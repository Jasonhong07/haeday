"use client";
// CC4a: find an order by checkout email, order id (first 8+ characters) or Stripe session / payment id.
// POSTs JSON so the email never appears in a URL.
import { useState } from "react";

type Row = { id: string; createdAt: string; paidAt: string | null; payment: string; fulfillment: string; totalCents: number | null; promise: string; duplicate: boolean; readingId: string | null };

export function OrderSearch() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch("/api/admin/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q }) });
      setRows(r.ok ? ((await r.json()) as { rows: Row[] }).rows : []);
    } finally { setBusy(false); }
  }
  return (
    <section className="card">
      <h2>Find an order</h2>
      <form onSubmit={go} style={{ display: "flex", gap: 8 }}>
        <input className="input" aria-label="Email, order id or Stripe id" placeholder="email, order id, cs_… or pi_…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        <button className="btn btn-primary" style={{ width: "auto", padding: "0 18px" }} disabled={busy || q.trim().length < 3}>Search</button>
      </form>
      {rows && (rows.length === 0 ? <p className="note">No orders found.</p> : (
        <ul style={{ paddingLeft: 18 }}>{rows.map((r) => (
          <li key={r.id}><a href={`/admin/orders/${r.id}`}><code>{r.id.slice(0, 8)}</code></a> · {r.payment}/{r.fulfillment}{r.duplicate ? " · duplicate" : ""} · {r.totalCents === null ? "–" : `$${(r.totalCents / 100).toFixed(2)}`} · {(r.paidAt ?? r.createdAt).slice(0, 16)}</li>
        ))}</ul>
      ))}
    </section>
  );
}
