// Checkout (ARCHITECTURE §4.2; CC1b F4/F7/F15). One active order per (guest, chart revision, SKU).
// DB work and the provider call are never in one transaction (CLAUDE.md rule 5). The order, its encrypted
// snapshot (chart + price + the exact approved content) and the FROZEN provider request are written together;
// every later attempt re-sends that frozen request with the same idempotency key.
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { Db } from "../db/client";
import { checkoutAttempts, orders } from "../db/schema";
import { loadChart } from "../charts/service";
import { encryptPrivate, type Keyring } from "../security/encryption";
import { aad } from "../security/keyring";
import { isSalesEnabled } from "../settings";
import { POLICY_VERSION } from "../engine";
import { LIBRARY_VERSION } from "@/content/library";
import { SNIPPETS_VERSION } from "@/content/snippets";
import { PROMPT_VERSION, buildFacts, contentReady, selectSnippets } from "../fulfillment/prompt";
import { PaymentProviderError, type CheckoutSessionRequest, type PaymentAdapter } from "./adapter";
import { openIssue } from "./issues";
import { CONSENT_VERSION, CONSENT_VERSION_DELAYED, SKUS, type Sku } from "./sku";
import { capacityState } from "../fulfillment/capacity";

export interface CheckoutDeps {
  db: Db;
  ring: Keyring;
  payments: PaymentAdapter;
  priceId: string;
  origin: string;
  automaticTax: boolean;
  /** Production: only Jason-approved content may be sold (D37). */
  approvedSnippetsOnly: boolean;
  /** D43: Stripe promotion codes on the Stripe page. */
  allowPromotionCodes?: boolean;
  /** F13: LLM_DAILY_CAP, for the delivery promise shown before payment. 0 = no capacity check. */
  dailyCap?: number;
  now?: () => Date;
}

export type CheckoutResult =
  | { ok: true; url: string; orderId: string }
  | { ok: false; error: "consent_required" | "sales_closed" | "not_found" | "needs_answer" | "provider_error" | "content_not_ready" | "busy" }
  | { ok: false; error: "promise_changed"; promise: "minutes" | "24h" }
  | { ok: false; error: "already_owned" | "processing"; orderId: string };

/** Frozen at checkout creation: what the customer is buying (CLAUDE.md rule 6). */
export interface OrderSnapshot {
  chartRevisionId: string;
  input: { birthDate: string; time: unknown; placeLabel: string };
  response: unknown;
  sku: Sku;
  amountCents: number;
  currency: string;
  policyVersion: string;
  libraryVersion: string;
  promptVersion: string;
  consentVersion: string;
  createdAt: string;
  /** D35/D47: the delivery promise the customer saw and accepted. */
  deliveryPromise?: "minutes" | "24h";
  /** F7: the exact interpretation texts this order pays for; generation uses these, not whatever is deployed later. */
  content?: { snippetsVersion: string; snippets: Array<{ id: string; version: number; text: string; approvedBy?: string | null }> };
}

const ACTIVE = ["open", "paid", "refund_pending", "partially_refunded"] as const;
/** Stripe requires expires_at ≥ 30 min ahead at creation. Past 25 min an unsent request could no longer be created. */
export const SESSION_TTL_MIN = 60;
export const RESEND_WINDOW_MIN = 25;

/**
 * `quotedPromise` = the delivery promise the checkout page showed (and the customer consented to). The server
 * re-decides; if it is now WORSE than what was shown, nothing is created and the page must show the new notice.
 */
export async function startCheckout(deps: CheckoutDeps, guestId: string, chartRevisionId: string, consent: boolean, sku: Sku = "saju_reading", quotedPromise: "minutes" | "24h" = "minutes"): Promise<CheckoutResult> {
  if (!consent) return { ok: false, error: "consent_required" };
  if (!(await isSalesEnabled(deps.db))) return { ok: false, error: "sales_closed" };
  const chart = await loadChart(deps.db, deps.ring, chartRevisionId, guestId);
  if (!chart) return { ok: false, error: "not_found" };
  if (chart.response.kind !== "computed") return { ok: false, error: "needs_answer" };
  const facts = buildFacts(chart.response.chart);
  if (!contentReady(facts, deps.approvedSnippetsOnly)) return { ok: false, error: "content_not_ready" };
  const cap = deps.dailyCap ?? 0;
  const capacity = cap > 0 ? (await capacityState(deps.db, cap, deps.now?.() ?? new Date())).state : "minutes";

  // The promise for THIS page view (D35/D47/D52). Decided once, before touching any order.
  if (capacity === "paused") return { ok: false, error: "busy" };
  if (capacity === "24h" && quotedPromise !== "24h") return { ok: false, error: "promise_changed", promise: "24h" };
  const promise: "minutes" | "24h" = capacity === "24h" || quotedPromise === "24h" ? "24h" : "minutes";

  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await deps.db.query.orders.findFirst({
      where: and(eq(orders.guestId, guestId), eq(orders.chartRevisionId, chartRevisionId), eq(orders.sku, sku), inArray(orders.paymentStatus, [...ACTIVE]), isNull(orders.duplicateOfOrderId),
        or(eq(orders.paymentStatus, "open"), ne(orders.fulfillmentStatus, "none"))), // same rule as the one-active index
    });
    if (existing && existing.paymentStatus !== "open") return { ok: false, error: "already_owned", orderId: existing.id };

    if (existing && existing.deliveryPromise !== promise) {
      // An open order made under a different promise: never charge under a promise this page did not show.
      if (existing.stripeSessionId) {
        try { await deps.payments.expireCheckoutSession(existing.stripeSessionId); } catch { return { ok: false, error: "provider_error" }; }
      }
      await deps.db.update(orders).set({ paymentStatus: "expired", updatedAt: new Date() }).where(and(eq(orders.id, existing.id), eq(orders.paymentStatus, "open")));
      continue;
    }
    if (existing) {
      if (existing.stripeSessionId) {
        let session;
        try { session = await deps.payments.getCheckoutSession(existing.stripeSessionId); } catch { return { ok: false, error: "provider_error" }; }
        if (session.status === "open" && session.url) return { ok: true, url: session.url, orderId: existing.id };
        if (session.status === "complete") return { ok: false, error: "processing", orderId: existing.id };
        // Expired at Stripe: close this order and start a fresh one on the next loop.
        await deps.db.update(orders).set({ paymentStatus: "expired", updatedAt: new Date() })
          .where(and(eq(orders.id, existing.id), eq(orders.paymentStatus, "open")));
        continue;
      }
      const resumed = await sendFrozen(deps, existing.id);
      if (resumed === "abandoned") continue; // provably never created: the next loop opens a new order
      return resumed;
    }

    const consentVersion = promise === "24h" ? CONSENT_VERSION_DELAYED : CONSENT_VERSION;
    const now = deps.now?.() ?? new Date();
    const id = randomUUID();
    const snippets = selectSnippets(facts, deps.approvedSnippetsOnly);
    const snapshot: OrderSnapshot = {
      chartRevisionId,
      input: { birthDate: chart.input.birthDate, time: chart.input.time, placeLabel: chart.input.placeLabel },
      response: chart.response,
      sku, amountCents: SKUS[sku].amountCents, currency: SKUS[sku].currency,
      policyVersion: POLICY_VERSION, libraryVersion: LIBRARY_VERSION, promptVersion: PROMPT_VERSION,
      consentVersion, createdAt: now.toISOString(), deliveryPromise: promise,
      content: { snippetsVersion: SNIPPETS_VERSION, snippets: snippets.map((s) => ({ id: s.id, version: s.version, text: s.text, approvedBy: s.approvedBy })) },
    };
    const request: CheckoutSessionRequest = {
      orderId: id, chartRevisionId, priceId: deps.priceId,
      successUrl: `${deps.origin}/order/${id}`,
      cancelUrl: `${deps.origin}/chart/${chartRevisionId}`,
      idempotencyKey: `checkout:${id}`,
      automaticTax: deps.automaticTax,
      allowPromotionCodes: deps.allowPromotionCodes ?? true,
      expiresAt: Math.floor(now.getTime() / 1000) + SESSION_TTL_MIN * 60,
    };
    request.providerParams = deps.payments.buildCheckoutParams(request);
    const created = await deps.db.transaction(async (tx) => {
      const inserted = await tx.insert(orders).values({
        id, chartRevisionId, guestId, sku,
        unitAmountCents: SKUS[sku].amountCents, currency: SKUS[sku].currency,
        snapshotEnc: encryptPrivate(snapshot, aad("orders", id, "snapshot"), deps.ring),
        consentVersion, deliveryPromise: promise, createdAt: now, updatedAt: now,
      }).onConflictDoNothing().returning({ id: orders.id });
      if (inserted.length === 0) return false;
      await tx.insert(checkoutAttempts).values({ orderId: id, idempotencyKey: request.idempotencyKey, request, createdAt: now });
      return true;
    });
    if (!created) continue; // a concurrent click created the active order; reuse it
    const r = await sendFrozen(deps, id);
    if (r === "abandoned") continue;
    return r;
  }
  return { ok: false, error: "provider_error" };
}

/**
 * Send the order's frozen request. Same key + same body = Stripe returns the session it already made (response
 * lost, DB save failed, double click). Past the resend window a request that Stripe REJECTS was never executed
 * (Stripe keeps no idempotent result for validation errors), so the order is closed and a new one may start;
 * an unknown outcome keeps the order and asks the customer to try again (reconciliation links a late session).
 */
async function sendFrozen(deps: CheckoutDeps, orderId: string): Promise<CheckoutResult | "abandoned"> {
  const now = deps.now?.() ?? new Date();
  const [att] = await deps.db.select().from(checkoutAttempts).where(eq(checkoutAttempts.orderId, orderId));
  if (!att) {
    // Order from before CC1b (no frozen request): close it rather than guess its original parameters.
    await expireOpenOrder(deps.db, orderId, now);
    return "abandoned";
  }
  if (att.status === "abandoned") { await expireOpenOrder(deps.db, orderId, now); return "abandoned"; }
  const request = att.request as CheckoutSessionRequest;
  const lateResend = now.getTime() - att.createdAt.getTime() > RESEND_WINDOW_MIN * 60_000;
  await deps.db.update(checkoutAttempts).set({ lastTriedAt: now }).where(eq(checkoutAttempts.id, att.id));
  let session;
  try {
    session = await deps.payments.createCheckoutSession(request);
  } catch (err) {
    if (err instanceof PaymentProviderError && err.code === "idempotency_mismatch") {
      // The key already ran with a different body (should be impossible with the frozen body): never wedge the
      // customer on it. Surface it, close the order, open a new one. A late payment of the old session is D51.
      await openIssue(deps.db, { kind: "checkout_idempotency_mismatch", objectId: att.idempotencyKey, livemode: deps.payments.livemode, orderId, nextAction: "check_stripe_for_session_of_this_order" });
      await deps.db.update(checkoutAttempts).set({ status: "abandoned" }).where(eq(checkoutAttempts.id, att.id));
      await expireOpenOrder(deps.db, orderId, now);
      return "abandoned";
    }
    if (lateResend && err instanceof PaymentProviderError && err.kind === "rejected") {
      await deps.db.update(checkoutAttempts).set({ status: "abandoned" }).where(eq(checkoutAttempts.id, att.id));
      await expireOpenOrder(deps.db, orderId, now);
      return "abandoned";
    }
    return { ok: false, error: "provider_error" };
  }
  if (!(await linkSession(deps.db, orderId, session.id, now))) {
    // The order was closed meanwhile (e.g. a D51 late payment closed this sibling): never hand out its session.
    if (session.status === "open") await deps.payments.expireCheckoutSession(session.id).catch(() => undefined);
    return "abandoned";
  }
  if (session.status === "complete") return { ok: false, error: "processing", orderId };
  if (session.status === "expired") { await expireOpenOrder(deps.db, orderId, now); return "abandoned"; } // replayed an old, dead session
  if (session.status !== "open" || !session.url) return { ok: false, error: "provider_error" };
  return { ok: true, url: session.url, orderId };
}

/** Store the provider session on the order and its attempt. False if the order is no longer open (or has another session). */
export async function linkSession(db: Db, orderId: string, sessionId: string, now: Date): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.update(checkoutAttempts).set({ status: "linked", sessionId }).where(and(eq(checkoutAttempts.orderId, orderId), isNull(checkoutAttempts.sessionId)));
    await tx.update(orders).set({ stripeSessionId: sessionId, updatedAt: now }).where(and(eq(orders.id, orderId), isNull(orders.stripeSessionId)));
    const [o] = await tx.select({ status: orders.paymentStatus, sid: orders.stripeSessionId }).from(orders).where(eq(orders.id, orderId));
    return o?.status === "open" && o.sid === sessionId;
  });
}

async function expireOpenOrder(db: Db, orderId: string, now: Date): Promise<void> {
  await db.update(orders).set({ paymentStatus: "expired", updatedAt: now }).where(and(eq(orders.id, orderId), eq(orders.paymentStatus, "open")));
}
