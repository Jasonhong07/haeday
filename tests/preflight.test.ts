// CC4a launch checklist: blocks in production when selling cannot work; never prints secret values.
import { describe, expect, it } from "vitest";
import { heartbeatStale } from "../src/server/admin";
import { parseEnv } from "../src/server/env";
import { preflight } from "../src/server/preflight";

const keys = { ENCRYPTION_KEYS: JSON.stringify({ k1: Buffer.alloc(32, 1).toString("base64") }), ENCRYPTION_ACTIVE_KEY_ID: "k1", EMAIL_LOOKUP_KEY: Buffer.alloc(32, 2).toString("base64") };
const prodBase = { NODE_ENV: "production", APP_ENV: "production", APP_ORIGIN: "https://haeday.net", DATABASE_URL: "postgres://u:p@h:5432/db", SESSION_SECRET: "s".repeat(40), ...keys };

describe("preflight (CC4a)", () => {
  it("an empty production setup is blocked on payments, AI, email, admin and content; secrets are never echoed", () => {
    const checks = preflight(parseEnv(prodBase));
    const blocked = checks.filter((c) => c.level === "block").map((c) => c.area);
    expect(blocked).toEqual(expect.arrayContaining(["Payments", "AI", "Email", "Admin", "Content"]));
    const text = JSON.stringify(checks);
    expect(text).not.toContain("s".repeat(40));
    expect(text).not.toContain(keys.EMAIL_LOOKUP_KEY);
    expect(text).not.toContain("u:p@h");
  });

  it("a full production setup has no payment/AI/email/admin blocks and flags test mode and CSP report-only", () => {
    const checks = preflight(parseEnv({
      ...prodBase, STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x", STRIPE_PRICE_SAJU: "price_x",
      LLM_API_KEY: "k", LLM_MODEL: "m", LLM_DAILY_CAP: "1000", RESEND_API_KEY: "re_x", EMAIL_FROM: "Haeday <hello@haeday.net>",
      SUPPORT_EMAIL: "help@haeday.net", ADMIN_EMAILS: "jason@haeday.net", SENTRY_DSN: "https://x@o.ingest.sentry.io/1",
    }));
    const byArea = (a: string) => checks.filter((c) => c.area === a).map((c) => c.level);
    for (const a of ["AI", "Admin"]) expect(byArea(a)).toEqual(["ok"]);
    expect(byArea("Payments")).toEqual(["ok", "warn"]); // configured, but still test mode in production
    expect(byArea("Security")).toEqual(["todo"]);
    expect(checks.find((c) => c.area === "Domain")!.level).toBe("ok");
  });

  it("a railway.app production origin is a warning; the worker heartbeat goes stale after 5 minutes", () => {
    const checks = preflight(parseEnv({ ...prodBase, APP_ORIGIN: "https://haeday-production.up.railway.app" }));
    expect(checks.find((c) => c.area === "Domain")!.level).toBe("warn");
    const now = new Date("2026-10-01T00:10:00Z");
    expect(heartbeatStale("2026-10-01T00:06:00Z", now)).toBe(false);
    expect(heartbeatStale("2026-10-01T00:04:00Z", now)).toBe(true);
    expect(heartbeatStale(undefined, now)).toBe(true);
    expect(heartbeatStale("garbage", now)).toBe(true);
  });
});
