// Local-only development harness. Never loads .env or contacts payment/email/LLM providers.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const local = resolve(root, "..", ".haeday-local");
const mode = process.argv[2] ?? "serve";
if (!["serve", "test", "build", "prepare"].includes(mode)) throw new Error("Unknown local demo command");
const configPath = resolve(local, "keys.json");
if (!existsSync(configPath)) writeFileSync(configPath, JSON.stringify({ encryption: randomBytes(32).toString("base64"), lookup: randomBytes(32).toString("base64"), session: randomBytes(48).toString("base64") }), { flag: "wx" });
const keys = JSON.parse(readFileSync(configPath, "utf8"));
const password = readFileSync(resolve(local, "password.txt"), "utf8").trim();
const dbUrl = (name) => `postgresql://haeday:${encodeURIComponent(password)}@127.0.0.1:55432/${name}`;
const env = { ...process.env, APP_ENV: "dev", APP_ORIGIN: "http://127.0.0.1:3008", DATABASE_URL: dbUrl("haeday_demo"), TEST_DATABASE_URL: dbUrl("haeday_test"), PAYMENTS_MODE: "test", LIVE_PAYMENTS_APPROVED: "false", DEV_FAKE_PROVIDERS: "true", LLM_DAILY_CAP: "100", STRIPE_AUTOMATIC_TAX: "false", ENCRYPTION_KEYS: JSON.stringify({ demo: keys.encryption }), ENCRYPTION_ACTIVE_KEY_ID: "demo", EMAIL_LOOKUP_KEY: keys.lookup, SESSION_SECRET: keys.session, ADMIN_EMAILS: "", FLAGS: "{}", CSP_MODE: "enforce", NEXT_TELEMETRY_DISABLED: "1" };
for (const name of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_SAJU", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID", "LLM_API_KEY", "RESEND_API_KEY", "EMAIL_FROM", "SUPPORT_EMAIL", "SENTRY_DSN", "POSTHOG_KEY", "NEXT_PUBLIC_SENTRY_DSN", "NEXT_PUBLIC_POSTHOG_KEY"]) env[name] = "";
for (const name of ["STRIPE_CONTRACT_KEY", "PAYPAL_CONTRACT_CLIENT_ID", "PAYPAL_CONTRACT_SECRET"]) env[name] = "";
delete env.NODE_ENV;
const run = (args) => {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: "inherit" });
  if (result.error || result.status !== 0) process.exit(result.status ?? 1);
};
try {
  const admin = new pg.Client({ connectionString: dbUrl("postgres") });
  await admin.connect();
  for (const name of ["haeday_demo", "haeday_test"]) {
    const found = await admin.query("select 1 from pg_database where datname = $1", [name]);
    if (!found.rowCount) await admin.query(`CREATE DATABASE ${name}`); // fixed local names only
  }
  await admin.end();
  if (mode === "test") {
    // freshDb() may reset only haeday_test, never the persistent demo database.
    run(["node_modules/vitest/vitest.mjs", "run"]);
  } else {
    run(["--import", "tsx", "src/server/db/migrate.ts"]);
    const demo = new pg.Client({ connectionString: env.DATABASE_URL });
    await demo.connect();
    await demo.query("insert into settings (key,value,updated_by) values ('sales_enabled','true'::jsonb,'local-demo') on conflict (key) do update set value=excluded.value, updated_by=excluded.updated_by");
    await demo.end();
    console.log("Local demo only: fake payments and generated sample text; no cards or emails. http://127.0.0.1:3008");
    if (mode === "build") run(["node_modules/next/dist/bin/next", "build"]);
    if (mode === "serve") run(["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3008"]);
  }
} catch {
  console.error("Local demo setup failed. Check the local database is running; no provider credentials were printed.");
  process.exitCode = 1;
}
