import { sql } from "drizzle-orm";
import { PgBoss, fromDrizzle } from "pg-boss";
import type { Db } from "../db/client";

/** Queue names used across the app. Jobs carry internal ids only (D17). */
export const QUEUES = {
  heartbeat: "system.heartbeat",
  generateReading: "reading.generate",
  sendEmail: "email.send",
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/**
 * `worker` role runs maintenance, schedules and migrations. `web` role only sends jobs:
 * no supervision, no cron, no schema changes (schema is installed by `pnpm db:migrate`).
 */
export function createBoss(connectionString: string, role: "worker" | "web" = "worker"): PgBoss {
  const webOnly = role === "web";
  return new PgBoss({ connectionString, schema: "pgboss", supervise: !webOnly, schedule: !webOnly, migrate: !webOnly });
}

let webBoss: Promise<PgBoss> | undefined;
/** Lazily started sender for the web process. */
export function getWebBoss(connectionString: string): Promise<PgBoss> {
  webBoss ??= (async () => { const b = createBoss(connectionString, "web"); await b.start(); return b; })();
  return webBoss;
}

/**
 * `exclusive`: at most one created/retry/active job per singletonKey (e.g. order id), so a
 * duplicate webhook or retry cannot start a second generation. The order state machine in the
 * database remains the primary guard; the queue policy is defence in depth.
 */
const POLICIES: Record<QueueName, "standard" | "exclusive"> = {
  [QUEUES.heartbeat]: "standard",
  [QUEUES.generateReading]: "exclusive",
  [QUEUES.sendEmail]: "exclusive",
};

export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const name of Object.values(QUEUES)) {
    await boss.createQueue(name, { policy: POLICIES[name] });
  }
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Enqueue inside an existing Drizzle transaction so the job commits or rolls back
 * together with the business rows (ARCHITECTURE §4.3, CLAUDE.md rule 5).
 */
export async function enqueueInTx(
  boss: PgBoss, tx: Tx, name: QueueName, data: Record<string, string>,
  options: { singletonKey?: string; duplicateExpected?: boolean } = {},
): Promise<string | null> {
  if (POLICIES[name] === "exclusive" && !options.singletonKey) {
    // Keyless sends on an exclusive queue share one slot and would be dropped silently.
    throw new Error(`singletonKey is required for queue ${name}`);
  }
  const id = await boss.send(name, data, { singletonKey: options.singletonKey, db: fromDrizzle(tx, sql) });
  if (id === null && !options.duplicateExpected) throw new Error(`Job was not enqueued for ${name}`);
  return id;
}
