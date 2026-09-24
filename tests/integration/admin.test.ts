import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dashboard, retryOrder, undelivered } from "../../src/server/admin";
import type { DbHandle } from "../../src/server/db/client";
import { customers, guests, orders, refunds } from "../../src/server/db/schema";
import { QUEUES, createBoss, ensureQueues } from "../../src/server/queue/boss";
import { TEST_DATABASE_URL, freshDb, hasDb } from "./helpers";

describe.skipIf(!hasDb)("admin dashboard data", () => {
  let h: DbHandle; let boss: PgBoss;
  beforeAll(async () => { h = await freshDb(); boss = createBoss(TEST_DATABASE_URL!); await boss.start(); await ensureQueues(boss); });
  afterAll(async () => { await boss?.stop({ graceful: false }); await h?.pool.end(); });

  it("derives money from orders and refunds, and retries stuck orders with an audit row", async () => {
    const [g] = await h.db.insert(guests).values({ cookieHash: randomBytes(6).toString("hex") }).returning();
    const [admin] = await h.db.insert(customers).values({ emailLookup: "x", emailEnc: "v1.a.b.c.d", verifiedAt: new Date() }).returning();
    const mk = (status: "paid" | "refunded", tax: number) => h.db.insert(orders).values({ guestId: g!.id, sku: "saju_reading", unitAmountCents: 399, subtotalCents: 399, taxCents: tax, totalCents: 399 + tax, consentVersion: "c", paymentStatus: status, paidAt: new Date(), fulfillmentStatus: "generating" }).returning();
    const [a] = await mk("paid", 0); const [b] = await mk("refunded", 30);
    await h.db.insert(refunds).values({ orderId: b!.id, reason: "goodwill", idempotencyKey: `r:${b!.id}`, amountCents: 429, status: "succeeded", requestedBy: "customer" });
    const d = await dashboard(h.db, 7);
    expect(d).toMatchObject({ paidOrders: 2, grossCents: 828, taxCents: 30, refundCents: 429, netCents: 369 });
    expect((await undelivered(h.db)).map((o) => o.id)).toContain(a!.id);
    expect(await retryOrder(h.db, boss, a!.id, admin!.id)).toBe("queued");
    expect((await h.db.query.orders.findFirst({ where: eq(orders.id, a!.id) }))!.fulfillmentStatus).toBe("queued");
    const n = (await h.db.execute(sql`select count(*)::int as n from pgboss.job where name = ${QUEUES.generateReading} and singleton_key = ${a!.id}`)).rows[0] as { n: number };
    expect(n.n).toBe(1);
    expect(await retryOrder(h.db, boss, b!.id, admin!.id)).toBe("not_allowed"); // refunded orders are never retried
  });
});
