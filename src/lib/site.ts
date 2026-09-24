// Public brand domain and support address, set once the domain is bought (docs/QUESTIONS.md Q3).
// NEXT_PUBLIC_* values are baked in at build time; change them in Railway and redeploy.
const domain = process.env.NEXT_PUBLIC_SITE_DOMAIN || "haeday.com";
export const SITE = { domain, support: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || `hello@${domain}` } as const;
