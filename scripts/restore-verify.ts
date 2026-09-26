// `DATABASE_URL=<restored copy> pnpm restore:verify` (ARCHITECTURE §8 restore drill). Read-only. Proves a restored
// backup is usable: every migration is present, the job queue schema exists, row counts look sane, and encrypted
// values decrypt with the CURRENT keys (a backup without its keys is useless). Prints counts only, never values.
import { sql } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { createDb } from "../src/server/db/client";
import { getEnv } from "../src/server/env";
import { decryptPrivate } from "../src/server/security/encryption";
import { aad, loadKeyring } from "../src/server/security/keyring";

// table, id column, encrypted column, AAD field name (must match the code that wrote it)
const ENCRYPTED: Array<[string, string, string]> = [
  ["chart_revisions", "input_enc", "input"], ["chart_revisions", "response_enc", "response"], ["customers", "email_enc", "email"],
  ["email_outbox", "payload_enc", "payload"], ["email_outbox", "to_email_enc", "to_email"], ["marketing_contacts", "email_enc", "email"],
  ["orders", "delivery_email_enc", "delivery_email"], ["orders", "snapshot_enc", "snapshot"], ["readings", "content_enc", "content"],
];
const SAMPLE = 25;

async function main() {
  const env = getEnv();
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const ring = loadKeyring(env);
  const { db, pool } = createDb(env.DATABASE_URL, 1);
  let failed = false;
  const say = (ok: boolean, text: string) => { if (!ok) failed = true; console.log(`${ok ? "PASS" : "FAIL"} ${text}`); };
  try {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: unknown[] };
    const applied = Number(((await db.execute(sql`select count(*)::int n from drizzle.__drizzle_migrations`)).rows[0] as { n: number }).n);
    say(applied === journal.entries.length, `migrations applied ${applied} / expected ${journal.entries.length}`);
    const boss = ((await db.execute(sql`select count(*)::int n from information_schema.tables where table_schema = 'pgboss'`)).rows[0] as { n: number }).n;
    say(boss > 0, `job queue schema present (${boss} tables)`);
    for (const t of ["orders", "readings", "refunds", "payment_events", "chart_revisions", "customers"]) {
      const n = ((await db.execute(sql.raw(`select count(*)::int n from "${t}"`))).rows[0] as { n: number }).n;
      console.log(`INFO ${t}: ${n} rows`);
    }
    for (const [table, col, field] of ENCRYPTED) {
      const rows = (await db.execute(sql.raw(`select id::text id, "${col}" v from "${table}" where "${col}" is not null order by random() limit ${SAMPLE}`))).rows as Array<{ id: string; v: string }>;
      let ok = 0;
      for (const r of rows) { try { decryptPrivate(r.v, aad(table, r.id, field), ring); ok++; } catch { /* counted below */ } }
      say(ok === rows.length, `${table}.${col}: ${ok}/${rows.length} sampled values decrypt with the current keys`);
    }
  } finally { await pool.end(); }
  console.log(failed ? "RESULT: restore NOT usable (see FAIL lines)" : "RESULT: restore usable. Next: rerun retention, run reconciliation, then restart the worker.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.log(`FAIL ${(e as Error).message}`); process.exit(1); });
