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

export const metadata: Metadata = { title: "Your reading · Haeday", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const COPY = {
  awaiting_payment: ["Confirming your payment", "This usually takes a few seconds. If you closed the payment page, nothing was charged."],
  processing: ["Payment received. Writing your reading.", "This usually takes under a minute. You can stay here; we'll also email you the link."],
  delivered: ["Your reading is ready", ""],
  failed_refunded: ["We couldn't complete your reading", "Your refund has been started. Banks usually show it in 5–10 business days."],
  refunded: ["This order was refunded", "Banks usually show refunds in 5–10 business days."],
  expired: ["This checkout expired", "Nothing was charged. You can start again from your chart."],
} as const;

export default async function OrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const ctx = serverContext();
  const view = await loadOrderView(ctx.db, orderId, await currentViewer(ctx.db));
  if (!view) notFound();
  const [title, copyBody] = COPY[view.state];
  // D35/D47: orders sold with the 24-hour promise say so while waiting.
  const body = view.state === "processing" && view.delayed
    ? "It's busy right now, so your reading will be ready within 24 hours. We'll email you the link. If it isn't ready by then, you get an automatic full refund."
    : copyBody;
  const waiting = view.state === "awaiting_payment" || view.state === "processing";
  return (
    <main className="app">
      <header className="brand"><Link href="/"><span aria-hidden="true" className="moon">☾</span> Haeday</Link></header>
      <h1>{title}</h1>
      {body && <p className="lede" role="status">{body}</p>}
      {waiting && !(view.state === "processing" && view.delayed) && <AutoRefresh seconds={4} />}
      {view.state === "delivered" && view.readingId && <Link className="btn btn-primary" href={`/r/${view.readingId}`}>Open my reading</Link>}
      {view.state === "delivered" && view.readingId && <ResendButton orderId={view.id} />}
      {view.state === "expired" && view.chartRevisionId && <Link className="btn btn-primary" href={`/chart/${view.chartRevisionId}`}>Back to my chart</Link>}
      <p className="fine">Questions? {SITE.support} · <Link href="/login">Open your readings on another device</Link></p>
    </main>
  );
}
