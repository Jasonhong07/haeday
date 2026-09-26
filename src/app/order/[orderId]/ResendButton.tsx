"use client";
// CC4a: "Email me the link again" (to the checkout address only).
import { useState } from "react";

const MSG: Record<string, string> = {
  queued: "Sent. Check your inbox (and spam folder) in a minute.",
  too_soon: "We just sent it. Please wait 10 minutes before asking again.",
  limit: "We've already re-sent it a few times. Use \"Open your readings on another device\" below instead.",
  no_email: "We don't have an email for this order. Your reading is always here on this page.",
};

export function ResendButton({ orderId }: { orderId: string }) {
  const [state, setState] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      const r = await fetch(`/api/orders/${orderId}/resend`, { method: "POST" });
      const b = (await r.json().catch(() => ({}))) as { status?: string; error?: string };
      setState(b.status ?? b.error ?? "error");
    } catch { setState("error"); } finally { setBusy(false); }
  }
  return (
    <div style={{ marginTop: 12 }}>
      <button className="btn btn-ghost" type="button" onClick={go} disabled={busy || state === "queued"}>{busy ? "Sending…" : "Email me the link again"}</button>
      {state && <p className="note" role="status">{MSG[state] ?? "Something went wrong. Your reading is still here on this page."}</p>}
    </div>
  );
}
