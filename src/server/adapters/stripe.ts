// Stripe implementation of PaymentAdapter. The only file that imports the Stripe SDK.
import Stripe from "stripe";
import type {
  CheckoutDetails, CheckoutSessionRef, CheckoutSessionRequest, PaymentAdapter, PaymentEvent, RefundResult, RefundStatus,
} from "../payments/adapter";

const refundStatus = (s: string | null | undefined): RefundStatus =>
  s === "succeeded" || s === "failed" || s === "canceled" || s === "requires_action" ? s : "pending";

const piId = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id ?? null);

export class StripePaymentAdapter implements PaymentAdapter {
  readonly provider = "stripe" as const;
  private readonly stripe: Stripe;
  constructor(secretKey: string, private readonly webhookSecret: string | undefined) {
    this.stripe = new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 20_000 });
  }

  private ref(s: Stripe.Checkout.Session): CheckoutSessionRef {
    return { id: s.id, url: s.url ?? null, status: (s.status ?? "open") as CheckoutSessionRef["status"] };
  }

  async createCheckoutSession(req: CheckoutSessionRequest): Promise<CheckoutSessionRef> {
    const s = await this.stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: req.priceId, quantity: 1 }],
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      client_reference_id: req.orderId,
      metadata: { orderId: req.orderId, chartRevisionId: req.chartRevisionId },
      payment_intent_data: { metadata: { orderId: req.orderId } },
      // Card + wallets only (no delayed methods at launch, ARCHITECTURE §4.2): Apple Pay / Google Pay ride on "card".
      payment_method_types: ["card"],
      automatic_tax: { enabled: req.automaticTax },
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60, // shortest window Stripe allows is 30 min; 60 keeps retries simple
    }, { idempotencyKey: req.idempotencyKey });
    return this.ref(s);
  }

  async getCheckoutSession(sessionId: string): Promise<CheckoutSessionRef> {
    return this.ref(await this.stripe.checkout.sessions.retrieve(sessionId));
  }

  async getCheckoutDetails(sessionId: string): Promise<CheckoutDetails> {
    const s = await this.stripe.checkout.sessions.retrieve(sessionId, { expand: ["line_items"] });
    return {
      id: s.id,
      livemode: s.livemode,
      status: (s.status ?? "open") as CheckoutDetails["status"],
      paymentStatus: s.payment_status === "paid" ? "paid" : s.payment_status === "no_payment_required" ? "no_payment_required" : "unpaid",
      currency: s.currency,
      amountSubtotal: s.amount_subtotal,
      amountTax: s.total_details?.amount_tax ?? null,
      amountTotal: s.amount_total,
      clientReferenceId: s.client_reference_id,
      metadataOrderId: s.metadata?.orderId ?? null,
      lineItems: (s.line_items?.data ?? []).map((li) => ({ priceId: li.price?.id ?? null, quantity: li.quantity ?? 0 })),
      paymentIntentId: piId(s.payment_intent),
      customerEmail: s.customer_details?.email ?? null,
    };
  }

  async expireCheckoutSession(sessionId: string): Promise<void> {
    await this.stripe.checkout.sessions.expire(sessionId);
  }

  async createRefund(req: { paymentIntentId: string; amountCents: number; idempotencyKey: string; orderId: string }): Promise<RefundResult> {
    const r = await this.stripe.refunds.create(
      { payment_intent: req.paymentIntentId, amount: req.amountCents, metadata: { orderId: req.orderId } },
      { idempotencyKey: req.idempotencyKey },
    );
    return { id: r.id, status: refundStatus(r.status) };
  }

  parseWebhook(rawBody: string, signature: string | null): PaymentEvent {
    if (!this.webhookSecret || !signature) throw new Error("Webhook signature missing");
    const e = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    const base = { id: e.id, livemode: e.livemode };
    switch (e.type) {
      case "checkout.session.completed": return { ...base, type: "checkout.completed", sessionId: e.data.object.id };
      case "checkout.session.async_payment_succeeded": return { ...base, type: "checkout.async_succeeded", sessionId: e.data.object.id };
      case "checkout.session.async_payment_failed": return { ...base, type: "checkout.async_failed", sessionId: e.data.object.id };
      case "checkout.session.expired": return { ...base, type: "checkout.expired", sessionId: e.data.object.id };
      case "refund.created":
      case "refund.updated":
      case "refund.failed": {
        const r = e.data.object;
        return { ...base, type: "refund.updated", refundId: r.id, paymentIntentId: piId(r.payment_intent), status: refundStatus(r.status), amountCents: r.amount, orderId: r.metadata?.orderId ?? null };
      }
      case "charge.refunded": {
        const c = e.data.object;
        return { ...base, type: "charge.refunded", paymentIntentId: piId(c.payment_intent), amountRefundedCents: c.amount_refunded, amountCents: c.amount };
      }
      case "charge.dispute.created":
      case "charge.dispute.updated":
      case "charge.dispute.closed": {
        const d = e.data.object;
        return {
          ...base, type: "dispute.updated", disputeId: d.id, paymentIntentId: piId(d.payment_intent), status: d.status, reason: d.reason ?? null,
          evidenceDueBy: d.evidence_details?.due_by ? new Date(d.evidence_details.due_by * 1000) : null,
        };
      }
      default: return { ...base, type: "ignored", providerType: e.type };
    }
  }
}
