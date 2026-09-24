import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "../../src/server/db/client";
import { chartRevisions, guests, orders, refunds } from "../../src/server/db/schema";
import { freshDb, hasDb } from "./helpers";

describe.skipIf(!hasDb)("schema constraints", () => {
  let h: DbHandle; let guestId: string; let revisionId: string;
  beforeAll(async () => {
    h = await freshDb();
    [{ id: guestId }] = await h.db.insert(guests).values({ cookieHash: "g1" }).returning({ id: guests.id }) as [{ id: string }];
    [{ id: revisionId }] = await h.db.insert(chartRevisions).values({
      chartGroupId: crypto.randomUUID(), guestId, inputEnc: "v1.x", responseEnc: "v1.y",
      policyVersion: "haeday-chart-v1", coverageVersion: "cov-1", tzdataVersion: "test", libraryVersion: "lib-0",
      deleteAfter: new Date(Date.now() + 30 * 86400000),
    }).returning({ id: chartRevisions.id }) as [{ id: string }];
  });
  afterAll(async () => { await h?.pool.end(); });
  const order = () => ({ guestId, chartRevisionId: revisionId, sku: "saju_reading", unitAmountCents: 399, consentVersion: "c1" });

  it("allows only one open or paid order per guest + revision + sku", async () => {
    await h.db.insert(orders).values(order());
    await expect(h.db.insert(orders).values(order())).rejects.toThrow();
    await h.db.update(orders).set({ paymentStatus: "expired" });
    await expect(h.db.insert(orders).values(order())).resolves.toBeDefined();
  });

  it("allows one active or successful refund claim per order regardless of reason (D15)", async () => {
    const [o] = await h.db.select({ id: orders.id }).from(orders).where(sql`${orders.paymentStatus} = 'open'`);
    const claim = (key: string, reason: "goodwill" | "service_failure") => ({ orderId: o!.id, reason, idempotencyKey: key, amountCents: 399, requestedBy: "test" });
    await h.db.insert(refunds).values(claim("a", "goodwill"));
    await expect(h.db.insert(refunds).values(claim("b", "service_failure"))).rejects.toThrow();
    await h.db.update(refunds).set({ status: "failed" });
    await expect(h.db.insert(refunds).values(claim("c", "service_failure"))).resolves.toBeDefined();
  });

  it("lets Stripe-originated refunds coexist with a service claim (D15 partial refunds stay visible)", async () => {
    const [o] = await h.db.select({ id: orders.id }).from(orders).where(sql`${orders.paymentStatus} = 'open'`);
    await expect(h.db.insert(refunds).values({ orderId: o!.id, source: "provider", reason: "admin", idempotencyKey: "stripe:re_1", amountCents: 100, requestedBy: "stripe", status: "succeeded" })).resolves.toBeDefined();
    await expect(h.db.insert(refunds).values({ orderId: o!.id, source: "provider", reason: "admin", idempotencyKey: "stripe:re_2", amountCents: 100, requestedBy: "stripe", status: "succeeded" })).resolves.toBeDefined();
  });

  it("keeps a refund_pending order in the active slot so it can return to paid", async () => {
    // A sold order (unlocked: fulfillment past "none") being refunded still owns the slot.
    await h.db.update(orders).set({ paymentStatus: "refund_pending", fulfillmentStatus: "delivered" }).where(sql`${orders.paymentStatus} = 'open'`);
    await expect(h.db.insert(orders).values(order())).rejects.toThrow();
  });

  it("a payment that never unlocked (fulfillment none: D34/D51 refunds) does not block a new purchase", async () => {
    await h.db.update(orders).set({ fulfillmentStatus: "none" }).where(sql`${orders.paymentStatus} = 'refund_pending'`);
    await expect(h.db.insert(orders).values(order())).resolves.toBeTruthy();
  });

  it("rejects non-positive prices", async () => {
    await expect(h.db.insert(orders).values({ ...order(), unitAmountCents: 0, sku: "x" })).rejects.toThrow();
  });

  it("stores no plaintext personal columns", async () => {
    const r = await h.db.execute(sql`select column_name from information_schema.columns where table_schema='public' and column_name ~ '(email|birth|input|response|content|snapshot)' and column_name !~ '(_enc|_lookup)$'`);
    expect(r.rows).toEqual([]);
  });

  it("allows retention to null every encrypted column (D16)", async () => {
    const r = await h.db.execute(sql`select table_name, column_name from information_schema.columns where table_schema='public' and column_name like '%\_enc' escape '\' and is_nullable = 'NO' and table_name <> 'customers'`);
    expect(r.rows).toEqual([]);
  });
});
