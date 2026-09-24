// Retention cron (ARCHITECTURE §4.9, D16). Deleting personal data is the one allowed exception to immutable rows,
// and every such change is stamped with pii_deleted_at.
import { and, eq, inArray, isNull, lt, notExists, or, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { chartRevisions, emailOutbox, magicLinks, marketingContacts, orders, readings, sessions } from "./db/schema";

export const PAID_RETENTION_DAYS = 365;
export const UNPAID_ORDER_DAYS = 30;

export async function runRetention(db: Db, now = new Date()) {
  const paidCutoff = new Date(now.getTime() - PAID_RETENTION_DAYS * 86_400_000);
  const unpaidCutoff = new Date(now.getTime() - UNPAID_ORDER_DAYS * 86_400_000);
  const PAID_LIKE = ["paid", "refund_pending", "refunded", "partially_refunded"] as const;

  return db.transaction(async (tx) => {
    // 1) Unpaid charts past delete_after that no paid-like order points to: remove entirely.
    const charts = await tx.delete(chartRevisions).where(and(
      lt(chartRevisions.deleteAfter, now),
      notExists(tx.select({ one: sql`1` }).from(orders).where(and(eq(orders.chartRevisionId, chartRevisions.id), inArray(orders.paymentStatus, [...PAID_LIKE])))),
    )).returning({ id: chartRevisions.id });

    // 2) Open/expired orders older than 30 days keep amounts and ids only.
    const unpaid = await tx.update(orders).set({ snapshotEnc: null, deliveryEmailEnc: null, piiDeletedAt: now, updatedAt: now })
      .where(and(inArray(orders.paymentStatus, ["open", "expired"]), lt(orders.createdAt, unpaidCutoff), isNull(orders.piiDeletedAt)))
      .returning({ id: orders.id });

    // 3) Paid orders 12 months after payment: chart, reading, snapshot and email go; transaction records stay.
    const old = await tx.select({ id: orders.id, chartRevisionId: orders.chartRevisionId }).from(orders)
      .where(and(inArray(orders.paymentStatus, [...PAID_LIKE]), lt(orders.paidAt, paidCutoff), isNull(orders.piiDeletedAt)));
    const ids = old.map((o) => o.id);
    const chartIds = old.map((o) => o.chartRevisionId).filter((x): x is string => Boolean(x));
    if (ids.length) {
      await tx.update(orders).set({ snapshotEnc: null, deliveryEmailEnc: null, deliveryEmailLookup: null, piiDeletedAt: now, updatedAt: now }).where(inArray(orders.id, ids));
      await tx.update(readings).set({ contentEnc: null, piiDeletedAt: now }).where(inArray(readings.orderId, ids));
      await tx.update(emailOutbox).set({ toEmailEnc: null, piiDeletedAt: now }).where(inArray(emailOutbox.orderId, ids));
    }
    if (chartIds.length) {
      await tx.update(chartRevisions).set({ inputEnc: null, responseEnc: null, piiDeletedAt: now }).where(inArray(chartRevisions.id, chartIds));
    }

    // 3b) C4: free-chart emails keep their address and chart summary 30 days (enough for retries), then only ids.
    const chartMail = await tx.update(emailOutbox).set({ toEmailEnc: null, payloadEnc: null, toLookup: null, piiDeletedAt: now })
      .where(and(eq(emailOutbox.kind, "chart"), lt(emailOutbox.createdAt, unpaidCutoff), isNull(emailOutbox.piiDeletedAt))).returning({ id: emailOutbox.id });

    // 3c) Safety net: unsubscribe() already drops the address; unsubscribed contacts keep only the keyed lookup.
    const contacts = await tx.update(marketingContacts).set({ emailEnc: null })
      .where(and(sql`${marketingContacts.unsubscribedAt} is not null`, sql`${marketingContacts.emailEnc} is not null`)).returning({ id: marketingContacts.id });

    // 4) Expired or used login artefacts.
    const links = await tx.delete(magicLinks).where(or(lt(magicLinks.expiresAt, now), lt(magicLinks.createdAt, new Date(now.getTime() - 86_400_000)))).returning({ id: magicLinks.id });
    const sess = await tx.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id });

    return { chartsDeleted: charts.length, unpaidOrdersScrubbed: unpaid.length, paidOrdersScrubbed: ids.length, chartEmailsScrubbed: chartMail.length, unsubscribedContactsScrubbed: contacts.length, magicLinksDeleted: links.length, sessionsDeleted: sess.length };
  });
}
