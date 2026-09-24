// Opens sales before any page renders, so the server's 30 s settings cache never holds a stale "closed" value
// (a fresh E2E database has no sales_enabled row until the full-flow test would have written it).
import { Pool } from "pg";
import { DB } from "../../playwright.config";

export default async function globalSetup() {
  if (!DB) return;
  const pool = new Pool({ connectionString: DB });
  try {
    await pool.query(`insert into settings (key, value, updated_by) values ('sales_enabled', 'true', 'e2e') on conflict (key) do update set value = 'true'`);
  } finally { await pool.end(); }
}
