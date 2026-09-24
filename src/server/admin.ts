// Owner dashboard data (D19). Money comes from orders/refunds, never from client analytics. UTC throughout.
import { and, count, desc, eq, gte, inArray, lt, sql, sum } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { Db } from "./db/client";
import { adminAudit, chartRevisions, disputes, orders, paymentIssues, refunds } from "./db/schema";
import { QUEUES, enqueueInTx } from "./queue/boss";

export async function dashboard(db: Db, days: number, now = new Date()) {
  const from = new Date(now.getTime() - days * 86_400_000);
  const paidLike = ["paid", "refund_pending", "refunded", "partially_refunded"] as const;
  const [charts] = await db.select({ n: count() }).from(chartRevisions).where(gte(chartRevisions.createdAt, from));
  const [guestsWithChart] = await db.select({ n: sql<number>`count(distinct ${chartRevisions.guestId})::int` }).from(chartRevisions).where(gte(chartRevisions.createdAt, from));
  const [paid] = await db.select({ n: count(), gross: sum(orders.totalCents), tax: sum(orders.taxCents) }).from(orders)
    .where(and(inArray(orders.paymentStatus, [...paidLike]), gte(orders.paidAt, from)));
  const [refunded] = await db.select({ n: count(), amount: sum(refunds.amountCents) }).from(refunds)
    .where(and(eq(refunds.status, "succeeded"), gte(refunds.updatedAt, from)));
  const [checkouts] = await db.select({ n: count() }).from(orders).where(gte(orders.createdAt, from));
  const gross = Number(paid?.gross ?? 0), tax = Number(paid?.tax ?? 0), ref = Number(refunded?.amount ?? 0);
  return {
    from, to: now, chartsCreated: charts?.n ?? 0, chartBrowsers: guestsWithChart?.n ?? 0, checkoutsStarted: checkouts?.n ?? 0,
    paidOrders: paid?.n ?? 0, grossCents: gross, taxCents: tax, refundsCount: refunded?.n ?? 0, refundCents: ref, netCents: gross - tax - ref,
  };
}

/** Paid but not delivered (the daily "must be zero" check, OPERATIONS). */
export async function undelivered(db: Db, now = new Date()) {
  return db.select({ id: orders.id, paidAt: orders.paidAt, fulfillment: orders.fulfillmentStatus, payment: orders.paymentStatus })
    .from(orders).where(and(eq(orders.paymentStatus, "paid"), inArray(orders.fulfillmentStatus, ["queued", "generating", "failed"]), lt(orders.paidAt, now)))
    .orderBy(desc(orders.paidAt)).limit(50);
}

export async function openIssues(db: Db) {
  const pendingRefunds = await db.select({ id: refunds.id, orderId: refunds.orderId, status: refunds.status }).from(refunds)
    .where(inArray(refunds.status, ["requested", "pending", "requires_action", "unknown"])).limit(50);
  const openDisputes = await db.select({ id: disputes.id, orderId: disputes.orderId, status: disputes.status, due: disputes.evidenceDueBy }).from(disputes)
    .where(sql`${disputes.status} not in ('won', 'lost', 'warning_closed')`).limit(50);
  // D34/CC1a: payment problems a person must act on (ids and codes only).
  const needsAction = await db.select({ id: paymentIssues.id, kind: paymentIssues.kind, orderId: paymentIssues.orderId, nextAction: paymentIssues.nextAction, occurrences: paymentIssues.occurrences, since: paymentIssues.createdAt })
    .from(paymentIssues).where(inArray(paymentIssues.status, ["open", "acknowledged"])).orderBy(desc(paymentIssues.createdAt)).limit(50);
  return { pendingRefunds, openDisputes, needsAction };
}

/** Retry a stuck order: back to queued with a fresh deadline and a new job (same singleton key). */
export async function retryOrder(db: Db, boss: PgBoss, orderId: string, actorId: string) {
  return db.transaction(async (tx) => {
    const moved = await tx.update(orders).set({ fulfillmentStatus: "queued", fulfillmentDeadlineAt: new Date(Date.now() + 15 * 60_000), updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.paymentStatus, "paid"), inArray(orders.fulfillmentStatus, ["queued", "generating"]))).returning({ id: orders.id });
    await tx.insert(adminAudit).values({ actorCustomerId: actorId, action: "retry", target: orderId });
    if (moved.length) await enqueueInTx(boss, tx, QUEUES.generateReading, { orderId }, { singletonKey: orderId });
    return moved.length > 0;
  });
}

export async function audit(db: Db, actorId: string, action: string, target: string | null) {
  await db.insert(adminAudit).values({ actorCustomerId: actorId, action, target });
}
