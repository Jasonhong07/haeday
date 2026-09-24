// Server-side SKU table (ARCHITECTURE §3). Prices never come from the client.
export const SKUS = {
  saju_reading: { amountCents: 399, currency: "usd", name: "Haeday personal saju reading" },
} as const;
export type Sku = keyof typeof SKUS;
export const CONSENT_VERSION = "consent-2026-09-24";
export const CONSENT_TEXT = "I'm 18 or older and understand this reading is for entertainment and reflection.";
export const FULFILLMENT_DEADLINE_MIN = 15;
