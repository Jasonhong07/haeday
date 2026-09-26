// CC4c: the PayPal webhook route only acts on events PayPal itself verified; a verify outage asks PayPal to retry.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentProviderError } from "../src/server/payments/adapter";

const m = vi.hoisted(() => ({ verify: vi.fn(), handle: vi.fn(), adapter: vi.fn() }));
vi.mock("../src/server/deps", () => ({ paypalAdapter: m.adapter, paymentAdapter: () => null }));
vi.mock("../src/server/http", () => ({
  serverContext: () => ({ db: {}, ring: {}, env: { DATABASE_URL: "postgres://x", PAYMENTS_MODE: "test" } }),
  json: (body: unknown, status = 200) => Response.json(body, { status }),
}));
vi.mock("../src/server/payments/webhook", () => ({ handlePaymentEvent: m.handle }));
vi.mock("../src/server/queue/boss", () => ({ getWebBoss: async () => ({}) }));
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));
import { POST } from "../src/app/api/webhooks/paypal/route";

const req = () => new Request("https://haeday.test/api/webhooks/paypal", { method: "POST", body: '{"id":"WH-1"}' });

describe("PayPal webhook route (CC4c)", () => {
  beforeEach(() => { vi.clearAllMocks(); m.adapter.mockReturnValue({ verifyWebhook: m.verify }); });
  it("not configured → 503; bad signature → 400 and nothing handled", async () => {
    m.adapter.mockReturnValue(null);
    expect((await POST(req())).status).toBe(503);
    m.adapter.mockReturnValue({ verifyWebhook: m.verify });
    m.verify.mockRejectedValue(new Error("Bad signature"));
    expect((await POST(req())).status).toBe(400);
    expect(m.handle).not.toHaveBeenCalled();
  });
  it("PayPal's verify API down → 503 (PayPal retries), never processed unverified", async () => {
    m.verify.mockRejectedValue(new PaymentProviderError("transient", "paypal_503"));
    expect((await POST(req())).status).toBe(503);
    expect(m.handle).not.toHaveBeenCalled();
  });
  it("verified → handled; a handler crash → 500 so PayPal redelivers", async () => {
    m.verify.mockResolvedValue({ id: "WH-1", livemode: false, type: "checkout.completed", sessionId: "O1" });
    m.handle.mockResolvedValue({ outcome: "paid" });
    const ok = await POST(req());
    expect(await ok.json()).toEqual({ received: true, outcome: "paid" });
    m.handle.mockRejectedValue(new Error("db down"));
    expect((await POST(req())).status).toBe(500);
  });
});
