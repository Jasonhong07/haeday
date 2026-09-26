// CC4c: the PayPal adapter over a mocked fetch: request shape, idempotency headers, error mapping, webhook
// verification (raw body sent back byte-for-byte) and event normalization.
import { describe, expect, it } from "vitest";
import { PayPalPaymentAdapter, fromCents, toCents } from "../src/server/adapters/paypal";
import { PaymentProviderError } from "../src/server/payments/adapter";
import { paypalConfigured, parseEnv } from "../src/server/env";

type Call = { url: string; method: string; headers: Record<string, string>; body: string | undefined };
function mockFetch(routes: Array<(c: Call) => { status: number; body: unknown } | undefined>) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const c = { url, method: init.method ?? "GET", headers: init.headers as Record<string, string>, body: init.body as string | undefined };
    calls.push(c);
    if (url.endsWith("/v1/oauth2/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
    for (const r of routes) { const res = r(c); if (res) return new Response(JSON.stringify(res.body), { status: res.status }); }
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const adapter = (f: typeof fetch) => new PayPalPaymentAdapter({ clientId: "cid", clientSecret: "sec", webhookId: "WHID", live: false, fetchImpl: f });

describe("PayPal adapter (CC4c)", () => {
  it("money strings convert without floating point", () => {
    expect(toCents("3.99")).toBe(399); expect(toCents("10")).toBe(1000); expect(toCents("0.5")).toBe(50);
    expect(toCents("1.999")).toBeNull(); expect(toCents("abc")).toBeNull();
    expect(fromCents(399)).toBe("3.99"); expect(fromCents(5)).toBe("0.05");
  });

  it("creates the order in the sandbox with PayPal-Request-Id, server price, our order id and no shipping", async () => {
    const { f, calls } = mockFetch([(c) => (c.url.endsWith("/v2/checkout/orders") && c.method === "POST" ? { status: 201, body: { id: "5O190127TN364715T", status: "CREATED", create_time: "2026-09-26T10:00:00Z" } } : undefined)]);
    const a = adapter(f);
    const req = { orderId: "11111111-1111-4111-8111-111111111111", chartRevisionId: "c", priceId: "saju_reading", successUrl: "", cancelUrl: "", idempotencyKey: "checkout:1111", automaticTax: false, allowPromotionCodes: false, expiresAt: 0 };
    const ref = await a.createCheckoutSession({ ...req, providerParams: a.buildCheckoutParams(req) });
    expect(ref).toMatchObject({ id: "5O190127TN364715T", url: null, status: "open" });
    const call = calls.find((c) => c.url.endsWith("/v2/checkout/orders"))!;
    expect(call.url.startsWith("https://api-m.sandbox.paypal.com")).toBe(true);
    expect(call.headers["PayPal-Request-Id"]).toBe("checkout:1111");
    const body = JSON.parse(call.body!);
    expect(body.intent).toBe("CAPTURE");
    expect(body.purchase_units[0]).toMatchObject({ custom_id: req.orderId, reference_id: req.orderId, invoice_id: `haeday-${req.orderId}`, amount: { currency_code: "USD", value: "3.99" } });
    expect(body.application_context.shipping_preference).toBe("NO_SHIPPING");
  });

  it("maps capture outcomes and errors (already captured, not approved, declined, 5xx = unknown)", async () => {
    let next: { status: number; body: unknown } = { status: 201, body: { status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "CAP1", status: "COMPLETED" }] } }] } };
    const { f, calls } = mockFetch([(c) => (c.url.includes("/capture") ? next : undefined)]);
    const a = adapter(f);
    expect(await a.capture("O1", "capture:o1")).toEqual({ outcome: "completed" });
    expect(calls.at(-1)!.headers["PayPal-Request-Id"]).toBe("capture:o1");
    next = { status: 201, body: { purchase_units: [{ payments: { captures: [{ id: "CAP1", status: "PENDING" }] } }] } };
    expect(await a.capture("O1", "k")).toEqual({ outcome: "pending" });
    next = { status: 422, body: { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "ORDER_ALREADY_CAPTURED" }] } };
    expect(await a.capture("O1", "k")).toEqual({ outcome: "already_captured" });
    next = { status: 422, body: { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "ORDER_NOT_APPROVED" }] } };
    expect(await a.capture("O1", "k")).toEqual({ outcome: "not_approved" });
    next = { status: 422, body: { details: [{ issue: "INSTRUMENT_DECLINED" }] } };
    expect(await a.capture("O1", "k")).toEqual({ outcome: "declined", code: "INSTRUMENT_DECLINED" });
    next = { status: 422, body: { details: [{ issue: "COMPLIANCE_VIOLATION" }] } };
    expect(await a.capture("O1", "k")).toEqual({ outcome: "failed", code: "COMPLIANCE_VIOLATION" }); // unmapped 4xx = final, never retried forever
    next = { status: 503, body: {} };
    await expect(a.capture("O1", "k")).rejects.toMatchObject({ kind: "transient" });
  });

  it("reads the COMPLETED capture even when a declined attempt comes first", async () => {
    const order = { id: "O3", status: "COMPLETED", purchase_units: [{ custom_id: "ord", amount: { currency_code: "USD", value: "3.99" }, payments: { captures: [
      { id: "CAPX", status: "DECLINED", amount: { currency_code: "USD", value: "3.99" } }, { id: "CAPY", status: "COMPLETED", amount: { currency_code: "USD", value: "3.99" } }] } }] };
    const { f } = mockFetch([(c) => (c.url.endsWith("/v2/checkout/orders/O3") ? { status: 200, body: order } : undefined)]);
    expect(await adapter(f).getCheckoutDetails("O3")).toMatchObject({ paymentStatus: "paid", paymentIntentId: "CAPY" });
  });

  it("reads order details: captured amount, capture id, references; no email taken from PayPal", async () => {
    const order = { id: "O2", status: "COMPLETED", create_time: "2026-09-26T10:00:00Z", purchase_units: [{
      reference_id: "ord", custom_id: "ord", amount: { currency_code: "USD", value: "3.99", breakdown: { item_total: { currency_code: "USD", value: "3.99" } } },
      items: [{ sku: "saju_reading", quantity: "1" }], payments: { captures: [{ id: "CAP2", status: "COMPLETED", amount: { currency_code: "USD", value: "3.99" }, create_time: "2026-09-26T10:01:00Z" }] },
    }], payer: { email_address: "payer@example.test" } };
    const { f } = mockFetch([(c) => (c.url.endsWith("/v2/checkout/orders/O2") ? { status: 200, body: order } : undefined)]);
    const d = await adapter(f).getCheckoutDetails("O2");
    expect(d).toMatchObject({ status: "complete", paymentStatus: "paid", currency: "usd", amountSubtotal: 399, amountTotal: 399, amountTax: 0, paymentIntentId: "CAP2", clientReferenceId: "ord", metadataOrderId: "ord", customerEmail: null, lineItems: [{ priceId: "saju_reading", quantity: 1 }] });
  });

  it("refund summary reads known refunds by id and is never 'complete'", async () => {
    const { f } = mockFetch([
      (c) => (c.url.endsWith("/v2/payments/captures/CAP3") ? { status: 200, body: { id: "CAP3", status: "REFUNDED", amount: { currency_code: "USD", value: "3.99" } } } : undefined),
      (c) => (c.url.endsWith("/v2/payments/refunds/R1") ? { status: 200, body: { id: "R1", status: "COMPLETED", amount: { currency_code: "USD", value: "3.99" }, custom_id: "row-1", seller_payable_breakdown: { total_refunded_amount: { value: "3.99", currency_code: "USD" } } } } : undefined),
    ]);
    const s = await adapter(f).getRefundSummary("CAP3", ["R1", "R1"]);
    expect(s).toMatchObject({ amountCapturedCents: 399, amountRefundedCents: 399, complete: false, refunds: [{ id: "R1", status: "succeeded", amountCents: 399, refundRowId: "row-1" }] });
  });

  it("webhook: verified by PayPal with the raw body unchanged; anything but SUCCESS is refused", async () => {
    let status = "SUCCESS";
    const { f, calls } = mockFetch([(c) => (c.url.endsWith("/v1/notifications/verify-webhook-signature") ? { status: 200, body: { verification_status: status } } : undefined)]);
    const raw = '{"id":"WH-9","event_type":"CHECKOUT.ORDER.APPROVED","resource":{"id":"O9"},  "extra":1.10}';
    const headers = new Headers({ "paypal-transmission-sig": "sig", "paypal-transmission-id": "tid", "paypal-transmission-time": "t", "paypal-cert-url": "https://api.paypal.com/cert", "paypal-auth-algo": "SHA256withRSA" });
    const e = await adapter(f).verifyWebhook(raw, headers);
    expect(e).toEqual({ id: "WH-9", livemode: false, type: "checkout.approved", sessionId: "O9" });
    const sent = calls.find((c) => c.url.endsWith("verify-webhook-signature"))!.body!;
    expect(sent.endsWith(`"webhook_event":${raw}}`)).toBe(true); // byte-for-byte, incl. spacing and 1.10
    expect(JSON.parse(sent)).toMatchObject({ webhook_id: "WHID", transmission_sig: "sig" });
    status = "FAILURE";
    await expect(adapter(f).verifyWebhook(raw, headers)).rejects.toThrow();
    await expect(adapter(f).verifyWebhook(raw, new Headers())).rejects.toThrow();
  });

  it("normalizes capture, refund and dispute events", () => {
    const a = adapter(mockFetch([]).f);
    expect(a.normalize({ id: "E1", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAP", supplementary_data: { related_ids: { order_id: "O1" } } } })).toMatchObject({ type: "checkout.completed", sessionId: "O1" });
    expect(a.normalize({ id: "E2", event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { id: "R1", status: "COMPLETED", custom_id: "row", amount: { value: "3.99", currency_code: "USD" }, links: [{ rel: "up", href: "https://api.paypal.com/v2/payments/captures/CAP9" }] } }))
      .toMatchObject({ type: "refund.updated", refundId: "R1", paymentIntentId: "CAP9", status: "succeeded", amountCents: 399, refundRowId: "row" });
    expect(a.normalize({ id: "E3", event_type: "CUSTOMER.DISPUTE.RESOLVED", resource: { dispute_id: "PP-D-1", status: "RESOLVED", dispute_outcome: { outcome_code: "RESOLVED_SELLER_FAVOUR" }, disputed_transactions: [{ seller_transaction_id: "CAP9" }] } }))
      .toMatchObject({ type: "dispute.updated", disputeId: "PP-D-1", status: "won", paymentIntentId: "CAP9" });
    expect(a.normalize({ id: "E5", event_type: "PAYMENT.CAPTURE.REVERSED", resource: { id: "REV1", status: "COMPLETED", amount: { value: "3.99", currency_code: "USD" }, links: [{ rel: "up", href: "https://api.paypal.com/v2/payments/captures/CAP7" }] } }))
      .toMatchObject({ type: "refund.updated", refundId: "REV1", paymentIntentId: "CAP7", amountCents: 399 }); // reversal = refund object pointing at the capture
    expect(a.normalize({ id: "E4", event_type: "BILLING.SUBSCRIPTION.CREATED", resource: {} })).toMatchObject({ type: "ignored" });
    expect(new PaymentProviderError("rejected", "x").kind).toBe("rejected");
  });

  it("PayPal is offered only when fully configured and while sales tax collection is off (Jason 2026-09-26)", () => {
    const base = { APP_ENV: "dev", PAYPAL_CLIENT_ID: "c", PAYPAL_CLIENT_SECRET: "s", PAYPAL_WEBHOOK_ID: "w" };
    expect(paypalConfigured(parseEnv(base))).toBe(true);
    expect(paypalConfigured(parseEnv({ ...base, STRIPE_AUTOMATIC_TAX: "true" }))).toBe(false);
    expect(paypalConfigured(parseEnv({ ...base, PAYPAL_WEBHOOK_ID: "" }))).toBe(false);
  });
});
