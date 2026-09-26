// CC4a route guards: resend only for the order's owner and same-origin; admin search/issue/resend only for admins.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ origin: vi.fn(), view: vi.fn(), resend: vi.fn(), admin: vi.fn(), find: vi.fn(), setIssue: vi.fn(), allow: vi.fn() }));
vi.mock("../src/server/http", () => ({
  sameOrigin: m.origin, readCookie: () => undefined,
  serverContext: () => ({ db: {}, ring: {}, env: { APP_ORIGIN: "https://haeday.test", DATABASE_URL: "postgres://x" } }),
  json: (body: unknown, status = 200) => Response.json(body, { status }),
}));
vi.mock("../src/server/guest", () => ({ findGuest: async () => ({ id: "g1" }), GUEST_COOKIE: "g" }));
vi.mock("../src/server/auth", () => ({ customerFromSession: async () => null, SESSION_COOKIE: "s" }));
vi.mock("../src/server/orders", () => ({ loadOrderView: m.view }));
vi.mock("../src/server/queue/boss", () => ({ getWebBoss: async () => ({}) }));
vi.mock("../src/server/ratelimit", () => ({ allowRequest: m.allow, clientIp: () => "1.2.3.4" }));
vi.mock("../src/server/support", () => ({ resendDelivery: m.resend, findOrders: m.find, setIssueStatus: m.setIssue }));
vi.mock("../src/server/admin-guard", () => ({ requireAdmin: m.admin }));
vi.mock("../src/server/admin", () => ({ audit: async () => undefined }));

import { POST as customerResend } from "../src/app/api/orders/[id]/resend/route";
import { POST as adminSearch } from "../src/app/api/admin/search/route";
import { POST as adminIssue } from "../src/app/api/admin/issues/[id]/route";
import { POST as adminResend } from "../src/app/api/admin/orders/[id]/resend/route";

const post = (url: string, body?: BodyInit, headers?: Record<string, string>) => new Request(`https://haeday.test${url}`, { method: "POST", body, headers });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const ORDER = "11111111-1111-4111-8111-111111111111";

describe("CC4a support routes", () => {
  beforeEach(() => { vi.clearAllMocks(); m.origin.mockReturnValue(true); m.allow.mockReturnValue(true); m.admin.mockResolvedValue(null); });

  it("customer resend: cross-site → 403, not the owner → 404, owner → resend for THAT order", async () => {
    m.origin.mockReturnValue(false);
    expect((await customerResend(post(`/api/orders/${ORDER}/resend`), params(ORDER))).status).toBe(403);
    m.origin.mockReturnValue(true);
    m.view.mockResolvedValue(null);
    expect((await customerResend(post(`/api/orders/${ORDER}/resend`), params(ORDER))).status).toBe(404);
    expect(m.resend).not.toHaveBeenCalled();
    m.view.mockResolvedValue({ id: ORDER });
    m.resend.mockResolvedValue("queued");
    const ok = await customerResend(post(`/api/orders/${ORDER}/resend`), params(ORDER));
    expect(await ok.json()).toEqual({ status: "queued" });
    expect(m.resend).toHaveBeenCalledWith(expect.anything(), ORDER, "customer");
    m.allow.mockReturnValue(false);
    expect((await customerResend(post(`/api/orders/${ORDER}/resend`), params(ORDER))).status).toBe(429);
  });

  it("admin routes: without an admin session everything is 404 and nothing runs", async () => {
    expect((await adminSearch(post("/api/admin/search", JSON.stringify({ q: "a@b.test" }), { "Content-Type": "application/json" }))).status).toBe(404);
    const form = new FormData(); form.set("status", "resolved");
    expect((await adminIssue(post(`/api/admin/issues/${ORDER}`, form), params(ORDER))).status).toBe(404);
    expect((await adminResend(post(`/api/admin/orders/${ORDER}/resend`, new FormData()), params(ORDER))).status).toBe(404);
    expect(m.find).not.toHaveBeenCalled(); expect(m.setIssue).not.toHaveBeenCalled(); expect(m.resend).not.toHaveBeenCalled();
  });

  it("admin redirect goes only to fixed admin paths; the message is a fixed code", async () => {
    m.admin.mockResolvedValue({ ctx: { db: {}, ring: {}, env: { APP_ORIGIN: "https://haeday.test", DATABASE_URL: "postgres://x" } }, actorId: "a1" });
    m.resend.mockResolvedValue("queued");
    const form = new FormData(); form.set("back", "order");
    const r = await adminResend(post(`/api/admin/orders/${ORDER}/resend`, form), params(ORDER));
    expect(r.headers.get("location")).toBe(`https://haeday.test/admin/orders/${ORDER}?msg=resend_queued`);
    const f2 = new FormData(); f2.set("status", "resolved"); f2.set("back", "order"); f2.set("orderId", "https://evil.test");
    m.setIssue.mockResolvedValue(true);
    const r2 = await adminIssue(post(`/api/admin/issues/${ORDER}`, f2), params(ORDER));
    expect(r2.headers.get("location")).toBe("https://haeday.test/admin?msg=issue_resolved");
  });
});
