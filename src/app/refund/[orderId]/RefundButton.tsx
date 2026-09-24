"use client";
import { useState } from "react";
import { SITE } from "@/lib/site";

const MSG: Record<string, string> = {
  refunded: "Done. Your refund of $3.99 has been started; banks usually show it in 5–10 business days.",
  pending: "Your refund is being processed. We'll email you if anything else is needed.",
  already_refunded: "This order has already been refunded.",
  outside_window: `This order isn't eligible for a no-questions refund (7 days, one per customer). Please email ${SITE.support} and we'll help.`,
  unavailable: "We couldn't find this order in this browser. Please sign in with your checkout email.",
  temporary_failure: "We couldn't process this right now. Please try again in a few minutes.",
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
  return <button className="btn btn-primary" type="button" disabled={busy} onClick={go}>Refund my $3.99</button>;
}
