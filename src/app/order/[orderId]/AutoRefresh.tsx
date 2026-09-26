"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
/** Bounded polling with a usable recovery action after automatic refresh stops. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  const [stopped, setStopped] = useState(false);
  useEffect(() => {
    let elapsed = 0;
    const t = setInterval(() => {
      elapsed += seconds;
      if (elapsed > 180) { clearInterval(t); setStopped(true); }
      else if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return <div className="order-refresh">
    <p className="note" role="status">{stopped ? "Automatic checking has paused. You can check again below; no new payment will be made." : "Checking for updates automatically…"}</p>
    <button type="button" className="btn btn-ghost" onClick={() => router.refresh()}>Check status now</button>
  </div>;
}
