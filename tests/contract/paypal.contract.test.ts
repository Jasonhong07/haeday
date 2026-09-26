// PayPal SANDBOX contract check for CC4c (never live: the adapter is built with live=false). Runs only when
// PAYPAL_CONTRACT_CLIENT_ID and PAYPAL_CONTRACT_SECRET are sandbox REST app credentials.
// Command: PAYPAL_CONTRACT_CLIENT_ID=... PAYPAL_CONTRACT_SECRET=... pnpm vitest run tests/contract/paypal.contract.test.ts
// Checks what our code relies on and cannot learn from docs alone: PayPal-Request-Id replay on order create,
// the order body we send is accepted (NO_SHIPPING, item sku, invoice id), details read back as we map them,
// and capturing an unapproved order is refused as ORDER_NOT_APPROVED (so we never charge without approval).
// Approval needs a sandbox buyer in a browser: capture → refund → refund summary is a manual staging check.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PayPalPaymentAdapter } from "../../src/server/adapters/paypal";

const id = process.env.PAYPAL_CONTRACT_CLIENT_ID ?? "";
const secret = process.env.PAYPAL_CONTRACT_SECRET ?? "";
const enabled = Boolean(id && secret);

describe.skipIf(!enabled)("PayPal sandbox contract (CC4c)", () => {
  const a = enabled ? new PayPalPaymentAdapter({ clientId: id, clientSecret: secret, webhookId: undefined, live: false }) : (null as unknown as PayPalPaymentAdapter);
  const req = () => {
    const orderId = randomUUID();
    const r = { orderId, chartRevisionId: randomUUID(), priceId: "saju_reading", successUrl: "", cancelUrl: "", idempotencyKey: `contract:${orderId}`, automaticTax: false, allowPromotionCodes: false, expiresAt: 0 };
    return { ...r, providerParams: a.buildCheckoutParams(r) };
  };

  it("same PayPal-Request-Id → same order; details map to our fields", async () => {
    const r = req();
    const first = await a.createCheckoutSession(r);
    const again = await a.createCheckoutSession(r);
    expect(again.id).toBe(first.id);
    expect(first.status).toBe("open");
    const d = await a.getCheckoutDetails(first.id);
    expect(d).toMatchObject({ status: "open", paymentStatus: "unpaid", currency: "usd", amountSubtotal: 399, amountTotal: 399, clientReferenceId: r.orderId, metadataOrderId: r.orderId, lineItems: [{ priceId: "saju_reading", quantity: 1 }], paymentIntentId: null });
  }, 60_000);

  it("capturing before the buyer approves is refused (not_approved), never a charge", async () => {
    const r = await a.createCheckoutSession(req());
    expect(await a.capture(r.id, `capture:${randomUUID()}`)).toBe("not_approved");
  }, 60_000);
});
