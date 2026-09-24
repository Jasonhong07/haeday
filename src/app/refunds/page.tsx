import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { SITE } from "@/lib/site";
export const metadata: Metadata = { title: "Refunds · Haeday" };
// PRD §12: automatic refund on delivery failure; one no-questions refund per customer within 7 days.
export default function Refunds() {
  return (
    <LegalPage title="Refund Policy" updated="September 24, 2026">
      <h2>If we can&apos;t deliver</h2><p>If your reading isn&apos;t delivered within 15 minutes of payment, we refund you automatically and email you. You don&apos;t need to do anything.</p>
      <h2>If it isn&apos;t for you</h2><p>Within 7 days of purchase, we&apos;ll refund one reading per customer, no questions asked. Use the refund link on your order page or email {SITE.support} from the address you used at checkout.</p>
      <h2>Duplicate charges</h2><p>If you were charged twice for the same reading, we refund the extra charge. This never counts as your one no-questions refund.</p>
      <h2>Timing</h2><p>Refunds go back to your original payment method. Banks usually show them within 5–10 business days.</p>
    </LegalPage>
  );
}
