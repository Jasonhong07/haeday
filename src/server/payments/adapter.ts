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
}
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
}

export type RefundStatus = "pending" | "requires_action" | "succeeded" | "failed" | "canceled";
export interface RefundResult { id: string; status: RefundStatus }

export type PaymentEvent =
  | { id: string; livemode: boolean; type: "checkout.completed" | "checkout.async_succeeded" | "checkout.async_failed" | "checkout.expired"; sessionId: string }
  | { id: string; livemode: boolean; type: "refund.updated"; refundId: string; paymentIntentId: string | null; status: RefundStatus; amountCents: number; orderId: string | null }
  | { id: string; livemode: boolean; type: "charge.refunded"; paymentIntentId: string | null; amountRefundedCents: number; amountCents: number }
  | { id: string; livemode: boolean; type: "dispute.updated"; disputeId: string; paymentIntentId: string | null; status: string; reason: string | null; evidenceDueBy: Date | null }
  | { id: string; livemode: boolean; type: "ignored"; providerType: string };

export interface PaymentAdapter {
  readonly provider: "stripe" | "fake";
  createCheckoutSession(req: CheckoutSessionRequest): Promise<CheckoutSessionRef>;
  getCheckoutSession(sessionId: string): Promise<CheckoutSessionRef>;
  getCheckoutDetails(sessionId: string): Promise<CheckoutDetails>;
  expireCheckoutSession(sessionId: string): Promise<void>;
  createRefund(req: { paymentIntentId: string; amountCents: number; idempotencyKey: string; orderId: string }): Promise<RefundResult>;
  /** Throws on a bad signature. */
  parseWebhook(rawBody: string, signature: string | null): PaymentEvent;
}
