// C1 landing (draft copy for Jason's approval, docs/CONTENT_REVIEW_KO.md). No fabricated reviews, counters or
// testimonials (D42). The sample excerpt appears only once Jason approves it.
import type { Metadata } from "next";
import Link from "next/link";
import { VisitBeacon } from "./Beacon";
import { OFFER_ITEMS } from "@/content/library";
import { SAMPLE_READING } from "@/content/sample";
import { publishedGuides } from "@/lib/guides";
import styles from "./home.module.css";
import { publicSalesOpen } from "@/server/public-sales";

export const metadata: Metadata = {
  title: "Haeday · Your Korean birth chart (saju), free",
  description: "Korean saju in plain English: a free birth chart in about a minute, and a personal reading for $3.99. No subscription.",
};
export const dynamic = "force-dynamic";

const FAQ: Array<[string, string]> = [
  ["What is saju?", "Saju (사주, “four pillars”) is the Korean way of reading a birth chart. Your birth year, month, day and hour each become a pair of characters, and together they describe your nature and your timing. Many people in Korea look at their saju around birthdays, new years and big decisions."],
  ["Is it accurate?", "We calculate your chart carefully: solar terms, your birthplace's solar time and daylight-saving rules. The meaning we draw from it is for reflection and entertainment, not a prediction or advice."],
  ["I don't know my birth time.", "That's fine. Choose “I don't know”. You still get your year, month and day pillars, and we tell you plainly if your day could change."],
  ["What do I get for $3.99?", "One personal reading, about 900 words, written for your chart and based on a curated Korean interpretation library. Your reading is available online for 12 months after payment. It's a one-time payment and never a subscription."],
  ["Can I get a refund?", "If we can't deliver your reading, you're refunded automatically. Within 7 days you can also ask for a refund for any reason, once per customer every 12 months."],
];

export default async function Home() {
  const salesOpen = await publicSalesOpen();
  const sample = SAMPLE_READING.approvedBy === "jason" && SAMPLE_READING.excerpt.length > 0 ? SAMPLE_READING : null;
  return (
    <main className={styles.home}>
      <VisitBeacon />
      <a className={styles.skip} href="#welcome">Skip to content</a>
      <header className={styles.header}>
        <Link href="/" className={styles.logo} aria-label="Haeday home"><span aria-hidden="true">☾</span> haeday</Link>
        <nav aria-label="Main navigation"><a href="#how">How it works</a><Link href="/my">My readings</Link></nav>
      </header>
      <section className={styles.hero} aria-labelledby="welcome">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>KOREAN SAJU · IN PLAIN ENGLISH</p>
          <h1 id="welcome">Find your heyday,<br /><em>by moonlight.</em></h1>
          <p className={styles.intro}>A different way to reflect on who you are. Explore your Korean birth chart, then go deeper with a personal reading.</p>
          <Link className={`btn btn-primary ${styles.cta}`} href="/saju">See my birth chart · Free <span aria-hidden="true">↗</span></Link>
          <p className={styles.caption}>About a minute · No payment needed for your chart</p>
          {!salesOpen && <div className={styles.notice} role="status"><span aria-hidden="true">◌</span><p><strong>Full readings open soon.</strong><br />Explore your free chart today.</p></div>}
        </div>
        <figure className={styles.art} aria-label="Illustration of the four pillars in a saju birth chart">
          <div className={styles.orbit} aria-hidden="true" /><div className={styles.crescent} aria-hidden="true" />
          <div className={styles.chartCard}>
            <div className={styles.cardTop}><span>THE FOUR PILLARS</span><span aria-hidden="true">✦</span></div>
            <p className={styles.cardTitle}>A little more<br /><em>self-understanding.</em></p>
            <div className={styles.pillarGrid}>
              {[['Year', '年'], ['Month', '月'], ['Day', '日'], ['Hour', '時']].map(([label, glyph]) => <div key={label}><span>{label}</span><b lang="ko">{glyph}</b></div>)}
            </div>
            <p className={styles.cardFoot}>Your birth details. A Korean perspective.</p>
          </div>
          <figcaption>Illustration of the chart structure · Not a personal reading</figcaption>
        </figure>
      </section>
      <div className={styles.trust}><span>Free chart first</span><span>$3.99 personal reading</span><span>One payment. No subscription.</span></div>
      <section className={styles.how} aria-labelledby="how">
        <div className={styles.sectionHead}><p className={styles.eyebrow}>A SMALL PAUSE, JUST FOR YOU</p><h2 id="how">From your birth details<br />to a new perspective.</h2></div>
        <ol className={styles.steps}>
          <li><span>01 / BEGIN</span><h3>Start with your story.</h3><p>Enter your birth date, time and city. Don’t know the time? You can still begin.</p></li>
          <li><span>02 / DISCOVER</span><h3>Meet your free chart.</h3><p>Explore your pillars, Day Master and five elements. We explain any uncertainty along the way.</p></li>
          <li><span>03 / GO DEEPER</span><h3>Make space to reflect.</h3><p>Choose a personal reading connecting your chart to relationships, work and the year ahead.</p></li>
        </ol>
      </section>
      <section className={styles.offer} aria-labelledby="inside">
        <div><p className={styles.paperEyebrow}>WHEN YOU WANT TO GO DEEPER</p><h2 id="inside">Your chart.<br /><em>The bigger picture.</em></h2><p className={styles.offerIntro}>A personal reading in plain English, based on a curated Korean interpretation library. AI-assisted, for reflection and entertainment.</p><p className={styles.price}>$3.99 <span>once · never a subscription</span></p><Link href="/saju" className={styles.paperCta}>Start with my free chart <span aria-hidden="true">↗</span></Link><p className={styles.paperNote}>About 900 words · Online access for 12 months</p></div>
        <div className={styles.contents}><p>INSIDE YOUR READING</p><ul>{OFFER_ITEMS.map((item, i) => <li key={item}><span aria-hidden="true">0{i + 1}</span>{item}</li>)}</ul><p className={styles.paperNote}>Including a brief look at your 2027 energy.</p></div>
      </section>
      {sample && <section aria-labelledby="sample" className={styles.sample}><p className={styles.eyebrow}>A CLOSER LOOK</p><h2 id="sample">From an example reading</h2><p className="note">{sample.person}</p>{sample.excerpt.map((p) => <p key={p.slice(0, 24)}>{p}</p>)}</section>}
      <section className={styles.questions} aria-labelledby="faq"><div><p className={styles.eyebrow}>BEFORE YOU BEGIN</p><h2 id="faq">A few good<br />questions.</h2><Link href="/method">How we calculate</Link></div><div>{FAQ.map(([q, a]) => <details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>)}</div></section>
      <section className={styles.closing} aria-label="Start your free chart"><span className={styles.smallMoon} aria-hidden="true">☾</span><h2>A moment for you.</h2><Link className={`btn btn-primary ${styles.cta}`} href="/saju">See my birth chart · Free <span aria-hidden="true">↗</span></Link><p className={styles.caption}>Birth details encrypted in storage · Secure checkout</p></section>
      <footer className={styles.footer}><Link className={styles.logo} href="/">☾ haeday</Link><p>AI-assisted · For entertainment and reflection · Not advice</p><nav aria-label="Legal and resources">{publishedGuides().length > 0 && <Link href="/learn">Saju guides</Link>}<Link href="/refunds">Refunds</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav></footer>
    </main>
  );
}
