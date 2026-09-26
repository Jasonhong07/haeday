import { expect, test } from "@playwright/test";
test("landing on a phone: honest, one free CTA, no checkout on the landing page itself", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Find your heyday");
  await expect(page.getByRole("link", { name: "See my birth chart · Free" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Questions" })).toBeVisible();
  await expect(page.getByText(/testimonial|reviews|★/i)).toHaveCount(0); // D42: no fabricated social proof
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


test("method page explains uncertainty and attributes the city data on mobile", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "How we calculate" }).click();
  await expect(page.getByRole("heading", { name: "Tradition, with clear assumptions." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "When you do not know the time" })).toBeVisible();
  await expect(page.getByRole("link", { name: "GeoNames city data" })).toHaveAttribute("href", "https://www.geonames.org/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("draft saju guides are hidden from visitors (404) until Jason approves them", async ({ page }) => {
  for (const path of ["/learn", "/learn/what-is-saju", "/learn/day-master/yin-wood"]) {
    const res = await page.goto(path);
    expect(res!.status(), path).toBe(404);
  }
});
