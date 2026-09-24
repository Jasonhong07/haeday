import { sql } from "drizzle-orm";
import { PgBoss, fromDrizzle } from "pg-boss";
import type { Db } from "../db/client";

/** Queue names used across the app. Jobs carry internal ids only (D17). */
export const QUEUES = {
  heartbeat: "system.heartbeat",
  generateReading: "reading.generate",
  sendEmail: "email.send",
  deadlines: "cron.deadlines",
  reconcileRefunds: "cron.reconcile-refunds",
  refundExecute: "refund.execute", // one provider call attempt per refund row (singletonKey = refund id)
  refundSync: "refund.sync",       // re-read provider refunds for one order (singletonKey = order id)
  retention: "cron.retention",
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
  [QUEUES.deadlines]: "standard",
  [QUEUES.reconcileRefunds]: "standard",
  [QUEUES.refundExecute]: "exclusive",
  [QUEUES.refundSync]: "exclusive",
  [QUEUES.retention]: "standard",
};

/** Retries (ARCHITECTURE §4.4/§4.5): generation 3 attempts total (~0 s, 20 s, 40–80 s); email 6 attempts with backoff. */
const RETRY: Record<QueueName, { retryLimit: number; retryDelay: number; retryBackoff: boolean; expireInSeconds: number }> = {
  [QUEUES.heartbeat]: { retryLimit: 0, retryDelay: 0, retryBackoff: false, expireInSeconds: 60 },
  [QUEUES.generateReading]: { retryLimit: 2, retryDelay: 20, retryBackoff: true, expireInSeconds: 180 },
  [QUEUES.sendEmail]: { retryLimit: 5, retryDelay: 30, retryBackoff: true, expireInSeconds: 60 },
  [QUEUES.deadlines]: { retryLimit: 0, retryDelay: 0, retryBackoff: false, expireInSeconds: 120 },
  [QUEUES.reconcileRefunds]: { retryLimit: 0, retryDelay: 0, retryBackoff: false, expireInSeconds: 600 },
  [QUEUES.retention]: { retryLimit: 1, retryDelay: 600, retryBackoff: false, expireInSeconds: 900 },
  [QUEUES.refundExecute]: { retryLimit: 5, retryDelay: 30, retryBackoff: true, expireInSeconds: 120 },
  [QUEUES.refundSync]: { retryLimit: 5, retryDelay: 30, retryBackoff: true, expireInSeconds: 120 },
};

export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const name of Object.values(QUEUES)) {
    await boss.createQueue(name, { policy: POLICIES[name], ...RETRY[name] });
    await boss.updateQueue(name, RETRY[name]); // queues created by an earlier deploy pick up new retry settings
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
