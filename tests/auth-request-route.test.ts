import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn(), allow: vi.fn(), origin: vi.fn() }));
vi.mock("../src/server/auth", () => ({ requestMagicLink: mocks.request }));
vi.mock("../src/server/deps", () => ({ emailAdapter: () => null, supportEmail: () => "support@example.test" }));
vi.mock("../src/server/ratelimit", () => ({ allowRequest: mocks.allow, clientIp: () => "127.0.0.1" }));
vi.mock("../src/server/http", () => ({
  sameOrigin: mocks.origin,
  serverContext: () => ({ db: {}, ring: {}, env: { APP_ORIGIN: "https://haeday.test", ADMIN_EMAILS: ["owner@example.test"] } }),
  json: (body: unknown, status = 200) => Response.json(body, { status }),
}));
import { POST } from "../src/app/api/auth/request/route";

const request = (email = "buyer@example.test") => new Request("https://haeday.test/api/auth/request", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
});
describe("D38 public login responses", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.allow.mockReturnValue(true); mocks.origin.mockReturnValue(true); });
  it.each(["sent", "not_sent", "throttled", "unavailable"])("hides internal result %s", async (result) => {
    mocks.request.mockResolvedValue(result);
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({ adminEmails: ["owner@example.test"] }), "buyer@example.test");
  });
  it("keeps a uniform IP limit without attempting delivery", async () => {
    mocks.allow.mockReturnValue(false);
    expect((await POST(request())).status).toBe(429);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("rejects malformed addresses and foreign origins before delivery", async () => {
    expect((await POST(request("invalid"))).status).toBe(400);
    mocks.origin.mockReturnValue(false);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
