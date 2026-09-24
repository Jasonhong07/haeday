// Cross-check D / CC1b F4: a retry with the same idempotency key must send identical parameters, or Stripe rejects
// it ("Keys for idempotent requests can only be used with the same parameters they were first used with").
import { describe, expect, it, vi } from "vitest";
import { StripePaymentAdapter } from "../src/server/adapters/stripe";
import { PaymentProviderError } from "../src/server/payments/adapter";

const req = {
  orderId: "o1", chartRevisionId: "c1", priceId: "price_1", successUrl: "s", cancelUrl: "c", idempotencyKey: "checkout:o1",
  automaticTax: false, allowPromotionCodes: true, expiresAt: 1_790_000_000,
};

function withCreate(create: (params: unknown) => Promise<unknown>) {
  const a = new StripePaymentAdapter("sk_test_dummy", "whsec_dummy");
  (a as unknown as { stripe: unknown }).stripe = { checkout: { sessions: { create } } };
  return a;
}

describe("Stripe checkout idempotency (F4)", () => {
  it("D: two calls with the same frozen request a few seconds apart send identical parameters", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const a = withCreate(async (params) => { seen.push(params as Record<string, unknown>); return { id: "cs_1", url: "u", status: "open" }; });
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
    await a.createCheckoutSession(req);
    vi.setSystemTime(new Date("2026-10-01T00:00:05Z"));
    await a.createCheckoutSession(req);
    vi.useRealTimers();
    expect(seen[1]).toEqual(seen[0]);
    expect(seen[0]).toMatchObject({ expires_at: req.expiresAt, allow_promotion_codes: true, client_reference_id: "o1" });
  });

  it("classifies provider errors: invalid request = rejected (never executed); idempotency/network = transient", async () => {
    const err = (type: string) => withCreate(async () => { throw Object.assign(new Error(type), { type }); });
    await expect(err("StripeInvalidRequestError").createCheckoutSession(req)).rejects.toMatchObject({ kind: "rejected" });
    await expect(err("StripeIdempotencyError").createCheckoutSession(req)).rejects.toMatchObject({ kind: "transient", code: "idempotency_mismatch" });
    await expect(err("StripeConnectionError").createCheckoutSession(req)).rejects.toBeInstanceOf(PaymentProviderError);
    await expect(err("StripeConnectionError").createCheckoutSession(req)).rejects.toMatchObject({ kind: "transient" });
  });
});
