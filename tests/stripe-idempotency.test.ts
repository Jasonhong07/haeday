// Cross-check D: a retry with the same idempotency key must send identical parameters, or Stripe rejects it
// ("Keys for idempotent requests can only be used with the same parameters they were first used with").
import { describe, expect, it, vi } from "vitest";
import { StripePaymentAdapter } from "../src/server/adapters/stripe";

describe("Stripe checkout idempotency", () => {
  it.fails("D: two calls with the same key a few seconds apart send identical parameters", async () => {
    const a = new StripePaymentAdapter("sk_test_dummy", "whsec_dummy");
    const seen: unknown[] = [];
    (a as unknown as { stripe: unknown }).stripe = {
      checkout: { sessions: { create: async (params: unknown) => { seen.push(params); return { id: "cs_1", url: "u", status: "open" }; } } },
    };
    const req = { orderId: "o1", chartRevisionId: "c1", priceId: "price_1", successUrl: "s", cancelUrl: "c", idempotencyKey: "checkout:o1", automaticTax: false };
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
    await a.createCheckoutSession(req);
    vi.setSystemTime(new Date("2026-10-01T00:00:05Z"));
    await a.createCheckoutSession(req);
    vi.useRealTimers();
    expect(seen[1]).toEqual(seen[0]);
  });
});
