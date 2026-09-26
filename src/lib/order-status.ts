/** Customer-visible status only. Never use this projection to authorize payment, refund or reading access. */
export type OrderState = "awaiting_payment" | "processing" | "delivered" | "refund_pending" | "refund_attention" | "refunded" | "partially_refunded" | "failed" | "expired";
export interface OrderStatusFacts {
  paymentStatus: string;
  fulfillmentStatus: string;
  hasReading: boolean;
  refundStatus?: string | null;
}
/** Rows arrive newest first, but an older active claim must not be hidden by a later failed external attempt. */
export function refundStatusForDisplay(rows: readonly { status: string }[]): string | null {
  return rows.find(r => r.status === "requires_action")?.status
    ?? rows.find(r => ["requested", "pending", "unknown"].includes(r.status))?.status
    ?? rows[0]?.status ?? null;
}
export function orderState(f: OrderStatusFacts): OrderState {
  if (f.paymentStatus === "refunded") return "refunded";
  if (["requested", "pending", "unknown"].includes(f.refundStatus ?? "")) return "refund_pending";
  if (["requires_action", "failed", "canceled"].includes(f.refundStatus ?? "")) return "refund_attention";
  if (f.paymentStatus === "refund_pending") return ["failed", "canceled"].includes(f.refundStatus ?? "") ? "refund_attention" : "refund_pending";
  if (f.paymentStatus === "partially_refunded") return "partially_refunded";
  if (f.paymentStatus === "open") return "awaiting_payment";
  if (f.paymentStatus === "expired") return "expired";
  if (f.fulfillmentStatus === "delivered" && f.hasReading) return "delivered";
  if (f.fulfillmentStatus === "failed") return ["failed", "canceled"].includes(f.refundStatus ?? "") ? "refund_attention" : "failed";
  return "processing";
}
export const ORDER_COPY: Record<OrderState, readonly [string, string]> = {
  awaiting_payment: ["Confirming your payment", "We haven't confirmed this payment yet. If you approved a payment, check this order before paying again. Closing the payment window does not tell us whether a payment succeeded."],
  processing: ["Payment received. Writing your reading.", "This usually takes under a minute. You can stay here; we'll also email you the link."],
  delivered: ["Your reading is ready", "Take a moment for yourself. Your reading is ready to open."],
  refund_pending: ["Your refund is being processed", "Your refund is not complete yet. We'll update this order when the payment provider confirms its status. Please don't submit another request."],
  refund_attention: ["Your refund needs attention", "We haven't confirmed a completed refund. Please contact support with your order reference so we can help. You don't need to pay again."],
  refunded: ["This order was refunded", "The payment provider confirmed the refund. The time it takes to appear in your account depends on your bank or payment method."],
  partially_refunded: ["Part of this order was refunded", "A partial refund is recorded. This does not mean the entire payment was returned. Contact support if you need help with the remaining amount."],
  failed: ["We couldn't complete your reading", "We are checking this order. A completed refund has not been confirmed. Please contact support if you need help, and don't pay again while this is being resolved."],
  expired: ["This checkout expired", "This checkout is closed. If you approved a payment or see a charge, contact support before starting another checkout."],
};
