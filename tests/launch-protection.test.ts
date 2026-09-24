// CC2 unit contract: CSP (L1), first-touch channels (L4), dev-only fakes (L6), robots/sitemap (L3).
import { afterEach, describe, expect, it } from "vitest";
import { buildCsp, cspHeaderName, sanitizeReport } from "../src/server/csp";
import { channelOf, knownCampaign } from "../src/lib/campaigns";
import { parseEnv } from "../src/server/env";
import robots from "../src/app/robots";
import sitemap from "../src/app/sitemap";

describe("CSP (L1)", () => {
  it("nonce + strict-dynamic for scripts, no third-party hosts, objects off, reports on", () => {
    const csp = buildCsp("abc", { dev: false, https: true });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toMatch(/unsafe-eval/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("font-src 'self'");
    expect(csp).not.toMatch(/googleapis|gstatic|posthog/);
    expect(csp).toContain("upgrade-insecure-requests");
    expect(cspHeaderName("report-only")).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName("enforce")).toBe("Content-Security-Policy");
  });
  it("violation reports keep only the directive and the blocked HOST (no paths, no query strings)", () => {
    const v = sanitizeReport({ "csp-report": { "violated-directive": "script-src-elem", "blocked-uri": "https://evil.example/x.js?email=a@b.com&dob=1990-01-01", "document-uri": "https://haeday.net/chart/123?x=1" } });
    expect(v).toEqual({ directive: "script-src-elem", blocked: "evil.example" });
    expect(JSON.stringify(v)).not.toMatch(/email|dob|chart|1990/);
    expect(sanitizeReport({ "csp-report": { "effective-directive": "script-src", "blocked-uri": "inline" } })).toEqual({ directive: "script-src", blocked: "inline" });
    expect(sanitizeReport("junk")).toBeNull();
  });
});

describe("first-touch channel (L4)", () => {
  it("campaign ids only from our list; anything else collapses to 'other' (a typed email never survives)", () => {
    expect(knownCampaign("TikTok")).toBe("tiktok");
    expect(channelOf({ campaign: "tiktok" })).toBe("tiktok");
    expect(channelOf({ campaign: "jane.doe@gmail.com" })).toBe("other");
    expect(channelOf({ refHost: "www.google.com" })).toBe("search");
    expect(channelOf({ refHost: "l.instagram.com" })).toBe("social");
    expect(channelOf({ refHost: "haeday.net", ownHost: "haeday.net" })).toBeNull();
    expect(channelOf({ refHost: "https://x.com/path?q=1" })).toBeNull(); // a URL is not a host: dropped
  });
});

describe("dev-only fakes (L6)", () => {
  const base = { NODE_ENV: "test", DEV_FAKE_PROVIDERS: "true" };
  it("allowed only in APP_ENV=dev, test mode, with no real Stripe or LLM key", () => {
    expect(parseEnv({ ...base, APP_ENV: "dev" }).DEV_FAKE_PROVIDERS).toBe(true);
    const staging = { ...base, APP_ENV: "staging", DATABASE_URL: "postgres://x", SESSION_SECRET: "s".repeat(40), APP_ORIGIN: "https://s.example" };
    expect(() => parseEnv(staging)).toThrow(/DEV_FAKE_PROVIDERS/);
    expect(() => parseEnv({ ...base, APP_ENV: "dev", STRIPE_SECRET_KEY: "sk_test_1" })).toThrow(/DEV_FAKE_PROVIDERS/);
    expect(() => parseEnv({ ...base, APP_ENV: "dev", LLM_API_KEY: "k" })).toThrow(/DEV_FAKE_PROVIDERS/);
  });
});

describe("robots and sitemap (L3)", () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });
  it("non-production: disallow everything, empty sitemap", () => {
    process.env.APP_ENV = "staging";
    expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(sitemap()).toEqual([]);
  });
  it("production: public pages only; private paths disallowed", () => {
    process.env.APP_ENV = "production"; process.env.APP_ORIGIN = "https://haeday.net";
    const urls = sitemap().map((u) => u.url);
    expect(urls).toContain("https://haeday.net/");
    expect(urls.some((u) => /\/(chart|order|r|admin|checkout|refund|my|login)\b/.test(u))).toBe(false);
    const rules = robots().rules as { disallow: string[] };
    for (const p of ["/chart/", "/order/", "/r/", "/admin", "/checkout/"]) expect(rules.disallow).toContain(p);
  });
});
