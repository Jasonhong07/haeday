import type { Metadata } from "next";
import Link from "next/link";
import { PLACES_ATTRIBUTION } from "@/server/places";
export const metadata: Metadata = { title: "How we calculate your chart · Haeday" };
export default function MethodPage() {
  return <main><header className="brand"><Link href="/">☾ Haeday</Link></header>
    <article style={{maxWidth:720,padding:"40px 0"}}>
      <p className="eyebrow">OUR METHOD</p><h1>Tradition, with clear assumptions.</h1>
      <p>Saju describes four pairs of characters associated with a birth year, month, day and hour. Haeday uses these as a starting point for reflection, not as a prediction or professional advice.</p>
      <h2>Your local birth time</h2><p>We interpret the time in your selected city using historical IANA time-zone rules. If a clock change made a time occur twice, we ask which occurrence you mean. If it did not occur, we ask you to check your input.</p>
      <h2>The year and month</h2><p>These change at the twelve solar-term boundaries called jie. We compare the birth instant in UTC with a table calculated using Skyfield and the JPL DE421 ephemeris. A birth exactly at a boundary belongs to the new period.</p>
      <h2>The day and hour</h2><p>We adjust your birth time for the longitude of your birthplace (local mean solar time), the same convention used by the most popular Korean saju calculators. This can move a birth to the previous or next calendar day. Our day changes at midnight in this adjusted time. From 11 PM to midnight, the day stays the same while the hour stem uses the next day.</p>
      <h2>When you do not know the time</h2><p>We examine every valid minute of your local birth date and leave the hour pillar empty. When year or month pillars change during that day, we ask about the time window. If you do not know, we use the window covering the most valid minutes and disclose alternatives before payment. This default is not a probability estimate.</p>
      <h2>What the element bars mean</h2><p>They count the visible elements in six or eight characters. They do not measure your personality, health, elemental strength or a scientific trait.</p>
      <h2>Why another calculator may differ</h2><p>Calculators can use different time-zone histories, longitude correction, equation-of-time adjustments or day boundaries. Near a boundary, even a few minutes can change a pillar. Historical dates before 1970 and approximate birth times carry additional uncertainty.</p>
      <h2>Places and sources</h2><p>{PLACES_ATTRIBUTION} The place list uses city coordinates, not a precise birth address. A nearby city may have different solar time or even different time-zone rules.</p>
      <ul><li><a href="https://www.geonames.org/">GeoNames city data</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></li>
      <li><a href="https://www.iana.org/time-zones">IANA Time Zone Database</a></li>
      <li><a href="https://rhodesmill.org/skyfield/">Skyfield astronomy library</a></li></ul>
      <p>Calculation policy: haeday-chart-v2. Haeday is in preparation; this page describes the intended calculation method. Paid readings are not open.</p>
    </article></main>;
}
