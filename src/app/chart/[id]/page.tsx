// Free chart (PRD §4). Server-rendered for the owning guest only; everything else is a 404.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DAY_MASTERS, ELEMENT_LABEL, OFFER_ITEMS } from "@/content/library";
import { formatDate, formatTime } from "@/lib/format";
import { markChartViewed, loadChart, type LoadedChart } from "@/server/charts/service";
import { formatClock, type Pillar, type Pillars } from "@/server/engine";
import { llmConfigured, paymentsConfigured } from "@/server/env";
import { findGuest, GUEST_COOKIE } from "@/server/guest";
import { serverContext } from "@/server/http";
import { buildFacts, contentReady, freePreview } from "@/server/fulfillment/prompt";
import { MARKETING_CONSENT_TEXT } from "@/server/email/capture";
import { ChartEmailForm } from "./ChartEmailForm";
import { isSalesEnabled } from "@/server/settings";
import { QuestionCard, ShareButton, type ShareData } from "./ChartClient";

export const metadata: Metadata = { title: "Your birth chart · Haeday", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const EL_HEX = { wood: "#5FA97A", fire: "#E0685A", earth: "#D9B26A", metal: "#C9CCD6", water: "#6FA0D8" } as const;
const POSITIONS = [["hour", "Hour"], ["day", "Day"], ["month", "Month"], ["year", "Year"]] as const; // traditional right-to-left order, read as a row

function Glyphs({ p }: { p: Pillar }) {
  return (
    <>
      <div className={`glyph el-${p.stemElement}`} aria-hidden="true">{p.stem}<small>{p.stemEn}</small></div>
      <div className={`glyph el-${p.branchElement}`} aria-hidden="true">{p.branch}<small>{p.branchEn}</small></div>
    </>
  );
}

function PillarTiles({ pillars }: { pillars: Pillars }) {
  return (
    <div className="pillars" role="list" aria-label="Your four pillars">
      {POSITIONS.map(([key, label]) => {
        const p = pillars[key];
        return (
          <div className="pillar" role="listitem" key={key}>
            <span className="pos">{label}</span>
            {p ? <><Glyphs p={p} /><span className="visually-hidden">{`${label} pillar: ${p.stem}${p.branch}, ${p.stemEn} · ${p.branchEn}`}</span></>
              : <div className="glyph unknown">Hour unknown</div>}
          </div>
        );
      })}
    </div>
  );
}

function detailsLine(c: LoadedChart): string {
  const t = c.input.time;
  const time = t.kind === "unknown" ? "time unknown" : t.kind === "approximate" ? `about ${formatTime(t.hhmm)}` : formatTime(t.hhmm);
  const fold = c.input.foldChoice ? ` (the ${c.input.foldChoice === "earlier" ? "first" : "second"} one)` : "";
  return `${formatDate(c.input.birthDate)}, ${time}${fold}, ${c.input.placeLabel}`;
}

const WARNING_TEXT: Record<string, string> = {
  hourBoundary: "Your birth time is close to the change of an hour pillar, so a few minutes' difference would change it.",
  dayBoundary: "Your birth time is close to midnight in solar time, so a few minutes' difference would change your day pillar.",
  termBoundary: "You were born within half an hour of a solar-term change, so your month (and maybe year) pillar sits right on a boundary.",
  pre1970Tz: "Time-zone records before 1970 are less certain, so treat the hour with a little caution.",
  approximateTime: "Your time is approximate, so the hour pillar is our best estimate.",
};

export default async function ChartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = serverContext();
  const guest = await findGuest(ctx.db, (await cookies()).get(GUEST_COOKIE)?.value);
  const chart = await loadChart(ctx.db, ctx.ring, id, guest?.id ?? null);
  if (!chart) notFound();
  await markChartViewed(ctx.db, chart.id);
  const r = chart.response;
  // D37: a chart whose reading still needs unapproved content is shown as "opening soon", never sold.
  const preview = r.kind === "computed" ? freePreview(r.chart.dayMaster.stem) : null;
  const salesOpen = r.kind === "computed" && contentReady(buildFacts(r.chart), ctx.env.APP_ENV === "production")
    && paymentsConfigured(ctx.env) && llmConfigured(ctx.env) && (await isSalesEnabled(ctx.db));

  let body: React.ReactNode;
  if (r.kind === "needs_fold_choice") {
    const t = "hhmm" in chart.input.time ? formatTime(chart.input.time.hhmm) : "";
    body = <QuestionCard chartId={id} allowUnknown={false} title={`Clocks fell back that night, so ${t} happened twice. Which one?`}
      choices={[{ label: `The first ${t}`, body: { foldChoice: "earlier" } }, { label: `The second ${t}`, body: { foldChoice: "later" } }]} />;
  } else {
    const c = r.chart;
    const dm = DAY_MASTERS[c.dayMaster.stem]!;
    const q = r.questions[0];
    const askWindow = q?.askCustomer && chart.input.boundaryChoice === undefined;
    const share: ShareData = {
      dayMasterHanja: dm.stem, dayMasterName: dm.name, image: dm.image,
      tiles: POSITIONS.map(([key, label]) => {
        const p = c.pillars[key];
        return p ? { pos: label, stem: p.stem, branch: p.branch, stemColor: EL_HEX[p.stemElement], branchColor: EL_HEX[p.branchElement] } : null;
      }),
    };
    body = (
      <>
        {askWindow && q && (
          <QuestionCard chartId={id} allowUnknown title="Your chart changes during that day. When were you born?"
            choices={q.windows.map((w) => ({ label: `Between ${formatClock(w.from)} and ${formatClock(w.to)}`, body: { boundaryChoice: w.index } }))} />
        )}
        <PillarTiles pillars={c.pillars} />
        <section className="card" aria-labelledby="dm">
          <span className="dm-hanja" aria-hidden="true">{dm.stem}</span>
          <p className="eyebrow">YOUR DAY MASTER</p>
          <h2 id="dm">{dm.name} · {dm.image}</h2>
          <p style={{ margin: 0 }}>{dm.line}</p>
        </section>
        {preview && (
          // C2 / D46: approved day-master text only. The paid sections are listed by title; their text is not on this page.
          <section className="card" aria-labelledby="preview">
            <p className="eyebrow">A PREVIEW FROM YOUR READING</p>
            <h2 id="preview">{dm.name}, in depth</h2>
            <p>{preview}</p>
            <p className="note" style={{ marginBottom: 4 }}>Also in your personal reading:</p>
            <ul className="locked">{OFFER_ITEMS.filter((i) => !/Day Master/.test(i)).map((i) => <li key={i}>{i}</li>)}</ul>
          </section>
        )}
        <section className="card" aria-labelledby="el">
          <h2 id="el">Your visible elements</h2>
          <div className="bars">
            {(Object.keys(ELEMENT_LABEL) as Array<keyof typeof ELEMENT_LABEL>).map((e) => {
              const n = c.visibleElements[e];
              return (
                <div className="bar" key={e}>
                  <span>{ELEMENT_LABEL[e].en}</span>
                  <span className="track" aria-hidden="true"><span className={`fill el-${e}`} style={{ width: `${(n / c.denominator) * 100}%`, display: "block" }} /></span>
                  <span aria-hidden="true">{n}</span>
                  <span className="visually-hidden">{`${ELEMENT_LABEL[e].en}: ${n} out of ${c.denominator}`}</span>
                </div>
              );
            })}
          </div>
          <p className="note">Out of {c.denominator} characters{c.denominator === 6 ? " (no hour pillar)" : ""}. A simple count, not a measure of strength.</p>
        </section>
        {c.disclosure && <p className="disclosure">{c.disclosure}</p>}
        {r.warnings.filter((w) => w !== "approximateTime" || c.timeBasis === "approximate").map((w) => {
          // R9: say WHAT could change, not only that something could (display only; the chart itself is unchanged).
          const alt = r.alternatives.find((a) => a.reason === w);
          const diff = alt ? (["year", "month", "day", "hour"] as const).filter((k) => {
            const a = alt.pillars[k]; const b = c.pillars[k];
            return a && b && (a.stem !== b.stem || a.branch !== b.branch);
          }).map((k) => `${k} pillar would be ${alt.pillars[k]!.stem}${alt.pillars[k]!.branch}`) : [];
          return <p key={w} className="note">{WARNING_TEXT[w]}{diff.length ? ` If so, your ${diff.join(" and ")}.` : ""}</p>;
        })}
      </>
    );
    return <Shell chart={chart} salesOpen={salesOpen} share={share}>{body}</Shell>;
  }
  return <Shell chart={chart} salesOpen={false}>{body}</Shell>;
}

function Shell({ chart, salesOpen, share, children }: { chart: LoadedChart; salesOpen: boolean; share?: ShareData; children: React.ReactNode }) {
  return (
    <main className="app">
      <header className="brand"><Link href="/"><span aria-hidden="true" className="moon">☾</span> Haeday</Link></header>
      <h1>Your birth chart</h1>
      {children}
      <section className="card" aria-label="Your details">
        <p style={{ margin: 0 }}>Your details: {detailsLine(chart)}. Solar time adjusted. <Link href={`/saju?edit=${chart.id}`}>Edit</Link></p>
      </section>
      {chart.response.kind === "computed" && (
        <section className="card offer" aria-labelledby="offer">
          <h2 id="offer">Your full reading includes</h2>
          <ul>{OFFER_ITEMS.map((i) => <li key={i}>{i}</li>)}</ul>
          {chart.ownedOrderId ? <Link className="btn btn-primary" href={`/order/${chart.ownedOrderId}`}>You already own this reading → Open</Link>
            : salesOpen
              // CC4c: a full page load (not a client-side <Link>), so the checkout page gets its own CSP, which allows
              // PayPal's frames; a soft navigation would keep this page's stricter policy and block the PayPal buttons.
              ? <a className="btn btn-primary" href={`/checkout/${chart.id}`}>Unlock my reading · $3.99</a>
            : <button className="btn btn-primary" type="button" disabled>Unlock my reading · $3.99</button>}
          <p className="fine">{salesOpen || chart.ownedOrderId ? "One-time payment · No subscription · AI-assisted" : "Full readings open soon · One-time payment · No subscription"}</p>
        </section>
      )}
      {share && <ShareButton data={share} />}
      {chart.response.kind === "computed" && <ChartEmailForm chartId={chart.id} consentText={MARKETING_CONSENT_TEXT} />}
      <p className="fine">AI-assisted · For entertainment and reflection · Not advice · <Link href="/method">How we calculate</Link></p>
    </main>
  );
}
