import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { SITE } from "@/lib/site";
export const metadata: Metadata = { title: "Terms · Haeday" };
// PRD §12 draft. Seller per D04; D05 checks (assumed name, residency) may change this text.
export default function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="September 26, 2026">
      <h2>Who we are</h2><p>Haeday is operated by Jason Hong, doing business as Haeday (&quot;we&quot;). Contact: {SITE.support}.</p>
      <h2>What we offer</h2><p>A free Korean saju (Four Pillars) birth chart and an optional personal reading sold as a one-time digital purchase ($3.99 USD plus any applicable tax). Readings are written with the help of artificial intelligence, grounded in a curated interpretation library.</p>
      <h2>Entertainment and reflection only</h2><p>Saju is a cultural tradition, not a science. Our content is for entertainment and self-reflection. It is not a prediction and not medical, legal, financial, psychological or other professional advice. Do not make important decisions based on it.</p>
      <h2>Who can buy</h2><p>You must be 18 or older to make a purchase.</p>
      <h2>Your purchase</h2><p>Payment is processed by Stripe (card, Apple Pay, Google Pay) or PayPal (PayPal, Venmo). The reading is delivered online and a link is emailed to the address you use at checkout. The checkout page tells you before you pay when it will be ready: usually in about a minute, or within 24 hours when we&apos;re busy. If we cannot deliver it in that time, we refund you automatically. Promotion codes, when offered, are entered on the card payment page and cannot be exchanged for cash. See our <Link href="/refunds">Refund Policy</Link>.</p>
      <h2>Emails</h2><p>We email you about your purchase (the reading link, refunds). If you ask us to email your free chart, we send only that. We send updates or offers only if you tick the box asking for them, and you can unsubscribe with one click in any such email.</p>
      <h2>Accuracy of your details</h2><p>Your chart depends on the date, time and place you enter. We calculate it as described on our <Link href="/method">method page</Link>. If a detail is approximate or unknown, we tell you which parts may change.</p>
      <h2>Acceptable use</h2><p>Please don&apos;t misuse the service, attempt to access other people&apos;s readings, or resell our content.</p>
      <h2>Our content</h2><p>Your reading is for your personal use. You may share it with friends. The site, library and design remain ours.</p>
      <h2>Liability</h2><p>To the extent permitted by law, our total liability for any claim relating to a purchase is limited to the amount you paid for it.</p>
      <h2>Changes</h2><p>We may update these terms; the date above shows the latest version. Purchases are governed by the terms in effect when you bought.</p>
    </LegalPage>
  );
}
