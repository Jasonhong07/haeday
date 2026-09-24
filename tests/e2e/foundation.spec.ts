import { expect, test } from "@playwright/test";
test("mobile placeholder stays honest and exposes no checkout", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Find your heyday");
  await expect(page.getByRole("status")).toContainText("in preparation");
  await expect(page.getByRole("button", { name: /pay|buy|checkout/i })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
