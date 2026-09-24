// Email outbox (ARCHITECTURE §4.5): rows are written in the same transaction as the business change and a job is
// enqueued in that transaction; the worker sends with idempotency key = dedupe key. Email failures never trigger
// regeneration or refunds.
import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { Db } from "../db/client";
import { emailOutbox, readings } from "../db/schema";
import { QUEUES, enqueueInTx } from "../queue/boss";
import { decryptPrivate, encryptPrivate, type Keyring } from "../security/encryption";
import { aad } from "../security/keyring";
import { EmailError, type EmailAdapter } from "../adapters/email";
import { apologyEmail, deliveryEmail } from "./templates";

export type EmailKind = "delivery" | "apology";
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

export interface SendDeps { db: Db; ring: Keyring; email: EmailAdapter; origin: string; supportEmail: string }

/** Returns "sent" | "skipped" | "failed"; throws to ask pg-boss for a retry. */
export async function sendQueuedEmail(deps: SendDeps, dedupeKey: string): Promise<"sent" | "skipped" | "failed"> {
  const [row] = await deps.db.update(emailOutbox).set({ status: "sending", attempts: sql`${emailOutbox.attempts} + 1` })
    .where(and(eq(emailOutbox.dedupeKey, dedupeKey), inArray(emailOutbox.status, ["pending", "sending"]))).returning();
  if (!row || !row.toEmailEnc) return "skipped";
  const to = decryptPrivate<string>(row.toEmailEnc, aad("email_outbox", row.id, "to_email"), deps.ring);

  let content;
  if (row.kind === "delivery") {
    const reading = row.orderId ? await deps.db.query.readings.findFirst({ where: eq(readings.orderId, row.orderId), columns: { id: true } }) : undefined;
    if (!reading) { await deps.db.update(emailOutbox).set({ status: "failed", lastError: "no_reading" }).where(eq(emailOutbox.id, row.id)); return "failed"; }
    content = deliveryEmail(`${deps.origin}/r/${reading.id}`, deps.supportEmail);
  } else {
    content = apologyEmail(deps.supportEmail);
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
