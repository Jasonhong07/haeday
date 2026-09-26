import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { SITE } from "@/lib/site";
export const metadata: Metadata = { title: "Refunds · Haeday" };
// PRD §12: automatic refund on delivery failure; one no-questions refund per customer within 7 days.
export default function Refunds() {
  return (
    <LegalPage title="Refund Policy" updated="September 26, 2026">
      <h2>If we can&apos;t deliver</h2><p>Before you pay, the checkout page tells you when your reading will be ready: usually in about a minute, or within 24 hours when we&apos;re busy. If it isn&apos;t delivered within about 15 minutes of your payment reaching us (or within 24 hours of your payment, if that&apos;s what the checkout page said), we refund you automatically and email you. You don&apos;t need to do anything.</p>
      <h2>If it isn&apos;t for you</h2><p>Within 7 days of purchase, we&apos;ll refund one reading per customer every 12 months, no questions asked. Use the refund link on your order page or email {SITE.support} from the address you used at checkout.</p>
      <h2>Duplicate charges</h2><p>If you were charged twice for the same reading, we refund the extra charge. This never counts as your one no-questions refund.</p>
      <h2>Free readings</h2><p>If you used a promotion code that made your reading free, there is nothing to refund. If we can&apos;t deliver it, write to us and we&apos;ll help you get your reading.</p>
      <h2>Timing</h2><p>Refunds go back to your original payment method. Banks usually show them within 5–10 business days.</p>
    </LegalPage>
  );
}
