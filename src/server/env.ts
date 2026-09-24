import { z } from "zod";

const optionalText = z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional());
const optionalUrl = z.preprocess((value) => value === "" ? undefined : value, z.url().optional());
const schema = z.object({
  APP_ENV: z.enum(["dev", "staging", "production"]).default("dev"),
  APP_ORIGIN: z.url().default("http://localhost:3000"),
  DATABASE_URL: optionalUrl,
  SESSION_SECRET: z.preprocess((value) => value === "" ? undefined : value, z.string().min(32).optional()),
  PAYMENTS_MODE: z.enum(["test", "live"]).default("test"),
  LIVE_PAYMENTS_APPROVED: z.enum(["true", "false"]).default("false").transform(v => v === "true"),
  STRIPE_SECRET_KEY: optionalText,
  STRIPE_WEBHOOK_SECRET: optionalText,
  STRIPE_PRICE_SAJU: optionalText,
  // Stripe Tax must be set up in the Stripe dashboard before this is turned on (docs/QUESTIONS.md Q4).
  STRIPE_AUTOMATIC_TAX: z.enum(["true", "false"]).default("false").transform(v => v === "true"),
  LLM_API_KEY: optionalText,
  LLM_MODEL: optionalText,
  LLM_DAILY_CAP: z.coerce.number().nonnegative().finite().default(0),
  RESEND_API_KEY: optionalText,
  // L7/D45: provider plan limits (Resend free: 100/day, 3,000/month) and the alert level. Raise after upgrading.
  EMAIL_DAILY_LIMIT: z.coerce.number().int().positive().default(100),
  EMAIL_MONTHLY_LIMIT: z.coerce.number().int().positive().default(3000),
  EMAIL_ALERT_AT: z.coerce.number().int().positive().default(70),
  EMAIL_FROM: optionalText,
  SUPPORT_EMAIL: z.preprocess((v) => v === "" ? undefined : v, z.email().optional()),
  ADMIN_EMAILS: z.string().default("").transform(v => v.split(",").map(s => s.trim().toLowerCase()).filter(Boolean)).pipe(z.array(z.email())),
  POSTHOG_KEY: optionalText,
  // L1: report-only until staging shows no unexpected violations, then "enforce" (read by src/proxy.ts).
  CSP_MODE: z.enum(["report-only", "enforce", "off"]).default("report-only"),
  // L6: in-memory payment + LLM stand-ins for local end-to-end tests. Refused outside APP_ENV=dev (see below).
  DEV_FAKE_PROVIDERS: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  SENTRY_DSN: optionalUrl,
  FLAGS: z.string().default("{}").transform((value, ctx) => {
    try {
      const flags: unknown = JSON.parse(value);
      return z.record(z.string(), z.boolean()).parse(flags);
    } catch {
      ctx.addIssue({ code: "custom", message: "Expected a JSON boolean map" });
      return z.NEVER;
    }
  }),
  TZDATA_VERSION: optionalText,
  // D17: JSON map {"k1":"<base64 32 bytes>"}; active id; separate HMAC key for email lookup.
  ENCRYPTION_KEYS: optionalText,
  ENCRYPTION_ACTIVE_KEY_ID: optionalText,
  EMAIL_LOOKUP_KEY: optionalText,
}).superRefine((env, ctx) => {
  const issue = (path: string) => ctx.addIssue({ code: "custom", path: [path], message: "Invalid runtime configuration" });
  if (env.PAYMENTS_MODE === "live" && (env.APP_ENV !== "production" || !env.LIVE_PAYMENTS_APPROVED)) issue("PAYMENTS_MODE");
  if (env.APP_ENV !== "dev") {
    if (!env.DATABASE_URL) issue("DATABASE_URL");
    if (!env.SESSION_SECRET) issue("SESSION_SECRET");
    if (!env.APP_ORIGIN.startsWith("https://")) issue("APP_ORIGIN");
  }
  // L6: fakes can never be switched on in staging/production, in live mode, or next to real Stripe keys.
  if (env.DEV_FAKE_PROVIDERS && (env.APP_ENV !== "dev" || env.PAYMENTS_MODE !== "test" || env.STRIPE_SECRET_KEY || env.LLM_API_KEY)) issue("DEV_FAKE_PROVIDERS");
  if (env.STRIPE_SECRET_KEY && !env.STRIPE_SECRET_KEY.startsWith(env.PAYMENTS_MODE === "live" ? "sk_live_" : "sk_test_")) issue("STRIPE_SECRET_KEY");
});
export type Env = z.infer<typeof schema>;

export function parseEnv(input: Record<string, string | undefined>): Env {
  // A deployed build must state its environment; a silent "dev" default would skip the https/db/session checks.
  if (input.NODE_ENV === "production" && !input.APP_ENV) throw new Error("Invalid environment fields: APP_ENV");
  const result = schema.safeParse(input);
  if (!result.success) {
    // Never include raw input or provider error objects in exceptions.
    const fields = [...new Set(result.error.issues.map(issue => issue.path.join(".") || "environment"))];
    throw new Error("Invalid environment fields: " + fields.join(", "));
  }
  return result.data;
}
export function getEnv(): Env { return parseEnv(process.env); }

/** L6: local end-to-end fakes (validated above to be dev-only). */
export const devFakes = (env: Env): boolean => env.DEV_FAKE_PROVIDERS && env.APP_ENV === "dev" && env.PAYMENTS_MODE === "test" && !env.STRIPE_SECRET_KEY;

/** A paid reading can only be sold when it can also be written (fail closed, D10). */
export function llmConfigured(env: Env): boolean {
  return devFakes(env) || Boolean(env.LLM_API_KEY && env.LLM_MODEL && env.LLM_DAILY_CAP > 0);
}

export function paymentsConfigured(env: Env): boolean {
  return devFakes(env) || Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && env.STRIPE_PRICE_SAJU);
}
