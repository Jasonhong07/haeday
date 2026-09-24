// Checkout Session reconciliation (ARCHITECTURE §4.10; CC1b F12). The safety net for "Stripe took the money but
// our webhook never arrived / was misconfigured / failed". Provider reads happen outside transactions; every
// transition goes through applyPaidSession — the same validation and transaction as the webhook.
//
// 1) reconcileOpenSessions (every 3 min): our open orders that already have a session → read that session.
// 2) reconcileStripeSessions (every 30 min): Stripe's completed sessions from a persistent cursor, in 6-hour windows,
//    with a 2-hour overlap (> the 60-min session life, clock-skew margin). An outage of any length is covered once
//    the job runs again. A session that keeps failing becomes an issue after 3 tries and stops holding the cursor.
import { and, asc, eq, isNotNull, lt } from "drizzle-orm";
import { orders, paymentIssues, settings } from "../db/schema";
import type { CheckoutDetails } from "./adapter";
import { openIssue } from "./issues";
import { applyPaidSession, type WebhookDeps } from "./webhook";

export const OPEN_CHECK_MIN_AGE_MS = 2 * 60_000;
export const OPEN_CHECK_BATCH = 200;
export const CURSOR_KEY = "reconcile_sessions_cursor";
export const CURSOR_OVERLAP_S = 2 * 3600;
export const CURSOR_BOOTSTRAP_S = 48 * 3600;
export const WINDOW_S = 6 * 3600;
export const MAX_SESSION_FAILURES = 3;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const source = (d: CheckoutDetails) => ({ eventId: `reconcile:${d.id}`, type: "reconcile.completed", livemode: d.livemode });

export async function reconcileOpenSessions(deps: WebhookDeps): Promise<{ checked: number; paid: number; expired: number }> {
  const now = deps.now?.() ?? new Date();
  const open = await deps.db.select({ id: orders.id, sessionId: orders.stripeSessionId }).from(orders)
    .where(and(eq(orders.paymentStatus, "open"), isNotNull(orders.stripeSessionId), lt(orders.updatedAt, new Date(now.getTime() - OPEN_CHECK_MIN_AGE_MS))))
    .orderBy(asc(orders.updatedAt)).limit(OPEN_CHECK_BATCH);
  let paid = 0; let expired = 0;
  for (const o of open) {
    try {
      const d = await deps.payments.getCheckoutDetails(o.sessionId!);
      if (d.status === "complete") {
        if ((await applyPaidSession(deps, d, source(d))).outcome === "paid") paid++;
      } else if (d.status === "expired") {
        const r = await deps.db.update(orders).set({ paymentStatus: "expired", updatedAt: now })
          .where(and(eq(orders.id, o.id), eq(orders.paymentStatus, "open"))).returning({ id: orders.id });
        expired += r.length;
      }
    } catch { /* next run */ } finally {
      // Always rotate, so failing or undecidable orders can never starve the batch.
      await deps.db.update(orders).set({ updatedAt: now }).where(and(eq(orders.id, o.id), eq(orders.paymentStatus, "open")));
    }
  }
  return { checked: open.length, paid, expired };
}

export async function reconcileStripeSessions(deps: WebhookDeps): Promise<{ scanned: number; paid: number; issues: number; cursor: number }> {
  const now = deps.now?.() ?? new Date();
  const nowS = Math.floor(now.getTime() / 1000);
  const [row] = await deps.db.select().from(settings).where(eq(settings.key, CURSOR_KEY));
  let cursor = typeof row?.value === "number" ? row.value : nowS - CURSOR_BOOTSTRAP_S;
  const mode = deps.paymentsMode === "live";
  let scanned = 0; let paid = 0; let issues = 0;

  // Oldest window first; stop at the first window that cannot be fully processed (the cursor stays before it).
  for (let from = Math.max(0, cursor - CURSOR_OVERLAP_S); from < nowS; from += WINDOW_S) {
    const until = Math.min(nowS + 1, from + WINDOW_S);
    let sessions;
    try {
      sessions = await deps.payments.listCompletedSessions(from, until);
    } catch {
      // Never silent: a list that keeps failing (outage, truncation) must be visible, the cursor stays put.
      await openIssue(deps.db, { kind: "reconcile_list_failed", objectId: `window:${from}`, livemode: mode, nextAction: "check_stripe_status_and_reconcile_job" });
      break;
    }
    let blocked = false;
    for (const s of sessions) {
      scanned++;
      if (s.livemode !== mode) continue;
      try {
        const ref = s.metadataOrderId ?? s.clientReferenceId;
        const [order] = ref && UUID_RE.test(ref) ? await deps.db.select({ status: orders.paymentStatus }).from(orders).where(eq(orders.id, ref)) : [];
        if (!order || order.status === "open" || order.status === "expired") {
          // Unknown/unlinked paid sessions become an `unlinked_paid_session` issue inside applyPaidSession (once:
          // the reconcile event id makes a second pass a no-op).
          const d = await deps.payments.getCheckoutDetails(s.id);
          const r = await applyPaidSession(deps, d, source(d));
          if (r.outcome === "paid") paid++;
          if (r.outcome === "rejected") issues++;
        }
      } catch {
        await openIssue(deps.db, { kind: "reconcile_session_failed", objectId: s.id, livemode: s.livemode, nextAction: "check_session_in_stripe_dashboard" });
        const [issue] = await deps.db.select({ n: paymentIssues.occurrences }).from(paymentIssues).where(eq(paymentIssues.dedupeKey, `reconcile_session_failed:${s.id}:${s.livemode ? "live" : "test"}`));
        if ((issue?.n ?? 0) < MAX_SESSION_FAILURES) { blocked = true; break; } // retry next run; after 3 the issue carries it
        issues++;
      }
    }
    if (blocked) break;
    cursor = Math.max(cursor, Math.min(until, nowS));
  }
  await deps.db.insert(settings).values({ key: CURSOR_KEY, value: cursor, updatedBy: "reconcile" })
    .onConflictDoUpdate({ target: settings.key, set: { value: cursor, updatedAt: now, updatedBy: "reconcile" } });
  return { scanned, paid, issues, cursor };
}
