// Checkout (ARCHITECTURE §4.2): one active order per (guest, chart revision, SKU); Stripe session reused while open.
// DB work and the provider call are never in one transaction (CLAUDE.md rule 5): the order row is created first,
// the session is created with idempotency key = order id, then the session id is stored conditionally.
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { orders } from "../db/schema";
import { loadChart } from "../charts/service";
import { encryptPrivate, type Keyring } from "../security/encryption";
import { aad } from "../security/keyring";
import { isSalesEnabled } from "../settings";
import { POLICY_VERSION } from "../engine";
import { LIBRARY_VERSION } from "@/content/library";
import { PROMPT_VERSION } from "../fulfillment/prompt";
import type { PaymentAdapter } from "./adapter";
import { CONSENT_VERSION, SKUS, type Sku } from "./sku";

export interface CheckoutDeps {
  db: Db;
  ring: Keyring;
  payments: PaymentAdapter;
  priceId: string;
  origin: string;
  automaticTax: boolean;
}

export type CheckoutResult =
  | { ok: true; url: string; orderId: string }
  | { ok: false; error: "consent_required" | "sales_closed" | "not_found" | "needs_answer" | "provider_error" }
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
}

const ACTIVE = ["open", "paid", "refund_pending", "partially_refunded"] as const;

export async function startCheckout(deps: CheckoutDeps, guestId: string, chartRevisionId: string, consent: boolean, sku: Sku = "saju_reading"): Promise<CheckoutResult> {
  if (!consent) return { ok: false, error: "consent_required" };
  if (!(await isSalesEnabled(deps.db))) return { ok: false, error: "sales_closed" };
  const chart = await loadChart(deps.db, deps.ring, chartRevisionId, guestId);
  if (!chart) return { ok: false, error: "not_found" };
  if (chart.response.kind !== "computed") return { ok: false, error: "needs_answer" };

  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await deps.db.query.orders.findFirst({
      where: and(eq(orders.guestId, guestId), eq(orders.chartRevisionId, chartRevisionId), eq(orders.sku, sku), inArray(orders.paymentStatus, [...ACTIVE])),
    });
    if (existing && existing.paymentStatus !== "open") return { ok: false, error: "already_owned", orderId: existing.id };

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
      return createSession(deps, existing.id, chartRevisionId);
    }

    const id = randomUUID();
    const snapshot: OrderSnapshot = {
      chartRevisionId,
      input: { birthDate: chart.input.birthDate, time: chart.input.time, placeLabel: chart.input.placeLabel },
      response: chart.response,
      sku, amountCents: SKUS[sku].amountCents, currency: SKUS[sku].currency,
      policyVersion: POLICY_VERSION, libraryVersion: LIBRARY_VERSION, promptVersion: PROMPT_VERSION,
      consentVersion: CONSENT_VERSION, createdAt: new Date().toISOString(),
    };
    const inserted = await deps.db.insert(orders).values({
      id, chartRevisionId, guestId, sku,
      unitAmountCents: SKUS[sku].amountCents, currency: SKUS[sku].currency,
      snapshotEnc: encryptPrivate(snapshot, aad("orders", id, "snapshot"), deps.ring),
      consentVersion: CONSENT_VERSION,
    }).onConflictDoNothing().returning({ id: orders.id });
    if (inserted.length === 0) continue; // a concurrent click created the active order; reuse it
    return createSession(deps, id, chartRevisionId);
  }
  return { ok: false, error: "provider_error" };
}

async function createSession(deps: CheckoutDeps, orderId: string, chartRevisionId: string): Promise<CheckoutResult> {
  let session;
  try {
    session = await deps.payments.createCheckoutSession({
      orderId, chartRevisionId, priceId: deps.priceId,
      successUrl: `${deps.origin}/order/${orderId}`,
      cancelUrl: `${deps.origin}/chart/${chartRevisionId}`,
      idempotencyKey: `checkout:${orderId}`,
      automaticTax: deps.automaticTax,
    });
  } catch {
    return { ok: false, error: "provider_error" };
  }
  await deps.db.update(orders).set({ stripeSessionId: session.id, updatedAt: new Date() })
    .where(and(eq(orders.id, orderId), isNull(orders.stripeSessionId)));
  if (!session.url) return { ok: false, error: "provider_error" };
  return { ok: true, url: session.url, orderId };
}
