// Paid reading (PRD §6): hanji background, ink text, max 680px. Text is rendered as text (React escapes it).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DAY_MASTERS } from "@/content/library";
import { serverContext } from "@/server/http";
import { loadReadingView } from "@/server/orders";
import { currentViewer } from "@/server/viewer";
import { SITE } from "@/lib/site";
import { ReadingTools } from "./ReadingTools";

export const metadata: Metadata = { title: "Your reading · Haeday", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

const SECTIONS = [
  ["summary", "Your chart at a glance"], ["dayMaster", "Your Day Master"], ["elements", "Your elements in balance"],
  ["love", "Love and relationships"], ["workMoney", "Work and money"], ["year2027", "Your 2027 energy"], ["reflection", "A question to reflect on"],
] as const;

import { ShareButton } from "@/app/chart/[id]/ChartClient";
import { shareData } from "@/lib/share";

export default async function ReadingPage({ params }: { params: Promise<{ readingId: string }> }) {
  const { readingId } = await params;
  const ctx = serverContext();
  const viewer = await currentViewer(ctx.db);
  const view = await loadReadingView(ctx.db, ctx.ring, readingId, viewer);
  if (!view) {
    // Not signed in on this device: offer sign-in instead of a bare 404 (same page for unknown ids).
    if (!viewer.customerId) {
      return (
        <main className="app">
          <header className="brand"><Link href="/"><span aria-hidden="true" className="moon">☾</span> Haeday</Link></header>
          <h1>Sign in to open your reading</h1>
          <p className="lede">For your privacy, readings open only in the browser you bought on, or after you sign in with the email you used at checkout.</p>
          <Link className="btn btn-primary" href={`/login?next=${encodeURIComponent(`/r/${readingId}`)}`}>Email me a sign-in link</Link>
        </main>
      );
    }
    notFound();
  }
  const dm = view.dayMasterStem ? DAY_MASTERS[view.dayMasterStem] : undefined;
  const r = view.reading;
  return (
    <main className="reading">
      <header className="reading-head">
        <Link href="/" className="reading-brand"><span aria-hidden="true">☾</span> Haeday</Link>
        {dm && <p className="reading-dm"><span className="reading-dm-hanja" aria-hidden="true">{dm.stem}</span>{dm.name} · {dm.image}</p>}
      </header>
      <ReadingTools>
      <article>
        <p className="reading-kicker">HAEDAY · A MOMENT FOR REFLECTION</p>
        <h1>Your personal reading</h1>
        <p className="reading-intro">Take what resonates. Leave room for your own story.</p>
        {view.disclosure && <p className="reading-disclosure">{view.disclosure}</p>}
        {view.refunded && <p className="reading-disclosure">This order was refunded. You can keep reading.</p>}
        <nav className="reading-contents" aria-label="Reading contents"><p>IN THIS READING</p><ol>{SECTIONS.map(([key, title]) => <li key={key}><a href={`#reading-${key}`}>{title}</a></li>)}</ol></nav>
        {SECTIONS.map(([key, title], index) => (
          <section key={key} className="reading-chapter" aria-labelledby={`reading-${key}`}>
            <p className="chapter-number" aria-hidden="true">0{index + 1} /</p>
            <h2 id={`reading-${key}`} tabIndex={-1}>{title}</h2>
            {r[key].split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
          </section>
        ))}
        {dm && view.pillars && (
          <section className="reading-share" aria-label="Share">
            {/* C6: same private, in-browser image as the chart page. No public link to this reading exists. */}
            <p className="reading-fine">Share your Day Master (no birth details, no reading text):</p>
            <ShareButton data={shareData(dm, view.pillars)} />
          </section>
        )}
        <p className="reading-fine">{r.disclaimer} Questions? {SITE.support}</p>
        <Link href="/my" className="reading-back">Back to my readings →</Link>
      </article>
      </ReadingTools>
    </main>
  );
}
