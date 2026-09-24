// The single refund service (ARCHITECTURE §4.8, D15, CLAUDE.md rule 8). Used by customer, admin, worker and cron.
// 1) short transaction: lock order, check eligibility, insert the one claim, mark refund_pending
// 2) provider call outside the transaction with a stable idempotency key
// 3) conditional update with the result. "pending"/"requires_action"/"unknown" are NOT refunded.
import { and, eq, gt, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { orders, refunds } from "../db/schema";
import type { PaymentAdapter, RefundStatus } from "./adapter";

export type RefundReason = "service_failure" | "goodwill" | "duplicate" | "admin";
export type RequestedBy = "customer" | "admin" | "worker" | "deadline_cron";
export const GOODWILL_DAYS = 7;

export type RefundOutcome =
  | { ok: true; status: RefundStatus | "unknown"; refundId: string }
  | { ok: false; error: "not_found" | "not_paid" | "already_refunded" | "in_progress" | "outside_window" | "goodwill_used" };

export async function requestRefund(
  deps: { db: Db; payments: PaymentAdapter; now?: () => Date },
  input: { orderId: string; reason: RefundReason; requestedBy: RequestedBy },
): Promise<RefundOutcome> {
  const now = deps.now?.() ?? new Date();
  const claim = await deps.db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("update");
    if (!order) return { ok: false as const, error: "not_found" as const };
    const [active] = await tx.select().from(refunds)
      .where(and(eq(refunds.orderId, order.id), eq(refunds.source, "service"), inArray(refunds.status, ["requested", "pending", "requires_action", "unknown", "succeeded"])));
    if (active) return { ok: false as const, error: active.status === "succeeded" ? "already_refunded" as const : "in_progress" as const };
    if (order.paymentStatus === "refunded") return { ok: false as const, error: "already_refunded" as const };
    if (order.paymentStatus !== "paid" || !order.stripePaymentIntentId) return { ok: false as const, error: "not_paid" as const };

    if (input.reason === "goodwill") {
      if (!order.paidAt || now.getTime() - order.paidAt.getTime() > GOODWILL_DAYS * 86_400_000) return { ok: false as const, error: "outside_window" as const };
      // One goodwill refund per checkout email (service failures and duplicates never count).
      if (order.deliveryEmailLookup) {
        const [used] = await tx.select({ n: sql<number>`count(*)::int` }).from(refunds).innerJoin(orders, eq(refunds.orderId, orders.id))
          .where(and(eq(orders.deliveryEmailLookup, order.deliveryEmailLookup), eq(refunds.reason, "goodwill"), ne(refunds.orderId, order.id),
            inArray(refunds.status, ["requested", "pending", "requires_action", "unknown", "succeeded"]), gt(refunds.createdAt, new Date(0))));
        if ((used?.n ?? 0) > 0) return { ok: false as const, error: "goodwill_used" as const };
      }
    }
    const amount = order.totalCents ?? order.unitAmountCents;
    // Stable per order: a retry after a crash reuses the same Stripe idempotency key.
    const [row] = await tx.insert(refunds).values({
      orderId: order.id, source: "service", reason: input.reason, idempotencyKey: `refund:${order.id}:1`,
      amountCents: amount, status: "requested", requestedBy: input.requestedBy,
    }).onConflictDoNothing().returning();
    if (!row) return { ok: false as const, error: "in_progress" as const };
    await tx.update(orders).set({ paymentStatus: "refund_pending", updatedAt: now }).where(eq(orders.id, order.id));
    return { ok: true as const, refund: row, paymentIntentId: order.stripePaymentIntentId };
  }).catch((err: unknown) => {
    // The partial unique index is the last line of defence against concurrent claims.
    if (err && typeof err === "object" && "cause" in err && (err.cause as { code?: string })?.code === "23505") return { ok: false as const, error: "in_progress" as const };
    throw err;
  });
  if (!claim.ok) return claim;

  let status: RefundStatus | "unknown";
  let stripeRefundId: string | null = null;
  try {
    const r = await deps.payments.createRefund({ paymentIntentId: claim.paymentIntentId, amountCents: claim.refund.amountCents, idempotencyKey: claim.refund.idempotencyKey, orderId: input.orderId });
    status = r.status; stripeRefundId = r.id;
  } catch {
    status = "unknown"; // reconciliation retries with the same idempotency key
  }
  await deps.db.transaction(async (tx) => {
    await tx.update(refunds).set({ status, stripeRefundId, updatedAt: now }).where(eq(refunds.id, claim.refund.id));
    if (status === "succeeded") await tx.update(orders).set({ paymentStatus: "refunded", updatedAt: now }).where(and(eq(orders.id, input.orderId), eq(orders.paymentStatus, "refund_pending")));
    if (status === "failed" || status === "canceled") await tx.update(orders).set({ paymentStatus: "paid", updatedAt: now }).where(and(eq(orders.id, input.orderId), eq(orders.paymentStatus, "refund_pending")));
  });
  return { ok: true, status, refundId: claim.refund.id };
}

/** Retry claims left in "unknown"/"requested" (crash or network error) with the SAME idempotency key. */
export async function reconcileRefunds(deps: { db: Db; payments: PaymentAdapter; now?: () => Date }): Promise<number> {
  const stuck = await deps.db.select().from(refunds).innerJoin(orders, eq(refunds.orderId, orders.id))
    .where(and(eq(refunds.source, "service"), inArray(refunds.status, ["unknown", "requested"])));
  let fixed = 0;
  for (const { refunds: r, orders: o } of stuck) {
    if (!o.stripePaymentIntentId) continue;
    try {
      const res = await deps.payments.createRefund({ paymentIntentId: o.stripePaymentIntentId, amountCents: r.amountCents, idempotencyKey: r.idempotencyKey, orderId: o.id });
      const now = deps.now?.() ?? new Date();
      await deps.db.transaction(async (tx) => {
        await tx.update(refunds).set({ status: res.status, stripeRefundId: res.id, updatedAt: now }).where(eq(refunds.id, r.id));
        if (res.status === "succeeded") await tx.update(orders).set({ paymentStatus: "refunded", updatedAt: now }).where(and(eq(orders.id, o.id), eq(orders.paymentStatus, "refund_pending")));
      });
      fixed++;
    } catch { /* stays unknown; next run retries */ }
  }
  return fixed;
}
