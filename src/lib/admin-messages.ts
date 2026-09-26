// Plain-language result of an admin action, from the fixed code in ?msg= (never free text from the URL).
const MSG: Record<string, string> = {
  retry_queued: "Retry queued.", retry_granted_and_queued: "Retry queued with one extra attempt.",
  retry_already_queued: "A generation job was already queued: nothing new started.", retry_duplicate_request: "That retry was already submitted.",
  retry_not_allowed: "Retry not allowed (refunded, refund in progress, dispute, or not paid).",
  resend_queued: "Delivery email queued again to the checkout address.", resend_not_delivered: "Not resent: the order is not delivered, or a refund or dispute is open.",
  resend_no_email: "No checkout email on this order (deleted by retention or never given).", resend_limit: "Already re-sent 3 times: ask the customer to sign in at /login instead.",
  resend_not_found: "Order not found.", resend_too_soon: "A delivery email went out less than a minute ago.",
  issue_acknowledged: "Marked as seen: no more alert emails for it (it reopens if it happens again).", issue_resolved: "Marked resolved.",
  issue_unchanged: "That issue was already closed.",
  refund_payments_not_configured: "Payments are not configured here: no refund was started.",
  refund_succeeded: "Refund succeeded.", refund_pending: "Refund started; the bank shows it in 5–10 business days.",
  refund_requested: "Refund claim recorded; the worker sends it to the payment provider.", refund_unknown: "Refund sent but the provider's answer was lost; reconciliation finishes it.",
  refund_already_refunded: "Already refunded.", refund_in_progress: "A refund is already in progress.", refund_not_paid: "Not a paid order.",
  refund_disputed: "Open dispute: answer it in the provider dashboard instead of refunding.", refund_nothing_to_refund: "Nothing left to refund.",
  refund_not_found: "Order not found.",
};

export function adminMessage(code: string | undefined): string | undefined {
  if (!code || !/^[a-z_]{3,60}$/.test(code)) return undefined;
  return MSG[code]; // unknown codes show nothing: the page never repeats text from a link
}
