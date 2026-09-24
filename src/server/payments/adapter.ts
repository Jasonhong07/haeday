// Payment provider boundary (CLAUDE.md rule 10: provider SDKs only in server/adapters).
// Business code talks to this interface; tests use FakePaymentAdapter.

export interface CheckoutSessionRequest {
  orderId: string;
  chartRevisionId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  /** Stable per order so a double click or retry returns the same session. */
  idempotencyKey: string;
  automaticTax: boolean;
  /** F15: customers may enter a Stripe promotion code on the Stripe page. */
  allowPromotionCodes: boolean;
  /** F4: fixed when the order is created (unix seconds) so every retry sends identical parameters. */
  expiresAt: number;
  /** F4: the COMPLETE provider body, built once at order creation and replayed verbatim (survives adapter changes). */
  providerParams?: Record<string, unknown>;
}

/**
 * Provider error with a verdict on whether the request may have run. `rejected` = the provider refused it before
 * executing (validation), so nothing was created; `transient` = network/5xx, outcome unknown.
 */
export class PaymentProviderError extends Error {
  constructor(public readonly kind: "rejected" | "transient", public readonly code: string) {
    super(`payment provider ${kind}: ${code}`);
    this.name = "PaymentProviderError";
  }
}

/** Minimal view of a completed Checkout Session for reconciliation (F12). */
export interface CompletedSessionRef { id: string; created: number; livemode: boolean; clientReferenceId: string | null; metadataOrderId: string | null }
export interface CheckoutSessionRef { id: string; url: string | null; status: "open" | "complete" | "expired" }

/** Everything the webhook validation needs, normalized from the provider. */
export interface CheckoutDetails {
  id: string;
  livemode: boolean;
  status: "open" | "complete" | "expired";
  paymentStatus: "paid" | "unpaid" | "no_payment_required";
  currency: string | null;
  amountSubtotal: number | null;
  amountTax: number | null;
  amountTotal: number | null;
  clientReferenceId: string | null;
  metadataOrderId: string | null;
  lineItems: Array<{ priceId: string | null; quantity: number }>;
  paymentIntentId: string | null;
  customerEmail: string | null;
  /** F15: total_details.amount_discount / amount_shipping (0 when absent). */
  amountDiscount: number;
  amountShipping: number;
  promotionCodeId: string | null;
  /** Session creation time (unix seconds). */
  created: number;
}

export type RefundStatus = "pending" | "requires_action" | "succeeded" | "failed" | "canceled";
export interface RefundResult { id: string; status: RefundStatus }

/** One provider refund as currently stored at the provider (CC1a F3: provider state is the source of truth). */
export interface ProviderRefund {
  id: string;
  status: RefundStatus;
  amountCents: number;
  currency: string;
  /** Our refunds.id if WE created it (metadata.refundRowId), else null. */
  refundRowId: string | null;
  orderId: string | null;
  failureReason: string | null;
}

/** Everything the refund sync needs for one payment, fetched in one go (all pages). */
export interface PaymentRefundSummary {
  paymentIntentId: string;
  livemode: boolean;
  currency: string;
  amountCapturedCents: number;
  /** Provider's charge.amount_refunded (non-failed, non-canceled refunds). Cross-checked against the list. */
  amountRefundedCents: number;
  refunds: ProviderRefund[];
}

export type PaymentEvent =
  | { id: string; livemode: boolean; type: "checkout.completed" | "checkout.async_succeeded" | "checkout.async_failed" | "checkout.expired"; sessionId: string }
  | { id: string; livemode: boolean; type: "refund.updated"; refundId: string; paymentIntentId: string | null; status: RefundStatus; amountCents: number; orderId: string | null }
  | { id: string; livemode: boolean; type: "charge.refunded"; paymentIntentId: string | null; amountRefundedCents: number; amountCents: number }
  | { id: string; livemode: boolean; type: "dispute.updated"; disputeId: string; paymentIntentId: string | null; status: string; reason: string | null; evidenceDueBy: Date | null }
  | { id: string; livemode: boolean; type: "ignored"; providerType: string };

export interface PaymentAdapter {
  readonly provider: "stripe" | "fake";
  /** Mode of the configured key (live keys start with sk_live_/rk_live_). Used to label issues. */
  readonly livemode: boolean;
  /** Pure: the exact provider body for this request (no network). Frozen by checkout; see providerParams. */
  buildCheckoutParams(req: CheckoutSessionRequest): Record<string, unknown>;
  createCheckoutSession(req: CheckoutSessionRequest): Promise<CheckoutSessionRef>;
  getCheckoutSession(sessionId: string): Promise<CheckoutSessionRef>;
  getCheckoutDetails(sessionId: string): Promise<CheckoutDetails>;
  /** F12: completed sessions created in [sinceUnix, untilUnix), all pages, oldest first. Throws if truncated. */
  listCompletedSessions(sinceUnix: number, untilUnix: number): Promise<CompletedSessionRef[]>;
  expireCheckoutSession(sessionId: string): Promise<void>;
  createRefund(req: { paymentIntentId: string; amountCents: number; idempotencyKey: string; orderId: string; refundRowId: string }): Promise<RefundResult>;
  /** Current refunds (all pages) and charge totals for one payment. Throws on network/provider error. */
  getRefundSummary(paymentIntentId: string): Promise<PaymentRefundSummary>;
  /** Throws on a bad signature. */
  parseWebhook(rawBody: string, signature: string | null): PaymentEvent;
}
