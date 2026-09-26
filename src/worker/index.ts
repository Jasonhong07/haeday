// Worker process: pg-boss consumers + cron (ARCHITECTURE §4.4–4.10). Logs carry ids and codes only (CLAUDE.md rule 9).
import * as Sentry from "@sentry/nextjs";
import { getDb } from "../server/db/client";
import { settings } from "../server/db/schema";
import { emailAdapter, llmAdapter, paymentAdapter, paypalAdapter, supportEmail } from "../server/deps";
import { requeueDueEmails, sendQueuedEmail } from "../server/email/outbox";
import { getEnv } from "../server/env";
import { RetryGeneration, generateReading, releaseDeferred, sweepDeadlines } from "../server/fulfillment/generate";
import { capacityState } from "../server/fulfillment/capacity";
import { openIssue } from "../server/payments/issues";
import { sentryOptions } from "../server/observability/sentry";
import { executeRefund, reconcileRefunds, syncOrderRefunds } from "../server/payments/refunds";
import { reconcileOpenSessions, reconcileStripeSessions } from "../server/payments/reconcile";
import { QUEUES, createBoss, ensureQueues } from "../server/queue/boss";
import { runRetention } from "../server/retention";
import { purgeOldEvents } from "../server/analytics";
import { loadKeyring } from "../server/security/keyring";
import { checkAlerts, raiseAlert } from "../server/alerts";

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
  });

  // Private-data jobs need the keyring; without it the worker keeps its heartbeat but does not touch orders (fail closed).
  let ring;
  try { ring = loadKeyring(env); } catch { console.error("[worker] encryption keys unavailable: order jobs paused"); Sentry.captureMessage("Worker without encryption keys", "error"); }
  const payments = paymentAdapter(env);
  const paypal = paypalAdapter(env); // CC4c: captures, reconciliation and refunds of PayPal/Venmo orders

  if (ring && payments) {
    const deps = {
      db, ring, boss, payments, paypal, llm: llmAdapter(env),
      approvedSnippetsOnly: env.APP_ENV === "production", dailyCap: env.LLM_DAILY_CAP,
    };
    await boss.work<{ orderId: string }>(QUEUES.generateReading, async ([job]) => {
      if (!job) return;
      try {
        const outcome = await generateReading(deps, job.data.orderId);
        console.log(`[worker] generate order=${job.data.orderId} outcome=${outcome}`);
      } catch (e) {
        if (e instanceof RetryGeneration) console.warn(`[worker] generate order=${job.data.orderId} retry code=${e.code}`);
        else Sentry.captureException(e);
        throw e;
      }
    });
    await boss.schedule(QUEUES.deadlines, "* * * * *");
    await boss.work(QUEUES.deadlines, async () => {
      const r = await sweepDeadlines(deps);
      if (r.failed) Sentry.captureMessage(`Fulfillment deadline failures: ${r.failed}`, "error");
      if (r.slow) Sentry.captureMessage(`Paid orders undelivered after 5 minutes: ${r.slow}`, "warning");
      // D52: past 2× the daily AI cap new payments pause by themselves; make that visible to Jason.
      const cap = await capacityState(db, env.LLM_DAILY_CAP);
      if (cap.state === "paused") {
        await openIssue(db, { kind: "llm_capacity_paused", objectId: new Date().toISOString().slice(0, 10), livemode: env.PAYMENTS_MODE === "live", nextAction: `sales_paused_backlog_${cap.backlog}_raise_LLM_DAILY_CAP_or_wait` });
        Sentry.captureMessage(`New payments paused: AI backlog ${cap.backlog} ≥ 2× daily cap`, "warning");
      }
    });
    await boss.schedule(QUEUES.deferredGeneration, "* * * * *");
    await boss.work(QUEUES.deferredGeneration, async () => { await releaseDeferred(deps); });
    await boss.schedule(QUEUES.reconcileRefunds, "*/15 * * * *");
    await boss.work(QUEUES.reconcileRefunds, async () => { await reconcileRefunds({ db, payments, paypal }); });
    // CC1b F12: missed or failed checkout webhooks. Same validation/transaction as the webhook (applyPaidSession).
    if (env.STRIPE_PRICE_SAJU) {
      const wh = { db, ring, boss, payments, others: { paypal }, paymentsMode: env.PAYMENTS_MODE, priceId: env.STRIPE_PRICE_SAJU };
      const whPayPal = paypal ? { db, ring, boss, payments: paypal, others: { stripe: payments }, paymentsMode: env.PAYMENTS_MODE, priceId: "saju_reading" } : null;
      await boss.schedule(QUEUES.reconcileOpen, "*/3 * * * *");
      await boss.work(QUEUES.reconcileOpen, async () => {
        const r = await reconcileOpenSessions(wh);
        if (r.paid) Sentry.captureMessage(`Reconciliation unlocked ${r.paid} paid order(s) the webhook missed`, "warning");
        // CC4c: PayPal orders approved but never captured, captured but never recorded, or abandoned.
        const p = whPayPal ? await reconcileOpenSessions(whPayPal) : null;
        if (p?.paid) Sentry.captureMessage(`PayPal reconciliation unlocked ${p.paid} paid order(s)`, "warning");
      });
      await boss.schedule(QUEUES.reconcileSessions, "*/30 * * * *");
      await boss.work(QUEUES.reconcileSessions, async () => {
        const r = await reconcileStripeSessions(wh);
        if (r.paid || r.issues) Sentry.captureMessage(`Session reconciliation: paid=${r.paid} issues=${r.issues}`, "warning");
      });
    }
    // CC1a: provider calls for committed refund claims, and provider re-reads triggered by refund webhooks.
    await boss.work<{ refundId: string }>(QUEUES.refundExecute, async ([job]) => {
      if (!job) return;
      const status = await executeRefund({ db, payments, paypal }, job.data.refundId);
      if (status === "requested") throw new Error("refund lease busy"); // another executor holds it: retry later
    });
    await boss.work<{ orderId: string }>(QUEUES.refundSync, async ([job]) => {
      if (!job) return;
      const r = await syncOrderRefunds({ db, payments, paypal }, job.data.orderId);
      if (r === "busy") throw new Error("refund sync busy"); // the holder saw `dirty` or will; retry keeps it certain
    });
  } else {
    console.warn("[worker] payments or keys not configured: generation, deadlines and refunds are idle");
  }

  const mail = emailAdapter(env);
  if (ring && mail) {
    const send = {
      db, ring, email: mail, origin: new URL(env.APP_ORIGIN).origin, supportEmail: supportEmail(env),
      limits: { daily: env.EMAIL_DAILY_LIMIT, monthly: env.EMAIL_MONTHLY_LIMIT, alertAt: env.EMAIL_ALERT_AT },
      envLabel: env.APP_ENV,
      onAlert: (n: number) => {
        Sentry.captureMessage(`Email volume reached ${n} today (plan limit ${env.EMAIL_DAILY_LIMIT}): upgrade the email plan`, "warning");
        void raiseAlert({ db, boss, ring: ring!, adminEmails: env.ADMIN_EMAILS }, { kind: "email_volume", subjects: ["daily"], daily: true, summary: () => `Emails sent today reached ${n} (plan limit ${env.EMAIL_DAILY_LIMIT}). Lower-priority mail stops first; upgrade the email plan if this repeats.` })
          .catch((e) => Sentry.captureException(e));
      },
    };
    await boss.schedule(QUEUES.emailDue, "*/5 * * * *");
    await boss.work(QUEUES.emailDue, async () => { await requeueDueEmails(db, boss); });
    await boss.work<{ dedupeKey: string }>(QUEUES.sendEmail, async ([job]) => {
      if (!job) return;
      const r = await sendQueuedEmail(send, job.data.dedupeKey);
      if (r === "failed") Sentry.captureMessage("Email permanently failed", "warning");
    });
  }

  // CC4a: operator alerts (email to ADMIN_EMAILS once a day per problem, plus Sentry).
  if (ring) {
    const alertDeps = { db, boss, ring, adminEmails: env.ADMIN_EMAILS };
    if (!env.ADMIN_EMAILS.length) console.warn("[worker] ADMIN_EMAILS empty: alerts are recorded on /admin only");
    await boss.schedule(QUEUES.alerts, "*/5 * * * *");
    await boss.work(QUEUES.alerts, async () => {
      const raised = await checkAlerts(alertDeps);
      for (const k of raised) Sentry.captureMessage(`Operator alert raised: ${k}`, "warning");
    });
  }

  await boss.schedule(QUEUES.retention, "17 9 * * *"); // daily 09:17 UTC
  await boss.work(QUEUES.retention, async () => {
    const r = await runRetention(db);
    await purgeOldEvents(db); // D40 first-party funnel events: kept 400 days
    console.log(`[worker] retention ${JSON.stringify(r)}`);
  });

  console.log("[worker] started");
  const stop = async () => { await boss.stop({ graceful: true }); process.exit(0); };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

main().catch((err) => { console.error(`[worker] failed to start ${errorCode(err)}`); process.exit(1); });
