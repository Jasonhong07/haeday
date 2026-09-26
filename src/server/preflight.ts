// CC4a: launch readiness checklist. Pure function of the parsed environment + content library, shown on /admin and
// printed by `pnpm preflight`. Reports variable NAMES and yes/no only, never values (CLAUDE.md rule 10).
import { DAY_MASTER_SNIPPETS, ELEMENT_SNIPPETS, TEN_GOD_SNIPPETS, TONE, YEAR_2027_BY_DM, YEAR_2027_GENERAL } from "@/content/snippets";
import { SAMPLE_READING } from "@/content/sample";
import { LEGAL_APPROVED } from "@/lib/legal";
import type { Env } from "./env";
import { loadKeyring } from "./security/keyring";

export type CheckLevel = "ok" | "todo" | "warn" | "block";
export interface Check { area: string; level: CheckLevel; text: string }

export function contentStatus() {
  const all = [TONE, YEAR_2027_GENERAL, ...Object.values(DAY_MASTER_SNIPPETS).flat(), ...Object.values(ELEMENT_SNIPPETS).flatMap((e) => [e.high, e.low]),
    ...Object.values(TEN_GOD_SNIPPETS), ...Object.values(YEAR_2027_BY_DM)];
  return { total: all.length, approved: all.filter((s) => s.approvedBy === "jason").length, sampleApproved: SAMPLE_READING.approvedBy === "jason" };
}

export function preflight(env: Env): Check[] {
  const prod = env.APP_ENV === "production";
  const out: Check[] = [];
  const add = (area: string, level: CheckLevel, text: string) => out.push({ area, level, text });
  // "block" = sales cannot work (or must not start) in this environment; "todo" = needed before launch.
  const need: CheckLevel = prod ? "block" : "todo";

  add("Environment", "ok", `APP_ENV=${env.APP_ENV}, PAYMENTS_MODE=${env.PAYMENTS_MODE}${env.PAYMENTS_MODE === "live" ? " (LIVE: real money)" : ""}`);
  if (!env.APP_ORIGIN.startsWith("https://")) add("Domain", env.APP_ENV === "dev" ? "ok" : "block", "APP_ORIGIN is not https");
  else if (/\.up\.railway\.app$/.test(new URL(env.APP_ORIGIN).hostname)) add("Domain", prod ? "warn" : "ok", "APP_ORIGIN is a railway.app address: set your own domain before launch (email trust, share links)");
  else add("Domain", "ok", "APP_ORIGIN uses your own domain");

  if (!env.ENCRYPTION_KEYS || !env.ENCRYPTION_ACTIVE_KEY_ID || !env.EMAIL_LOOKUP_KEY) add("Encryption", "block", "ENCRYPTION_KEYS / ENCRYPTION_ACTIVE_KEY_ID / EMAIL_LOOKUP_KEY missing: nothing private can be stored");
  else {
    try { loadKeyring(env); add("Encryption", "ok", "Encryption key format and active id valid (keep an offline copy: backups are unreadable without them)"); }
    catch { add("Encryption", "block", "Encryption key format or active id invalid: private data cannot be stored or opened"); }
  }

  if (!(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && env.STRIPE_PRICE_SAJU)) add("Payments", need, "Stripe: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and STRIPE_PRICE_SAJU all needed to sell");
  else if (!env.STRIPE_PRICE_SAJU.startsWith("price_")) add("Payments", "block", "STRIPE_PRICE_SAJU should start with price_");
  else add("Payments", "ok", `Stripe configured (${env.PAYMENTS_MODE} mode)`);
  if (prod && env.PAYMENTS_MODE === "test") add("Payments", "warn", "Production is still in TEST mode: nobody can pay real money (expected until you approve going live)");
  add("Sales tax", "warn", env.STRIPE_AUTOMATIC_TAX ? "Stripe Tax ON (PayPal hidden). Verify registrations and product tax treatment; this configuration is not tax clearance." : "Stripe Tax OFF: confirm launch treatment and monitoring with your CPA (Q4). Configuration alone is not tax clearance.");
  if (!(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET && env.PAYPAL_WEBHOOK_ID)) add("PayPal", "todo", "PayPal/Venmo off: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_WEBHOOK_ID needed (card checkout works without it)");
  else add("PayPal", "ok", env.STRIPE_AUTOMATIC_TAX ? "PayPal configured but hidden (sales tax is on); refunds of past PayPal orders still work" : `PayPal/Venmo configured (${env.PAYMENTS_MODE === "live" ? "live" : "sandbox"})`);

  if (!(env.LLM_API_KEY && env.LLM_MODEL)) add("AI", need, "LLM_API_KEY and LLM_MODEL needed to write readings");
  else if (env.LLM_DAILY_CAP <= 0) add("AI", need, "LLM_DAILY_CAP is 0: sales stay closed");
  else add("AI", "ok", `AI configured, daily cap ${env.LLM_DAILY_CAP}`);

  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) add("Email", need, "RESEND_API_KEY and EMAIL_FROM needed for delivery and sign-in emails");
  else add("Email", "ok", `Email configured (plan limits ${env.EMAIL_DAILY_LIMIT}/day, ${env.EMAIL_MONTHLY_LIMIT}/month)`);
  if (!env.SUPPORT_EMAIL) add("Email", need, "SUPPORT_EMAIL missing: customers need an address to write to");
  if (!env.ADMIN_EMAILS.length) add("Admin", need, "ADMIN_EMAILS empty: nobody can open /admin and alerts are not emailed");
  else add("Admin", "ok", `${env.ADMIN_EMAILS.length} admin address(es): alerts are emailed there`);

  if (!env.SENTRY_DSN) add("Monitoring", prod ? "warn" : "ok", "SENTRY_DSN missing: errors are only in Railway logs (alerts still email you)");
  if (env.CSP_MODE === "off") add("Security", prod ? "block" : "warn", "CSP_MODE=off");
  else if (env.CSP_MODE === "report-only") add("Security", prod ? "todo" : "ok", "CSP report-only: switch CSP_MODE to enforce after two quiet days on staging");
  else add("Security", "ok", "CSP enforced");

  const c = contentStatus();
  if (c.approved < c.total) add("Content", prod ? "block" : "todo", `${c.approved}/${c.total} interpretation snippets approved: production sells only readings whose snippets are all approved (docs/CONTENT_REVIEW_KO.md)`);
  else add("Content", "ok", `All ${c.total} snippets approved`);
  if (!c.sampleApproved) add("Content", "todo", "Landing sample reading not approved: it stays hidden");
  if (!LEGAL_APPROVED) add("Legal", "todo", "Terms, privacy and refund pages still say \"Draft for review\" until you approve the text");
  add("Marketing email", "ok", "Marketing sends are OFF until a postal address is set (D48); consent is only recorded");
  return out;
}
