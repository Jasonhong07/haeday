/** Customer feedback is not the refund authorization or accounting state. */
export function refundFeedback(result: { ok: true; status: string } | { ok: false; error: string }): { status: string } | { error: string } {
  if (result.ok) {
    if (result.status === "succeeded") return { status: "refunded" };
    if (["failed", "canceled", "requires_action"].includes(result.status)) return { status: "needs_attention" };
    return { status: "pending" };
  }
  const errors: Record<string, string> = { not_found: "unavailable", not_paid: "payment_unconfirmed", already_refunded: "already_refunded", in_progress: "pending", outside_window: "outside_window", goodwill_used: "outside_window", disputed: "disputed", nothing_to_refund: "nothing_to_refund" };
  return { error: errors[result.error] ?? "temporary_failure" };
}
