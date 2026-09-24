"use client";
// C4 / D41: "Email me my chart" with a SEPARATE, unchecked marketing consent.
import { useState } from "react";

export function ChartEmailForm({ chartId, consentText }: { chartId: string; consentText: string }) {
  const [email, setEmail] = useState("");
  const [marketing, setMarketing] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error" | "limit">("idle");
  async function send(e: React.FormEvent) {
    e.preventDefault(); setState("busy");
    const res = await fetch("/api/chart-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chartId, email, marketing }) }).catch(() => null);
    setState(res?.ok ? "sent" : res?.status === 429 ? "limit" : "error");
  }
  if (state === "sent") return <p className="note" role="status">Sent. Check your inbox (and spam folder) in a minute.</p>;
  return (
    <form onSubmit={send} className="card" aria-labelledby="mail-title">
      <h2 id="mail-title">Email me my chart</h2>
      <label className="visually-hidden" htmlFor="chart-email">Email</label>
      <input id="chart-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={{ width: "100%", minHeight: 44, marginBottom: 12 }} />
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
        <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} style={{ width: 20, height: 20, marginTop: 2 }} />
        <span className="note" style={{ margin: 0 }}>{consentText}</span>
      </label>
      <button className="btn btn-ghost" type="submit" disabled={state === "busy"}>Email me my chart</button>
      {state === "error" && <p className="error" role="alert">That didn&apos;t work. Please try again.</p>}
      {state === "limit" && <p className="error" role="alert">That&apos;s enough emails for today. Please try again tomorrow.</p>}
      <p className="fine">We send your chart only to this address. See our <a href="/privacy">privacy policy</a>.</p>
    </form>
  );
}
