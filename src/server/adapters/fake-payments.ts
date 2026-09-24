// In-memory PaymentAdapter for tests and the local dev checkout simulator. Never used in staging/production.
import { randomUUID } from "node:crypto";
import type {
  CheckoutDetails, CheckoutSessionRef, CheckoutSessionRequest, PaymentAdapter, PaymentEvent, RefundResult, RefundStatus,
} from "../payments/adapter";

interface FakeSession { ref: CheckoutSessionRef; req: CheckoutSessionRequest; details: Partial<CheckoutDetails> }

export class FakePaymentAdapter implements PaymentAdapter {
  readonly provider = "fake" as const;
  sessions = new Map<string, FakeSession>();
  byIdempotency = new Map<string, string>();
  refunds = new Map<string, RefundResult & { idempotencyKey: string; amountCents: number }>();
  calls = { createSession: 0, createRefund: 0 };
  /** Next refund outcome, or a function that throws to simulate a network error. */
  nextRefund: RefundStatus | (() => never) = "succeeded";
  livemode = false;

  async createCheckoutSession(req: CheckoutSessionRequest): Promise<CheckoutSessionRef> {
    this.calls.createSession++;
    const existing = this.byIdempotency.get(req.idempotencyKey);
    if (existing) return this.sessions.get(existing)!.ref;
    const id = `cs_test_${randomUUID().replace(/-/g, "")}`;
    const ref: CheckoutSessionRef = { id, url: `https://checkout.fake/${id}`, status: "open" };
    this.sessions.set(id, { ref, req, details: {} });
    this.byIdempotency.set(req.idempotencyKey, id);
    return ref;
  }

  async getCheckoutSession(sessionId: string): Promise<CheckoutSessionRef> {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error("No such session");
    return s.ref;
  }

  /** Test helper: mark a session paid, optionally overriding any field to simulate tampering. */
  complete(sessionId: string, override: Partial<CheckoutDetails> = {}): void {
    const s = this.sessions.get(sessionId)!;
    s.ref.status = "complete";
    s.details = { paymentStatus: "paid", paymentIntentId: `pi_${sessionId.slice(8, 24)}`, customerEmail: "buyer@example.test", ...override };
  }

  async getCheckoutDetails(sessionId: string): Promise<CheckoutDetails> {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error("No such session");
    return {
      id: sessionId, livemode: this.livemode, status: s.ref.status, paymentStatus: "unpaid",
      currency: "usd", amountSubtotal: 399, amountTax: 0, amountTotal: 399,
      clientReferenceId: s.req.orderId, metadataOrderId: s.req.orderId,
      lineItems: [{ priceId: s.req.priceId, quantity: 1 }], paymentIntentId: null, customerEmail: null,
      ...s.details,
    };
  }

  async expireCheckoutSession(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (s && s.ref.status === "open") s.ref.status = "expired";
  }

  async createRefund(req: { paymentIntentId: string; amountCents: number; idempotencyKey: string; orderId: string }): Promise<RefundResult> {
    this.calls.createRefund++;
    const prior = [...this.refunds.values()].find((r) => r.idempotencyKey === req.idempotencyKey);
    if (prior) return { id: prior.id, status: prior.status };
    if (typeof this.nextRefund === "function") this.nextRefund();
    const r = { id: `re_${randomUUID().slice(0, 12)}`, status: this.nextRefund as RefundStatus, idempotencyKey: req.idempotencyKey, amountCents: req.amountCents };
    this.refunds.set(r.id, r);
    return { id: r.id, status: r.status };
  }

  /** Tests pass already-built events as JSON; the signature must be "fake-signature". */
  parseWebhook(rawBody: string, signature: string | null): PaymentEvent {
    if (signature !== "fake-signature") throw new Error("Bad signature");
    return JSON.parse(rawBody) as PaymentEvent;
  }
}
