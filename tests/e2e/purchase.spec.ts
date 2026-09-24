// Post-payment pages on a phone viewport: order status → reading (hanji), privacy of the reading link, /my, legal pages.
// The paid order is seeded in the database (payments are covered by tests/integration/commerce.test.ts).
import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { encryptPrivate, type Keyring } from "../../src/server/security/encryption";
import { aad } from "../../src/server/security/keyring";

const DB = process.env.E2E_DATABASE_URL ?? process.env.TEST_DATABASE_URL;
test.skip(!DB, "needs a database");
const ring: Keyring = { activeId: "e2e", keys: { e2e: Buffer.alloc(32, 7) }, lookupKey: Buffer.alloc(32, 9) };

const section = (t: string) => Array.from({ length: 5 }, () => `${t} sentence for a calm and reflective reading.`).join(" ");
const reading = {
  summary: section("Summary"), dayMaster: section("Candle"), elements: section("Elements"), love: section("Love"),
  workMoney: section("Work"), year2027: section("Year"), reflection: "What would you like to grow this year?",
  usedSnippetIds: ["dm.ding.core"], disclaimer: "For entertainment and reflection. Not a prediction or professional advice.",
};

test("paid order → processing → delivered reading; other browsers must sign in", async ({ page, browser }) => {
  await page.goto("/saju");
  await page.getByLabel("Birth date").fill("1990-05-12");
  await page.getByRole("textbox", { name: /birth time/i }).fill("09:30");
  await page.getByRole("combobox", { name: "Birth city" }).fill("seoul");
  await page.getByRole("option", { name: /^Seoul, South Korea$/ }).click();
  await page.getByRole("button", { name: "See my birth chart · Free" }).click();
  await expect(page).toHaveURL(/\/chart\/[0-9a-f-]{36}$/);
  const chartId = page.url().split("/").pop()!;

  const pool = new Pool({ connectionString: DB });
  const { rows: [chart] } = await pool.query("select guest_id from chart_revisions where id = $1", [chartId]);
  const orderId = crypto.randomUUID(), readingId = crypto.randomUUID();
  await pool.query(
    `insert into orders (id, chart_revision_id, guest_id, sku, unit_amount_cents, total_cents, consent_version, payment_status, paid_at, fulfillment_status)
     values ($1, $2, $3, 'saju_reading', 399, 399, 'c', 'paid', now(), 'generating')`, [orderId, chartId, chart.guest_id]);

  await page.goto(`/order/${orderId}`);
  await expect(page.getByRole("heading", { name: "Payment received. Writing your reading." })).toBeVisible();

  await pool.query(`insert into readings (id, order_id, content_enc, prompt_version, model_id, policy_version) values ($1, $2, $3, 'p', 'm', 'v')`,
    [readingId, orderId, encryptPrivate(reading, aad("readings", readingId, "content"), ring)]);
  await pool.query(`update orders set fulfillment_status = 'delivered' where id = $1`, [orderId]);
  await pool.end();

  await expect(page.getByRole("link", { name: "Open my reading" })).toBeVisible({ timeout: 15000 }); // auto refresh
  await page.getByRole("link", { name: "Open my reading" }).click();
  await expect(page.getByRole("heading", { name: "Your personal reading" })).toBeVisible();
  for (const h of ["Your Day Master", "Love and relationships", "Your 2027 energy", "A question to reflect on"]) await expect(page.getByRole("heading", { name: h })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.goto("/my");
  await expect(page.getByRole("link", { name: "Open" })).toBeVisible();

  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto(`/r/${readingId}`);
  await expect(p2.getByRole("heading", { name: "Sign in to open your reading" })).toBeVisible();
  await expect(p2.getByText("Candle sentence")).toHaveCount(0);
  expect((await p2.goto(`/order/${orderId}`))?.status()).toBe(404);
  await other.close();
});

test("legal and sign-in pages render on a phone", async ({ page }) => {
  for (const [path, heading] of [["/terms", "Terms of Service"], ["/privacy", "Privacy Policy"], ["/refunds", "Refund Policy"], ["/login", "Open your readings"]] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
  await page.goto("/login/verify?error=expired");
  await expect(page.locator(".error")).toContainText("expired");
});
