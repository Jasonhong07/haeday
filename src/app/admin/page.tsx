// Owner dashboard (D19): aggregates only, sales switch, stuck orders. Verified session + ADMIN_EMAILS, else 404.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dashboard, openIssues, undelivered } from "@/server/admin";
import { isAdmin } from "@/server/auth";
import { serverContext } from "@/server/http";
import { isSalesEnabled, resetSettingsCache } from "@/server/settings";
import { currentViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Admin · Haeday", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export default async function Admin({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const ctx = serverContext();
  const v = await currentViewer(ctx.db);
  if (!(await isAdmin(ctx.db, ctx.ring, v.customerId, ctx.env.ADMIN_EMAILS))) notFound();
  const days = Math.min(Math.max(Number((await searchParams).days ?? 7) || 7, 1), 365);
  resetSettingsCache();
  const [d, stuck, issues, sales, heartbeat] = await Promise.all([
    dashboard(ctx.db, days), undelivered(ctx.db), openIssues(ctx.db), isSalesEnabled(ctx.db),
    ctx.db.query.settings.findFirst({ where: (s, { eq }) => eq(s.key, "worker_heartbeat") }),
  ]);
  const conv = d.chartBrowsers ? ((d.paidOrders / d.chartBrowsers) * 100).toFixed(1) : "0.0";
  return (
    <main className="app" style={{ maxWidth: 760 }}>
      <header className="brand"><Link href="/"><span aria-hidden="true" className="moon">☾</span> Haeday admin</Link></header>
      <p className="note">Last {days} days, UTC · <Link href="/admin?days=1">1d</Link> · <Link href="/admin?days=7">7d</Link> · <Link href="/admin?days=30">30d</Link> · Worker heartbeat: {String(heartbeat?.value ?? "none")}</p>
      <section className="card">
        <h2>Sales are {sales ? "ON" : "OFF"}</h2>
        <form method="post" action="/api/admin/sales" className="btn-row">
          {!sales && <button className="btn btn-primary" name="mode" value="on">Turn sales on</button>}
          {sales && <button className="btn btn-ghost" name="mode" value="soft_stop">Soft stop (no new checkouts)</button>}
          <button className="btn btn-ghost" name="mode" value="hard_stop">Hard stop (also expire open checkouts)</button>
        </form>
      </section>
      <section className="card">
        <h2>Funnel and money</h2>
        <p>Browsers that made a chart (device-based): <b>{d.chartBrowsers}</b> · charts: {d.chartsCreated} · checkouts started: {d.checkoutsStarted}</p>
        <p>Paid orders: <b>{d.paidOrders}</b> · conversion (paid ÷ chart browsers, activity-based): {conv}%</p>
        <p>Gross {usd(d.grossCents)} · tax {usd(d.taxCents)} · refunds {usd(d.refundCents)} ({d.refundsCount}) · <b>net {usd(d.netCents)}</b></p>
        <p className="note">Landing visitors need PostHog (not connected yet).</p>
      </section>
      <section className="card">
        <h2>Paid but not delivered: {stuck.length}</h2>
        {stuck.map((o) => (
          <div key={o.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "8px 0" }}>
            <code style={{ fontSize: 12 }}>{o.id.slice(0, 8)}</code> <span className="note">{o.fulfillment} · paid {o.paidAt?.toISOString().slice(0, 16)}</span>
            <form method="post" action={`/api/admin/orders/${o.id}/retry`}><button className="btn btn-ghost" style={{ minHeight: 40, width: "auto", padding: "0 14px" }}>Retry</button></form>
            <form method="post" action={`/api/admin/orders/${o.id}/refund`}><button className="btn btn-ghost" style={{ minHeight: 40, width: "auto", padding: "0 14px" }}>Refund</button></form>
          </div>
        ))}
      </section>
      <section className="card">
        <h2>Refunds pending: {issues.pendingRefunds.length} · Disputes open: {issues.openDisputes.length}</h2>
        {issues.openDisputes.map((x) => <p key={x.id} className="note">Dispute {x.status} · evidence due {x.due?.toISOString().slice(0, 10) ?? "?"}</p>)}
      </section>
    </main>
  );
}
