// Public marketing pages must not depend on private-data decryption keys.
import * as Sentry from "@sentry/nextjs";
import { getEnv, llmConfigured, paymentsConfigured } from "./env";
import { getDb } from "./db/client";
import { isSalesEnabled } from "./settings";
let lastWarning = 0;
export async function publicSalesOpen(): Promise<boolean> {
  try {
    const env = getEnv();
    if (!env.DATABASE_URL || !paymentsConfigured(env) || !llmConfigured(env)) return false;
    return await isSalesEnabled(getDb(env.DATABASE_URL).db);
  } catch {
    // Fail closed for sales, not for public copy. Never attach the exception, query or environment.
    if (Date.now() - lastWarning > 60_000) {
      lastWarning = Date.now();
      Sentry.captureMessage("public_sales_availability_unavailable", "warning");
    }
    return false;
  }
}
