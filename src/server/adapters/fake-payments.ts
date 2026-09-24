// In-memory PaymentAdapter for tests and the local dev checkout simulator. Never used in staging/production.
import { randomUUID } from "node:crypto";
import { PaymentProviderError } from "../payments/adapter";
import type {
  CheckoutDetails, CheckoutSessionRef, CheckoutSessionRequest, CompletedSessionRef, PaymentAdapter, PaymentEvent, PaymentRefundSummary, ProviderRefund, RefundResult, RefundStatus,
} from "../payments/adapter";

interface FakeSession { ref: CheckoutSessionRef; req: CheckoutSessionRequest; details: Partial<CheckoutDetails>; created: number }

export class FakePaymentAdapter implements PaymentAdapter {
  readonly provider = "fake" as const;
  sessions = new Map<string, FakeSession>();
  byIdempotency = new Map<string, string>();
  refunds = new Map<string, ProviderRefund & { idempotencyKey: string | null; paymentIntentId: string }>();
  /** Captured amount per PaymentIntent (set by complete()). */
  captured = new Map<string, number>();
  calls = { createSession: 0, createRefund: 0, getRefundSummary: 0 };
  /** Test hooks: run inside a provider call to simulate races or crashes. */
  hooks: { beforeCreateRefund?: () => Promise<void>; afterCreateRefund?: (r: RefundResult) => Promise<void>; beforeSummaryReturn?: (pi: string) => Promise<void> } = {};
  /** Next refund outcome, or a function that throws to simulate a network error. */
  nextRefund: RefundStatus | (() => never) = "succeeded";
  livemode = false;
  /** Base of the "checkout page" URL (tests: an unreachable host; dev E2E: our own /dev/pay page). */
  constructor(private readonly checkoutBase = "https://checkout.fake/") { }

  /** Clock for session creation and Stripe's "expires_at at least 30 min ahead" rule (unix seconds). */
  nowUnix = (): number => Math.floor(Date.now() / 1000);
  /** Next session create: "lost" = created at the provider but the response never arrives; "down" = never reached it. */
  nextSession: "ok" | "lost" | "down" = "ok";

  /** Tests may replace this to simulate an adapter change between deploys. */
  buildCheckoutParams(req: CheckoutSessionRequest): Record<string, unknown> {
    const { providerParams: _ignored, ...rest } = req;
    return { ...rest, bodyVersion: 1 };
  }

  async createCheckoutSession(req: CheckoutSessionRequest): Promise<CheckoutSessionRef> {
    this.calls.createSession++;
    if (this.nextSession === "down") { this.nextSession = "ok"; throw new PaymentProviderError("transient", "StripeConnectionError"); }
    const existing = this.byIdempotency.get(req.idempotencyKey);
    if (existing) {
      // Stripe replays only for identical parameters (idempotent requests contract).
      const body = (r: CheckoutSessionRequest) => JSON.stringify(r.providerParams ?? this.buildCheckoutParams(r));
      if (body(this.sessions.get(existing)!.req) !== body(req)) throw new PaymentProviderError("transient", "idempotency_mismatch");
      return this.sessions.get(existing)!.ref;
    }
    if (req.expiresAt < this.nowUnix() + 30 * 60) throw new PaymentProviderError("rejected", "expires_at_too_soon");
    const id = `cs_test_${randomUUID().replace(/-/g, "")}`;
    const ref: CheckoutSessionRef = { id, url: `${this.checkoutBase}${id}`, status: "open" };
    this.sessions.set(id, { ref, req: { ...req }, details: {}, created: this.nowUnix() });
    this.byIdempotency.set(req.idempotencyKey, id);
    if (this.nextSession === "lost") { this.nextSession = "ok"; throw new PaymentProviderError("transient", "StripeConnectionError"); }
    return ref;
  }

  async listCompletedSessions(sinceUnix: number, untilUnix: number): Promise<CompletedSessionRef[]> {
    return [...this.sessions.entries()]
      .filter(([, s]) => s.ref.status === "complete" && s.created >= sinceUnix && s.created < untilUnix)
      .map(([id, s]) => ({ id, created: s.created, livemode: this.livemode, clientReferenceId: s.details.clientReferenceId ?? s.req.orderId, metadataOrderId: s.details.metadataOrderId ?? s.req.orderId }))
      .sort((a, b) => a.created - b.created);
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
    const pi = s.details.paymentIntentId;
    if (pi) this.captured.set(pi, s.details.amountTotal ?? 399);
  }

  async getCheckoutDetails(sessionId: string): Promise<CheckoutDetails> {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error("No such session");
    return {
      id: sessionId, livemode: this.livemode, status: s.ref.status, paymentStatus: "unpaid",
      currency: "usd", amountSubtotal: 399, amountTax: 0, amountTotal: 399,
      clientReferenceId: s.req.orderId, metadataOrderId: s.req.orderId,
      lineItems: [{ priceId: s.req.priceId, quantity: 1 }], paymentIntentId: null, customerEmail: null,
      amountDiscount: 0, amountShipping: 0, promotionCodeId: null, created: s.created, paidAt: s.created,
      ...s.details,
    };
  }

  async expireCheckoutSession(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (s && s.ref.status === "open") s.ref.status = "expired";
  }

  async createRefund(req: { paymentIntentId: string; amountCents: number; idempotencyKey: string; orderId: string; refundRowId: string }): Promise<RefundResult> {
    this.calls.createRefund++;
    await this.hooks.beforeCreateRefund?.();
    const prior = [...this.refunds.values()].find((r) => r.idempotencyKey === req.idempotencyKey);
    if (prior) return { id: prior.id, status: prior.status };
    if (typeof this.nextRefund === "function") this.nextRefund();
    const captured = this.captured.get(req.paymentIntentId) ?? 399;
    if (req.amountCents > captured - this.activeRefunded(req.paymentIntentId)) throw Object.assign(new Error("amount_too_large"), { code: "amount_too_large" });
    const r = {
      id: `re_${randomUUID().replace(/-/g, "").slice(0, 16)}`, status: this.nextRefund as RefundStatus, amountCents: req.amountCents, currency: "usd",
      refundRowId: req.refundRowId, orderId: req.orderId, failureReason: null, idempotencyKey: req.idempotencyKey, paymentIntentId: req.paymentIntentId,
    };
    this.refunds.set(r.id, r);
    const res = { id: r.id, status: r.status };
    await this.hooks.afterCreateRefund?.(res);
    return res;
  }

  /** Sum of refunds that currently hold money back (Stripe's charge.amount_refunded: everything not failed/canceled). */
  private activeRefunded(pi: string): number {
    return [...this.refunds.values()].filter((r) => r.paymentIntentId === pi && r.status !== "failed" && r.status !== "canceled").reduce((a, r) => a + r.amountCents, 0);
  }

  async getRefundSummary(paymentIntentId: string): Promise<PaymentRefundSummary> {
    this.calls.getRefundSummary++;
    const snapshot: PaymentRefundSummary = {
      paymentIntentId, livemode: this.livemode, currency: "usd",
      amountCapturedCents: this.captured.get(paymentIntentId) ?? 399,
      amountRefundedCents: this.activeRefunded(paymentIntentId),
      refunds: [...this.refunds.values()].filter((r) => r.paymentIntentId === paymentIntentId)
        .map(({ id, status, amountCents, currency, refundRowId, orderId, failureReason }) => ({ id, status, amountCents, currency, refundRowId, orderId, failureReason })),
    };
    await this.hooks.beforeSummaryReturn?.(paymentIntentId); // snapshot already taken: simulates a slow, now-stale response
    return snapshot;
  }

  /** Test helper: the provider changes a refund later (e.g. pending → succeeded, or succeeded → failed at the bank). */
  setRefundStatus(id: string, status: RefundStatus, failureReason: string | null = null): void {
    const r = this.refunds.get(id)!; r.status = status; r.failureReason = failureReason;
  }

  /** Test helper: a refund created outside the app (Stripe dashboard). */
  dashboardRefund(paymentIntentId: string, amountCents: number, status: RefundStatus = "succeeded"): string {
    const id = `re_dash_${randomUUID().slice(0, 8)}`;
    this.refunds.set(id, { id, status, amountCents, currency: "usd", refundRowId: null, orderId: null, failureReason: null, idempotencyKey: null, paymentIntentId });
    return id;
  }

  /** Tests pass already-built events as JSON; the signature must be "fake-signature". */
  parseWebhook(rawBody: string, signature: string | null): PaymentEvent {
    if (signature !== "fake-signature") throw new Error("Bad signature");
    return JSON.parse(rawBody) as PaymentEvent;
  }
}
