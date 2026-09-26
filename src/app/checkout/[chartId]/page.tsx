// Checkout step (PRD §5): consent checkbox, then Stripe Checkout. The server re-validates everything.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadChart } from "@/server/charts/service";
import { headers } from "next/headers";
import { dailyCap, paymentAdapter } from "@/server/deps";
import { devFakes, llmConfigured, paymentsConfigured, paypalConfigured } from "@/server/env";
import { serverContext } from "@/server/http";
import { buildFacts, contentReady } from "@/server/fulfillment/prompt";
import { isSalesEnabled } from "@/server/settings";
import { currentViewer } from "@/server/viewer";
import { CONSENT_TEXT, CONSENT_TEXT_DELAYED, DELAY_NOTICE } from "@/server/payments/sku";
import { capacityState } from "@/server/fulfillment/capacity";
import { CheckoutForm } from "./CheckoutForm";

export const metadata: Metadata = { title: "Unlock your reading · Haeday", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: { params: Promise<{ chartId: string }> }) {
  const { chartId } = await params;
  const ctx = serverContext();
  const viewer = await currentViewer(ctx.db);
  const chart = await loadChart(ctx.db, ctx.ring, chartId, viewer.guestId);
  if (!chart || chart.response.kind !== "computed") notFound();
  const open = Boolean(paymentAdapter(ctx.env)) && paymentsConfigured(ctx.env) && llmConfigured(ctx.env)
    && contentReady(buildFacts(chart.response.chart), ctx.env.APP_ENV === "production") && (await isSalesEnabled(ctx.db));
  // D35/D47/D52: the delivery promise is decided on the server and shown BEFORE payment.
  const capacity = open ? (await capacityState(ctx.db, dailyCap(ctx.env))).state : "minutes";
  const delayed = capacity === "24h";
  // CC4c: PayPal/Venmo only while configured and sales tax collection is off.
  const paypal = open && paypalConfigured(ctx.env)
    ? (devFakes(ctx.env) ? { mode: "fake" as const } : { mode: "sdk" as const, clientId: ctx.env.PAYPAL_CLIENT_ID, nonce: (await headers()).get("x-nonce") ?? undefined, sandbox: ctx.env.PAYMENTS_MODE !== "live" })
    : null;
  return (
    <main className="app">
      <header className="brand"><Link href="/"><span aria-hidden="true" className="moon">☾</span> Haeday</Link></header>
      <h1>Unlock your reading</h1>
      <section className="card">
        <p style={{ margin: "0 0 8px" }}>One personal reading for the chart you just made: about 900 words on your Day Master, elements, love, work and money, and your 2027 energy.</p>
        <p className="note" style={{ margin: 0 }}>$3.99 one-time · No subscription · AI-assisted, grounded in a curated interpretation library · {capacity === "paused" ? "Opening again soon" : delayed ? "Delivered within 24 hours" : "Delivered in about a minute"}</p>
      </section>
      <section className="card" aria-label="Before you pay">
        {/* C3: exact terms, stated before payment. */}
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Pay by card on Stripe&apos;s secure page. Apple Pay or Google Pay appear there if your device and browser support them.{paypal ? " Or pay with PayPal or Venmo below." : ""}</li>
          <li>Have a promotion code? Enter it on the Stripe page{paypal ? " (card payment only)" : ""}.</li>
          <li>If we can&apos;t deliver your reading, you&apos;re refunded automatically. Within 7 days you can also ask for a refund for any reason, once per customer every 12 months.</li>
          <li>We email you the link and it stays on your order page. Sales tax, if any, is shown by Stripe before you pay.</li>
        </ul>
      </section>
      {open && delayed && <p className="notice card" role="status">{DELAY_NOTICE}</p>}
      {open && capacity === "paused"
        ? <p className="card" role="status">We&apos;re at capacity for new readings right now. Your free chart is saved in this browser: please come back in a few hours.</p>
        : open ? <CheckoutForm chartId={chartId} consentText={delayed ? CONSENT_TEXT_DELAYED : CONSENT_TEXT} promise={delayed ? "24h" : "minutes"} paypal={paypal} />
        : <p className="card" role="status">Full readings open soon. Your free chart is saved in this browser, so you can come back to it.</p>}
      <p className="fine"><Link href={`/chart/${chartId}`}>Back to my chart</Link> · <Link href="/refunds">Refund policy</Link> · <Link href="/terms">Terms</Link></p>
    </main>
  );
}
