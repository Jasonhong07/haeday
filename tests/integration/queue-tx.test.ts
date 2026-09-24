import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PgBoss } from "pg-boss";
import type { DbHandle } from "../../src/server/db/client";
import { guests } from "../../src/server/db/schema";
import { QUEUES, createBoss, enqueueInTx, ensureQueues } from "../../src/server/queue/boss";
import { TEST_DATABASE_URL, freshDb, hasDb } from "./helpers";

async function jobCount(h: DbHandle, marker: string): Promise<number> {
  const r = await h.db.execute(sql`select count(*)::int as n from pgboss.job where name = ${QUEUES.generateReading} and data->>'marker' = ${marker}`);
  return (r.rows[0] as { n: number }).n;
}

describe.skipIf(!hasDb)("DB row + queue job share one transaction (M0 proof)", () => {
  let h: DbHandle; let boss: PgBoss;
  beforeAll(async () => {
    h = await freshDb();
    boss = createBoss(TEST_DATABASE_URL!);
    await boss.start();
    await ensureQueues(boss);
  });
  afterAll(async () => { await boss?.stop({ graceful: false }); await h?.pool.end(); });

  it("rolls back both the row and the job when the transaction throws", async () => {
    await expect(h.db.transaction(async (tx) => {
      await tx.insert(guests).values({ cookieHash: "rollback-guest" });
      await enqueueInTx(boss, tx, QUEUES.generateReading, { marker: "rollback" }, { singletonKey: "order-rollback" });
      throw new Error("forced failure after enqueue");
    })).rejects.toThrow("forced failure");
    expect(await h.db.select().from(guests).where(eq(guests.cookieHash, "rollback-guest"))).toHaveLength(0);
    expect(await jobCount(h, "rollback")).toBe(0);
  });

  it("commits both the row and the job together", async () => {
    await h.db.transaction(async (tx) => {
      await tx.insert(guests).values({ cookieHash: "commit-guest" });
      await enqueueInTx(boss, tx, QUEUES.generateReading, { marker: "commit" }, { singletonKey: "order-commit" });
    });
    expect(await h.db.select().from(guests).where(eq(guests.cookieHash, "commit-guest"))).toHaveLength(1);
    expect(await jobCount(h, "commit")).toBe(1);
  });

  it("deduplicates by singletonKey inside transactions", async () => {
    await h.db.transaction(async (tx) => {
      await enqueueInTx(boss, tx, QUEUES.generateReading, { marker: "single" }, { singletonKey: "order-1" });
    });
    await h.db.transaction(async (tx) => {
      await enqueueInTx(boss, tx, QUEUES.generateReading, { marker: "single" }, { singletonKey: "order-1", duplicateExpected: true });
    });
    expect(await jobCount(h, "single")).toBe(1);
  });

  it("refuses keyless sends on exclusive queues and unexpected drops", async () => {
    await expect(h.db.transaction(async (tx) => enqueueInTx(boss, tx, QUEUES.sendEmail, { marker: "nokey" }))).rejects.toThrow("singletonKey");
    await expect(h.db.transaction(async (tx) => enqueueInTx(boss, tx, QUEUES.generateReading, { marker: "single" }, { singletonKey: "order-1" }))).rejects.toThrow("not enqueued");
  });

  it("enqueues from a web-process boss that was never started as a worker", async () => {
    const webBoss = createBoss(TEST_DATABASE_URL!, "web");
    await webBoss.start();
    await h.db.transaction(async (tx) => {
      await enqueueInTx(webBoss, tx, QUEUES.generateReading, { marker: "web" }, { singletonKey: "order-web" });
    });
    expect(await jobCount(h, "web")).toBe(1);
    await webBoss.stop({ graceful: false });
  });
});
