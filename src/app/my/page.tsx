// Purchases for this customer (verified session) and this browser's guest orders.
import { and, desc, eq, inArray, or, type SQL } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { orders, readings } from "@/server/db/schema";
import { serverContext } from "@/server/http";
import { currentViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "My readings · Haeday", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function MyPage() {
  const ctx = serverContext();
  const v = await currentViewer(ctx.db);
  const who = [v.guestId ? eq(orders.guestId, v.guestId) : undefined, v.customerId ? eq(orders.customerId, v.customerId) : undefined].filter(Boolean) as SQL[];
  const rows = who.length ? await ctx.db.select({ id: orders.id, paidAt: orders.paidAt, status: orders.paymentStatus, fulfillment: orders.fulfillmentStatus, readingId: readings.id })
    .from(orders).leftJoin(readings, eq(readings.orderId, orders.id))
    .where(and(or(...who), inArray(orders.paymentStatus, ["paid", "refund_pending", "refunded", "partially_refunded"]))).orderBy(desc(orders.paidAt)) : [];
  return (
    <main className="app">
      <header className="brand"><Link href="/"><span aria-hidden="true" className="moon">☾</span> Haeday</Link></header>
      <h1>My readings</h1>
      {rows.length === 0 ? (
        <p className="lede">No purchases in this browser yet. {v.customerId ? "" : <Link href="/login">Sign in with your checkout email</Link>}</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {rows.map((r) => (
            <li key={r.id} className="card">
              <p style={{ margin: "0 0 8px" }}>Reading · {r.paidAt ? r.paidAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : ""}{r.status === "refunded" ? " · refunded" : ""}</p>
              {r.readingId ? <Link className="btn btn-ghost" href={`/r/${r.readingId}`}>Open</Link> : <Link className="btn btn-ghost" href={`/order/${r.id}`}>Status</Link>}
            </li>
          ))}
        </ul>
      )}
      {v.customerId && <form method="post" action="/api/auth/logout"><button className="btn btn-ghost" type="submit">Sign out</button></form>}
    </main>
  );
}
