import { describe, expect, it } from "vitest";
import { parseEnv, paymentsConfigured } from "../src/server/env";

describe("runtime configuration", () => {
  it("boots without optional providers and disables payment configuration", () => {
    const env = parseEnv({});
    expect(env.APP_ENV).toBe("dev");
    expect(paymentsConfigured(env)).toBe(false);
  });
  it.each(["dev", "staging"])("rejects live mode in %s even with approval", APP_ENV => {
    expect(() => parseEnv({ APP_ENV, PAYMENTS_MODE: "live", LIVE_PAYMENTS_APPROVED: "true" })).toThrow();
  });
  it("requires explicit production approval", () => {
    expect(() => parseEnv({ APP_ENV: "production", PAYMENTS_MODE: "live" })).toThrow();
  });
  it("rejects a live Stripe key in test mode without leaking its value", () => {
    const secret = "sk_live_do_not_expose";
    expect(() => parseEnv({ STRIPE_SECRET_KEY: secret })).toThrow("STRIPE_SECRET_KEY");
    try { parseEnv({ STRIPE_SECRET_KEY: secret }); } catch (error) { expect(String(error)).not.toContain(secret); }
  });
  it("validates boolean flags without exposing input", () => {
    expect(parseEnv({ FLAGS: '{"preview":true}' }).FLAGS.preview).toBe(true);
    expect(() => parseEnv({ FLAGS: '{"email":"private@example.com"}' })).toThrow("FLAGS");
  });
  it("requires APP_ENV to be explicit in production builds", () => {
    expect(() => parseEnv({ NODE_ENV: "production" })).toThrow("APP_ENV");
    expect(parseEnv({ NODE_ENV: "production", APP_ENV: "dev" }).APP_ENV).toBe("dev");
  });
  it("requires session and database configuration outside dev", () => {
    expect(() => parseEnv({ APP_ENV: "staging", APP_ORIGIN: "https://example.com" })).toThrow();
  });
  it("accepts approved production live configuration", () => {
    const env = parseEnv({ APP_ENV:"production", APP_ORIGIN:"https://example.com",
      DATABASE_URL:"postgresql://localhost/haeday", SESSION_SECRET:"x".repeat(32),
      PAYMENTS_MODE:"live", LIVE_PAYMENTS_APPROVED:"true", STRIPE_SECRET_KEY:"sk_live_example",
      STRIPE_WEBHOOK_SECRET:"whsec_example", STRIPE_PRICE_SAJU:"price_example" });
    expect(paymentsConfigured(env)).toBe(true);
  });
});
