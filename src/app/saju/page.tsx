import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { loadChart } from "@/server/charts/service";
import { findGuest, GUEST_COOKIE } from "@/server/guest";
import { serverContext } from "@/server/http";
import { SajuForm, type SajuInitial } from "./SajuForm";
import { VisitBeacon } from "../Beacon";

export const metadata: Metadata = { title: "Your birth chart · Haeday", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SajuPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  let initial: SajuInitial | undefined;
  if (edit) {
    // Editing prefills the owner's own input and saves a new revision in the same chart group.
    const ctx = serverContext();
    const guest = await findGuest(ctx.db, (await cookies()).get(GUEST_COOKIE)?.value);
    const chart = await loadChart(ctx.db, ctx.ring, edit, guest?.id ?? null);
    if (chart) {
      const t = chart.input.time;
      initial = { birthDate: chart.input.birthDate, mode: t.kind, hhmm: "hhmm" in t ? t.hhmm : "", placeId: chart.input.placeId, placeLabel: chart.input.placeLabel, chartGroupId: chart.chartGroupId };
    }
  }
  return (
    <main className="app">
      <header className="brand"><Link href="/"><span aria-hidden="true" className="moon">☾</span> Haeday</Link></header>
      <h1>{initial ? "Edit your details" : "Your birth chart"}</h1>
      <p className="lede">Three details, about a minute. Your free chart shows your four pillars and your Day Master.</p>
      <VisitBeacon />
      <SajuForm initial={initial} today={new Date().toISOString().slice(0, 10)} />
      <p className="fine">AI-assisted · For entertainment and reflection · Not advice · <Link href="/method">How we calculate</Link></p>
    </main>
  );
}
