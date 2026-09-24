"use client";
import { useState } from "react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "throttled" | "error">("idle");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setState("busy");
    const res = await fetch("/api/auth/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => null);
    setState(res?.ok ? "sent" : res?.status === 429 ? "throttled" : "error");
  }
  if (state === "sent") return <p className="card" role="status">If that email has a Haeday purchase, a sign-in link is on its way. It works once and expires in 15 minutes.</p>;
  return (
    <form onSubmit={submit} className="card">
      {state === "throttled" && <p className="error" role="alert">Too many links requested. Please wait an hour and try again.</p>}
      {state === "error" && <p className="error" role="alert">We couldn&apos;t send a link right now. Please try again in a few minutes.</p>}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <button className="btn btn-primary" type="submit" disabled={state === "busy"}>Email me a link</button>
    </form>
  );
}
