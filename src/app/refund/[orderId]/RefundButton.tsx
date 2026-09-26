"use client";
import { useState } from "react";
import { SITE } from "@/lib/site";

const MSG: Record<string, string> = {
  refunded: "The payment provider confirmed your refund. The time it takes to appear in your account depends on your bank or payment method.",
  pending: "Your refund is being processed. Check the order status below for updates; please don't submit another request.",
  needs_attention: `Your refund has not completed and needs attention. Please contact ${SITE.support} with your order reference.`,
  nothing_to_refund: "There is no remaining paid amount to refund. An order fully covered by a promotion code does not receive a cash refund.",
  payment_unconfirmed: "This payment has not been confirmed. Check the order status before paying or requesting another refund.",
  disputed: "This payment has an open dispute. Please follow the dispute with your payment provider or contact support.",
  already_refunded: "This order has already been refunded.",
  outside_window: `This order isn't eligible for a no-questions refund (7 days, one per customer every 12 months). Please email ${SITE.support} and we'll help.`,
  unavailable: "We couldn't find this order in this browser. Please sign in with your checkout email.",
  temporary_failure: "We couldn't confirm the result. Check the order status below before submitting another request.",
};

export function RefundButton({ orderId }: { orderId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const res = await fetch(`/api/refunds/${orderId}`, { method: "POST" }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { status?: string; error?: string } | null;
    setMsg(MSG[body?.status ?? body?.error ?? "temporary_failure"] ?? MSG.temporary_failure!);
    setBusy(false);
  }
  if (msg) return <p className="card" role="status">{msg}</p>;
  return <button className="btn btn-primary" type="button" disabled={busy} onClick={go}>{busy ? "Requesting refund…" : "Request my refund"}</button>;
}
