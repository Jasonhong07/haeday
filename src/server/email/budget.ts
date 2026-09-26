// Email volume guard (L7, D45). Every send (outbox and sign-in links) reserves one slot atomically before calling
// the provider. Lower-priority mail stops earlier so sign-in links and deliveries keep working on a small plan:
//   magic link and operator alerts: up to the limit · delivery/apology: limit − 20 · chart email: limit − 40 · marketing: limit − 60
// The same tiers apply to the monthly limit. A reservation is never given back (a failed send may still have been
// accepted by the provider), so counting errs on the safe side.
import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { emailBudget } from "../db/schema";

export type MailClass = "magic" | "alert" | "delivery" | "apology" | "chart" | "marketing";
const RESERVE: Record<MailClass, number> = { magic: 0, alert: 0, delivery: 20, apology: 20, chart: 40, marketing: 60 };
export interface BudgetLimits { daily: number; monthly: number; alertAt: number }
export type Reservation = { ok: true; sentToday: number; alert: boolean } | { ok: false; reason: "daily" | "monthly" };

const day = (d: Date) => d.toISOString().slice(0, 10);

export async function reserveEmail(db: Db, cls: MailClass, limits: BudgetLimits, now = new Date()): Promise<Reservation> {
  const today = day(now);
  const monthStart = today.slice(0, 7) + "-01";
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  return db.transaction(async (tx) => {
    await tx.insert(emailBudget).values({ day: today, sent: 0 }).onConflictDoNothing();
    const [row] = await tx.select().from(emailBudget).where(eq(emailBudget.day, today)).for("update"); // serialises the day
    const [{ month } = { month: 0 }] = await tx.select({ month: sql<number>`coalesce(sum(${emailBudget.sent}), 0)::int` }).from(emailBudget)
      .where(and(gte(emailBudget.day, monthStart), lt(emailBudget.day, nextMonth)));
    const reserve = RESERVE[cls];
    if (row!.sent >= limits.daily - reserve) return { ok: false as const, reason: "daily" as const };
    if (month >= limits.monthly - reserve) return { ok: false as const, reason: "monthly" as const };
    const [upd] = await tx.update(emailBudget).set({ sent: row!.sent + 1 }).where(eq(emailBudget.day, today)).returning({ sent: emailBudget.sent });
    return { ok: true as const, sentToday: upd!.sent, alert: upd!.sent === limits.alertAt };
  });
}

/** Next UTC midnight plus a random spread, when a deferred email may try again. */
export function nextBudgetWindow(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) + Math.floor(Math.random() * 30 * 60_000));
}

export async function sentToday(db: Db, now = new Date()): Promise<number> {
  const [row] = await db.select().from(emailBudget).where(eq(emailBudget.day, day(now)));
  return row?.sent ?? 0;
}
