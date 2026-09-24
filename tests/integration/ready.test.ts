import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.resetModules(); vi.unstubAllEnvs(); });

it("reports not_ready quickly when the database is unreachable", async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://nobody:x@127.0.0.1:1/none");
  const { GET } = await import("../../src/app/api/health/ready/route");
  const started = Date.now();
  const res = await GET();
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ status: "not_ready" });
  expect(Date.now() - started).toBeLessThan(5000);
});
