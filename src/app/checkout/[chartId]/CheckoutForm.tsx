"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PayPalCheckout } from "./PayPalCheckout";

const ERRORS: Record<string, string> = {
  sales_closed: "Full readings aren't open right now. Please try again later.",
  needs_answer: "Please answer the question on your chart first.",
  provider_error: "Our payment page didn't open. Please try again in a moment.",
  not_found: "We couldn't find this chart in this browser.",
  busy: "We're at capacity for new readings right now. Please come back in a few hours.",
  content_not_ready: "Readings for this chart open soon.",
};

export function CheckoutForm({ chartId, consentText, promise, paypal }: { chartId: string; consentText: string; promise: "minutes" | "24h"; paypal?: { mode: "sdk" | "fake"; clientId?: string; nonce?: string; sandbox?: boolean } | null }) {
  const router = useRouter();
  const [consent, setConsent] = useState(false);
  // A tap that lands before hydration ticks the real checkbox but not React state: pick it up once hydrated.
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => { if (box.current?.checked) setConsent(true); }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true); setError(null);
    const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chartRevisionId: chartId, consent: true, promise }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { url?: string; error?: string; orderId?: string } | null;
    if (body?.url) { window.location.assign(body.url); return; }
    if ((body?.error === "already_owned" || body?.error === "processing") && body.orderId) { router.push(`/order/${body.orderId}`); return; }
    // Delivery time changed since this page loaded: show the new notice and ask again (never charge on the old promise).
    if (body?.error === "promise_changed") { setConsent(false); setBusy(false); setError("Delivery time just changed. Please read the updated note and confirm again."); router.refresh(); return; }
    setBusy(false); setError(ERRORS[body?.error ?? ""] ?? "Something went wrong. Please try again.");
  }
  return (
    <section className="card">
      {error && <p className="error" role="alert">{error}</p>}
      <label style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16, cursor: "pointer" }}>
        <input ref={box} type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ width: 22, height: 22, marginTop: 2, accentColor: "#D9B26A" }} />
        <span>{consentText}</span>
      </label>
      <button className="btn btn-primary" type="button" disabled={!consent || busy} onClick={go}>{busy ? "Opening secure checkout…" : "Continue to payment · $3.99"}</button>
      <p className="fine">Card, Apple Pay or Google Pay on Stripe&apos;s secure page. If sales tax applies, Stripe shows the total before you pay.</p>
      {paypal && <PayPalCheckout chartId={chartId} promise={promise} consent={consent} mode={paypal.mode} clientId={paypal.clientId} nonce={paypal.nonce} sandbox={paypal.sandbox} />}
    </section>
  );
}
