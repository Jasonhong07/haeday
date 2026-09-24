// L6: the whole customer path on a phone, through the REAL checkout, webhook handler, generation checks and pages,
// with dev-only fake Stripe/LLM (DEV_FAKE_PROVIDERS, APP_ENV=dev). CSP is ENFORCED here, so any blocked script
// would break the flow. Also proves the fake pay route is not a public surface.
import { expect, test } from "@playwright/test";
import { Pool } from "pg";

const DB = process.env.E2E_DATABASE_URL ?? process.env.TEST_DATABASE_URL;
test.skip(!DB, "needs a database");

test("chart → checkout → pay → reading, with CSP enforced", async ({ page }) => {
  const pool = new Pool({ connectionString: DB });
  await pool.query(`insert into settings (key, value, updated_by) values ('sales_enabled', 'true', 'e2e') on conflict (key) do update set value = 'true'`);
  const violations: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });

  const res = await page.goto("/");
  expect(res!.headers()["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  await page.goto("/saju");
  await page.getByLabel("Birth date").fill("1988-08-08");
  await page.getByRole("textbox", { name: /birth time/i }).fill("08:08");
  await page.getByRole("combobox", { name: "Birth city" }).fill("chicago");
  await page.getByRole("option", { name: /^Chicago, IL, United States$/ }).click();
  await page.getByRole("button", { name: "See my birth chart · Free" }).click();
  await expect(page).toHaveURL(/\/chart\/[0-9a-f-]{36}$/);

  await page.getByRole("link", { name: /Unlock my reading/ }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Continue to payment/ }).click();
  await expect(page).toHaveURL(/\/dev\/pay\?s=cs_test_/);
  await page.getByRole("button", { name: /Pay \$3\.99 \(test\)/ }).click();
  await expect(page).toHaveURL(/\/order\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Your reading is ready" })).toBeVisible({ timeout: 15000 });
  await page.getByRole("link", { name: "Open my reading" }).click();
  await expect(page).toHaveURL(/\/r\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/What would you like to grow this year\?/)).toBeVisible();

  // D40: the funnel saw this browser at every step.
  const { rows: [f] } = await pool.query(`select
      (select count(*)::int from funnel_events where name = 'visit') v,
      (select count(*)::int from funnel_events where name = 'form_started') s,
      (select count(*)::int from readings where first_viewed_at is not null) o`);
  expect(f.v).toBeGreaterThan(0); expect(f.s).toBeGreaterThan(0); expect(f.o).toBeGreaterThan(0);
  expect(violations).toEqual([]);
  await pool.end();
});

test("the dev pay route is not reachable from other sites", async ({ request }) => {
  const r = await request.post("/api/dev/pay", { form: { s: "cs_test_x" }, headers: { Origin: "https://evil.example" } });
  expect(r.status()).toBe(404);
});
