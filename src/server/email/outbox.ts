// Email outbox (ARCHITECTURE §4.5): rows are written in the same transaction as the business change and a job is
// enqueued in that transaction; the worker sends with idempotency key = dedupe key. Email failures never trigger
// regeneration or refunds.
import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { Db } from "../db/client";
import { emailOutbox, readings } from "../db/schema";
import { QUEUES, enqueueInTx } from "../queue/boss";
import { decryptPrivate, encryptPrivate, type Keyring } from "../security/encryption";
import { aad } from "../security/keyring";
import { EmailError, type EmailAdapter } from "../adapters/email";
import { adminAlertEmail, apologyEmail, apologyFreeEmail, chartEmail, deliveryEmail } from "./templates";
import { nextBudgetWindow, reserveEmail, type BudgetLimits, type MailClass } from "./budget";

export type EmailKind = "delivery" | "apology" | "apology_free" | "chart" | "admin_alert";
export const MAX_EMAIL_ATTEMPTS = 6;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function queueEmailInTx(tx: Tx, boss: PgBoss, ring: Keyring, input: { kind: EmailKind; orderId: string; to: string }): Promise<void> {
  const id = crypto.randomUUID();
  const dedupeKey = `${input.orderId}:${input.kind}`;
  const inserted = await tx.insert(emailOutbox).values({
    id, kind: input.kind, orderId: input.orderId, dedupeKey,
    toEmailEnc: encryptPrivate(input.to, aad("email_outbox", id, "to_email"), ring),
  }).onConflictDoNothing().returning({ id: emailOutbox.id });
  if (inserted.length === 0) return; // already queued once for this order and kind
  await enqueueInTx(boss, tx, QUEUES.sendEmail, { dedupeKey }, { singletonKey: dedupeKey });
}

export interface SendDeps {
  db: Db; ring: Keyring; email: EmailAdapter; origin: string; supportEmail: string;
  /** Shown in operator alert subjects outside production, e.g. "staging". */
  envLabel?: string;
  /** L7: provider plan limits. Absent = no budget check (tests of unrelated behaviour). */
  limits?: BudgetLimits; onAlert?: (sentToday: number) => void; now?: () => Date;
}
const CLASS: Record<string, MailClass> = { delivery: "delivery", apology: "apology", apology_free: "apology", chart: "chart", admin_alert: "alert" };

/** Returns "sent" | "skipped" | "failed" | "deferred" (over the daily/monthly budget); throws to ask pg-boss for a retry. */
export async function sendQueuedEmail(deps: SendDeps, dedupeKey: string): Promise<"sent" | "skipped" | "failed" | "deferred"> {
  const [row] = await deps.db.update(emailOutbox).set({ status: "sending", attempts: sql`${emailOutbox.attempts} + 1` })
    .where(and(eq(emailOutbox.dedupeKey, dedupeKey), inArray(emailOutbox.status, ["pending", "sending"]))).returning();
  if (!row || !row.toEmailEnc) return "skipped";
  const to = decryptPrivate<string>(row.toEmailEnc, aad("email_outbox", row.id, "to_email"), deps.ring);

  let content;
  if (row.kind === "delivery") {
    const reading = row.orderId ? await deps.db.query.readings.findFirst({ where: eq(readings.orderId, row.orderId), columns: { id: true } }) : undefined;
    if (!reading) { await deps.db.update(emailOutbox).set({ status: "failed", lastError: "no_reading" }).where(eq(emailOutbox.id, row.id)); return "failed"; }
    content = deliveryEmail(`${deps.origin}/r/${reading.id}`, deps.supportEmail);
  } else if (row.kind === "chart") {
    if (!row.payloadEnc) { await deps.db.update(emailOutbox).set({ status: "failed", lastError: "no_payload" }).where(eq(emailOutbox.id, row.id)); return "failed"; }
    content = chartEmail(decryptPrivate(row.payloadEnc, aad("email_outbox", row.id, "payload"), deps.ring), deps.origin, deps.supportEmail);
  } else if (row.kind === "admin_alert") {
    if (!row.payloadEnc) { await deps.db.update(emailOutbox).set({ status: "failed", lastError: "no_payload" }).where(eq(emailOutbox.id, row.id)); return "failed"; }
    content = adminAlertEmail(decryptPrivate(row.payloadEnc, aad("email_outbox", row.id, "payload"), deps.ring), deps.origin, deps.envLabel);
  } else if (row.kind === "apology_free") {
    content = apologyFreeEmail(deps.supportEmail);
  } else {
    content = apologyEmail(deps.supportEmail);
  }

  if (deps.limits) {
    const now = deps.now?.() ?? new Date();
    const r = await reserveEmail(deps.db, CLASS[row.kind] ?? "marketing", deps.limits, now);
    if (!r.ok) {
      // Over the plan: keep it for the next budget window (the reading itself is always on the order page).
      await deps.db.update(emailOutbox).set({ status: "pending", attempts: sql`${emailOutbox.attempts} - 1`, lastError: `budget_${r.reason}`, nextAttemptAt: nextBudgetWindow(now) })
        .where(eq(emailOutbox.id, row.id));
      return "deferred";
    }
    if (r.alert) deps.onAlert?.(r.sentToday);
  }

  try {
    const res = await deps.email.send({ to, ...content, idempotencyKey: row.dedupeKey });
    await deps.db.update(emailOutbox).set({ status: "sent", providerMessageId: res.id, lastError: null }).where(eq(emailOutbox.id, row.id));
    return "sent";
  } catch (e) {
    const code = e instanceof EmailError ? e.code : "unknown";
    const permanent = e instanceof EmailError && e.permanent;
    if (permanent || row.attempts >= MAX_EMAIL_ATTEMPTS) {
      await deps.db.update(emailOutbox).set({ status: permanent ? "bounced" : "failed", lastError: code }).where(eq(emailOutbox.id, row.id));
      return "failed";
    }
    await deps.db.update(emailOutbox).set({ status: "pending", lastError: code, nextAttemptAt: new Date(Date.now() + 60_000) }).where(eq(emailOutbox.id, row.id));
    throw e;
  }
}

/** Cron: pending emails whose time has come (budget deferral, retry backoff) get their send job back. */
export async function requeueDueEmails(db: Db, boss: PgBoss, now = new Date()): Promise<number> {
  // Also "sending" rows left behind by a crashed worker (10+ min): the send job is exclusive per email and the
  // provider call is idempotent, so re-running is safe.
  const due = await db.select({ dedupeKey: emailOutbox.dedupeKey }).from(emailOutbox)
    .where(or(and(eq(emailOutbox.status, "pending"), lte(emailOutbox.nextAttemptAt, now)),
      and(eq(emailOutbox.status, "sending"), lte(emailOutbox.nextAttemptAt, new Date(now.getTime() - 10 * 60_000))))).limit(500);
  let n = 0;
  for (const d of due) {
    await db.transaction(async (tx) => {
      if (await enqueueInTx(boss, tx, QUEUES.sendEmail, { dedupeKey: d.dedupeKey }, { singletonKey: d.dedupeKey, duplicateExpected: true })) n++;
    });
  }
  return n;
}
