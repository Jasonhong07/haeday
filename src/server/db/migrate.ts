// Applies committed SQL migrations. Run as a pre-deploy step, never at request time.
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createBoss, ensureQueues } from "../queue/boss";
import { createDb } from "./client";

/** App tables first, then the pg-boss schema and queues, so web can enqueue before the worker starts. */
export async function runMigrations(connectionString: string): Promise<void> {
  const { db, pool } = createDb(connectionString, 1);
  try {
    await migrate(db, { migrationsFolder: "drizzle" });
  } finally {
    await pool.end();
  }
  const boss = createBoss(connectionString);
  await boss.start();
  try { await ensureQueues(boss); } finally { await boss.stop({ graceful: false }); }
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL is required"); process.exit(1); }
  runMigrations(url).then(() => console.log("migrations applied")).catch(() => { console.error("migration failed"); process.exit(1); });
}
