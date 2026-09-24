import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { serverContext } from "@/server/http";
import { loadOrderView } from "@/server/orders";
import { currentViewer } from "@/server/viewer";
import { RefundButton } from "./RefundButton";

export const metadata: Metadata = { title: "Refund · Haeday", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function RefundPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const ctx = serverContext();
  const view = await loadOrderView(ctx.db, orderId, await currentViewer(ctx.db));
  if (!view) notFound();
  return (
    <main className="app">
      <header className="brand"><Link href="/"><span aria-hidden="true" className="moon">☾</span> Haeday</Link></header>
      <h1>Request a refund</h1>
      {view.state === "refunded" || view.state === "failed_refunded" ? <p className="lede" role="status">This order has already been refunded (or the refund is on its way).</p> : (
        <>
          <p className="lede">Not what you hoped for? Within 7 days of purchase we refund one reading per customer, no questions asked. Banks usually show it in 5–10 business days.</p>
          <RefundButton orderId={orderId} />
        </>
      )}
      <p className="fine"><Link href="/refunds">Refund policy</Link> · Questions? hello@haeday.com</p>
    </main>
  );
}
