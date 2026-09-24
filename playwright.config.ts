import { defineConfig, devices } from "@playwright/test";

export const DB = process.env.E2E_DATABASE_URL ?? process.env.TEST_DATABASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: "http://127.0.0.1:3000", ...devices["iPhone 13"], browserName: "chromium",
    // Optional override for sandboxes with a preinstalled Chromium; CI and local use Playwright's own browser.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  // Chart flows need a database: E2E_DATABASE_URL, else TEST_DATABASE_URL (CI). Keys below are throwaway test keys.
  webServer: {
    command: DB ? "pnpm db:migrate && pnpm build && pnpm start -p 3000" : "pnpm build && pnpm start -p 3000",
    env: {
      APP_ENV: "dev", APP_ORIGIN: "http://127.0.0.1:3000", ...(DB ? { DATABASE_URL: DB } : {}),
      // L6: dev-only fake Stripe + fake LLM so one test can walk chart → pay → reading (refused outside APP_ENV=dev).
      DEV_FAKE_PROVIDERS: "true", CSP_MODE: "enforce",
      ENCRYPTION_KEYS: JSON.stringify({ e2e: Buffer.alloc(32, 7).toString("base64") }), ENCRYPTION_ACTIVE_KEY_ID: "e2e",
      EMAIL_LOOKUP_KEY: Buffer.alloc(32, 9).toString("base64"),
    },
    url: "http://127.0.0.1:3000/api/health/live", timeout: 180000, reuseExistingServer: true,
  },
});
