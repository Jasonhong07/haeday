// In-memory PayPal stand-in for tests and the local dev checkout (DEV_FAKE_PROVIDERS). Never used in staging/production.
// Mimics the PayPal behaviours the app relies on: PayPal-Request-Id replay, approve → capture, capture declines,
// "already captured", refunds readable only by id, and no refund list (summary never complete).
import { randomUUID } from "node:crypto";
import type {
  CaptureResult, CheckoutDetails, CheckoutSessionRef, CheckoutSessionRequest, CompletedSessionRef, PaymentAdapter, PaymentEvent, PaymentRefundSummary, ProviderRefund, RefundResult, RefundStatus,
} from "../payments/adapter";
import { PaymentProviderError } from "../payments/adapter";

type OrderState = "CREATED" | "APPROVED" | "COMPLETED" | "VOIDED";
interface FakeOrder { id: string; req: CheckoutSessionRequest; state: OrderState; created: number; capture?: { id: string; status: "COMPLETED" | "PENDING"; amountCents: number; at: number } }

export class FakePayPalAdapter implements PaymentAdapter {
  readonly provider = "fake" as const;
  readonly kind = "paypal" as const;
  livemode = false;
  orders = new Map<string, FakeOrder>();
  byRequestId = new Map<string, string>();
  refunds = new Map<string, ProviderRefund & { captureId: string; requestId: string }>();
  calls = { create: 0, capture: 0, createRefund: 0 };
  /** Next create: "lost" = created but the response never arrives. Next capture: see captureNext. */
  nextCreate: "ok" | "lost" | "down" = "ok";
  captureNext: "ok" | "pending" | "declined" | "lost" | "down" | "failed" = "ok";
  /** Worst case PayPal behaviour: a repeated PayPal-Request-Id replays the stored FAILED answer. */
  failedByRequestId = new Map<string, CaptureResult>();
  nextRefund: RefundStatus | "lost" = "succeeded";
  nowUnix = (): number => Math.floor(Date.now() / 1000);

  buildCheckoutParams(req: CheckoutSessionRequest): Record<string, unknown> {
    const { providerParams: _p, ...rest } = req;
    return { intent: "CAPTURE", ...rest, amount: "3.99" };
  }

  private ref(o: FakeOrder): CheckoutSessionRef {
    return { id: o.id, url: null, status: o.state === "COMPLETED" ? "complete" : o.state === "APPROVED" ? "approved" : o.state === "VOIDED" ? "expired" : "open", createdUnix: o.created };
  }

  async createCheckoutSession(req: CheckoutSessionRequest): Promise<CheckoutSessionRef> {
    this.calls.create++;
    if (this.nextCreate === "down") { this.nextCreate = "ok"; throw new PaymentProviderError("transient", "paypal_network"); }
    const prior = this.byRequestId.get(req.idempotencyKey);
    if (prior) return this.ref(this.orders.get(prior)!);
    const o: FakeOrder = { id: `PPFAKE${randomUUID().replace(/-/g, "").slice(0, 13).toUpperCase()}`, req: { ...req }, state: "CREATED", created: this.nowUnix() };
    this.orders.set(o.id, o); this.byRequestId.set(req.idempotencyKey, o.id);
    if (this.nextCreate === "lost") { this.nextCreate = "ok"; throw new PaymentProviderError("transient", "paypal_network"); }
    return this.ref(o);
  }

  /** Test/dev helper: the buyer approves in the PayPal (or Venmo) window. */
  approve(orderId: string): void { const o = this.orders.get(orderId)!; if (o.state === "CREATED") o.state = "APPROVED"; }

  async getCheckoutSession(id: string): Promise<CheckoutSessionRef> {
    const o = this.orders.get(id);
    if (!o) throw new PaymentProviderError("rejected", "RESOURCE_NOT_FOUND");
    return this.ref(o);
  }

  async capture(id: string, requestId: string): Promise<CaptureResult> {
    this.calls.capture++;
    const o = this.orders.get(id);
    if (!o) throw new PaymentProviderError("rejected", "RESOURCE_NOT_FOUND");
    const replay = this.byRequestId.get(requestId);
    if (replay === id && o.capture) return { outcome: o.capture.status === "COMPLETED" ? "completed" : "pending" };
    const stored = this.failedByRequestId.get(requestId);
    if (stored) return stored;
    if (this.captureNext === "down") { this.captureNext = "ok"; throw new PaymentProviderError("transient", "paypal_network"); }
    if (o.state === "COMPLETED") return { outcome: "already_captured" };
    if (o.state !== "APPROVED") return { outcome: "not_approved" };
    if (this.captureNext === "declined" || this.captureNext === "failed") {
      const r: CaptureResult = this.captureNext === "declined" ? { outcome: "declined", code: "INSTRUMENT_DECLINED" } : { outcome: "failed", code: "COMPLIANCE_VIOLATION" };
      this.captureNext = "ok"; this.failedByRequestId.set(requestId, r); return r;
    }
    const pending = this.captureNext === "pending";
    o.state = "COMPLETED";
    o.capture = { id: `CAPFAKE${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`, status: pending ? "PENDING" : "COMPLETED", amountCents: 399, at: this.nowUnix() };
    this.byRequestId.set(requestId, id);
    if (this.captureNext === "lost") { this.captureNext = "ok"; throw new PaymentProviderError("transient", "paypal_network"); }
    this.captureNext = "ok";
    return { outcome: pending ? "pending" : "completed" };
  }

  /** Test helper: PayPal finishes a pending capture. */
  completeCapture(orderId: string): void { const o = this.orders.get(orderId)!; if (o.capture) o.capture.status = "COMPLETED"; }

  async getCheckoutDetails(id: string): Promise<CheckoutDetails> {
    const o = this.orders.get(id);
    if (!o) throw new PaymentProviderError("rejected", "RESOURCE_NOT_FOUND");
    const r = this.ref(o);
    return {
      id, livemode: this.livemode, status: r.status === "complete" ? "complete" : r.status === "expired" ? "expired" : "open",
      paymentStatus: o.capture?.status === "COMPLETED" ? "paid" : "unpaid", currency: "usd",
      amountSubtotal: 399, amountTax: 0, amountTotal: o.capture?.amountCents ?? 399,
      clientReferenceId: o.req.orderId, metadataOrderId: o.req.orderId,
      lineItems: [{ priceId: "saju_reading", quantity: 1 }], paymentIntentId: o.capture?.id ?? null, customerEmail: null,
      amountDiscount: 0, amountShipping: 0, promotionCodeId: null, created: o.created, paidAt: o.capture?.at ?? null,
    };
  }

  async listCompletedSessions(): Promise<CompletedSessionRef[]> { return []; }
  async expireCheckoutSession(): Promise<void> { /* PayPal cannot void an unapproved order */ }

  async createRefund(req: { paymentIntentId: string; amountCents: number; idempotencyKey: string; orderId: string; refundRowId: string }): Promise<RefundResult> {
    this.calls.createRefund++;
    const prior = [...this.refunds.values()].find((r) => r.requestId === req.idempotencyKey);
    if (prior) return { id: prior.id, status: prior.status };
    const lost = this.nextRefund === "lost";
    const r = { id: `REFAKE${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`, status: (lost ? "succeeded" : this.nextRefund) as RefundStatus, amountCents: req.amountCents, currency: "usd",
      refundRowId: req.refundRowId, orderId: null, failureReason: null, captureId: req.paymentIntentId, requestId: req.idempotencyKey };
    this.refunds.set(r.id, r);
    if (lost) { this.nextRefund = "succeeded"; throw new PaymentProviderError("transient", "paypal_network"); }
    return { id: r.id, status: r.status };
  }

  /** Test helper: a refund made in the PayPal dashboard (we learn its id only from a webhook). */
  dashboardRefund(captureId: string, amountCents: number): string {
    const id = `REDASH${randomUUID().slice(0, 8).toUpperCase()}`;
    this.refunds.set(id, { id, status: "succeeded", amountCents, currency: "usd", refundRowId: null, orderId: null, failureReason: null, captureId, requestId: `dash-${id}` });
    return id;
  }

  async getRefundSummary(captureId: string, known: string[] = []): Promise<PaymentRefundSummary> {
    const all = [...this.refunds.values()].filter((r) => r.captureId === captureId);
    const refunded = all.filter((r) => r.status !== "failed" && r.status !== "canceled").reduce((a, r) => a + r.amountCents, 0);
    return {
      paymentIntentId: captureId, livemode: this.livemode, currency: "usd", amountCapturedCents: 399, amountRefundedCents: refunded,
      refunds: all.filter((r) => known.includes(r.id)).map(({ captureId: _c, requestId: _r, ...x }) => x),
      complete: false,
    };
  }

  parseWebhook(): PaymentEvent { throw new Error("use verifyWebhook"); }

  /** Tests send already-normalized events; the header paypal-transmission-sig must be "fake-signature". */
  async verifyWebhook(raw: string, headers: Headers): Promise<PaymentEvent> {
    if (headers.get("paypal-transmission-sig") !== "fake-signature") throw new Error("Bad signature");
    return JSON.parse(raw) as PaymentEvent;
  }
}
