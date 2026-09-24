// The single refund service (ARCHITECTURE §4.8, D15, CLAUDE.md rule 8; redesigned in CC1a, docs/review/PROPOSAL_V2_CODEX.md F1–F3/F6/F9).
//
// 1) claimRefundInTx: inside the CALLER's transaction: lock the order, check eligibility, insert the one claim,
//    mark the order refund_pending and enqueue `refund.execute`. Failure + refund intent therefore commit together.
// 2) executeRefund: take a short DB lease on the claim, call the provider OUTSIDE any transaction with a stable
//    idempotency key, save the answer only while the lease is still ours. Never re-creates a refund blindly
//    after the idempotency window: it looks the refund up instead.
// 3) syncOrderRefunds: the provider's refund list is the source of truth for the order status. A per-order lease
//    makes sure an older fetch can never overwrite a newer one; events that arrive meanwhile set `dirty`.
import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, isNull, lt, ne, notInArray, or, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { Db } from "../db/client";
import { disputes, orders, refundSyncs, refunds } from "../db/schema";
import { QUEUES, enqueueInTx } from "../queue/boss";
import type { PaymentAdapter, PaymentRefundSummary, RefundStatus } from "./adapter";
import { openIssue } from "./issues";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type RefundReason = "service_failure" | "goodwill" | "duplicate" | "admin" | "validation_failure";
export type RequestedBy = "customer" | "admin" | "worker" | "deadline_cron" | "webhook";
// Jason 2026-09-24: one goodwill refund per customer (email) per rolling 12 months.
export const GOODWILL_RESET_DAYS = 365;
export const GOODWILL_DAYS = 7;
export const LEASE_MS = 120_000;
/** Stripe keeps idempotency keys for at least 24 h; after this we look a refund up instead of re-sending. */
export const IDEMPOTENCY_SAFE_MS = 23 * 3_600_000;
/** Pending/requires_action refunds older than this are re-read from the provider by reconciliation. */
export const PENDING_RECHECK_MS = 3_600_000;

const CLAIM_ACTIVE = ["requested", "pending", "requires_action", "unknown", "succeeded"] as const; // matches the partial unique index
const NOT_AT_PROVIDER = ["requested", "unknown"] as const;
const HOLDS_MONEY: readonly RefundStatus[] = ["pending", "requires_action", "succeeded"];
const CLOSED_DISPUTE = ["won", "lost", "warning_closed", "prevented"];

export interface RefundDeps {
  db: Db; payments: PaymentAdapter; boss: PgBoss; now?: () => Date;
  /** Test hook: runs at the start of the goodwill transaction, before any lock (forces a real race). */
  hooks?: { goodwillStart?: () => Promise<void> };
}

export type ClaimError = "not_found" | "not_paid" | "already_refunded" | "in_progress" | "outside_window" | "goodwill_used" | "disputed" | "nothing_to_refund";
export type RefundOutcome =
  | { ok: true; status: RefundStatus | "unknown" | "requested"; refundId: string }
  | { ok: false; error: ClaimError };

const isUniqueViolation = (err: unknown): boolean => {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
};

async function openDisputeFor(tx: Db | Tx, orderId: string): Promise<boolean> {
  const [d] = await tx.select({ id: disputes.id }).from(disputes).where(and(eq(disputes.orderId, orderId), notInArray(disputes.status, CLOSED_DISPUTE))).limit(1);
  return Boolean(d);
}

/**
 * Claim inside the caller's transaction. The caller must already hold the goodwill advisory lock for goodwill claims.
 * `amountCents` defaults to what is still refundable (total minus refunds that hold money, from any source).
 */
export async function claimRefundInTx(
  tx: Tx, boss: PgBoss,
  input: { orderId: string; reason: RefundReason; requestedBy: RequestedBy; now: Date; livemode: boolean; amountCents?: number },
): Promise<{ ok: true; refundId: string } | { ok: false; error: ClaimError }> {
  const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("update");
  if (!order) return { ok: false, error: "not_found" };
  const rows = await tx.select().from(refunds).where(eq(refunds.orderId, order.id));
  const active = rows.find((r) => r.source === "service" && (CLAIM_ACTIVE as readonly string[]).includes(r.status));
  if (active) return { ok: false, error: active.status === "succeeded" ? "already_refunded" : "in_progress" };
  if (order.paymentStatus === "refunded") return { ok: false, error: "already_refunded" };
  if (!["paid", "partially_refunded"].includes(order.paymentStatus) || !order.stripePaymentIntentId) return { ok: false, error: "not_paid" };
  if (await openDisputeFor(tx, order.id)) {
    await openIssue(tx, { kind: "refund_blocked_dispute", objectId: order.stripePaymentIntentId, livemode: input.livemode, orderId: order.id, nextAction: "answer_dispute_no_refund" });
    return { ok: false, error: "disputed" };
  }
  if (input.reason === "goodwill") {
    if (!order.paidAt || input.now.getTime() - order.paidAt.getTime() > GOODWILL_DAYS * 86_400_000) return { ok: false, error: "outside_window" };
    if (order.deliveryEmailLookup) {
      const [used] = await tx.select({ n: sql<number>`count(*)::int` }).from(refunds).innerJoin(orders, eq(refunds.orderId, orders.id))
        .where(and(eq(orders.deliveryEmailLookup, order.deliveryEmailLookup), eq(refunds.reason, "goodwill"), ne(refunds.orderId, order.id),
          inArray(refunds.status, [...CLAIM_ACTIVE]), gt(refunds.createdAt, new Date(input.now.getTime() - GOODWILL_RESET_DAYS * 86_400_000))));
      if ((used?.n ?? 0) > 0) return { ok: false, error: "goodwill_used" };
    }
  }
  const total = order.totalCents ?? order.unitAmountCents;
  const held = rows.filter((r) => HOLDS_MONEY.includes(r.status as RefundStatus)).reduce((a, r) => a + r.amountCents, 0);
  const amount = Math.min(input.amountCents ?? total, total - held);
  if (amount <= 0) return { ok: false, error: "nothing_to_refund" };
  const attemptNo = rows.filter((r) => r.source === "service").length + 1;

  // Savepoint: a concurrent claim hitting the unique index must not abort the caller's transaction.
  const row = await tx.transaction(async (sp) => {
    const [r] = await sp.insert(refunds).values({
      orderId: order.id, source: "service", reason: input.reason, idempotencyKey: `refund:${order.id}:${attemptNo}`,
      amountCents: amount, status: "requested", requestedBy: input.requestedBy, attemptNo,
    }).returning();
    return r;
  }).catch((err: unknown) => { if (isUniqueViolation(err)) return null; throw err; });
  if (!row) return { ok: false, error: "in_progress" };
  // A refunded order must not still be delivered, and a later refund failure must not put it back into the
  // automatic generate/sweep path (which would open a new claim on its own): stop fulfillment with the claim.
  const stopFulfillment = order.fulfillmentStatus === "queued" || order.fulfillmentStatus === "generating";
  await tx.update(orders).set({
    paymentStatus: "refund_pending", updatedAt: input.now,
    ...(stopFulfillment ? { fulfillmentStatus: "failed" as const, currentFencingToken: null } : {}),
  }).where(eq(orders.id, order.id));
  await enqueueInTx(boss, tx, QUEUES.refundExecute, { refundId: row.id }, { singletonKey: row.id });
  return { ok: true, refundId: row.id };
}

/** Customer, admin and worker entry point: claim (one transaction), then try the provider call right away. */
export async function requestRefund(deps: RefundDeps, input: { orderId: string; reason: RefundReason; requestedBy: RequestedBy }): Promise<RefundOutcome> {
  const now = deps.now?.() ?? new Date();
  let lookup: string | null = null;
  if (input.reason === "goodwill") {
    const [o] = await deps.db.select({ lookup: orders.deliveryEmailLookup }).from(orders).where(eq(orders.id, input.orderId));
    lookup = o?.lookup ?? null;
  }
  const claim = await deps.db.transaction(async (tx) => {
    if (input.reason === "goodwill") {
      await deps.hooks?.goodwillStart?.();
      // Lock order: email lock first, then the order row (claimRefundInTx). Every goodwill path uses this order.
      if (lookup) await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`goodwill:${lookup}`}, 0))`);
    }
    return claimRefundInTx(tx, deps.boss, { ...input, now, livemode: deps.payments.livemode });
  }).catch((err: unknown) => { if (isUniqueViolation(err)) return { ok: false as const, error: "in_progress" as const }; throw err; });
  if (!claim.ok) return claim;
  const status = await executeRefund(deps, claim.refundId).catch(() => "requested" as const); // the queued job retries
  return { ok: true, status, refundId: claim.refundId };
}

/**
 * One provider attempt for one claim. Safe to run from the web request, the queue and reconciliation at the
 * same time: the lease lets one executor call the provider, and the idempotency key makes a repeated call
 * return the same refund.
 */
export async function executeRefund(deps: Pick<RefundDeps, "db" | "payments" | "now">, refundId: string): Promise<RefundStatus | "unknown" | "requested"> {
  const now = deps.now?.() ?? new Date();
  const token = randomUUID();
  const taken = await deps.db.transaction(async (tx) => {
    const [row] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).for("update");
    if (!row) return null;
    if (!(NOT_AT_PROVIDER as readonly string[]).includes(row.status)) return { row, skip: true as const };
    if (row.leaseToken && row.leaseExpiresAt && row.leaseExpiresAt > now) return { row, skip: true as const };
    const [order] = await tx.select().from(orders).where(eq(orders.id, row.orderId));
    if (!order?.stripePaymentIntentId) return { row, skip: true as const };
    if (await openDisputeFor(tx, order.id)) {
      await openIssue(tx, { kind: "refund_blocked_dispute", objectId: order.stripePaymentIntentId, livemode: deps.payments.livemode, orderId: order.id, nextAction: "answer_dispute_no_refund" });
      return { row, skip: true as const };
    }
    // Past the idempotency window (measured from the FIRST provider call) we look up instead of sending.
    const expired = row.firstSentAt !== null && now.getTime() - row.firstSentAt.getTime() > IDEMPOTENCY_SAFE_MS;
    await tx.update(refunds).set({ leaseToken: token, leaseExpiresAt: new Date(now.getTime() + LEASE_MS), ...(row.firstSentAt || expired ? {} : { firstSentAt: now }) }).where(eq(refunds.id, row.id));
    return { row, skip: false as const, paymentIntentId: order.stripePaymentIntentId, expired };
  });
  if (!taken) return "unknown";
  if (taken.skip) return taken.row.status;
  const { row } = taken;

  // Past the idempotency window a repeated create could make a SECOND refund: look it up instead.
  if (taken.expired) {
    await releaseLease(deps.db, row.id, token);
    const synced = await syncOrderRefunds(deps, row.orderId);
    const [after] = await deps.db.select().from(refunds).where(eq(refunds.id, row.id));
    if (synced === "synced" && after && !after.stripeRefundId && (NOT_AT_PROVIDER as readonly string[]).includes(after.status)) {
      // The provider's full refund list for this payment has no refund carrying our row id: it was never created.
      // Close the attempt (frees the one-claim index for a deliberate new attempt) and keep the obligation visible.
      await deps.db.update(refunds).set({ status: "failed", failureReason: "never_created", updatedAt: now })
        .where(and(eq(refunds.id, row.id), inArray(refunds.status, [...NOT_AT_PROVIDER]), isNull(refunds.stripeRefundId)));
      await openIssue(deps.db, { kind: "refund_unknown_stale", objectId: row.id, livemode: deps.payments.livemode, orderId: row.orderId, nextAction: "never_created_start_new_refund" });
      await syncOrderRefunds(deps, row.orderId);
      return "failed";
    }
    return after?.status ?? "unknown";
  }

  let result: { id: string; status: RefundStatus } | null = null;
  try {
    result = await deps.payments.createRefund({ paymentIntentId: taken.paymentIntentId, amountCents: row.amountCents, idempotencyKey: row.idempotencyKey, orderId: row.orderId, refundRowId: row.id });
  } catch { /* network or provider error: outcome unknown, looked up later with the same key */ }

  await deps.db.transaction(async (tx) => {
    const [cur] = await tx.select().from(refunds).where(eq(refunds.id, row.id)).for("update");
    if (!cur || cur.leaseToken !== token) return; // lease lost: a newer executor owns the row
    const set: Partial<typeof refunds.$inferInsert> = { leaseToken: null, leaseExpiresAt: null, lastCheckedAt: now, updatedAt: now };
    if (result) {
      if (!cur.stripeRefundId) set.stripeRefundId = result.id;
      // A sync may already have stored a newer provider status; only fill in while we are still "not at provider".
      if ((NOT_AT_PROVIDER as readonly string[]).includes(cur.status)) {
        set.status = result.status;
        // This save IS the transition to a failed state (the sync will then see "failed" already): open it here.
        if (result.status === "failed" || result.status === "canceled") {
          await openIssue(tx, { kind: "refund_failed", objectId: result.id, livemode: deps.payments.livemode, orderId: row.orderId, nextAction: "contact_customer_then_new_refund" });
        }
      }
    } else if (cur.status === "requested") {
      set.status = "unknown";
    }
    await tx.update(refunds).set(set).where(eq(refunds.id, row.id));
  }).catch(async (err: unknown) => {
    if (!isUniqueViolation(err) || !result) throw err;
    // A provider row already holds this refund id (recorded without our metadata). It is the same refund:
    // drop the duplicate record and store the id on our claim, under the same lease check.
    await deps.db.transaction(async (tx) => {
      const [cur] = await tx.select().from(refunds).where(eq(refunds.id, row.id)).for("update");
      if (!cur || cur.leaseToken !== token) return;
      await tx.delete(refunds).where(and(eq(refunds.stripeRefundId, result!.id), eq(refunds.source, "provider"), eq(refunds.orderId, row.orderId)));
      await tx.update(refunds).set({ stripeRefundId: result!.id, status: result!.status, leaseToken: null, leaseExpiresAt: null, lastCheckedAt: now, updatedAt: now }).where(eq(refunds.id, row.id));
    });
  });
  if (result) await syncOrderRefunds(deps, row.orderId).catch(() => undefined); // order status from provider truth
  const [final] = await deps.db.select({ status: refunds.status }).from(refunds).where(eq(refunds.id, row.id));
  return final?.status ?? "unknown";
}

async function releaseLease(db: Db, refundId: string, token: string): Promise<void> {
  await db.update(refunds).set({ leaseToken: null, leaseExpiresAt: null }).where(and(eq(refunds.id, refundId), eq(refunds.leaseToken, token)));
}

export type SyncOutcome = "synced" | "busy" | "stale" | "no_payment";

/** Re-read every provider refund of this order's payment and derive the order's refund state from it. */
export async function syncOrderRefunds(deps: Pick<RefundDeps, "db" | "payments" | "now">, orderId: string): Promise<SyncOutcome> {
  for (let round = 0; round < 3; round++) {
    const now = deps.now?.() ?? new Date();
    const token = randomUUID();
    const acquired = await deps.db.insert(refundSyncs).values({ orderId, leaseToken: token, leaseExpiresAt: new Date(now.getTime() + LEASE_MS), dirty: false })
      .onConflictDoUpdate({
        target: refundSyncs.orderId,
        set: { leaseToken: token, leaseExpiresAt: new Date(now.getTime() + LEASE_MS), dirty: false },
        setWhere: or(isNull(refundSyncs.leaseExpiresAt), lt(refundSyncs.leaseExpiresAt, now)),
      }).returning({ orderId: refundSyncs.orderId });
    if (acquired.length === 0) {
      // Someone is fetching right now: ask them to fetch once more after saving.
      await deps.db.update(refundSyncs).set({ dirty: true }).where(eq(refundSyncs.orderId, orderId));
      return "busy";
    }
    const [order] = await deps.db.select({ pi: orders.stripePaymentIntentId }).from(orders).where(eq(orders.id, orderId));
    if (!order?.pi) { await releaseSync(deps.db, orderId, token, now); return "no_payment"; }

    let summary: PaymentRefundSummary;
    try {
      summary = await deps.payments.getRefundSummary(order.pi);
    } catch (err) {
      await releaseSync(deps.db, orderId, token, null);
      throw err;
    }
    let outcome: "synced" | "stale" | "dirty";
    try {
      outcome = await applySummary(deps, orderId, token, summary);
    } catch (err) {
      await releaseSync(deps.db, orderId, token, null); // e.g. deadlock victim: never leave the lease behind
      throw err;
    }
    if (outcome !== "dirty") return outcome;
  }
  return "busy";
}

async function releaseSync(db: Db, orderId: string, token: string, syncedAt: Date | null): Promise<void> {
  // On failure (syncedAt null) the read did not happen: put `dirty` back so reconciliation still finds the order.
  await db.update(refundSyncs).set({ leaseToken: null, leaseExpiresAt: null, ...(syncedAt ? { lastSyncedAt: syncedAt } : { dirty: true }) })
    .where(and(eq(refundSyncs.orderId, orderId), eq(refundSyncs.leaseToken, token)));
}

async function applySummary(deps: Pick<RefundDeps, "db" | "now">, orderId: string, token: string, summary: PaymentRefundSummary): Promise<"synced" | "stale" | "dirty"> {
  const now = deps.now?.() ?? new Date();
  return deps.db.transaction(async (tx) => {
    // Lock order: order row first, then refund_syncs — the same order as the webhook path (no deadlock).
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    const [lease] = await tx.select().from(refundSyncs).where(and(eq(refundSyncs.orderId, orderId), eq(refundSyncs.leaseToken, token), gt(refundSyncs.leaseExpiresAt, now))).for("update");
    if (!lease) return "stale" as const; // lease expired and was taken over: this fetch is older, discard it
    if (!order || order.stripePaymentIntentId !== summary.paymentIntentId) return "stale" as const;
    const rows = await tx.select().from(refunds).where(eq(refunds.orderId, orderId));

    for (const pr of summary.refunds) {
      if (pr.currency !== order.currency) {
        await openIssue(tx, { kind: "refund_amount_mismatch", objectId: pr.id, livemode: summary.livemode, orderId, nextAction: "currency_mismatch_review" });
        continue;
      }
      // Our row: by provider id, else by the row id we put in metadata — only if that row belongs to THIS order.
      const mine = rows.find((r) => r.stripeRefundId === pr.id)
        ?? (pr.refundRowId ? rows.find((r) => r.id === pr.refundRowId && r.source === "service" && !r.stripeRefundId) : undefined);
      const endedNow = (pr.status === "failed" || pr.status === "canceled") && (!mine || (mine.status !== "failed" && mine.status !== "canceled"));
      if (endedNow) { // ours, or a dashboard refund that bounced: either way a person must look
        // Our refund failed (or money came back after "succeeded", e.g. closed card): the customer is still owed
        // it. Opened once, on the transition, so a person's "resolved" is not undone by later syncs.
        await openIssue(tx, { kind: "refund_failed", objectId: pr.id, livemode: summary.livemode, orderId, nextAction: "contact_customer_then_new_refund" });
      }
      if (mine) {
        await tx.update(refunds).set({ stripeRefundId: pr.id, status: pr.status, failureReason: pr.failureReason, lastCheckedAt: now, updatedAt: now }).where(eq(refunds.id, mine.id));
        mine.stripeRefundId = pr.id; mine.status = pr.status;
      } else {
        // Created outside the app (Stripe dashboard): recorded, never blocked by the one-claim rule (D22).
        const [ins] = await tx.insert(refunds).values({
          orderId, source: "provider", reason: "admin", idempotencyKey: `provider:${pr.id}`, amountCents: pr.amountCents,
          stripeRefundId: pr.id, status: pr.status, failureReason: pr.failureReason, requestedBy: "stripe_dashboard", lastCheckedAt: now,
        }).onConflictDoNothing().returning();
        if (ins) rows.push(ins);
      }
    }

    const holding = summary.refunds.filter((r) => r.currency === order.currency && r.status !== "failed" && r.status !== "canceled");
    if (holding.reduce((a, r) => a + r.amountCents, 0) !== summary.amountRefundedCents) {
      await openIssue(tx, { kind: "refund_amount_mismatch", objectId: summary.paymentIntentId, livemode: summary.livemode, orderId, nextAction: "compare_charge_and_refund_list" });
    }
    const succeeded = holding.filter((r) => r.status === "succeeded").reduce((a, r) => a + r.amountCents, 0);
    const inFlight = holding.some((r) => r.status === "pending" || r.status === "requires_action")
      || rows.some((r) => r.source === "service" && (NOT_AT_PROVIDER as readonly string[]).includes(r.status));
    const total = order.totalCents ?? order.unitAmountCents;
    const next = succeeded >= total ? "refunded" : inFlight ? "refund_pending" : succeeded > 0 ? "partially_refunded" : "paid";
    // A refund that failed returns the order to "paid" as a PAYMENT fact only: fulfillment is untouched, and the
    // open refund_failed issue carries the obligation (no regeneration, no automatic retry).
    await tx.update(orders).set({ paymentStatus: next, updatedAt: now })
      .where(and(eq(orders.id, orderId), inArray(orders.paymentStatus, ["paid", "refund_pending", "partially_refunded", "refunded"]), ne(orders.paymentStatus, next)));

    const again = lease.dirty;
    await tx.update(refundSyncs).set({ leaseToken: null, leaseExpiresAt: null, dirty: false, lastSyncedAt: now }).where(eq(refundSyncs.orderId, orderId));
    return again ? "dirty" as const : "synced" as const;
  });
}

/** Called by refund webhooks (in their transaction): mark the order for a provider re-read and queue it. */
export async function markRefundSyncInTx(tx: Tx, boss: PgBoss, orderId: string): Promise<void> {
  await tx.insert(refundSyncs).values({ orderId, dirty: true }).onConflictDoUpdate({ target: refundSyncs.orderId, set: { dirty: true } });
  await enqueueInTx(boss, tx, QUEUES.refundSync, { orderId }, { singletonKey: orderId, duplicateExpected: true });
}

/**
 * Cron: finish claims that never reached the provider (crash, network) and re-read long-pending refunds.
 * It never creates a new provider attempt on its own: a confirmed failure is an issue for a person.
 */
export async function reconcileRefunds(deps: Pick<RefundDeps, "db" | "payments" | "now">): Promise<number> {
  const now = deps.now?.() ?? new Date();
  let touched = 0;
  const notSent = await deps.db.select({ id: refunds.id }).from(refunds)
    .where(and(eq(refunds.source, "service"), inArray(refunds.status, [...NOT_AT_PROVIDER]), or(isNull(refunds.leaseExpiresAt), lt(refunds.leaseExpiresAt, now))));
  for (const r of notSent) {
    try { await executeRefund(deps, r.id); touched++; } catch { /* next run */ }
  }
  const stale = new Date(now.getTime() - PENDING_RECHECK_MS);
  const pending = await deps.db.selectDistinct({ orderId: refunds.orderId }).from(refunds)
    .where(and(inArray(refunds.status, ["pending", "requires_action"]), or(isNull(refunds.lastCheckedAt), lt(refunds.lastCheckedAt, stale))));
  // Webhook-triggered syncs whose job gave up (provider outage, worker down) stay dirty until read here.
  const dirty = await deps.db.select({ orderId: refundSyncs.orderId }).from(refundSyncs)
    .where(and(eq(refundSyncs.dirty, true), or(isNull(refundSyncs.leaseExpiresAt), lt(refundSyncs.leaseExpiresAt, now))));
  const orderIds = new Set([...pending.map((p) => p.orderId), ...dirty.map((d) => d.orderId)]);
  for (const orderId of orderIds) {
    try { if ((await syncOrderRefunds(deps, orderId)) === "synced") touched++; } catch { /* next run */ }
  }
  return touched;
}
