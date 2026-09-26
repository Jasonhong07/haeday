import { expect, test } from "@playwright/test";
test("landing on a phone: honest, one free CTA, no checkout on the landing page itself", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Find your heyday");
  await expect(page.getByRole("link", { name: "See my birth chart · Free" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /A few good\s*questions/i })).toBeVisible();
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

test("birth time is keyboard accessible and empty city search explains recovery", async ({ page }) => {
  await page.goto("/saju");
  const exact = page.getByRole("radio", { name: "I know it", exact: true });
  await exact.focus();
  await exact.press("ArrowLeft");
  await expect(page.getByRole("radio", { name: "I don't know", exact: true })).toBeChecked();
  await expect(page.locator('input[type="time"]')).toHaveCount(0);
  const city = page.getByRole("combobox", { name: "Birth city" });
  await city.fill("zzzznomatch");
  await expect(page.getByRole("status")).toContainText("No matching city");
  await city.fill("Chicago");
  await expect(page.getByRole("option", { name: "Chicago, IL, United States", exact: true })).toBeVisible();
  await city.press("Enter");
  await expect(city).toHaveValue("Chicago, IL, United States");
  await expect(page.getByRole("status")).toBeEmpty();
});

test("city search failure gives a recoverable message", async ({ page }) => {
  await page.route("**/api/places?*", route => route.fulfill({ status: 503, body: "{}" }));
  await page.goto("/saju");
  await page.getByRole("combobox", { name: "Birth city" }).fill("Chicago");
  await expect(page.getByRole("status")).toContainText("City search is unavailable");
  await expect(page.getByRole("option")).toHaveCount(0);
});
