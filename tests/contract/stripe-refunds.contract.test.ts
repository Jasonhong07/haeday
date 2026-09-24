// Stripe TEST-MODE contract check for the CC1a refund design. Runs only when STRIPE_CONTRACT_KEY is an sk_test_ key
// (never a live key). It creates a real test-mode payment with Stripe's test card token, then checks the exact
// provider behaviour our code relies on. Command: STRIPE_CONTRACT_KEY=sk_test_... pnpm vitest run tests/contract
import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { StripePaymentAdapter } from "../../src/server/adapters/stripe";

const key = process.env.STRIPE_CONTRACT_KEY ?? "";
const enabled = key.startsWith("sk_test_");

describe.skipIf(!enabled)("Stripe test-mode refund contract (CC1a)", () => {
  // Built lazily: the describe body runs even when skipped. (Test-only SDK use: creating a test payment has no adapter.)
  const stripe = enabled ? new Stripe(key) : (null as unknown as Stripe);
  const adapter = enabled ? new StripePaymentAdapter(key, undefined) : (null as unknown as StripePaymentAdapter);

  async function testPayment(amount = 399) {
    const pi = await stripe.paymentIntents.create({
      amount, currency: "usd", payment_method: "pm_card_visa", confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" }, metadata: { contract: "cc1a" },
    });
    expect(pi.status).toBe("succeeded");
    return pi.id;
  }

  it("partial refunds, metadata round-trip, full list and amount_refunded", async () => {
    const pi = await testPayment();
    const run = Date.now();
    const a = await adapter.createRefund({ paymentIntentId: pi, amountCents: 200, idempotencyKey: `contract:${run}:a`, orderId: "o-contract", refundRowId: "row-a" });
    await adapter.createRefund({ paymentIntentId: pi, amountCents: 199, idempotencyKey: `contract:${run}:b`, orderId: "o-contract", refundRowId: "row-b" });
    const s = await adapter.getRefundSummary(pi);
    expect(s.livemode).toBe(false);
    expect(s.amountCapturedCents).toBe(399);
    expect(s.refunds).toHaveLength(2);
    expect(s.refunds.find((r) => r.id === a.id)).toMatchObject({ refundRowId: "row-a", orderId: "o-contract", amountCents: 200, currency: "usd" });
    // amount_refunded counts refunds that hold money back (our derivation relies on this).
    expect(s.amountRefundedCents).toBe(s.refunds.filter((r) => r.status !== "failed" && r.status !== "canceled").reduce((x, r) => x + r.amountCents, 0));
    // Over-refund is rejected by Stripe (our remaining-amount math must never rely on Stripe to stop a double refund).
    await expect(adapter.createRefund({ paymentIntentId: pi, amountCents: 1, idempotencyKey: `contract:${run}:c`, orderId: "o", refundRowId: "row-c" })).rejects.toThrow();
  });

  it("same idempotency key + same params replays; same key + different params is an error", async () => {
    const pi = await testPayment();
    const k = `contract:${Date.now()}:idem`;
    const r1 = await adapter.createRefund({ paymentIntentId: pi, amountCents: 100, idempotencyKey: k, orderId: "o", refundRowId: "row" });
    const r2 = await adapter.createRefund({ paymentIntentId: pi, amountCents: 100, idempotencyKey: k, orderId: "o", refundRowId: "row" });
    expect(r2.id).toBe(r1.id);
    await expect(adapter.createRefund({ paymentIntentId: pi, amountCents: 101, idempotencyKey: k, orderId: "o", refundRowId: "row" })).rejects.toThrow();
  });

  it("CC1b: frozen checkout body replays the same session; a different body under the same key is an idempotency error", async () => {
    const price = process.env.STRIPE_CONTRACT_PRICE; // a $3.99 test-mode price id
    if (!price) return;
    const req = {
      orderId: `00000000-0000-4000-8000-${String(Date.now()).padStart(12, "0").slice(-12)}`, chartRevisionId: "c", priceId: price,
      successUrl: "https://example.com/s", cancelUrl: "https://example.com/c", idempotencyKey: `contract-checkout:${Date.now()}`,
      automaticTax: false, allowPromotionCodes: true, expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };
    const frozen = { ...req, providerParams: adapter.buildCheckoutParams(req) };
    const a = await adapter.createCheckoutSession(frozen);
    const b = await adapter.createCheckoutSession(frozen);
    expect(b.id).toBe(a.id);
    await expect(adapter.createCheckoutSession({ ...frozen, providerParams: { ...frozen.providerParams, allow_promotion_codes: false } }))
      .rejects.toMatchObject({ code: "idempotency_mismatch" });
    // A stale expiry is rejected before execution (our "rejected ⇒ never created" inference).
    await expect(adapter.createCheckoutSession({ ...req, idempotencyKey: `${req.idempotencyKey}:stale`, expiresAt: Math.floor(Date.now() / 1000) + 60 }))
      .rejects.toMatchObject({ kind: "rejected" });
    const d = await adapter.getCheckoutDetails(a.id);
    expect(d).toMatchObject({ amountDiscount: 0, amountShipping: 0, clientReferenceId: req.orderId, metadataOrderId: req.orderId });
    await adapter.expireCheckoutSession(a.id);
  });
});
