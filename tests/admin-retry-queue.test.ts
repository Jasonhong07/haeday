// D36 admin retry against real Postgres + pg-boss (replaces the earlier mock-only check: a mock cannot prove a
// rollback). Covers: enqueue bound to the transaction, +1 grant per request (double click = one), refusal rules,
// token invalidation, and "already queued" reported instead of a false success.
import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { retryOrder } from "../src/server/admin";
import type { DbHandle } from "../src/server/db/client";
import { attemptGrants, customers, disputes, generationAttempts, guests, orders, refunds } from "../src/server/db/schema";
import { QUEUES, createBoss, ensureQueues } from "../src/server/queue/boss";
import { TEST_DATABASE_URL, freshDb, hasDb } from "./integration/helpers";

describe.skipIf(!hasDb)("admin retry (D36)", () => {
  let h: DbHandle; let boss: PgBoss; let admin: string;
  beforeAll(async () => {
    h = await freshDb(); boss = createBoss(TEST_DATABASE_URL!); await boss.start(); await ensureQueues(boss);
    const [a] = await h.db.insert(customers).values({ emailLookup: "adm", emailEnc: "v1.a.b.c.d", verifiedAt: new Date() }).returning();
    admin = a!.id;
  });
  afterAll(async () => { await boss?.stop({ graceful: false }); await h?.pool.end(); });

  async function mk(fulfillment: "queued" | "generating" | "failed", attempts = 0) {
    const [g] = await h.db.insert(guests).values({ cookieHash: randomBytes(6).toString("hex") }).returning();
    const [o] = await h.db.insert(orders).values({ guestId: g!.id, sku: "saju_reading", unitAmountCents: 399, totalCents: 399, consentVersion: "c", paymentStatus: "paid", paidAt: new Date(), fulfillmentStatus: fulfillment, stripePaymentIntentId: `pi_${randomBytes(4).toString("hex")}`, currentFencingToken: randomUUID() }).returning();
    for (let i = 1; i <= attempts; i++) await h.db.insert(generationAttempts).values({ orderId: o!.id, attemptNo: i, status: "failed" });
    return o!;
  }
  const jobs = async (id: string) => ((await h.db.execute(sql`select count(*)::int as n from pgboss.job where name = ${QUEUES.generateReading} and singleton_key = ${id} and state = 'created'`)).rows[0] as { n: number }).n;
  const grants = async (id: string) => (await h.db.select().from(attemptGrants).where(eq(attemptGrants.orderId, id))).length;

  it("queues a stuck order in one transaction and invalidates the old worker's token", async () => {
    const o = await mk("generating", 1);
    expect(await retryOrder(h.db, boss, o.id, admin)).toBe("queued");
    const after = (await h.db.query.orders.findFirst({ where: eq(orders.id, o.id) }))!;
    expect(after).toMatchObject({ fulfillmentStatus: "queued", currentFencingToken: null });
    expect(await jobs(o.id)).toBe(1);
    expect(await retryOrder(h.db, boss, o.id, admin)).toBe("already_queued"); // reported, not a fake success
    expect(await jobs(o.id)).toBe(1);
  });

  it("an exhausted order gets +1 attempt per request; the same request (double click) grants once", async () => {
    const o = await mk("failed", 3);
    const req = randomUUID();
    expect(await retryOrder(h.db, boss, o.id, admin, req)).toBe("granted_and_queued");
    expect(await retryOrder(h.db, boss, o.id, admin, req)).toBe("duplicate_request");
    expect(await grants(o.id)).toBe(1);
  });

  it("refuses refunded / refunding / disputed orders; allows after a FAILED refund (D49 free reading)", async () => {
    const a = await mk("failed", 3);
    await h.db.insert(refunds).values({ orderId: a.id, reason: "service_failure", idempotencyKey: `r:${a.id}`, amountCents: 399, status: "pending", requestedBy: "worker" });
    expect(await retryOrder(h.db, boss, a.id, admin)).toBe("not_allowed");
    await h.db.update(refunds).set({ status: "failed" }).where(eq(refunds.orderId, a.id));
    expect(await retryOrder(h.db, boss, a.id, admin)).toBe("granted_and_queued");
    const b = await mk("generating");
    await h.db.insert(disputes).values({ orderId: b.id, stripeDisputeId: `dp_${randomBytes(4).toString("hex")}`, status: "needs_response" });
    expect(await retryOrder(h.db, boss, b.id, admin)).toBe("not_allowed");
  });

  it("a queue failure rolls back the order change and the grant", async () => {
    const o = await mk("failed", 3);
    const flaky = new Proxy(boss, { get: (t, p) => (p === "send" ? async () => { throw new Error("queue down"); } : Reflect.get(t, p)) });
    await expect(retryOrder(h.db, flaky, o.id, admin)).rejects.toThrow();
    expect((await h.db.query.orders.findFirst({ where: eq(orders.id, o.id) }))!.fulfillmentStatus).toBe("failed");
    expect(await grants(o.id)).toBe(0);
  });

  it("retry while an older job is still ACTIVE: reported as already queued, and the order is re-released when that job ends", async () => {
    const o = await mk("generating", 1);
    await boss.send(QUEUES.generateReading, { orderId: o.id }, { singletonKey: o.id });
    const fetched = (await boss.fetch<{ orderId: string }>(QUEUES.generateReading, { batchSize: 100 })) ?? []; // all now "active"
    expect(fetched.some((j) => j.data.orderId === o.id)).toBe(true);
    expect(await retryOrder(h.db, boss, o.id, admin)).toBe("already_queued");
    // The old worker's result can no longer be saved (token cleared); its job ends as "skipped".
    for (const j of fetched) await boss.complete(QUEUES.generateReading, j.id);
    const { releaseDeferred } = await import("../src/server/fulfillment/generate");
    expect(await releaseDeferred({ db: h.db, boss })).toBeGreaterThanOrEqual(1);
    expect(await jobs(o.id)).toBe(1);
    expect((await h.db.query.orders.findFirst({ where: eq(orders.id, o.id) }))!.fulfillmentNotBefore).toBeNull();
  });
});
