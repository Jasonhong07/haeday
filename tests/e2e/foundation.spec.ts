import { expect, test } from "@playwright/test";
test("mobile placeholder stays honest and exposes no checkout", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Find your heyday");
  await expect(page.getByRole("status")).toContainText("in preparation");
  await expect(page.getByRole("button", { name: /pay|buy|checkout/i })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("city autocomplete API works through the real server", async ({ request }) => {
  const res = await request.get("/api/places?q=chicago");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { results: { label: string; placeId: string }[] };
  expect(body.results[0]?.label).toBe("Chicago, IL, United States");
  expect(body.results[0]?.placeId).toMatch(/^gn:\d+$/);
  expect((await request.get("/api/places")).status()).toBe(400);
});
