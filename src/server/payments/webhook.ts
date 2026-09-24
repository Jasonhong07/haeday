// Payment webhook (ARCHITECTURE §4.3). Provider details are fetched BEFORE the transaction; then one transaction:
// insert payment_event (unique → duplicates are no-ops) → validated transition → enqueue generation (same tx).
import { and, eq, inArray } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { Db } from "../db/client";
import { disputes, orders, paymentEvents, refunds } from "../db/schema";
import { QUEUES, enqueueInTx } from "../queue/boss";
import { emailLookup, encryptPrivate, type Keyring } from "../security/encryption";
import { aad } from "../security/keyring";
import type { CheckoutDetails, PaymentAdapter, PaymentEvent } from "./adapter";
import { FULFILLMENT_DEADLINE_MIN, SKUS } from "./sku";

export interface WebhookDeps {
  db: Db;
  ring: Keyring;
  boss: PgBoss;
  payments: PaymentAdapter;
  paymentsMode: "test" | "live";
  priceId: string;
  now?: () => Date;
}

export type WebhookOutcome =
  | "duplicate" | "paid" | "expired" | "ignored" | "rejected" | "no_transition" | "refund_updated" | "dispute_updated";

/** Every check from CLAUDE.md rule 4. Returns the reason on failure (logged as a code, never with values). */
export function validatePaid(d: CheckoutDetails, order: { id: string; stripeSessionId: string | null; unitAmountCents: number; currency: string }, deps: Pick<WebhookDeps, "paymentsMode" | "priceId">): string | null {
  if (d.livemode !== (deps.paymentsMode === "live")) return "livemode_mismatch";
  if (order.stripeSessionId !== d.id) return "session_mismatch";
  if (d.clientReferenceId !== order.id || d.metadataOrderId !== order.id) return "order_reference_mismatch";
  if (d.paymentStatus !== "paid") return "not_paid";
  if (d.currency !== order.currency || d.currency !== SKUS.saju_reading.currency) return "currency_mismatch";
  if (d.lineItems.length !== 1 || d.lineItems[0]!.priceId !== deps.priceId || d.lineItems[0]!.quantity !== 1) return "line_item_mismatch";
  if (d.amountSubtotal !== order.unitAmountCents) return "subtotal_mismatch";
  if (d.amountTotal === null || d.amountTotal < d.amountSubtotal) return "total_mismatch";
  if (!d.paymentIntentId) return "missing_payment_intent";
  return null;
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
      const orderId = details.metadataOrderId ?? details.clientReferenceId;
      return deps.db.transaction(async (tx) => {
        const ins = await tx.insert(paymentEvents).values({ provider: deps.payments.provider, eventId: event.id, type: event.type, livemode: event.livemode, orderId: null })
          .onConflictDoNothing().returning({ id: paymentEvents.id });
        if (ins.length === 0) return { outcome: "duplicate" as const };
        const [order] = orderId ? await tx.select().from(orders).where(eq(orders.id, orderId)).for("update") : [];
        const reason = order ? validatePaid(details, order, deps) : "unknown_order";
        if (reason) {
          await tx.update(paymentEvents).set({ handledAt: now, type: `rejected:${reason}` }).where(eq(paymentEvents.id, ins[0]!.id));
          return { outcome: "rejected" as const, reason };
        }
        const email = details.customerEmail;
        const moved = await tx.update(orders).set({
          paymentStatus: "paid", paidAt: now, fulfillmentStatus: "queued",
          fulfillmentDeadlineAt: new Date(now.getTime() + FULFILLMENT_DEADLINE_MIN * 60_000),
          subtotalCents: details.amountSubtotal, taxCents: details.amountTax ?? 0, totalCents: details.amountTotal,
          stripePaymentIntentId: details.paymentIntentId,
          deliveryEmailEnc: email ? encryptPrivate(email, aad("orders", order!.id, "delivery_email"), deps.ring) : null,
          deliveryEmailLookup: email ? emailLookup(email, deps.ring) : null,
          updatedAt: now,
        }).where(and(eq(orders.id, order!.id), eq(orders.paymentStatus, "open"))).returning({ id: orders.id });
        await tx.update(paymentEvents).set({ handledAt: now, orderId: order!.id }).where(eq(paymentEvents.id, ins[0]!.id));
        // A late "completed" never moves expired/refunded orders back to paid (ARCHITECTURE §2).
        if (moved.length === 0) return { outcome: "no_transition" as const, reason: `status_${order!.paymentStatus}` };
        await enqueueInTx(deps.boss, tx, QUEUES.generateReading, { orderId: order!.id }, { singletonKey: order!.id });
        return { outcome: "paid" as const };
      });
    }

    case "checkout.expired":
    case "checkout.async_failed": {
      return deps.db.transaction(async (tx) => {
        const ins = await tx.insert(paymentEvents).values({ provider: deps.payments.provider, eventId: event.id, type: event.type, livemode: event.livemode, handledAt: now })
          .onConflictDoNothing().returning({ id: paymentEvents.id });
        if (ins.length === 0) return { outcome: "duplicate" as const };
        const moved = await tx.update(orders).set({ paymentStatus: "expired", updatedAt: now })
          .where(and(eq(orders.stripeSessionId, event.sessionId), eq(orders.paymentStatus, "open"))).returning({ id: orders.id });
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
        const [order] = await tx.select().from(orders).where(eq(orders.stripePaymentIntentId, event.paymentIntentId)).for("update");
        if (!order) return { outcome: "ignored" as const, reason: "unknown_payment_intent" };
        await tx.update(paymentEvents).set({ orderId: order.id }).where(eq(paymentEvents.id, ins[0]!.id));

        if (event.type === "refund.updated") {
          const [mine] = await tx.select().from(refunds).where(eq(refunds.stripeRefundId, event.refundId));
          if (mine) {
            await tx.update(refunds).set({ status: event.status, updatedAt: now }).where(eq(refunds.id, mine.id));
          } else {
            // Created outside the app (Stripe dashboard): recorded, never blocked by the one-claim rule (D22).
            await tx.insert(refunds).values({
              orderId: order.id, source: "provider", reason: "admin", idempotencyKey: `provider:${event.refundId}`,
              amountCents: event.amountCents, stripeRefundId: event.refundId, status: event.status, requestedBy: "stripe_dashboard",
            }).onConflictDoNothing();
          }
          if (event.status === "failed" || event.status === "canceled") {
            await tx.update(orders).set({ paymentStatus: "paid", updatedAt: now }).where(and(eq(orders.id, order.id), eq(orders.paymentStatus, "refund_pending")));
          }
          if (event.status !== "succeeded") return { outcome: "refund_updated" as const };
        }
        // Money actually returned: derive the order status from what Stripe reports.
        const refunded = event.type === "charge.refunded" ? event.amountRefundedCents : event.amountCents;
        const total = order.totalCents ?? order.unitAmountCents;
        const status = refunded >= total ? "refunded" : "partially_refunded";
        await tx.update(orders).set({ paymentStatus: status, updatedAt: now })
          .where(and(eq(orders.id, order.id), inArray(orders.paymentStatus, ["paid", "refund_pending", "partially_refunded"])));
        return { outcome: "refund_updated" as const };
      });
    }

    case "dispute.updated": {
      return deps.db.transaction(async (tx) => {
        const ins = await tx.insert(paymentEvents).values({ provider: deps.payments.provider, eventId: event.id, type: event.type, livemode: event.livemode, handledAt: now })
          .onConflictDoNothing().returning({ id: paymentEvents.id });
        if (ins.length === 0) return { outcome: "duplicate" as const };
        const [order] = event.paymentIntentId ? await tx.select({ id: orders.id }).from(orders).where(eq(orders.stripePaymentIntentId, event.paymentIntentId)) : [];
        await tx.insert(disputes).values({ orderId: order?.id ?? null, stripeDisputeId: event.disputeId, status: event.status, reason: event.reason, evidenceDueBy: event.evidenceDueBy })
          .onConflictDoUpdate({ target: disputes.stripeDisputeId, set: { status: event.status, reason: event.reason, evidenceDueBy: event.evidenceDueBy, updatedAt: now } });
        return { outcome: "dispute_updated" as const };
      });
    }

    default:
      await recordOnly(deps, event, `ignored:${event.providerType}`, null);
      return { outcome: "ignored" };
  }
}
