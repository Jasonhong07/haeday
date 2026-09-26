// `pnpm smoke https://your-staging-domain`: read-only checks against a running deployment. Makes no purchase, sends
// no email and changes nothing. Exit code 1 if any check fails.
const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!/^https?:\/\//.test(base)) { console.log("usage: pnpm smoke https://your-domain"); process.exit(2); }

type Result = { name: string; ok: boolean; note?: string };
const results: Result[] = [];
const check = (name: string, ok: boolean, note?: string) => results.push({ name, ok, note });

async function get(path: string, init?: RequestInit) {
  return fetch(`${base}${path}`, { redirect: "manual", ...init, headers: { "User-Agent": "haeday-smoke/1", ...(init?.headers ?? {}) } });
}

async function main() {
  const live = await get("/api/health/live");
  check("health/live answers 200", live.status === 200, `status ${live.status}`);

  const home = await get("/");
  const html = await home.text();
  check("landing answers 200", home.status === 200, `status ${home.status}`);
  const csp = home.headers.get("content-security-policy") ?? home.headers.get("content-security-policy-report-only");
  check("CSP header present with a nonce", Boolean(csp && /'nonce-[^']+'/.test(csp)), csp ? (home.headers.has("content-security-policy") ? "enforced" : "report-only") : "missing");
  check("clickjacking blocked (frame-ancestors 'none')", Boolean(csp?.includes("frame-ancestors 'none'")));
  check("no third-party font or script hosts on the landing page", !/fonts\.googleapis|gstatic|posthog|googletagmanager/.test(html));
  check("landing has the free chart link", html.includes('href="/saju"'));

  const robots = await (await get("/robots.txt")).text();
  check("robots.txt keeps private pages out", /Disallow: \/(admin|r\/|order)/.test(robots) || /Disallow: \/\s*$/m.test(robots));
  const sitemap = await get("/sitemap.xml");
  check("sitemap.xml answers", sitemap.status === 200, `status ${sitemap.status}`);

  const admin = await get("/admin");
  check("/admin is hidden without an admin session (404)", admin.status === 404, `status ${admin.status}`);
  const reading = await get("/r/00000000-0000-4000-8000-000000000000");
  const readingHtml = await reading.text();
  check("unknown reading id shows only the sign-in page", reading.status < 500 && readingHtml.includes("Sign in to open your reading"), `status ${reading.status}`);
  check("private pages are not cached", /no-store/.test(reading.headers.get("cache-control") ?? ""));
  const devPay = await get("/dev/pay?s=cs_test_x");
  check("dev fake-payment page is not reachable", devPay.status === 404, `status ${devPay.status}`);
  const webhook = await get("/api/webhooks/stripe", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } });
  check("webhook rejects unsigned requests", webhook.status >= 400 && webhook.status < 500, webhook.status === 503 ? "503: Stripe is not configured on this deployment" : `status ${webhook.status}`);
  const places = await get("/api/places?q=chicago");
  check("city search works", places.status === 200 && (await places.text()).includes("Chicago"), `status ${places.status}`);

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.note ? ` (${r.note})` : ""}`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

main().catch((e) => { console.log(`FAIL could not reach ${base}: ${(e as Error).message}`); process.exit(1); });
