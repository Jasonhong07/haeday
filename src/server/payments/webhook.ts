// Payment webhook (ARCHITECTURE §4.3). Provider details are fetched BEFORE the transaction; then one transaction:
// insert payment_event (unique → duplicates are no-ops) → validated transition → enqueue generation (same tx).
import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { Db } from "../db/client";
import { checkoutAttempts, disputes, orders, paymentEvents } from "../db/schema";
import { QUEUES, enqueueInTx } from "../queue/boss";
import { emailLookup, encryptPrivate, type Keyring } from "../security/encryption";
import { aad } from "../security/keyring";
import { PaymentProviderError, type CheckoutDetails, type PaymentAdapter, type PaymentEvent, type ProviderKind } from "./adapter";
import { FULFILLMENT_DEADLINE_MIN, SKUS } from "./sku";
import { openIssue } from "./issues";
import { claimRefundInTx, markRefundSyncInTx } from "./refunds";
import { refunds } from "../db/schema";
import { DELAYED_PROMISE_MS } from "../fulfillment/capacity";

export interface WebhookDeps {
  db: Db;
  ring: Keyring;
  boss: PgBoss;
  payments: PaymentAdapter;
  paymentsMode: "test" | "live";
  /** Stripe: the price id. PayPal: the item sku we send ("saju_reading"). */
  priceId: string;
  /** CC4c: adapters of the OTHER provider, to close a sibling order's checkout there (D51). */
  others?: Partial<Record<ProviderKind, PaymentAdapter | null>>;
  now?: () => Date;
}

export type WebhookOutcome =
  | "duplicate" | "paid" | "expired" | "ignored" | "rejected" | "no_transition" | "refund_updated" | "dispute_updated"
  | "pending" | "declined" | "not_approved" | "closed" | "provider_error" | "failed";

/**
 * Every check from CLAUDE.md rule 4, plus F15 discounts. Returns the reason on failure (a code, never values).
 * A 100% promotion code yields payment_status "no_payment_required", total 0 and no PaymentIntent: allowed only
 * when the discount equals the subtotal exactly.
 */
export function validatePaid(d: CheckoutDetails, order: { id: string; providerCheckoutId: string | null; unitAmountCents: number; currency: string }, deps: Pick<WebhookDeps, "paymentsMode" | "priceId">): string | null {
  if (d.livemode !== (deps.paymentsMode === "live")) return "livemode_mismatch";
  if (order.providerCheckoutId !== d.id) return "session_mismatch";
  if (d.clientReferenceId !== order.id || d.metadataOrderId !== order.id) return "order_reference_mismatch";
  const free = d.paymentStatus === "no_payment_required";
  if (d.paymentStatus !== "paid" && !free) return "not_paid";
  if (d.currency !== order.currency || d.currency !== SKUS.saju_reading.currency) return "currency_mismatch";
  if (d.lineItems.length !== 1 || d.lineItems[0]!.priceId !== deps.priceId || d.lineItems[0]!.quantity !== 1) return "line_item_mismatch";
  if (d.amountSubtotal !== order.unitAmountCents) return "subtotal_mismatch";
  if (d.amountShipping !== 0) return "shipping_mismatch";
  if (!Number.isInteger(d.amountDiscount) || d.amountDiscount < 0 || d.amountDiscount > d.amountSubtotal) return "discount_mismatch";
  const tax = d.amountTax ?? 0;
  if (tax < 0 || d.amountTotal === null || d.amountTotal !== d.amountSubtotal - d.amountDiscount + tax) return "total_mismatch";
  if (free) return d.amountTotal === 0 && d.amountDiscount === d.amountSubtotal ? null : "free_mismatch";
  if (d.amountTotal <= 0) return "total_mismatch";
  if (!d.paymentIntentId) return "missing_payment_intent";
  return null;
}

/** Reasons that say "this payment is not provably ours" — never refunded automatically (D34). */
const IDENTITY_REASONS = ["provider_mismatch", "livemode_mismatch", "session_mismatch", "order_reference_mismatch", "not_paid", "missing_payment_intent", "unknown_order", "free_mismatch"];

export type PaidSource = { eventId: string; type: string; livemode: boolean };

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Another ACTIVE, non-duplicate order for the same guest, chart revision and SKU (locked). */
async function otherActiveOrder(tx: Tx, o: { id: string; guestId: string; sku: string; chartRevisionId: string | null }) {
  if (!o.chartRevisionId) return undefined;
  const [other] = await tx.select().from(orders)
    .where(and(eq(orders.guestId, o.guestId), eq(orders.sku, o.sku), eq(orders.chartRevisionId, o.chartRevisionId), ne(orders.id, o.id),
      inArray(orders.paymentStatus, ["open", "paid", "refund_pending", "partially_refunded"]), isNull(orders.duplicateOfOrderId),
      or(eq(orders.paymentStatus, "open"), ne(orders.fulfillmentStatus, "none")))) // same rule as the one-active index
    .for("update");
  return other;
}

/**
 * One validated transition for a completed Checkout Session, shared by the webhook and reconciliation (F12).
 * Provider details must be fetched BEFORE calling (no network in the transaction). Idempotent per event id and,
 * through the conditional status update, per order.
 */
export async function applyPaidSession(deps: WebhookDeps, details: CheckoutDetails, source: PaidSource): Promise<{ outcome: WebhookOutcome; reason?: string }> {
  const now = deps.now?.() ?? new Date();
  const orderId = details.metadataOrderId ?? details.clientReferenceId;
  let toExpire: { id: string; kind: string } | null = null;
  const result = await deps.db.transaction(async (tx) => {
    const ins = await tx.insert(paymentEvents).values({ provider: deps.payments.provider, eventId: source.eventId, type: source.type, livemode: source.livemode, orderId: null })
      .onConflictDoNothing().returning({ id: paymentEvents.id });
    if (ins.length === 0) return { outcome: "duplicate" as const };
    const isUuid = orderId !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
    const [found] = isUuid ? await tx.select().from(orders).where(eq(orders.id, orderId!)).for("update") : [];
    let order = found;

    // F4/F12: the session was created but we never stored its id (response lost, DB save failed). Adopt it only
    // with full proof: both references, mode, a frozen attempt for this order, and created after the order.
    if (order && order.paymentProvider === deps.payments.kind && !order.providerCheckoutId && (order.paymentStatus === "open" || order.paymentStatus === "expired")
      && details.clientReferenceId === order.id && details.metadataOrderId === order.id
      && details.livemode === (deps.paymentsMode === "live") && details.created >= Math.floor(order.createdAt.getTime() / 1000) - 60) {
      const [att] = await tx.select({ id: checkoutAttempts.id }).from(checkoutAttempts).where(eq(checkoutAttempts.orderId, order.id));
      if (att) {
        await tx.update(orders).set({ providerCheckoutId: details.id, updatedAt: now }).where(eq(orders.id, order.id));
        await tx.update(checkoutAttempts).set({ status: "linked", sessionId: details.id }).where(eq(checkoutAttempts.id, att.id));
        order = { ...order, providerCheckoutId: details.id };
      }
    }

    // CC4c: a Stripe event can never pay a PayPal order and vice versa.
    const reason = !order ? "unknown_order" : order.paymentProvider !== deps.payments.kind ? "provider_mismatch" : validatePaid(details, order, deps);
    const markEvent = (type: string) => tx.update(paymentEvents).set({ handledAt: now, type, orderId: order?.id ?? null }).where(eq(paymentEvents.id, ins[0]!.id));
    const moneyFacts = {
      paidAt: now, providerPaymentId: details.paymentIntentId,
      subtotalCents: details.amountSubtotal, taxCents: details.amountTax ?? 0, totalCents: details.amountTotal,
      discountCents: details.amountDiscount, promotionCodeId: details.promotionCodeId, updatedAt: now,
    };
    if (reason) {
      await markEvent(`rejected:${reason}`);
      // D34: money taken but validation failed. Refund ONLY when this payment provably belongs to this order;
      // the reading is never unlocked (fulfillment stays "none"). Everything else is an alert, never a refund.
      const linked = order && !IDENTITY_REASONS.includes(reason) && (order.paymentStatus === "open" || order.paymentStatus === "expired")
        && order.providerCheckoutId === details.id && details.clientReferenceId === order.id && details.metadataOrderId === order.id
        && details.livemode === (deps.paymentsMode === "live") && details.paymentStatus === "paid" && details.paymentIntentId
        && details.amountTotal !== null && details.amountTotal > 0;
      if (linked) {
        // An expired order may have a live sibling (D51): record this one as a duplicate so the one-active index holds.
        const sibling = order!.paymentStatus === "expired" ? await otherActiveOrder(tx, order!) : undefined;
        await tx.update(orders).set({ paymentStatus: "paid", ...moneyFacts, ...(sibling ? { duplicateOfOrderId: sibling.id } : {}) }).where(eq(orders.id, order!.id));
        const claim = await claimRefundInTx(tx, deps.boss, { orderId: order!.id, reason: "validation_failure", requestedBy: "webhook", now, livemode: source.livemode, amountCents: details.amountTotal! });
        await openIssue(tx, { kind: "validation_failure_refund", objectId: details.id, livemode: source.livemode, orderId: order!.id, nextAction: claim.ok ? `refund_started:${reason}` : `refund_${claim.error}:${reason}` });
      } else if (details.paymentStatus === "paid") {
        await openIssue(tx, { kind: "unlinked_paid_session", objectId: details.id, livemode: source.livemode, orderId: order?.id ?? null, nextAction: `review_no_auto_refund:${reason}` });
      }
      return { outcome: "rejected" as const, reason };
    }
    const o = order!;
    await markEvent(source.type);

    // D51: our side marked the order expired, but the customer finished paying this (linked) session: honour it.
    if (o.paymentStatus === "expired") {
      const other = await otherActiveOrder(tx, o);
      if (other && other.paymentStatus !== "open") {
        // They already own this reading through another order: a duplicate payment, refunded, never unlocked.
        await tx.update(orders).set({ paymentStatus: "paid", ...moneyFacts, duplicateOfOrderId: other.id }).where(eq(orders.id, o.id));
        if ((details.amountTotal ?? 0) > 0) {
          const claim = await claimRefundInTx(tx, deps.boss, { orderId: o.id, reason: "duplicate", requestedBy: "webhook", now, livemode: source.livemode });
          await openIssue(tx, { kind: "validation_failure_refund", objectId: details.id, livemode: source.livemode, orderId: o.id, nextAction: claim.ok ? "duplicate_purchase_refund_started" : `duplicate_refund_${claim.error}` });
        }
        return { outcome: "rejected" as const, reason: "duplicate_purchase" };
      }
      if (other) {
        await tx.update(orders).set({ paymentStatus: "expired", updatedAt: now }).where(and(eq(orders.id, other.id), eq(orders.paymentStatus, "open")));
        if (other.providerCheckoutId) toExpire = { id: other.providerCheckoutId, kind: other.paymentProvider }; // closed at the provider after commit
      }
    }

    const email = details.customerEmail;
    // D47: a "24h" order's deadline runs from when the customer actually paid (provider time), not from when we
    // happened to hear about it; a "minutes" order keeps the 15-minute worker deadline.
    const providerPaidAt = details.paidAt ? new Date(details.paidAt * 1000) : null;
    const deadline = o.deliveryPromise === "24h"
      ? new Date(Math.min(now.getTime(), (providerPaidAt ?? now).getTime()) + DELAYED_PROMISE_MS)
      : new Date(now.getTime() + FULFILLMENT_DEADLINE_MIN * 60_000);
    const moved = await tx.update(orders).set({
      paymentStatus: "paid", ...moneyFacts, fulfillmentStatus: "queued", providerPaidAt,
      fulfillmentDeadlineAt: deadline,
      // Stripe collects the email on its page; PayPal/Venmo buyers typed it on ours (stored at order creation, kept).
      ...(email ? { deliveryEmailEnc: encryptPrivate(email, aad("orders", o.id, "delivery_email"), deps.ring), deliveryEmailLookup: emailLookup(email, deps.ring) } : {}),
    }).where(and(eq(orders.id, o.id), inArray(orders.paymentStatus, ["open", "expired"]))).returning({ id: orders.id });
    // A late "completed" never moves refund_pending/refunded orders back to paid (ARCHITECTURE §2).
    if (moved.length === 0) return { outcome: "no_transition" as const, reason: `status_${o.paymentStatus}` };
    await enqueueInTx(deps.boss, tx, QUEUES.generateReading, { orderId: o.id }, { singletonKey: o.id });
    return { outcome: "paid" as const };
  });
  if (toExpire) {
    const t = toExpire as { id: string; kind: string };
    const adapter = t.kind === deps.payments.kind ? deps.payments : deps.others?.[t.kind as ProviderKind];
    await adapter?.expireCheckoutSession(t.id).catch(() => undefined); // best effort; D51 covers a race
  }
  return result;
}

/**
 * CC4c PayPal: capture an approved order, then run the SAME validated transition as every other payment path.
 * Used by the capture route (the buyer's onApprove), the CHECKOUT.ORDER.APPROVED webhook and reconciliation.
 * Never captures an order we closed (expired/abandoned): the buyer's approval then simply lapses, nothing is charged.
 * The capture call is idempotent (PayPal-Request-Id = capture:<order id>), so concurrent paths get one capture.
 */
export async function captureAndApply(deps: WebhookDeps, checkoutId: string, eventId?: string): Promise<{ outcome: WebhookOutcome; reason?: string; orderId?: string }> {
  if (deps.payments.kind !== "paypal" || !deps.payments.capture) return { outcome: "ignored", reason: "not_paypal" };
  const [o] = await deps.db.select({ id: orders.id, status: orders.paymentStatus }).from(orders)
    .where(and(eq(orders.providerCheckoutId, checkoutId), eq(orders.paymentProvider, "paypal")));
  if (!o) return { outcome: "ignored", reason: "unknown_order" };
  if (o.status !== "open") return { outcome: o.status === "expired" ? "closed" : "no_transition", orderId: o.id };
  // The key changes after each decline: a retry with another funding source is a NEW capture request (PayPal may
  // replay a stored failure for a repeated key). A second capture of the same order is refused by PayPal itself.
  const [att] = await deps.db.select({ declines: checkoutAttempts.captureDeclines }).from(checkoutAttempts).where(eq(checkoutAttempts.orderId, o.id));
  const declines = att?.declines ?? 0;
  let r;
  try { r = await deps.payments.capture(checkoutId, `capture:${o.id}:${declines}`); }
  catch (e) { return { outcome: "provider_error", reason: e instanceof PaymentProviderError ? e.code : "unknown", orderId: o.id }; }
  if (r.outcome === "declined") {
    await deps.db.update(checkoutAttempts).set({ captureDeclines: declines + 1 }).where(and(eq(checkoutAttempts.orderId, o.id), eq(checkoutAttempts.captureDeclines, declines)));
    return { outcome: "declined", reason: r.code, orderId: o.id };
  }
  if (r.outcome === "not_approved") return { outcome: "not_approved", orderId: o.id };
  if (r.outcome === "failed") {
    // Refused for good: close our order (the buyer can start again, by card or PayPal) and tell a person.
    const now = deps.now?.() ?? new Date();
    await deps.db.update(orders).set({ paymentStatus: "expired", updatedAt: now }).where(and(eq(orders.id, o.id), eq(orders.paymentStatus, "open")));
    await openIssue(deps.db, { kind: "paypal_capture_failed", objectId: checkoutId, livemode: deps.payments.livemode, orderId: o.id, nextAction: `capture_refused_${r.code ?? "unknown"}_nothing_charged` });
    return { outcome: "failed", reason: r.code, orderId: o.id };
  }
  let d: CheckoutDetails;
  try { d = await deps.payments.getCheckoutDetails(checkoutId); }
  catch { return { outcome: "provider_error", orderId: o.id }; }
  if (d.paymentStatus !== "paid") return { outcome: "pending", orderId: o.id }; // PayPal review: the capture webhook finishes it
  const res = await applyPaidSession(deps, d, { eventId: eventId ?? `capture:${d.paymentIntentId}`, type: "paypal.capture", livemode: d.livemode });
  return { ...res, orderId: o.id };
}

async function recordOnly(deps: WebhookDeps, event: PaymentEvent, type: string, orderId: string | null): Promise<boolean> {
  const inserted = await deps.db.insert(paymentEvents).values({ provider: deps.payments.provider, eventId: event.id, type, livemode: event.livemode, orderId, handledAt: new Date() })
    .onConflictDoNothing().returning({ id: paymentEvents.id });
  return inserted.length > 0;
}

export async function handlePaymentEvent(deps: WebhookDeps, event: PaymentEvent): Promise<{ outcome: WebhookOutcome; reason?: string }> {
  const now = deps.now?.() ?? new Date();
  if (event.livemode !== (deps.paymentsMode === "live")) {
    return (await recordOnly(deps, event, "rejected:livemode", null)) ? { outcome: "rejected", reason: "livemode_mismatch" } : { outcome: "duplicate" };
  }
  const seen = await deps.db.query.paymentEvents.findFirst({ where: and(eq(paymentEvents.provider, deps.payments.provider), eq(paymentEvents.eventId, event.id)), columns: { id: true } });
  if (seen) return { outcome: "duplicate" };

  switch (event.type) {
    case "checkout.completed":
    case "checkout.async_succeeded": {
      const details = await deps.payments.getCheckoutDetails(event.sessionId); // outside any transaction
      return applyPaidSession(deps, details, { eventId: event.id, type: event.type, livemode: event.livemode });
    }

    case "checkout.approved": {
      // PayPal: the buyer approved (maybe closed the window before our page could capture). Capture outside any
      // transaction, then the normal transition. A capture that cannot finish now is retried by PayPal / reconciliation.
      const r = await captureAndApply(deps, event.sessionId, event.id);
      if (r.outcome === "provider_error") throw new Error("capture_failed_retry"); // 500 → PayPal redelivers
      if (r.outcome !== "paid" && r.outcome !== "duplicate" && r.outcome !== "rejected") await recordOnly(deps, event, `approved:${r.outcome}`, r.orderId ?? null);
      return { outcome: r.outcome, reason: r.reason };
    }

    case "checkout.expired":
    case "checkout.async_failed": {
      return deps.db.transaction(async (tx) => {
        const ins = await tx.insert(paymentEvents).values({ provider: deps.payments.provider, eventId: event.id, type: event.type, livemode: event.livemode, handledAt: now })
          .onConflictDoNothing().returning({ id: paymentEvents.id });
        if (ins.length === 0) return { outcome: "duplicate" as const };
        const moved = await tx.update(orders).set({ paymentStatus: "expired", updatedAt: now })
          .where(and(eq(orders.providerCheckoutId, event.sessionId), eq(orders.paymentStatus, "open"))).returning({ id: orders.id });
        return { outcome: moved.length ? "expired" as const : "no_transition" as const };
      });
    }

    case "refund.updated":
    case "charge.refunded": {
      return deps.db.transaction(async (tx) => {
        const ins = await tx.insert(paymentEvents).values({ provider: deps.payments.provider, eventId: event.id, type: event.type, livemode: event.livemode, handledAt: now })
          .onConflictDoNothing().returning({ id: paymentEvents.id });
        if (ins.length === 0) return { outcome: "duplicate" as const };
        if (!event.paymentIntentId) return { outcome: "ignored" as const };
        // No order row lock here: the sync takes order → refund_syncs; this path only touches refund_syncs.
        const [order] = await tx.select({ id: orders.id }).from(orders).where(and(eq(orders.providerPaymentId, event.paymentIntentId), eq(orders.paymentProvider, deps.payments.kind)));
        if (!order) return { outcome: "ignored" as const, reason: "unknown_payment_intent" };
        await tx.update(paymentEvents).set({ orderId: order.id }).where(eq(paymentEvents.id, ins[0]!.id));
        if (event.type === "refund.updated" && deps.payments.kind === "paypal") await rememberPayPalRefund(tx, order.id, event, now);

        // CC1a F3: the event body is only a trigger. The provider's current refund list decides the state,
        // read by the `refund.sync` job under a per-order lease (no ordering bugs, no lost webhook-first rows).
        await markRefundSyncInTx(tx, deps.boss, order.id);
        return { outcome: "refund_updated" as const };
      });
    }

    case "dispute.updated": {
      return deps.db.transaction(async (tx) => {
        const ins = await tx.insert(paymentEvents).values({ provider: deps.payments.provider, eventId: event.id, type: event.type, livemode: event.livemode, handledAt: now })
          .onConflictDoNothing().returning({ id: paymentEvents.id });
        if (ins.length === 0) return { outcome: "duplicate" as const };
        const [order] = event.paymentIntentId ? await tx.select({ id: orders.id }).from(orders).where(and(eq(orders.providerPaymentId, event.paymentIntentId), eq(orders.paymentProvider, deps.payments.kind))) : [];
        await tx.insert(disputes).values({ orderId: order?.id ?? null, providerDisputeId: event.disputeId, status: event.status, reason: event.reason, evidenceDueBy: event.evidenceDueBy })
          .onConflictDoUpdate({ target: disputes.providerDisputeId, set: { status: event.status, reason: event.reason, evidenceDueBy: event.evidenceDueBy, updatedAt: now } });
        return { outcome: "dispute_updated" as const };
      });
    }

    default:
      await recordOnly(deps, event, `ignored:${(event as { providerType?: string }).providerType ?? "unknown"}`, null);
      return { outcome: "ignored" };
  }
}

/**
 * PayPal can only read a refund by its id, so the id from the webhook must be on record before the sync runs:
 * our claim gets it (matched by the refund row id we sent as custom_id); a refund made in the PayPal dashboard is
 * recorded as a provider refund (never blocked by the one-claim rule, D22). Statuses are then set by the sync.
 */
async function rememberPayPalRefund(tx: Tx, orderId: string, e: Extract<PaymentEvent, { type: "refund.updated" }>, now: Date): Promise<void> {
  const [known] = await tx.select({ id: refunds.id }).from(refunds).where(eq(refunds.providerRefundId, e.refundId));
  if (known) return;
  if (e.refundRowId && /^[0-9a-f-]{36}$/i.test(e.refundRowId)) {
    const mine = await tx.update(refunds).set({ providerRefundId: e.refundId, updatedAt: now })
      .where(and(eq(refunds.id, e.refundRowId), eq(refunds.orderId, orderId), eq(refunds.source, "service"), isNull(refunds.providerRefundId))).returning({ id: refunds.id });
    if (mine.length) return;
  }
  await tx.insert(refunds).values({
    orderId, source: "provider", reason: "admin", idempotencyKey: `provider:${e.refundId}`, amountCents: e.amountCents,
    providerRefundId: e.refundId, status: e.status, requestedBy: "paypal_dashboard", lastCheckedAt: now,
  }).onConflictDoNothing();
}
