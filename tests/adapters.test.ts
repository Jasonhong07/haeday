// Provider adapters: request shape and parsing (no network).
import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { AnthropicLlm, LlmError } from "../src/server/adapters/llm";
import { EmailError, ResendEmail } from "../src/server/adapters/email";
import { StripePaymentAdapter } from "../src/server/adapters/stripe";

describe("Anthropic adapter", () => {
  it("forces the tool call and returns its JSON input", async () => {
    let sent: { url: string; body: Record<string, unknown>; headers: Record<string, string> } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> };
      return new Response(JSON.stringify({ model: "m-1", content: [{ type: "tool_use", input: { ok: true } }], usage: { input_tokens: 10, output_tokens: 20 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const llm = new AnthropicLlm("sk-test", "m-1", fake);
    const r = await llm.generate({ system: "s", user: "u", jsonSchema: { type: "object" }, maxTokens: 100, timeoutMs: 1000 });
    expect(r).toEqual({ json: { ok: true }, modelId: "m-1", inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 });
    expect(sent!.url).toBe("https://api.anthropic.com/v1/messages");
    expect(sent!.body).toMatchObject({ model: "m-1", tool_choice: { type: "tool", name: "write_reading" }, max_tokens: 100 });
    expect(sent!.headers["x-api-key"]).toBe("sk-test");
  });
  it("maps HTTP errors and missing tool output to LlmError codes", async () => {
    const err = new AnthropicLlm("k", "m", (async () => new Response("{}", { status: 529 })) as unknown as typeof fetch);
    await expect(err.generate({ system: "", user: "", jsonSchema: {}, maxTokens: 1, timeoutMs: 1000 })).rejects.toMatchObject({ code: "http" });
    const empty = new AnthropicLlm("k", "m", (async () => new Response(JSON.stringify({ content: [{ type: "text" }] }))) as unknown as typeof fetch);
    await expect(empty.generate({ system: "", user: "", jsonSchema: {}, maxTokens: 1, timeoutMs: 1000 })).rejects.toBeInstanceOf(LlmError);
  });
});

describe("Resend adapter", () => {
  it("sends the idempotency key and marks 4xx rejections permanent", async () => {
    let headers: Record<string, string> = {};
    const ok = new ResendEmail("re_x", "Haeday <hello@haeday.com>", undefined, (async (_u: string, init: RequestInit) => { headers = init.headers as Record<string, string>; return new Response(JSON.stringify({ id: "e1" })); }) as unknown as typeof fetch);
    expect(await ok.send({ to: "a@b.co", subject: "s", html: "h", text: "t", idempotencyKey: "k1" })).toEqual({ id: "e1" });
    expect(headers["Idempotency-Key"]).toBe("k1");
    const bad = new ResendEmail("re_x", "f", undefined, (async () => new Response("{}", { status: 422 })) as unknown as typeof fetch);
    await expect(bad.send({ to: "x", subject: "s", html: "h", text: "t", idempotencyKey: "k" })).rejects.toMatchObject({ permanent: true });
    const flaky = new ResendEmail("re_x", "f", undefined, (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch);
    await expect(flaky.send({ to: "x", subject: "s", html: "h", text: "t", idempotencyKey: "k" })).rejects.toBeInstanceOf(EmailError);
  });
});

describe("Stripe webhook parsing", () => {
  const secret = "whsec_test_secret";
  const adapter = new StripePaymentAdapter("sk_test_dummy", secret);
  const sign = (payload: string) => new Stripe("sk_test_dummy").webhooks.generateTestHeaderString({ payload, secret });

  it("verifies the signature and normalizes checkout.session.completed", () => {
    const payload = JSON.stringify({ id: "evt_1", object: "event", livemode: false, type: "checkout.session.completed", data: { object: { id: "cs_test_1", object: "checkout.session" } } });
    expect(adapter.parseWebhook(payload, sign(payload))).toEqual({ id: "evt_1", livemode: false, type: "checkout.completed", sessionId: "cs_test_1" });
  });
  it("rejects a tampered body or missing signature", () => {
    const payload = JSON.stringify({ id: "evt_2", object: "event", livemode: false, type: "checkout.session.completed", data: { object: { id: "cs_test_2" } } });
    const header = sign(payload);
    expect(() => adapter.parseWebhook(payload.replace("cs_test_2", "cs_test_X"), header)).toThrow();
    expect(() => adapter.parseWebhook(payload, null)).toThrow();
  });
  it("normalizes refunds and ignores unrelated events", () => {
    const refund = JSON.stringify({ id: "evt_3", object: "event", livemode: false, type: "refund.updated", data: { object: { id: "re_1", object: "refund", status: "succeeded", amount: 399, payment_intent: "pi_1", metadata: { orderId: "o1" } } } });
    expect(adapter.parseWebhook(refund, sign(refund))).toMatchObject({ type: "refund.updated", refundId: "re_1", status: "succeeded", paymentIntentId: "pi_1", orderId: "o1" });
    const other = JSON.stringify({ id: "evt_4", object: "event", livemode: false, type: "customer.created", data: { object: { id: "cus_1" } } });
    expect(adapter.parseWebhook(other, sign(other))).toMatchObject({ type: "ignored", providerType: "customer.created" });
  });
});
