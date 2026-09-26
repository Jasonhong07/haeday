"use client";
// CC4c: PayPal + Venmo buttons (PayPal's JS SDK, loaded only on this page). The buyer types the email for the
// reading link here (Jason 2026-09-26), approves in PayPal's window, and our server captures and validates.
// In the local end-to-end setup (DEV_FAKE_PROVIDERS) a plain test button walks the same server routes instead.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Props = { chartId: string; promise: "minutes" | "24h"; consent: boolean; mode: "sdk" | "fake"; clientId?: string; nonce?: string; sandbox?: boolean };
type PayPalActions = { resolve: () => Promise<void>; reject: () => Promise<void>; restart?: () => Promise<void> };
type PayPalSdk = { Buttons: (o: Record<string, unknown>) => { render: (el: HTMLElement) => Promise<void>; isEligible?: () => boolean } };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ERRORS: Record<string, string> = {
  sales_closed: "Full readings aren't open right now. Please try again later.",
  busy: "We're at capacity for new readings right now. Please come back in a few hours.",
  promise_changed: "Delivery time just changed. Please reload the page and confirm again.",
  provider_error: "PayPal didn't respond. Please try again in a moment, or pay by card.",
  invalid: "Please enter a valid email address.",
};

export function PayPalCheckout({ chartId, promise, consent, mode, clientId, nonce, sandbox }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const live = useRef({ email, consent });
  const orderRef = useRef<string | null>(null);
  const [statusOrderId, setStatusOrderId] = useState<string | null>(null);
  useEffect(() => { live.current = { email, consent }; }, [email, consent]);

  const ready = () => {
    if (!live.current.consent) { setError("Please tick the box above first."); return false; }
    if (!EMAIL_RE.test(live.current.email.trim())) { setError("Enter the email where we should send your reading link."); return false; }
    setError(null); return true;
  };

  async function create(): Promise<string> {
    const res = await fetch("/api/checkout/paypal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chartRevisionId: chartId, consent: true, promise, email: live.current.email.trim() }) }).catch(() => null);
    const b = (await res?.json().catch(() => null)) as { orderId?: string; paypalOrderId?: string; error?: string } | null;
    if ((b?.error === "already_owned" || b?.error === "processing") && b.orderId) { router.push(`/order/${b.orderId}`); throw new Error("redirect"); }
    if (!b?.paypalOrderId || !b.orderId) { setError(ERRORS[b?.error ?? ""] ?? "Something went wrong. Please try again."); throw new Error("create_failed"); }
    orderRef.current = b.orderId;
    setStatusOrderId(b.orderId);
    return b.paypalOrderId;
  }

  async function capture(actions?: PayPalActions): Promise<void> {
    const orderId = orderRef.current;
    if (!orderId) return;
    const res = await fetch("/api/checkout/paypal/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) }).catch(() => null);
    const b = (await res?.json().catch(() => null)) as { status?: string; orderId?: string } | null;
    if (b?.status === "declined" && actions?.restart) { await actions.restart(); return; } // pick another way to pay in PayPal
    if (b?.status === "declined" || b?.status === "not_approved") { setError("PayPal didn't approve that payment. Nothing was charged. Please try again."); return; }
    if (b?.status === "failed") { setError("PayPal couldn't complete this payment. Nothing was charged. Please pay by card, or reload the page to try PayPal again."); return; }
    router.push(`/order/${b?.orderId ?? orderId}`); // paid, still confirming, or closed: the order page tells the truth
  }

  useEffect(() => {
    if (mode !== "sdk" || !clientId || !box.current) return;
    const el = box.current;
    const params = new URLSearchParams({ "client-id": clientId, currency: "USD", intent: "capture", components: "buttons", "enable-funding": "venmo", "disable-funding": "card,credit,paylater" });
    if (sandbox) params.set("buyer-country", "US"); // sandbox only: lets the Venmo button show for testing
    const s = document.createElement("script");
    s.src = `https://www.paypal.com/sdk/js?${params}`;
    if (nonce) { s.nonce = nonce; s.setAttribute("data-csp-nonce", nonce); }
    s.async = true;
    s.onload = () => {
      const paypal = (window as unknown as { paypal?: PayPalSdk }).paypal;
      if (!paypal) return;
      void paypal.Buttons({
        style: { layout: "vertical", shape: "rect", height: 48 },
        onClick: (_d: unknown, actions: PayPalActions) => (ready() ? actions.resolve() : actions.reject()),
        createOrder: () => create(),
        onApprove: (_d: unknown, actions: PayPalActions) => capture(actions),
        onCancel: () => setError(null),
        onError: () => setError("PayPal ran into a problem. If you approved a payment, check its status before trying again."),
      }).render(el);
    };
    s.onerror = () => setError("PayPal couldn't load. Please pay by card, or try again later.");
    document.body.appendChild(s);
    return () => { s.remove(); el.innerHTML = ""; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the SDK is loaded once; callbacks read live refs
  }, [mode, clientId, nonce, sandbox]);

  async function fakeFlow() {
    if (!ready()) return;
    setBusy(true);
    try {
      const ppId = await create();
      await fetch("/api/dev/paypal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", paypalOrderId: ppId }) });
      const orderId = orderRef.current!;
      await fetch("/api/checkout/paypal/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) });
      await fetch("/api/dev/paypal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", orderId }) });
      router.push(`/order/${orderId}`);
    } catch { setBusy(false); }
  }

  return (
    <section className="card" aria-label="Pay with PayPal or Venmo">
      <p style={{ margin: "0 0 8px" }}><b>Or pay with PayPal or Venmo</b></p>
      <label className="note" htmlFor="pp-email">Email for your reading link</label>
      <input id="pp-email" className="input" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ margin: "6px 0 12px" }} />
      {error && <div className="error" role="alert"><p style={{ margin: 0 }}>{error}</p>{statusOrderId && <Link href={`/order/${statusOrderId}`}>Check payment status</Link>}</div>}
      {mode === "sdk" ? <div ref={box} /> : <button className="btn btn-ghost" type="button" onClick={fakeFlow} disabled={busy}>{busy ? "Paying…" : "PayPal (test)"}</button>}
      <p className="fine">Venmo appears on phones in the US where Venmo is installed. Promotion codes work with card payment only.</p>
    </section>
  );
}
