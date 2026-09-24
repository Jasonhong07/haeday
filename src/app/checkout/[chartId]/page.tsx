// Checkout step (PRD §5): consent checkbox, then Stripe Checkout. The server re-validates everything.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadChart } from "@/server/charts/service";
import { paymentAdapter } from "@/server/deps";
import { llmConfigured, paymentsConfigured } from "@/server/env";
import { serverContext } from "@/server/http";
import { isSalesEnabled } from "@/server/settings";
import { currentViewer } from "@/server/viewer";
import { CONSENT_TEXT } from "@/server/payments/sku";
import { CheckoutForm } from "./CheckoutForm";

export const metadata: Metadata = { title: "Unlock your reading · Haeday", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: { params: Promise<{ chartId: string }> }) {
  const { chartId } = await params;
  const ctx = serverContext();
  const viewer = await currentViewer(ctx.db);
  const chart = await loadChart(ctx.db, ctx.ring, chartId, viewer.guestId);
  if (!chart || chart.response.kind !== "computed") notFound();
  const open = Boolean(paymentAdapter(ctx.env)) && paymentsConfigured(ctx.env) && llmConfigured(ctx.env) && (await isSalesEnabled(ctx.db));
  return (
    <main className="app">
      <header className="brand"><Link href="/"><span aria-hidden="true" className="moon">☾</span> Haeday</Link></header>
      <h1>Unlock your reading</h1>
      <section className="card">
        <p style={{ margin: "0 0 8px" }}>One personal reading for the chart you just made: about 900 words on your Day Master, elements, love, work and money, and your 2027 energy.</p>
        <p className="note" style={{ margin: 0 }}>$3.99 one-time · No subscription · AI-assisted, grounded in a curated interpretation library · Delivered in about a minute</p>
      </section>
      {open ? <CheckoutForm chartId={chartId} consentText={CONSENT_TEXT} /> : <p className="card" role="status">Full readings open soon. Your free chart is saved in this browser, so you can come back to it.</p>}
      <p className="fine"><Link href={`/chart/${chartId}`}>Back to my chart</Link> · <Link href="/refunds">Refund policy</Link> · <Link href="/terms">Terms</Link></p>
    </main>
  );
}
