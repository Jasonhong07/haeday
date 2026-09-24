// Read models for customer pages. Access: the guest who created the order (and, in M6, the verified customer).
import { and, eq, or, type SQL, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./db/client";
import { orders, readings } from "./db/schema";
import type { Reading } from "./fulfillment/prompt";
import type { OrderSnapshot } from "./payments/checkout";
import { decryptPrivate, type Keyring } from "./security/encryption";
import { aad } from "./security/keyring";

export interface Viewer { guestId: string | null; customerId: string | null }

function owns(v: Viewer): SQL | undefined {
  const parts = [v.guestId ? eq(orders.guestId, v.guestId) : undefined, v.customerId ? eq(orders.customerId, v.customerId) : undefined].filter(Boolean) as SQL[];
  return parts.length ? or(...parts) : undefined;
}

export type OrderState = "awaiting_payment" | "processing" | "delivered" | "failed_refunded" | "refunded" | "expired";

export async function loadOrderView(db: Db, orderId: string, v: Viewer) {
  const access = owns(v);
  if (!access || !z.uuid().safeParse(orderId).success) return null;
  const o = await db.query.orders.findFirst({ where: and(eq(orders.id, orderId), access) });
  if (!o) return null;
  const reading = await db.query.readings.findFirst({ where: eq(readings.orderId, o.id), columns: { id: true } });
  let state: OrderState;
  if (o.paymentStatus === "open") state = "awaiting_payment";
  else if (o.paymentStatus === "expired") state = "expired";
  else if (o.fulfillmentStatus === "delivered" && reading) state = "delivered";
  else if (o.fulfillmentStatus === "failed") state = "failed_refunded";
  else if (o.paymentStatus === "refunded" || o.paymentStatus === "refund_pending") state = "refunded";
  else state = "processing";
  return { id: o.id, state, readingId: reading?.id ?? null, chartRevisionId: o.chartRevisionId, paidAt: o.paidAt, delayed: o.deliveryPromise === "24h" };
}

export async function loadReadingView(db: Db, ring: Keyring, readingId: string, v: Viewer) {
  const access = owns(v);
  if (!access || !z.uuid().safeParse(readingId).success) return null;
  const [row] = await db.select({ r: readings, o: orders }).from(readings).innerJoin(orders, eq(readings.orderId, orders.id))
    .where(and(eq(readings.id, readingId), access));
  if (!row || !row.r.contentEnc) return null;
  const reading = decryptPrivate<Reading>(row.r.contentEnc, aad("readings", readingId, "content"), ring);
  // D40 step 8: first time the owner opened it.
  if (!row.r.firstViewedAt) await db.update(readings).set({ firstViewedAt: new Date() }).where(and(eq(readings.id, readingId), isNull(readings.firstViewedAt)));
  const snapshot = row.o.snapshotEnc ? decryptPrivate<OrderSnapshot>(row.o.snapshotEnc, aad("orders", row.o.id, "snapshot"), ring) : null;
  const response = snapshot?.response as { kind: string; chart?: { disclosure: string | null; dayMaster: { stem: string }; pillars: Record<string, { stem: string; branch: string; stemEn: string; branchEn: string; stemElement: string; branchElement: string } | null> } } | undefined;
  return {
    reading, deliveredAt: row.r.deliveredAt, orderId: row.o.id, refunded: row.o.paymentStatus === "refunded",
    disclosure: response?.chart?.disclosure ?? null, pillars: response?.chart?.pillars ?? null, dayMasterStem: response?.chart?.dayMaster.stem ?? null,
    placeLabel: snapshot?.input.placeLabel ?? null,
  };
}
