// CC4a: operator alerts by email (Jason 2026-09-26: "the app emails me directly, and Sentry too").
// Every alert is deduplicated per kind + subject + UTC day in admin_alerts, so a lasting problem mails once a day.
// Alert emails go through the normal outbox (idempotent sends, retries, budget class "alert" = never starved by
// customer mail). Summaries carry counts, short order ids and codes only: no birth data, emails or reading text.
import { and, desc, eq, gte, inArray, lt, notInArray, or } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { Db } from "./db/client";
import { adminAlerts, disputes, emailOutbox, orders, paymentIssues } from "./db/schema";
import { QUEUES, enqueueInTx } from "./queue/boss";
import { encryptPrivate, type Keyring } from "./security/encryption";
import { aad } from "./security/keyring";

export type AlertKind = "payment_issue" | "late_delivery" | "dispute" | "email_failed" | "email_volume";
export interface AlertDeps { db: Db; boss: PgBoss; ring: Keyring; adminEmails: string[]; now?: () => Date }

/** Minutes after payment when an "about a minute" order that is still not delivered becomes an alert. */
export const LATE_MINUTES = 10;

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Records each subject once (per UTC day when `daily`, else once ever) and, if any subject is new, queues ONE email
 * per admin describing the new ones. So order B going late after order A was mailed at 09:00 still gets its own
 * email, while a problem that lasts is repeated at most once a day. Without ADMIN_EMAILS the alert is recorded
 * under a separate key, so setting the list later the same day still mails it.
 */
export async function raiseAlert(deps: AlertDeps, a: { kind: AlertKind; subjects: string[]; daily: boolean; summary: (fresh: string[]) => string }): Promise<boolean> {
  const now = deps.now?.() ?? new Date();
  const suffix = `${a.daily ? `:${day(now)}` : ""}${deps.adminEmails.length ? "" : ":no-recipients"}`;
  return deps.db.transaction(async (tx) => {
    const fresh: string[] = [];
    let firstId: string | null = null;
    const summaryFor = (subjects: string[]) => a.summary(subjects).slice(0, 1000);
    for (const subject of [...new Set(a.subjects)].sort()) {
      const [row] = await tx.insert(adminAlerts).values({ dedupeKey: `${a.kind}:${subject}${suffix}`, kind: a.kind, summary: summaryFor([subject]), createdAt: now })
        .onConflictDoNothing().returning({ id: adminAlerts.id });
      if (row) { fresh.push(subject); firstId ??= row.id; }
    }
    if (!fresh.length || !firstId) return false;
    const summary = summaryFor(fresh);
    for (const [i, to] of deps.adminEmails.entries()) {
      const id = crypto.randomUUID();
      const key = `alert:${firstId}:${i}`;
      await tx.insert(emailOutbox).values({
        id, kind: "admin_alert", orderId: null, dedupeKey: key,
        toEmailEnc: encryptPrivate(to, aad("email_outbox", id, "to_email"), deps.ring),
        payloadEnc: encryptPrivate({ kind: a.kind, summary }, aad("email_outbox", id, "payload"), deps.ring),
      });
      await enqueueInTx(deps.boss, tx, QUEUES.sendEmail, { dedupeKey: key }, { singletonKey: key });
    }
    return true;
  });
}

/** Dispute statuses that are over (shared with the dashboard so both agree on what "open" means). */
export const CLOSED_DISPUTE_STATUSES = ["won", "lost", "warning_closed", "prevented"] as const;

const short = (id: string | null) => (id ? id.slice(0, 8) : "none");

/** Every 5 minutes (worker): looks at the database and raises what a person must act on. */
export async function checkAlerts(deps: AlertDeps): Promise<AlertKind[]> {
  const now = deps.now?.() ?? new Date();
  const raised: AlertKind[] = [];

  // 1) Payment issues nobody has looked at yet (acknowledged/resolved ones are not re-mailed). One subject per issue.
  const issues = await deps.db.select({ id: paymentIssues.id, kind: paymentIssues.kind, next: paymentIssues.nextAction, order: paymentIssues.orderId })
    .from(paymentIssues).where(eq(paymentIssues.status, "open")).orderBy(paymentIssues.createdAt).limit(50);
  if (issues.length) {
    const byId = new Map(issues.map((i) => [i.id, i]));
    if (await raiseAlert(deps, { kind: "payment_issue", subjects: issues.map((i) => i.id), daily: true, summary: (ids) =>
      `${ids.length} open payment issue(s): ${ids.map((id) => { const i = byId.get(id)!; return `${i.kind} (next: ${i.next}, order ${short(i.order)})`; }).join("; ")}. Mark them "Seen" on /admin to stop reminders.` })) raised.push("payment_issue");
  }

  // 2) Paid but not delivered: past the deadline, or an "about a minute" order still waiting after LATE_MINUTES.
  const lateCut = new Date(now.getTime() - LATE_MINUTES * 60_000);
  const late = await deps.db.select({ id: orders.id }).from(orders).where(and(
    eq(orders.paymentStatus, "paid"), inArray(orders.fulfillmentStatus, ["queued", "generating", "failed"]),
    or(lt(orders.fulfillmentDeadlineAt, now), and(eq(orders.deliveryPromise, "minutes"), lt(orders.paidAt, lateCut))),
  )).orderBy(orders.paidAt).limit(20);
  if (late.length && await raiseAlert(deps, { kind: "late_delivery", subjects: late.map((o) => o.id), daily: true,
    summary: (ids) => `${ids.length} paid order(s) not delivered in time: ${ids.map(short).join(", ")}. Open /admin to retry or refund.` })) raised.push("late_delivery");

  // 3) Open disputes (daily while open: evidence has a due date).
  const open = await deps.db.select({ id: disputes.id, due: disputes.evidenceDueBy, order: disputes.orderId }).from(disputes)
    .where(notInArray(disputes.status, [...CLOSED_DISPUTE_STATUSES])).orderBy(desc(disputes.createdAt)).limit(20);
  if (open.length) {
    const byId = new Map(open.map((d) => [d.id, d]));
    if (await raiseAlert(deps, { kind: "dispute", subjects: open.map((d) => d.id), daily: true, summary: (ids) =>
      `${ids.length} open dispute(s): ${ids.map((id) => { const d = byId.get(id)!; return `order ${short(d.order)}, evidence due ${d.due ? d.due.toISOString().slice(0, 10) : "unknown"}`; }).join("; ")}. Answer in the payment provider's dashboard.` })) raised.push("dispute");
  }

  // 4) Customer emails that permanently failed in the last 3 days: each failure is mailed once (not a reminder).
  const failed = await deps.db.select({ id: emailOutbox.id, order: emailOutbox.orderId }).from(emailOutbox).where(and(
    inArray(emailOutbox.kind, ["delivery", "apology", "apology_free"]), inArray(emailOutbox.status, ["failed", "bounced"]),
    gte(emailOutbox.createdAt, new Date(now.getTime() - 3 * 86_400_000)),
  )).limit(50);
  if (failed.length) {
    const byId = new Map(failed.map((f) => [f.id, f]));
    if (await raiseAlert(deps, { kind: "email_failed", subjects: failed.map((f) => f.id), daily: false, summary: (ids) =>
      `${ids.length} customer email(s) failed or bounced (orders ${ids.map((id) => short(byId.get(id)!.order)).join(", ")}). Customers can still open readings from the order page or by signing in; check the order page on /admin (a bounce usually means a mistyped address, so reply to the customer if they write in).` })) raised.push("email_failed");
  }

  return raised;
}

export async function recentAlerts(db: Db, limit = 10) {
  return db.select({ kind: adminAlerts.kind, summary: adminAlerts.summary, at: adminAlerts.createdAt }).from(adminAlerts).orderBy(desc(adminAlerts.createdAt)).limit(limit);
}
