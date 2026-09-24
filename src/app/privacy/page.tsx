import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
export const metadata: Metadata = { title: "Privacy · Haeday" };
// PRD §12 draft; retention matches ARCHITECTURE §4.9 / D16.
export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="September 24, 2026">
      <h2>What we collect</h2><p>Your birth date, birth time (if you know it) and birth city, to calculate your chart. If you buy a reading: your email address (collected by Stripe at checkout) and payment records. We do not receive your card number. We use a cookie to recognize your browser so only you can open your chart and reading.</p>
      <h2>Why</h2><p>To calculate your chart, write and deliver your reading, send you the link, handle refunds and support, prevent fraud and keep required business records.</p>
      <h2>How we protect it</h2><p>Birth details, charts, readings and email addresses are encrypted before they are stored. Access is limited to what is needed to run the service. We never put your birth details or email into analytics or error reports.</p>
      <h2>Who helps us</h2><p>Stripe (payments), Railway (hosting and database), Resend (email), Sentry (error reports, without personal data), PostHog (product analytics, without birth data or email) and our AI provider, which receives only your chart facts (no name, email or birth date) to write the reading.</p>
      <h2>How long we keep it</h2><p>Free charts that are never purchased: deleted after 30 days. Purchased readings and their charts: deleted 12 months after payment. Payment records are kept as long as the law requires.</p>
      <h2>Your choices</h2><p>Email hello@haeday.com from the address you used at checkout to ask for a copy or deletion of your data. We don&apos;t sell your personal information and don&apos;t use it for advertising.</p>
      <h2>Children</h2><p>Purchases are for adults 18 and over.</p>
    </LegalPage>
  );
}
