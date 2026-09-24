import { describe, expect, it, vi } from "vitest";
import type { PgBoss } from "pg-boss";
import type { Db } from "../src/server/db/client";
import { retryOrder } from "../src/server/admin";

describe("admin retry queue transaction", () => {
  function fixture(jobId: string | null) {
    const tx = {
      update: () => ({ set: () => ({ where: () => ({ returning: async () => [{ id: "order" }] }) }) }),
      insert: () => ({ values: async () => undefined }),
      execute: vi.fn(),
    };
    const db = { transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as Db;
    const send = vi.fn(async () => jobId);
    const boss = { send } as unknown as PgBoss;
    return { db, boss, send };
  }
  it("passes the transaction-bound DB adapter to the queue", async () => {
    const f = fixture("job");
    expect(await retryOrder(f.db, f.boss, "order", "admin")).toBe(true);
    expect(f.send).toHaveBeenCalledWith("reading.generate", { orderId: "order" }, expect.objectContaining({
      singletonKey: "order", db: expect.objectContaining({ executeSql: expect.any(Function) }),
    }));
  });
  it("rejects a dropped queue insertion instead of committing a false success", async () => {
    const f = fixture(null);
    await expect(retryOrder(f.db, f.boss, "order", "admin")).rejects.toThrow("Job was not enqueued");
  });
});
