// Server-side SKU table (ARCHITECTURE §3). Prices never come from the client.
export const SKUS = {
  saju_reading: { amountCents: 399, currency: "usd", name: "Haeday personal saju reading" },
} as const;
export type Sku = keyof typeof SKUS;
export const CONSENT_VERSION = "consent-2026-09-24";
export const CONSENT_TEXT = "I'm 18 or older and understand this reading is for entertainment and reflection.";
export const FULFILLMENT_DEADLINE_MIN = 15;
/** D35/D47: shown before payment when AI capacity is tight. The consent is versioned separately. */
export const CONSENT_VERSION_DELAYED = "consent-2026-09-24-delayed24h";
export const DELAY_NOTICE = "We're busy right now: your reading will arrive within 24 hours, and we'll email you when it's ready. If it isn't ready in 24 hours, you get an automatic full refund.";
export const CONSENT_TEXT_DELAYED = "I'm 18 or older, understand this reading is for entertainment and reflection, and accept delivery within 24 hours.";
