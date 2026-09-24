// Owner dashboard data (D19). Money comes from orders/refunds, never from client analytics. UTC throughout.
import { and, count, desc, eq, gt, gte, inArray, isNull, lt, ne, sql, sum } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { Db } from "./db/client";
import { randomUUID } from "node:crypto";
import { adminAudit, attemptGrants, chartRevisions, disputes, generationAttempts, orders, paymentIssues, refunds } from "./db/schema";
import { MAX_ATTEMPTS } from "./fulfillment/generate";
import { QUEUES, enqueueInTx } from "./queue/boss";

export async function dashboard(db: Db, days: number, now = new Date()) {
  const from = new Date(now.getTime() - days * 86_400_000);
  const paidLike = ["paid", "refund_pending", "refunded", "partially_refunded"] as const;
  const [charts] = await db.select({ n: count() }).from(chartRevisions).where(gte(chartRevisions.createdAt, from));
  const [guestsWithChart] = await db.select({ n: sql<number>`count(distinct ${chartRevisions.guestId})::int` }).from(chartRevisions).where(gte(chartRevisions.createdAt, from));
  // F15: free (100% code) orders are entitlements, not sales: excluded from paid orders and revenue, counted apart.
  // Money (gross/tax) counts every captured payment; the ORDER count leaves out payments that were never a sale
  // (duplicates and validation-failure refunds, which never unlock: fulfillment "none").
  const [paid] = await db.select({ gross: sum(orders.totalCents), tax: sum(orders.taxCents) }).from(orders)
    .where(and(inArray(orders.paymentStatus, [...paidLike]), gte(orders.paidAt, from), gt(orders.totalCents, 0)));
  const [sales] = await db.select({ n: count() }).from(orders)
    .where(and(inArray(orders.paymentStatus, [...paidLike]), gte(orders.paidAt, from), gt(orders.totalCents, 0), isNull(orders.duplicateOfOrderId), ne(orders.fulfillmentStatus, "none")));
  const [free] = await db.select({ n: count() }).from(orders)
    .where(and(inArray(orders.paymentStatus, [...paidLike]), gte(orders.paidAt, from), eq(orders.totalCents, 0)));
  const [refunded] = await db.select({ n: count(), amount: sum(refunds.amountCents) }).from(refunds)
    .where(and(eq(refunds.status, "succeeded"), gte(refunds.updatedAt, from)));
  const [checkouts] = await db.select({ n: count() }).from(orders).where(gte(orders.createdAt, from));
  // F14: AI cost of everything generated in the window (all attempts, failed ones included), per delivered reading.
  const [ai] = await db.select({
    attempts: count(), costed: sql<number>`count(${generationAttempts.costMicroUsd})::int`, micro: sql<number>`coalesce(sum(${generationAttempts.costMicroUsd}), 0)::bigint`,
    delivered: sql<number>`count(distinct case when ${orders.fulfillmentStatus} = 'delivered' then ${orders.id} end)::int`,
  }).from(generationAttempts).innerJoin(orders, eq(generationAttempts.orderId, orders.id)).where(gte(generationAttempts.startedAt, from));
  const aiAttempts = ai?.attempts ?? 0; const aiCostMicro = Number(ai?.micro ?? 0); const delivered = ai?.delivered ?? 0;
  const gross = Number(paid?.gross ?? 0), tax = Number(paid?.tax ?? 0), ref = Number(refunded?.amount ?? 0);
  return {
    from, to: now, chartsCreated: charts?.n ?? 0, chartBrowsers: guestsWithChart?.n ?? 0, checkoutsStarted: checkouts?.n ?? 0,
    aiAttempts, aiCostMicroUsd: aiCostMicro, aiUnknownCostAttempts: aiAttempts - (ai?.costed ?? 0), aiCostPerDeliveredMicroUsd: delivered ? Math.round(aiCostMicro / delivered) : null,
    paidOrders: sales?.n ?? 0, freeOrders: free?.n ?? 0, grossCents: gross, taxCents: tax, refundsCount: refunded?.n ?? 0, refundCents: ref, netCents: gross - tax - ref,
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

export type RetryResult = "queued" | "granted_and_queued" | "already_queued" | "duplicate_request" | "not_allowed";

/**
 * D36 admin retry. Allowed only for paid orders that are not refunded and not being refunded (a refund that
 * FAILED still allows it: D49 "a free reading instead"), with no open dispute. An order that used all its
 * attempts gets +1 attempt per admin request; the request id makes a double click grant only one. The running
 * attempt's fencing token is invalidated, and the job is enqueued in the same transaction. An already queued job
 * is reported, never shown as a fresh success.
 */
export async function retryOrder(db: Db, boss: PgBoss, orderId: string, actorId: string, requestId: string = randomUUID(), now = new Date()): Promise<RetryResult> {
  return db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    const refundRows = o ? await tx.select({ status: refunds.status, source: refunds.source }).from(refunds).where(eq(refunds.orderId, orderId)) : [];
    const refundOpenOrDone = refundRows.some((r) => r.source === "service" && r.status !== "failed" && r.status !== "canceled");
    const [dispute] = o ? await tx.select({ id: disputes.id }).from(disputes)
      .where(and(eq(disputes.orderId, orderId), sql`${disputes.status} not in ('won', 'lost', 'warning_closed', 'prevented')`)).limit(1) : [];
    // The same admin request again (double click, resubmitted form): nothing new happens.
    const [seen] = await tx.select({ id: attemptGrants.id }).from(attemptGrants).where(eq(attemptGrants.requestId, requestId));
    if (seen) return "duplicate_request" as const;
    if (!o || o.paymentStatus !== "paid" || !["queued", "generating", "failed"].includes(o.fulfillmentStatus) || refundOpenOrDone || dispute || o.duplicateOfOrderId) {
      await tx.insert(adminAudit).values({ actorCustomerId: actorId, action: "retry_refused", target: orderId });
      return "not_allowed" as const;
    }
    const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(generationAttempts).where(eq(generationAttempts.orderId, orderId));
    const [{ g } = { g: 0 }] = await tx.select({ g: count() }).from(attemptGrants).where(eq(attemptGrants.orderId, orderId));
    let granted = false;
    if (n >= MAX_ATTEMPTS + g) {
      const ins = await tx.insert(attemptGrants).values({ orderId, requestId, actorCustomerId: actorId }).onConflictDoNothing().returning({ id: attemptGrants.id });
      if (ins.length === 0) return "duplicate_request" as const; // the same click, again
      granted = true;
    }
    // Fresh deadline (a "24h" order keeps its later promise), no deferral, old worker token can no longer save.
    const fresh = new Date(now.getTime() + 15 * 60_000);
    const deadline = o.fulfillmentDeadlineAt && o.fulfillmentDeadlineAt > fresh ? o.fulfillmentDeadlineAt : fresh;
    // fulfillmentNotBefore = now is a release marker: if an older job is still active (the enqueue below is then
    // deduplicated), the every-minute releaseDeferred cron enqueues this order as soon as that job ends.
    await tx.update(orders).set({ fulfillmentStatus: "queued", fulfillmentDeadlineAt: deadline, fulfillmentNotBefore: now, currentFencingToken: null, updatedAt: now })
      .where(eq(orders.id, orderId));
    await tx.update(generationAttempts).set({ status: "abandoned", finishedAt: now })
      .where(and(eq(generationAttempts.orderId, orderId), eq(generationAttempts.status, "running")));
    await tx.insert(adminAudit).values({ actorCustomerId: actorId, action: granted ? "retry_grant" : "retry", target: orderId });
    const job = await enqueueInTx(boss, tx, QUEUES.generateReading, { orderId }, { singletonKey: orderId, duplicateExpected: true });
    if (!job) return "already_queued" as const;
    return granted ? "granted_and_queued" as const : "queued" as const;
  });
}

export async function audit(db: Db, actorId: string, action: string, target: string | null) {
  await db.insert(adminAudit).values({ actorCustomerId: actorId, action, target });
}
