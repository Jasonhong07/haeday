"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
/** Re-renders the server page every few seconds (stops after ~3 minutes). */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => { if (++n > 180 / seconds) clearInterval(t); else router.refresh(); }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return <p className="note" aria-live="polite">Checking… <span className="visually-hidden">This page updates automatically.</span></p>;
}
