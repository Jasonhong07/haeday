// CC4a: one order, everything support needs (statuses and ids only; no email, birth data or reading text).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { isAdmin } from "@/server/auth";
import { serverContext } from "@/server/http";
import { currentViewer } from "@/server/viewer";
import { MAX_RESENDS, orderDetail, resendCount } from "@/server/support";
import { adminMessage } from "@/lib/admin-messages";

export const metadata: Metadata = { title: "Order · Haeday admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const usd = (c: number | null | undefined) => (c === null || c === undefined ? "–" : `$${(c / 100).toFixed(2)}`);
const t = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : "–");
const small = { minHeight: 40, width: "auto", padding: "0 14px" } as const;

export default async function AdminOrder({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const ctx = serverContext();
  const v = await currentViewer(ctx.db);
  if (!(await isAdmin(ctx.db, ctx.ring, v.customerId, ctx.env.ADMIN_EMAILS))) notFound();
  const { id } = await params;
  const d = await orderDetail(ctx.db, id);
  if (!d) notFound();
  const msg = adminMessage((await searchParams).msg);
  const o = d.order;
  const resends = await resendCount(ctx.db, id);
  const canRetry = o.payment === "paid" && ["queued", "generating", "failed"].includes(o.fulfillment);
  const canRefund = ["paid", "partially_refunded"].includes(o.payment);
  const canResend = o.fulfillment === "delivered" && o.payment !== "refunded" && d.hasEmail && resends < MAX_RESENDS;
  return (
    <main className="app" style={{ maxWidth: 760 }}>
      {msg && <p className="notice card" role="status">{msg}</p>}
      <header className="brand"><Link href="/admin"><span aria-hidden="true" className="moon">☾</span> Haeday admin</Link></header>
      <h1 style={{ fontSize: 24 }}>Order <code>{o.id.slice(0, 8)}</code></h1>
      <section className="card">
        <p>Payment <b>{o.payment}</b> · fulfillment <b>{o.fulfillment}</b> · promise {o.promise}{o.duplicate ? ` · duplicate of ${d.duplicateOf?.slice(0, 8)}` : ""}</p>
        <p className="note">Created {t(o.createdAt)} · paid {t(o.paidAt)} · deadline {t(d.deadline)}{d.notBefore ? ` · not before ${t(d.notBefore)}` : ""}</p>
        <p className="note">Total {usd(o.totalCents)} · tax {usd(d.tax)} · discount {usd(d.discount)} · checkout email {d.hasEmail ? "on file" : "none"}{d.piiDeleted ? " · personal data deleted (retention)" : ""}</p>
        <p className="note">Stripe: {d.session ?? "–"} · {d.intent ?? "–"}</p>
        {o.readingId && <p className="note">Reading id {o.readingId.slice(0, 8)} (the customer opens it at /r/…; admins cannot read it)</p>}
        <div className="btn-row" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canRetry && <form method="post" action={`/api/admin/orders/${id}/retry`}><input type="hidden" name="requestId" value={randomUUID()} /><input type="hidden" name="back" value="order" /><button className="btn btn-ghost" style={small}>Retry generation</button></form>}
          {canResend && <form method="post" action={`/api/admin/orders/${id}/resend`}><input type="hidden" name="back" value="order" /><button className="btn btn-ghost" style={small}>Resend delivery email ({MAX_RESENDS - resends} left)</button></form>}
          {canRefund && <form method="post" action={`/api/admin/orders/${id}/refund`}><input type="hidden" name="back" value="order" /><button className="btn btn-ghost" style={small}>Refund</button></form>}
        </div>
      </section>
      <section className="card">
        <h2>Generation attempts: {d.attempts.length}</h2>
        {d.attempts.map((a, i) => <p key={i} className="note">{t(a.at)} · {a.status}{a.error ? ` · ${a.error}` : ""}{a.model ? ` · ${a.model}` : ""}</p>)}
      </section>
      <section className="card">
        <h2>Emails: {d.emails.length}</h2>
        {d.emails.map((e, i) => <p key={i} className="note">{t(e.at)} · {e.kind}{e.key.includes(":delivery:r") ? " (resend)" : ""} · {e.status} · tries {e.attempts}{e.error ? ` · ${e.error}` : ""}</p>)}
      </section>
      <section className="card">
        <h2>Refunds: {d.refunds.length}</h2>
        {d.refunds.map((r) => <p key={r.id} className="note">{t(r.at)} · {r.reason} · {r.status} · {usd(r.amountCents)} · {r.source}{r.failure ? ` · ${r.failure}` : ""}</p>)}
      </section>
      <section className="card">
        <h2>Issues and disputes</h2>
        {d.issues.map((x) => (
          <div key={x.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="note">{x.kind} · {x.status} · {x.next}</span>
            {x.status !== "resolved" && <form method="post" action={`/api/admin/issues/${x.id}`}><input type="hidden" name="back" value="order" /><input type="hidden" name="orderId" value={id} /><button className="btn btn-ghost" name="status" value="resolved" style={small}>Resolved</button></form>}
          </div>
        ))}
        {d.disputes.map((x, i) => <p key={i} className="note">Dispute {x.status} · evidence due {t(x.due)}</p>)}
        {d.issues.length + d.disputes.length === 0 && <p className="note">None.</p>}
      </section>
    </main>
  );
}
