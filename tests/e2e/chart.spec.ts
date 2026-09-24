// M2 end-to-end: input → free chart on a phone viewport, including fold, gap and unknown-time cases (TASKS M2).
import { expect, test, type Page } from "@playwright/test";

test.skip(!(process.env.E2E_DATABASE_URL ?? process.env.TEST_DATABASE_URL), "needs a database");

async function fill(page: Page, date: string, mode: "I know it" | "Roughly" | "I don't know", time: string | null, city: string, pick: RegExp) {
  await page.goto("/saju");
  await page.getByLabel("Birth date").fill(date);
  await page.getByRole("radio", { name: mode }).click();
  if (time) await page.getByRole("textbox", { name: /birth time/i }).fill(time);
  await page.getByRole("combobox", { name: "Birth city" }).fill(city);
  await page.getByRole("option", { name: pick }).first().click();
  await page.getByRole("button", { name: "See my birth chart · Free" }).click();
}

test("exact time: landing → input → chart with pillars, Day Master, details and share preview", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "See my birth chart · Free" }).click();
  await expect(page).toHaveURL(/\/saju$/);
  await fill(page, "1990-05-12", "I know it", "09:30", "seoul", /^Seoul, South Korea$/);
  await expect(page).toHaveURL(/\/chart\/[0-9a-f-]{36}$/);
  const pillars = page.getByRole("list", { name: "Your four pillars" });
  for (const p of ["Year pillar: 庚午", "Month pillar: 辛巳", "Day pillar: 丁丑", "Hour pillar: 甲辰"]) await expect(pillars).toContainText(p);
  await expect(page.getByRole("heading", { name: /Yin Fire/ })).toBeVisible();
  await expect(page.getByText("Out of 8 characters")).toBeVisible();
  await expect(page.getByText(/Your details: May 12, 1990, 9:30 AM, Seoul, South Korea\. Solar time adjusted\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Unlock my reading · $3.99" })).toBeDisabled();
  await page.getByRole("button", { name: "Share my Day Master" }).click();
  await expect(page.getByRole("img", { name: /Share image: Day Master 丁 Yin Fire/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("fold: 1:30 AM on 1995-10-29 in New York asks which one, then shows the chart", async ({ page }) => {
  await fill(page, "1995-10-29", "I know it", "01:30", "new york", /^New York City, NY/);
  await expect(page.getByRole("heading", { name: "Clocks fell back that night, so 1:30 AM happened twice. Which one?" })).toBeVisible();
  const firstUrl = page.url();
  await page.getByRole("button", { name: "The second 1:30 AM" }).click();
  await expect(page).not.toHaveURL(firstUrl);
  await expect(page.getByRole("list", { name: "Your four pillars" })).toBeVisible();
  await expect(page.getByText(/1:30 AM \(the second one\)/)).toBeVisible();
});

test("gap: 2:30 AM on 1995-04-02 in New York is rejected with a clear message", async ({ page }) => {
  await fill(page, "1995-04-02", "I know it", "02:30", "new york", /^New York City, NY/);
  await expect(page.locator(".error")).toContainText("didn't exist on this date because clocks sprang forward");
  await expect(page).toHaveURL(/\/saju$/);
});

test("unknown time with a day-only split shows the disclosure, no question, hour unknown", async ({ page }) => {
  await fill(page, "1990-11-03", "I don't know", null, "new york", /^New York City, NY/);
  await expect(page.getByText("Hour unknown")).toBeVisible();
  await expect(page.getByText("Out of 6 characters (no hour pillar)")).toBeVisible();
  await expect(page.locator(".disclosure")).toContainText("If you were born between");
  await expect(page.getByRole("heading", { name: /When were you born/ })).toHaveCount(0);
});

test("unknown time on the 立春 date asks for the window, and 'I don't know' keeps the disclosed default", async ({ page }) => {
  await fill(page, "2024-02-04", "I don't know", null, "new york", /^New York City, NY/);
  await expect(page.getByRole("heading", { name: "Your chart changes during that day. When were you born?" })).toBeVisible();
  await page.getByRole("button", { name: "I don't know" }).click();
  await expect(page.getByRole("heading", { name: /When were you born/ })).toHaveCount(0);
  await expect(page.locator(".disclosure")).toBeVisible();
});

test("edit keeps the details and creates a new chart; another browser cannot open it", async ({ page, browser }) => {
  await fill(page, "1985-03-20", "Roughly", "14:40", "chicago", /^Chicago, IL/);
  await expect(page).toHaveURL(/\/chart\/[0-9a-f-]{36}$/);
  const chartUrl = page.url();
  await expect(page.getByText(/about 2:40 PM/)).toBeVisible();
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByLabel("Birth date")).toHaveValue("1985-03-20");
  await expect(page.getByRole("combobox", { name: "Birth city" })).toHaveValue("Chicago, IL, United States");
  await page.getByRole("radio", { name: "I know it" }).click();
  await page.getByRole("button", { name: "See my birth chart · Free" }).click();
  await expect(page).not.toHaveURL(chartUrl);
  await expect(page.getByText(/2:40 PM, Chicago/)).toBeVisible();
  const other = await browser.newContext();
  const res = await (await other.newPage()).goto(chartUrl);
  expect(res?.status()).toBe(404);
  await other.close();
});
