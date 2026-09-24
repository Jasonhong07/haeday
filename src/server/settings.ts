import { eq } from "drizzle-orm";
import type { Db } from "./db/client";
import { settings } from "./db/schema";

const SALES_KEY = "sales_enabled";
const CACHE_MS = 30_000;
let cache: { value: boolean; at: number } | undefined;

/** Sales are OFF unless explicitly enabled (fail closed). Cached ≤ 30 s (ARCHITECTURE §5). */
export async function isSalesEnabled(db: Db, now = Date.now()): Promise<boolean> {
  if (cache && now - cache.at < CACHE_MS) return cache.value;
  const row = await db.query.settings.findFirst({ where: eq(settings.key, SALES_KEY) });
  const value = row?.value === true;
  cache = { value, at: now };
  return value;
}

export async function setSalesEnabled(db: Db, enabled: boolean, updatedBy: string): Promise<void> {
  await db.insert(settings).values({ key: SALES_KEY, value: enabled, updatedBy })
    .onConflictDoUpdate({ target: settings.key, set: { value: enabled, updatedBy, updatedAt: new Date() } });
  cache = undefined;
}

export function resetSettingsCache(): void { cache = undefined; }
