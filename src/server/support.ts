// CC4a: support tools for a one-person operation. Jason gets an email "I never got my reading" and needs to find
// the order, see what happened, and fix it without touching the database. Lookups use the keyed email hash (D17):
// the typed address is never stored, logged or put in a URL.
import { and, count, desc, eq, inArray, like, notInArray, or, sql } from "drizzle-orm";
import { CLOSED_DISPUTE_STATUSES } from "./alerts";
import type { PgBoss } from "pg-boss";
import { z } from "zod";
import type { Db } from "./db/client";
import { adminAudit, disputes, emailOutbox, generationAttempts, orders, paymentIssues, readings, refunds } from "./db/schema";
import { QUEUES, enqueueInTx } from "./queue/boss";
import { decryptPrivate, emailLookup, encryptPrivate, normalizeEmail, type Keyring } from "./security/encryption";
import { aad } from "./security/keyring";

export const MAX_RESENDS = 3;           // extra delivery emails per order, admin and customer together
export const CUSTOMER_RESEND_GAP_MS = 10 * 60_000;
export const ADMIN_RESEND_GAP_MS = 60_000;   // a double click never sends twice

export type OrderRow = {
  id: string; createdAt: Date; paidAt: Date | null; payment: string; fulfillment: string; totalCents: number | null;
  promise: string; duplicate: boolean; readingId: string | null;
};

const rowCols = {
  id: orders.id, createdAt: orders.createdAt, paidAt: orders.paidAt, payment: orders.paymentStatus, fulfillment: orders.fulfillmentStatus,
  totalCents: orders.totalCents, promise: orders.deliveryPromise, duplicateOf: orders.duplicateOfOrderId, readingId: readings.id,
};
const toRow = (r: { id: string; createdAt: Date; paidAt: Date | null; payment: string; fulfillment: string; totalCents: number | null; promise: string; duplicateOf: string | null; readingId: string | null }): OrderRow =>
  ({ id: r.id, createdAt: r.createdAt, paidAt: r.paidAt, payment: r.payment, fulfillment: r.fulfillment, totalCents: r.totalCents, promise: r.promise, duplicate: Boolean(r.duplicateOf), readingId: r.readingId });

/**
 * Admin search: a full or partial order id (≥ 8 hex characters, as shown in alerts and emails), a Stripe
 * checkout session / payment intent id, or the checkout email (matched through its keyed hash).
 */
export async function findOrders(db: Db, ring: Keyring, query: string): Promise<OrderRow[]> {
  const q = query.trim();
  let where;
  if (z.email().safeParse(normalizeEmail(q)).success) where = eq(orders.deliveryEmailLookup, emailLookup(normalizeEmail(q), ring));
  else if (/^(cs|pi)_(test|live)_[A-Za-z0-9]+$/.test(q)) where = or(eq(orders.stripeSessionId, q), eq(orders.stripePaymentIntentId, q));
  else if (/^[0-9a-f-]{8,36}$/i.test(q)) where = like(sql`${orders.id}::text`, `${q.toLowerCase()}%`);
  else return [];
  const rows = await db.select(rowCols).from(orders).leftJoin(readings, eq(readings.orderId, orders.id)).where(where).orderBy(desc(orders.createdAt)).limit(25);
  return rows.map(toRow);
}

/** Everything about one order a person needs, ids and statuses only (no email address, birth data or reading text). */
export async function orderDetail(db: Db, orderId: string) {
  if (!z.uuid().safeParse(orderId).success) return null;
  const [o] = await db.select(rowCols).from(orders).leftJoin(readings, eq(readings.orderId, orders.id)).where(eq(orders.id, orderId));
  if (!o) return null;
  const [full] = await db.select({
    deadline: orders.fulfillmentDeadlineAt, notBefore: orders.fulfillmentNotBefore, discount: orders.discountCents, tax: orders.taxCents,
    hasEmail: sql<boolean>`${orders.deliveryEmailEnc} is not null`, session: orders.stripeSessionId, intent: orders.stripePaymentIntentId,
    duplicateOf: orders.duplicateOfOrderId, piiDeleted: orders.piiDeletedAt,
  }).from(orders).where(eq(orders.id, orderId));
  const [refundRows, attempts, emails, issues, disputeRows] = await Promise.all([
    db.select({ id: refunds.id, reason: refunds.reason, status: refunds.status, amountCents: refunds.amountCents, source: refunds.source, at: refunds.createdAt, failure: refunds.failureReason })
      .from(refunds).where(eq(refunds.orderId, orderId)).orderBy(refunds.createdAt),
    db.select({ status: generationAttempts.status, error: generationAttempts.errorCode, at: generationAttempts.startedAt, model: generationAttempts.modelId })
      .from(generationAttempts).where(eq(generationAttempts.orderId, orderId)).orderBy(generationAttempts.startedAt),
    db.select({ kind: emailOutbox.kind, status: emailOutbox.status, attempts: emailOutbox.attempts, error: emailOutbox.lastError, at: emailOutbox.createdAt, key: emailOutbox.dedupeKey })
      .from(emailOutbox).where(eq(emailOutbox.orderId, orderId)).orderBy(emailOutbox.createdAt),
    db.select({ id: paymentIssues.id, kind: paymentIssues.kind, status: paymentIssues.status, next: paymentIssues.nextAction, at: paymentIssues.createdAt })
      .from(paymentIssues).where(eq(paymentIssues.orderId, orderId)),
    db.select({ status: disputes.status, due: disputes.evidenceDueBy }).from(disputes).where(eq(disputes.orderId, orderId)),
  ]);
  return { order: toRow(o), ...full!, refunds: refundRows, attempts, emails, issues, disputes: disputeRows };
}

export type ResendResult = "queued" | "not_delivered" | "no_email" | "limit" | "too_soon" | "not_found";

/**
 * Sends the delivery email again to the address used at checkout (never to a new address: that would let anyone
 * with the order page redirect a reading). Up to MAX_RESENDS per order; not within 1 minute (admin) or 10 minutes
 * (customer) of the last delivery email. Serialised per order (row lock), so a double click queues one email.
 */
export async function resendDelivery(deps: { db: Db; boss: PgBoss; ring: Keyring; now?: () => Date }, orderId: string, by: "admin" | "customer", actorId?: string): Promise<ResendResult> {
  const now = deps.now?.() ?? new Date();
  return deps.db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!o) return "not_found" as const;
    const reading = await tx.select({ id: readings.id }).from(readings).where(eq(readings.orderId, orderId));
    // Only a plain paid, delivered order: never while a refund or dispute is under way (or after one).
    if (o.fulfillmentStatus !== "delivered" || !reading.length || o.paymentStatus !== "paid") return "not_delivered" as const;
    const [openDispute] = await tx.select({ id: disputes.id }).from(disputes)
      .where(and(eq(disputes.orderId, orderId), notInArray(disputes.status, [...CLOSED_DISPUTE_STATUSES]))).limit(1);
    if (openDispute) return "not_delivered" as const;
    if (!o.deliveryEmailEnc) return "no_email" as const;
    const prior = await tx.select({ key: emailOutbox.dedupeKey, at: emailOutbox.createdAt }).from(emailOutbox)
      .where(and(eq(emailOutbox.orderId, orderId), eq(emailOutbox.kind, "delivery"))).orderBy(desc(emailOutbox.createdAt));
    const resends = prior.filter((p) => p.key.startsWith(`${orderId}:delivery:r`)).length;
    if (resends >= MAX_RESENDS) return "limit" as const;
    const gap = by === "customer" ? CUSTOMER_RESEND_GAP_MS : ADMIN_RESEND_GAP_MS;
    if (prior[0] && now.getTime() - prior[0].at.getTime() < gap) return "too_soon" as const;
    const to = decryptPrivate<string>(o.deliveryEmailEnc, aad("orders", orderId, "delivery_email"), deps.ring);
    const id = crypto.randomUUID();
    const key = `${orderId}:delivery:r${resends + 1}`;
    await tx.insert(emailOutbox).values({ id, kind: "delivery", orderId, dedupeKey: key, toEmailEnc: encryptPrivate(to, aad("email_outbox", id, "to_email"), deps.ring), createdAt: now });
    await enqueueInTx(deps.boss, tx, QUEUES.sendEmail, { dedupeKey: key }, { singletonKey: key });
    if (by === "admin" && actorId) await tx.insert(adminAudit).values({ actorCustomerId: actorId, action: "resend_delivery", target: orderId });
    return "queued" as const;
  });
}

/** Admin marks a payment issue as seen (no more alert emails) or resolved. Reopens by itself if it happens again. */
export async function setIssueStatus(db: Db, issueId: string, status: "acknowledged" | "resolved", actorId: string, now = new Date()): Promise<boolean> {
  if (!z.uuid().safeParse(issueId).success) return false;
  return db.transaction(async (tx) => {
    const upd = await tx.update(paymentIssues).set({ status, resolvedAt: status === "resolved" ? now : null, updatedAt: now })
      .where(and(eq(paymentIssues.id, issueId), inArray(paymentIssues.status, ["open", "acknowledged"]))).returning({ id: paymentIssues.id });
    if (!upd.length) return false;
    await tx.insert(adminAudit).values({ actorCustomerId: actorId, action: `issue_${status}`, target: issueId });
    return true;
  });
}

export async function resendCount(db: Db, orderId: string): Promise<number> {
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(emailOutbox).where(like(emailOutbox.dedupeKey, `${orderId}:delivery:r%`));
  return n;
}
