// Worker process: pg-boss consumer + cron. Business handlers arrive in M4/M6.
import * as Sentry from "@sentry/nextjs";
import { getDb } from "../server/db/client";
import { settings } from "../server/db/schema";
import { getEnv } from "../server/env";
import { sentryOptions } from "../server/observability/sentry";
import { QUEUES, createBoss, ensureQueues } from "../server/queue/boss";

function errorCode(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { name?: string; code?: string };
    return [e.name, e.code].filter(Boolean).join(":") || "unknown";
  }
  return "unknown";
}

async function main(): Promise<void> {
  const env = getEnv();
  if (!env.DATABASE_URL) throw new Error("Database is not configured");
  if (env.SENTRY_DSN) Sentry.init(sentryOptions(env.SENTRY_DSN, env.APP_ENV));
  const { db } = getDb(env.DATABASE_URL);
  const boss = createBoss(env.DATABASE_URL);
  boss.on("error", (err) => { console.error(`[worker] queue error ${errorCode(err)}`); Sentry.captureException(err); });
  await boss.start();
  await ensureQueues(boss);
  await boss.schedule(QUEUES.heartbeat, "* * * * *");
  await boss.work(QUEUES.heartbeat, async () => {
    const at = new Date().toISOString();
    await db.insert(settings).values({ key: "worker_heartbeat", value: at, updatedBy: "worker" })
      .onConflictDoUpdate({ target: settings.key, set: { value: at, updatedAt: new Date(), updatedBy: "worker" } });
    console.log(`[worker] heartbeat ${at}`);
  });
  console.log("[worker] started");

  const stop = async () => { await boss.stop({ graceful: true }); process.exit(0); };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

main().catch((err) => { console.error(`[worker] failed to start ${errorCode(err)}`); process.exit(1); });
