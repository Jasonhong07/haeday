"use client";
// First-party funnel beacon (D40): sends only an event name, an allowlisted campaign id and the referrer HOST.
import { useEffect } from "react";

export function sendEvent(name: "visit" | "form_started"): void {
  let c: string | undefined; let ref: string | undefined;
  try {
    const p = new URLSearchParams(window.location.search);
    c = (p.get("c") ?? p.get("utm_source") ?? undefined)?.slice(0, 40);
    ref = document.referrer ? new URL(document.referrer).hostname : undefined;
  } catch { /* ignore */ }
  const body = JSON.stringify(name === "visit" ? { name, ...(c ? { c } : {}), ...(ref ? { ref } : {}) } : { name });
  fetch("/api/e", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
}

export function VisitBeacon() {
  useEffect(() => {
    try { if (sessionStorage.getItem("hd_visit")) return; sessionStorage.setItem("hd_visit", "1"); } catch { /* storage blocked: still count */ }
    sendEvent("visit");
  }, []);
  return null;
}
