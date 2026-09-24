import { sql } from "drizzle-orm";
import { createDb, type DbHandle } from "../../src/server/db/client";
import { runMigrations } from "../../src/server/db/migrate";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
// In CI a missing database must fail loudly, never skip silently.
if (process.env.CI && !TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required in CI");
export const hasDb = Boolean(TEST_DATABASE_URL);

export async function freshDb(): Promise<DbHandle> {
  const url = TEST_DATABASE_URL!;
  // This helper drops schemas. Refuse anything that is not clearly a throwaway test database.
  if (!/_test(\?.*)?$/.test(new URL(url).pathname)) throw new Error("TEST_DATABASE_URL must point to a database whose name ends in _test");
  const admin = createDb(url, 1);
  await admin.db.execute(sql`drop schema if exists public cascade; drop schema if exists pgboss cascade; drop schema if exists drizzle cascade; create schema public;`);
  await admin.pool.end();
  await runMigrations(url);
  return createDb(url, 5);
}
