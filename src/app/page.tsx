// C1 landing (draft copy for Jason's approval, docs/CONTENT_REVIEW_KO.md). No fabricated reviews, counters or
// testimonials (D42). The sample excerpt appears only once Jason approves it.
import type { Metadata } from "next";
import Link from "next/link";
import { VisitBeacon } from "./Beacon";
import { OFFER_ITEMS } from "@/content/library";
import { SAMPLE_READING } from "@/content/sample";
import { dailyCap, paymentAdapter } from "@/server/deps";
import { llmConfigured, paymentsConfigured } from "@/server/env";
import { serverContext } from "@/server/http";
import { isSalesEnabled } from "@/server/settings";
import { publishedGuides } from "@/lib/guides";

export const metadata: Metadata = {
  title: "Haeday · Your Korean birth chart (saju), free",
  description: "Korean saju in plain English: a free birth chart in about a minute, and a personal reading for $3.99. No subscription.",
};
export const dynamic = "force-dynamic";

const FAQ: Array<[string, string]> = [
  ["What is saju?", "Saju (사주, “four pillars”) is the Korean way of reading a birth chart. Your birth year, month, day and hour each become a pair of characters, and together they describe your nature and your timing. Many people in Korea look at their saju around birthdays, new years and big decisions."],
  ["Is it accurate?", "We calculate your chart carefully: solar terms, your birthplace's solar time and daylight-saving rules. The meaning we draw from it is for reflection and entertainment, not a prediction or advice."],
  ["I don't know my birth time.", "That's fine. Choose “I don't know”. You still get your year, month and day pillars, and we tell you plainly if your day could change."],
  ["What do I get for $3.99?", "One personal reading, about 900 words, written for your chart and based on a curated Korean interpretation library. It's yours to keep. It's a one-time payment and never a subscription."],
  ["Can I get a refund?", "If we can't deliver your reading, you're refunded automatically. Within 7 days you can also ask for a refund for any reason, once per customer every 12 months."],
];

export default async function Home() {
  const ctx = serverContext();
  const salesOpen = Boolean(paymentAdapter(ctx.env)) && paymentsConfigured(ctx.env) && llmConfigured(ctx.env) && dailyCap(ctx.env) > 0 && (await isSalesEnabled(ctx.db));
  const sample = SAMPLE_READING.approvedBy === "jason" && SAMPLE_READING.excerpt.length > 0 ? SAMPLE_READING : null;
  return (
    <main>
      <VisitBeacon />
      <header className="brand"><span aria-hidden="true" className="moon">☾</span> Haeday</header>
      <section aria-labelledby="welcome">
        <p className="eyebrow">KOREAN SAJU · A MOMENT FOR REFLECTION</p>
        <h1 id="welcome">Find your heyday,<br /><em>by moonlight.</em></h1>
        <p className="intro">Your Korean birth chart (saju) shows your nature and your timing. Free chart in about a minute. Personal reading $3.99, never a subscription.</p>
        <Link className="btn btn-primary" href="/saju" style={{ maxWidth: 420 }}>See my birth chart · Free</Link>
        {!salesOpen && (
          <div className="notice" role="status" style={{ marginTop: 20 }}>
            <span className="dot" aria-hidden="true" />
            <div><strong>Full readings open soon.</strong><p>The free chart is ready now. Paid readings are not yet available.</p></div>
          </div>
        )}
      </section>

      <section aria-labelledby="how" style={{ marginTop: 48, maxWidth: 560 }}>
        <h2 id="how">How it works</h2>
        <ol className="steps">
          <li><strong>Enter three details.</strong> Birth date, birth time (or “I don&apos;t know”) and birth city.</li>
          <li><strong>See your free chart.</strong> Your four pillars, your Day Master and your elements.</li>
          <li><strong>Unlock your reading, if you like.</strong> About 900 words written for your chart, $3.99 once.</li>
        </ol>
      </section>

      <section aria-labelledby="inside" style={{ marginTop: 32, maxWidth: 560 }}>
        <h2 id="inside">What&apos;s in the personal reading</h2>
        <ul>{OFFER_ITEMS.map((i) => <li key={i}>{i}</li>)}</ul>
      </section>

      {sample && (
        <section aria-labelledby="sample" className="card" style={{ marginTop: 32, maxWidth: 560 }}>
          <h2 id="sample">From an example reading</h2>
          <p className="note">{sample.person}</p>
          {sample.excerpt.map((p) => <p key={p.slice(0, 24)}>{p}</p>)}
        </section>
      )}

      <section aria-labelledby="faq" style={{ marginTop: 32, maxWidth: 560 }}>
        <h2 id="faq">Questions</h2>
        {FAQ.map(([q, a]) => (
          <details key={q} className="faq"><summary>{q}</summary><p>{a}</p></details>
        ))}
      </section>

      <p className="fine" style={{ marginTop: 32 }}>One-time payment · No subscription · Secure checkout by Stripe · Your birth details are encrypted and never shared.</p>
      <Link className="btn btn-primary" href="/saju" style={{ maxWidth: 420, marginTop: 8 }}>See my birth chart · Free</Link>
      <footer>AI-assisted · For entertainment and reflection · Not advice · <Link href="/method">How we calculate</Link> · {publishedGuides().length > 0 && <><Link href="/learn">Saju guides</Link> · </>}<Link href="/refunds">Refunds</Link> · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link></footer>
    </main>
  );
}
