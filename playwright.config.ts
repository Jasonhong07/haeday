import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: {
    baseURL: "http://127.0.0.1:3000", ...devices["iPhone 13"], browserName: "chromium",
    // Optional override for sandboxes with a preinstalled Chromium; CI and local use Playwright's own browser.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: { command: "pnpm build && pnpm start -p 3000", env: { APP_ENV: "dev" }, url: "http://127.0.0.1:3000/api/health/live", timeout: 180000, reuseExistingServer: true },
});
