"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const ERRORS: Record<string, string> = {
  sales_closed: "Full readings aren't open right now. Please try again later.",
  needs_answer: "Please answer the question on your chart first.",
  provider_error: "Our payment page didn't open. Please try again in a moment.",
  not_found: "We couldn't find this chart in this browser.",
};

export function CheckoutForm({ chartId, consentText }: { chartId: string; consentText: string }) {
  const router = useRouter();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true); setError(null);
    const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chartRevisionId: chartId, consent: true }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { url?: string; error?: string; orderId?: string } | null;
    if (body?.url) { window.location.assign(body.url); return; }
    if ((body?.error === "already_owned" || body?.error === "processing") && body.orderId) { router.push(`/order/${body.orderId}`); return; }
    setBusy(false); setError(ERRORS[body?.error ?? ""] ?? "Something went wrong. Please try again.");
  }
  return (
    <section className="card">
      {error && <p className="error" role="alert">{error}</p>}
      <label style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16, cursor: "pointer" }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ width: 22, height: 22, marginTop: 2, accentColor: "#D9B26A" }} />
        <span>{consentText}</span>
      </label>
      <button className="btn btn-primary" type="button" disabled={!consent || busy} onClick={go}>{busy ? "Opening secure checkout…" : "Continue to payment · $3.99"}</button>
      <p className="fine">Secure payment by Stripe. If sales tax applies, Stripe shows the total before you pay.</p>
    </section>
  );
}
