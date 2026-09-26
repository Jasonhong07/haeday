// Order status (PRD §6 states). Refreshes itself while payment or writing is in progress.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { serverContext } from "@/server/http";
import { loadOrderView } from "@/server/orders";
import { currentViewer } from "@/server/viewer";
import { AutoRefresh } from "./AutoRefresh";
import { ResendButton } from "./ResendButton";
import { SITE } from "@/lib/site";
import { ORDER_COPY } from "@/lib/order-status";

export const metadata: Metadata = { title: "Your reading · Haeday", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";



export default async function OrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const ctx = serverContext();
  const view = await loadOrderView(ctx.db, orderId, await currentViewer(ctx.db));
  if (!view) notFound();
  const [title, copyBody] = ORDER_COPY[view.state];
  // D35/D47: orders sold with the 24-hour promise say so while waiting.
  const body = view.state === "processing" && view.delayed
    ? "It's busy right now, so your reading will be ready within 24 hours of payment. We'll email you the link. If it isn't ready by then, an automatic full refund will be requested."
    : copyBody;
  const waiting = view.state === "awaiting_payment" || view.state === "processing" || view.state === "refund_pending";
  return (
    <main className="app">
      <header className="brand"><Link href="/"><span aria-hidden="true" className="moon">☾</span> Haeday</Link></header>
      <p className="eyebrow" style={{ marginTop: 28 }}>YOUR HAEDAY ORDER</p>
      <h1>{title}</h1>
      {body && <p className="lede" role="status">{body}</p>}
      {waiting && <AutoRefresh seconds={view.delayed ? 30 : 4} />}
      {view.readingId && <Link className="btn btn-primary" href={`/r/${view.readingId}`}>Open my reading</Link>}
      {view.state === "delivered" && view.readingId && <ResendButton orderId={view.id} />}
      {["delivered", "processing", "partially_refunded"].includes(view.state) && <p><Link href={`/refund/${view.id}`}>Request a refund</Link></p>}
      {view.state === "expired" && view.chartRevisionId && <Link className="btn btn-primary" href={`/chart/${view.chartRevisionId}`}>Back to my chart</Link>}
      <p className="note">Order reference: <code>{view.id}</code></p>
      <p className="fine">Questions? {SITE.support} · <Link href="/login">Open your readings on another device</Link></p>
    </main>
  );
}
