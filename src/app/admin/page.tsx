import { sentToday } from "@/server/email/budget";
import { randomUUID } from "node:crypto";
// Owner dashboard (D19): aggregates only, sales switch, stuck orders. Verified session + ADMIN_EMAILS, else 404.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dashboard, funnel, heartbeatStale, openIssues, undelivered } from "@/server/admin";
import { isAdmin } from "@/server/auth";
import { serverContext } from "@/server/http";
import { isSalesEnabled, resetSettingsCache } from "@/server/settings";
import { currentViewer } from "@/server/viewer";
import { recentAlerts } from "@/server/alerts";
import { adminMessage } from "@/lib/admin-messages";
import { OrderSearch } from "./OrderSearch";
import { preflight } from "@/server/preflight";

export const metadata: Metadata = { title: "Admin · Haeday", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

const STEPS = [["visit", "Visit"], ["formStarted", "Form started"], ["chartCreated", "Chart created"], ["chartViewed", "Free chart viewed"], ["checkoutStarted", "Checkout started"], ["paid", "Paid (sales)"], ["delivered", "Reading delivered"], ["opened", "Reading opened"]] as const;
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "–");

export default async function Admin({ searchParams }: { searchParams: Promise<{ days?: string; msg?: string }> }) {
  const ctx = serverContext();
  const v = await currentViewer(ctx.db);
  if (!(await isAdmin(ctx.db, ctx.ring, v.customerId, ctx.env.ADMIN_EMAILS))) notFound();
  const sp = await searchParams;
  const days = Math.min(Math.max(Number(sp.days ?? 7) || 7, 1), 365);
  const retryMsg = adminMessage(sp.msg);
  resetSettingsCache();
  const f = await funnel(ctx.db, days);
  const [d, stuck, issues, sales, emailsToday, heartbeat, alerts] = await Promise.all([
    dashboard(ctx.db, days), undelivered(ctx.db), openIssues(ctx.db), isSalesEnabled(ctx.db), sentToday(ctx.db),
    ctx.db.query.settings.findFirst({ where: (s, { eq }) => eq(s.key, "worker_heartbeat") }), recentAlerts(ctx.db, 8),
  ]);
  const checks = preflight(ctx.env);
  const workerStale = heartbeatStale(heartbeat?.value);
  const conv = d.chartBrowsers ? ((d.paidOrders / d.chartBrowsers) * 100).toFixed(1) : "0.0";
  return (
    <main className="app" style={{ maxWidth: 760 }}>
      {retryMsg && <p className="notice card" role="status">{retryMsg}</p>}
      <header className="brand"><Link href="/"><span aria-hidden="true" className="moon">☾</span> Haeday admin</Link></header>
      <p className="note">Last {days} days, UTC · <Link href="/admin?days=1">1d</Link> · <Link href="/admin?days=7">7d</Link> · <Link href="/admin?days=30">30d</Link> · Worker heartbeat: {String(heartbeat?.value ?? "none")}</p>
      {workerStale && <p className="notice card" role="alert">The worker has not checked in for over 5 minutes: readings, refunds, emails and alerts are paused. Check the worker service on Railway.</p>}
      <OrderSearch />
      <details className="card">
        <summary><b>Launch checklist</b>: {checks.filter((c) => c.level === "block").length} blocking · {checks.filter((c) => c.level === "todo").length} to do · {checks.filter((c) => c.level === "warn").length} warnings</summary>
        <ul style={{ paddingLeft: 18 }}>{checks.map((c, i) => <li key={i} className="note">{c.level === "ok" ? "✓" : c.level === "block" ? "✗" : "•"} <b>{c.area}</b>: {c.text}</li>)}</ul>
      </details>
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
        <p>AI: {d.aiAttempts} calls · ${(d.aiCostMicroUsd / 1e6).toFixed(2)} total · {d.aiCostPerDeliveredMicroUsd === null ? "no deliveries yet" : `$${(d.aiCostPerDeliveredMicroUsd / 1e6).toFixed(3)} per delivered reading`}{d.aiUnknownCostAttempts ? ` · ${d.aiUnknownCostAttempts} calls with unknown cost (model not priced or timed out)` : ""}</p>
        <p>Emails sent today (UTC): {emailsToday}</p>
        <p>Paid orders: <b>{d.paidOrders}</b> · free (100% code): {d.freeOrders} · conversion (paid ÷ chart browsers, activity-based): {conv}%</p>
        <p>Gross {usd(d.grossCents)} · tax {usd(d.taxCents)} · refunds {usd(d.refundCents)} ({d.refundsCount}) · <b>net {usd(d.netCents)}</b></p>
              </section>
      <section className="card">
        <h2>Paid but not delivered: {stuck.length}</h2>
        {stuck.map((o) => (
          <div key={o.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "8px 0" }}>
            <a href={`/admin/orders/${o.id}`}><code style={{ fontSize: 12 }}>{o.id.slice(0, 8)}</code></a> <span className="note">{o.fulfillment} · paid {o.paidAt?.toISOString().slice(0, 16)}</span>
            <form method="post" action={`/api/admin/orders/${o.id}/retry`}><input type="hidden" name="requestId" value={randomUUID()} /><button className="btn btn-ghost" style={{ minHeight: 40, width: "auto", padding: "0 14px" }}>Retry</button></form>
            <form method="post" action={`/api/admin/orders/${o.id}/refund`}><button className="btn btn-ghost" style={{ minHeight: 40, width: "auto", padding: "0 14px" }}>Refund</button></form>
          </div>
        ))}
      </section>
      <section className="card">
        <h2>Funnel (D40)</h2>
        <p className="note">Activity = how often each step happened in the period. Cohort = browsers whose first visit was in the period, and how far they got. Browsers are anonymous first-party ids, not people.</p>
        <table style={{ width: "100%", fontSize: 14 }}><thead><tr><th align="left">Step</th><th align="right">Activity</th><th align="right">Cohort</th><th align="right">From previous</th></tr></thead>
          <tbody>{STEPS.map(([k, label], i) => (
            <tr key={k}><td>{label}</td><td align="right">{f.activity[k]}</td><td align="right">{f.cohort[k]}</td><td align="right">{i ? pct(f.cohort[k], f.cohort[STEPS[i - 1]![0]]) : ""}</td></tr>
          ))}</tbody></table>
        <p className="note">Refund rate {pct(f.refundRate, 1)} · generation failure rate {pct(f.failureRate, 1)}</p>
        <p className="note">By first channel: {f.byChannel.map((c) => `${c.channel} ${c.visitors} → ${c.buyers} buyers (${pct(c.buyers, c.visitors)})`).join(" · ") || "no visits yet"}</p>
      </section>
      <section className="card">
        <h2>Refunds pending: {issues.pendingRefunds.length} · Disputes open: {issues.openDisputes.length}</h2>
        {issues.openDisputes.map((x) => <p key={x.id} className="note">Dispute {x.status} · evidence due {x.due?.toISOString().slice(0, 10) ?? "?"}</p>)}
        <h2>Needs action: {issues.needsAction.length}</h2>
        {issues.needsAction.map((x) => (
          <div key={x.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "8px 0" }}>
            <span className="note">{x.kind} · {x.nextAction} · order {x.orderId ? <a href={`/admin/orders/${x.orderId}`}>{x.orderId.slice(0, 8)}</a> : "none"} · since {x.since.toISOString().slice(0, 16)}{x.occurrences > 1 ? ` · seen ${x.occurrences}×` : ""}{x.status === "acknowledged" ? " · seen" : ""}</span>
            {x.status === "open" && <form method="post" action={`/api/admin/issues/${x.id}`}><button className="btn btn-ghost" name="status" value="acknowledged" style={{ minHeight: 36, width: "auto", padding: "0 12px" }}>Seen</button></form>}
            <form method="post" action={`/api/admin/issues/${x.id}`}><button className="btn btn-ghost" name="status" value="resolved" style={{ minHeight: 36, width: "auto", padding: "0 12px" }}>Resolved</button></form>
          </div>
        ))}
      </section>
      <section className="card">
        <h2>Recent alerts</h2>
        {alerts.length === 0 ? <p className="note">None. Alerts are emailed to ADMIN_EMAILS at most once a day per problem.</p>
          : alerts.map((x, i) => <p key={i} className="note">{x.at.toISOString().slice(0, 16)} · {x.kind} · {x.summary}</p>)}
      </section>
    </main>
  );
}
