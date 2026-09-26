import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ env: vi.fn(), db: vi.fn(), enabled: vi.fn(), alert: vi.fn() }));
vi.mock("../src/server/env", () => ({ getEnv: m.env, paymentsConfigured: () => true, llmConfigured: () => true }));
vi.mock("../src/server/db/client", () => ({ getDb: m.db }));
vi.mock("../src/server/settings", () => ({ isSalesEnabled: m.enabled }));
vi.mock("@sentry/nextjs", () => ({ captureMessage: m.alert }));
import { publicSalesOpen } from "../src/server/public-sales";
beforeEach(() => { vi.clearAllMocks(); m.env.mockReturnValue({ DATABASE_URL: "postgres://local/test" }); m.db.mockReturnValue({ db: {} }); m.enabled.mockResolvedValue(true); });
it("works without private encryption keys", async () => { expect(await publicSalesOpen()).toBe(true); });
it("missing DB leaves sales off without a connection", async () => { m.env.mockReturnValue({}); expect(await publicSalesOpen()).toBe(false); expect(m.db).not.toHaveBeenCalled(); });
it("database failure disables sales without leaking the exception", async () => {
  m.enabled.mockRejectedValue(new Error("SECRET query birth details"));
  expect(await publicSalesOpen()).toBe(false);
  expect(JSON.stringify(m.alert.mock.calls)).not.toContain("SECRET");
});
it("invalid configuration cannot enable sales", async () => { m.env.mockImplementation(() => { throw new Error("bad config"); }); expect(await publicSalesOpen()).toBe(false); });
