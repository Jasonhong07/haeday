// AI generation capacity (CC1c F13; D35, D47, D52). One "attempt" = one LLM call slot; the UTC-day count of
// generation_attempts rows is the budget. Admission happens inside the claim transaction under a per-day advisory
// lock, so concurrent workers can never overshoot (no count-then-call race).
//
// Checkout promise (shown BEFORE payment and frozen on the order):
//   minutes : used + waiting 24h backlog < 90% of the cap
//   24h     : otherwise, while the waiting backlog is below 2× cap (D52: the cap auto-raises up to 2× for urgent orders)
//   paused  : backlog ≥ 2× cap → new payments stop automatically (existing orders keep going) + admin alert
// Generation:
//   minutes orders : run while used < 1.2× cap (20% reserved above the cap for orders already promised "a minute")
//   24h orders     : run while used < cap; when the deadline is ≤ 6 h away, run up to 2× cap (D52); else wait until
//                    the next UTC day (spread over 30 min) or until the order becomes urgent, whichever is first.
import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { generationAttempts, orders } from "../db/schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export const DELAY_THRESHOLD = 0.9;
export const MINUTES_OVERFLOW = 1.2;
export const AUTO_RAISE_MAX = 2;          // D52
export const URGENT_MS = 6 * 3_600_000;
export const DELAYED_PROMISE_MS = 24 * 3_600_000; // D47
export type Promise_ = "minutes" | "24h";
export type CapacityState = Promise_ | "paused";

export const dayStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
export const nextDayStart = (now: Date) => new Date(dayStart(now).getTime() + 86_400_000);

/** Attempts that failed before any LLM call (no model, a known pre-call code) used no AI capacity. */
export const PRE_CALL_ERRORS = ["snapshot_missing", "snapshot_not_computed", "content_not_ready", "content_not_approved", "no_approved_snippets", "llm_not_configured", "llm_cap_not_set"];

async function usedToday(db: Db | Tx, now: Date): Promise<number> {
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(generationAttempts)
    .where(and(gte(generationAttempts.startedAt, dayStart(now)),
      sql`not (${generationAttempts.status} = 'failed' and ${generationAttempts.modelId} is null and coalesce(${generationAttempts.errorCode}, '') in (${sql.join(PRE_CALL_ERRORS.map((c) => sql`${c}`), sql`, `)}))`));
  return n;
}

/** Paid "24h" orders that still need a generation. */
export async function waitingBacklog(db: Db | Tx): Promise<number> {
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(orders)
    .where(and(eq(orders.paymentStatus, "paid"), eq(orders.deliveryPromise, "24h"), inArray(orders.fulfillmentStatus, ["queued", "generating"])));
  return n;
}

export async function capacityState(db: Db, cap: number, now = new Date()): Promise<{ state: CapacityState; used: number; backlog: number }> {
  const used = await usedToday(db, now);
  const backlog = await waitingBacklog(db);
  if (cap <= 0) return { state: "minutes", used, backlog }; // sales are closed elsewhere when no cap is set
  if (used + backlog < DELAY_THRESHOLD * cap) return { state: "minutes", used, backlog };
  if (backlog < AUTO_RAISE_MAX * cap) return { state: "24h", used, backlog };
  return { state: "paused", used, backlog };
}

export type Admission = { kind: "go" } | { kind: "defer"; until: Date } | { kind: "over" };

/** Inside the claim transaction. Serialised per UTC day, so the count cannot race. */
export async function admitAttempt(tx: Tx, input: { cap: number; promise: Promise_; deadlineAt: Date | null; now: Date; afterCount?: () => Promise<void> }): Promise<Admission> {
  const { cap, promise, deadlineAt, now } = input;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`llm-day:${dayStart(now).toISOString().slice(0, 10)}`}, 0))`);
  const used = await usedToday(tx, now);
  await input.afterCount?.(); // test hook: forces concurrent workers to overlap here
  if (promise === "minutes") return used < Math.min(MINUTES_OVERFLOW, AUTO_RAISE_MAX) * cap ? { kind: "go" } : { kind: "over" };
  if (used < cap) return { kind: "go" };
  const urgent = deadlineAt !== null && deadlineAt.getTime() - now.getTime() <= URGENT_MS;
  // Beyond 2× even for urgent orders: look again in 15 min; if the promise still can't be kept, the 24 h deadline
  // refund (D47) applies. New payments are already paused at this point (capacityState).
  if (urgent) return used < AUTO_RAISE_MAX * cap ? { kind: "go" } : { kind: "defer", until: new Date(now.getTime() + 15 * 60_000) };
  const spread = Math.floor(Math.random() * 30 * 60_000);
  const tomorrow = new Date(nextDayStart(now).getTime() + spread);
  const becomesUrgent = deadlineAt ? new Date(deadlineAt.getTime() - URGENT_MS) : tomorrow;
  return { kind: "defer", until: tomorrow < becomesUrgent ? tomorrow : becomesUrgent };
}
