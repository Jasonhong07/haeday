// Reading generation (ARCHITECTURE §4.4). Fencing tokens make sure only the latest attempt can save a reading,
// and only while the order is still paid. LLM and refund calls run outside transactions.
import { randomUUID } from "node:crypto";
import { and, count, eq, inArray, lt, lte } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { Db } from "../db/client";
import { attemptGrants, generationAttempts, orders, readings } from "../db/schema";
import { LlmError, type LlmAdapter, type LlmUsage } from "../adapters/llm";
import { admitAttempt } from "./capacity";
import { costMicroUsd } from "./pricing";
import type { PaymentAdapter } from "../payments/adapter";
import type { OrderSnapshot } from "../payments/checkout";
import { claimRefundInTx, executeRefund } from "../payments/refunds";
import { queueEmailInTx } from "../email/outbox";
import { QUEUES, enqueueInTx } from "../queue/boss";
import { decryptPrivate, encryptPrivate, type Keyring } from "../security/encryption";
import { aad } from "../security/keyring";
import type { Chart, ChartResponse } from "../engine";
import { checkReading } from "./checks";
import { PROMPT_VERSION, READING_JSON_SCHEMA, SYSTEM_PROMPT, buildFacts, buildUserMessage, contentReady, selectSnippets } from "./prompt";

export const MAX_ATTEMPTS = 3;
export const LLM_TIMEOUT_MS = 60_000;
export const LLM_MAX_TOKENS = 3_000;

export interface GenerateDeps {
  db: Db; ring: Keyring; boss: PgBoss; llm: LlmAdapter | null; payments: PaymentAdapter;
  approvedSnippetsOnly: boolean; dailyCap: number; now?: () => Date;
  /** Test hook (F13): runs right after the capacity count, inside the admission transaction. */
  hooks?: { afterCapacityCount?: () => Promise<void> };
}

/** F14: usage columns for an attempt; unknown usage stays null (never counted as free). */
function usageColumns(u: LlmUsage | null) {
  if (!u) return {};
  const cost = costMicroUsd(u.modelId, u);
  return {
    modelId: u.modelId, inputTokens: u.inputTokens, outputTokens: u.outputTokens, cacheReadTokens: u.cacheReadTokens, cacheWriteTokens: u.cacheWriteTokens,
    costMicroUsd: cost?.micro ?? null, pricingVersion: cost?.version ?? null,
  };
}

/** Thrown to make pg-boss retry the job (it re-enters generateReading, which starts a new attempt). */
export class RetryGeneration extends Error { constructor(public readonly code: string) { super(`generation retry: ${code}`); this.name = "RetryGeneration"; } }

export type GenerateOutcome = "delivered" | "skipped" | "failed_refunded" | "deferred";

export async function generateReading(deps: GenerateDeps, orderId: string): Promise<GenerateOutcome> {
  const now = deps.now?.() ?? new Date();
  const token = randomUUID();

  const claim = await deps.db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order || order.paymentStatus !== "paid" || !["queued", "generating"].includes(order.fulfillmentStatus)) return null;
    if (order.fulfillmentNotBefore && order.fulfillmentNotBefore > now) return { deferred: true as const };
    const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(generationAttempts).where(eq(generationAttempts.orderId, orderId));
    // D36: each admin retry grant adds one attempt (stored apart from the real LLM calls).
    const [{ g } = { g: 0 }] = await tx.select({ g: count() }).from(attemptGrants).where(eq(attemptGrants.orderId, orderId));
    // Earlier attempts that never finished (worker crash) are closed so their token can no longer save.
    await tx.update(generationAttempts).set({ status: "abandoned", finishedAt: now })
      .where(and(eq(generationAttempts.orderId, orderId), eq(generationAttempts.status, "running")));
    if (n >= MAX_ATTEMPTS + g) return { order, attemptNo: n + 1, exhausted: true as const };
    // F13: atomic capacity admission (per UTC day). A deferred "24h" order uses no attempt and no LLM call.
    if (deps.dailyCap > 0) {
      const adm = await admitAttempt(tx, { cap: deps.dailyCap, promise: order.deliveryPromise === "24h" ? "24h" : "minutes", deadlineAt: order.fulfillmentDeadlineAt, now, afterCount: deps.hooks?.afterCapacityCount });
      if (adm.kind === "defer") {
        await tx.update(orders).set({ fulfillmentStatus: "queued", fulfillmentNotBefore: adm.until, currentFencingToken: null, updatedAt: now }).where(eq(orders.id, orderId));
        return { deferred: true as const };
      }
      // Over the minutes-order ceiling: no attempt row and no LLM call (the slot count stays honest). pg-boss
      // retries later; if it never fits, the 15-minute deadline refunds.
      if (adm.kind === "over") return { over: true as const };
    }
    await tx.insert(generationAttempts).values({ orderId, attemptNo: n + 1, fencingToken: token, startedAt: now });
    await tx.update(orders).set({ fulfillmentStatus: "generating", currentFencingToken: token, fulfillmentNotBefore: null, updatedAt: now }).where(eq(orders.id, orderId));
    return { order, attemptNo: n + 1, maxAttempts: MAX_ATTEMPTS + g, exhausted: false as const };
  });
  if (!claim) return "skipped";
  if ("deferred" in claim) return "deferred";
  if ("over" in claim) throw new RetryGeneration("llm_daily_cap");
  if (claim.exhausted) return failAndRefund(deps, orderId, "attempts_exhausted", {});

  const fail = async (code: string, usage?: LlmUsage | null): Promise<GenerateOutcome> => {
    await deps.db.update(generationAttempts).set({ status: "failed", errorCode: code, finishedAt: deps.now?.() ?? new Date(), ...usageColumns(usage ?? null) })
      .where(and(eq(generationAttempts.orderId, orderId), eq(generationAttempts.fencingToken, token)));
    if (claim.attemptNo >= claim.maxAttempts) return failAndRefund(deps, orderId, code, { fencingToken: token });
    throw new RetryGeneration(code);
  };

  if (!deps.llm) return fail("llm_not_configured");
  if (deps.dailyCap <= 0) return fail("llm_cap_not_set");

  if (!claim.order.snapshotEnc) return fail("snapshot_missing");
  const snapshot = decryptPrivate<OrderSnapshot>(claim.order.snapshotEnc, aad("orders", orderId, "snapshot"), deps.ring);
  const response = snapshot.response as ChartResponse;
  if (response.kind !== "computed") return fail("snapshot_not_computed");
  const chart: Chart = response.chart;
  const facts = buildFacts(chart);
  // F7: use exactly the content frozen at checkout (what the customer paid for). Older orders without it fall
  // back to the deployed library, but only when that library passes the same gate as checkout.
  let snippets: Array<{ id: string; text: string }>;
  let snippetsVersion: string | null = null;
  if (snapshot.content && snapshot.content.snippets.length > 0) {
    // Defence in depth: production never generates from frozen drafts, even if checkout was misconfigured.
    if (deps.approvedSnippetsOnly && !snapshot.content.snippets.every((s) => s.approvedBy === "jason")) return fail("content_not_approved");
    snippets = snapshot.content.snippets; snippetsVersion = snapshot.content.snippetsVersion;
  } else {
    if (!contentReady(facts, deps.approvedSnippetsOnly)) return fail("content_not_ready");
    snippets = selectSnippets(facts, deps.approvedSnippetsOnly);
  }
  if (snippets.length === 0) return fail("no_approved_snippets");

  let raw: unknown; let modelId: string; let usage: LlmUsage;
  try {
    const res = await deps.llm.generate({ system: SYSTEM_PROMPT, user: buildUserMessage(facts, snippets), jsonSchema: READING_JSON_SCHEMA, maxTokens: LLM_MAX_TOKENS, timeoutMs: LLM_TIMEOUT_MS });
    raw = res.json; modelId = res.modelId;
    usage = { modelId: res.modelId, inputTokens: res.inputTokens, outputTokens: res.outputTokens, cacheReadTokens: res.cacheReadTokens, cacheWriteTokens: res.cacheWriteTokens };
  } catch (e) {
    // F14: provider-reported usage is billed even on failure; a timeout has none (unknown, never 0).
    return fail(e instanceof Error && "code" in e ? `llm_${String((e as { code: unknown }).code)}` : "llm_error", e instanceof LlmError ? e.usage : null);
  }
  await deps.db.update(generationAttempts).set(usageColumns(usage)).where(and(eq(generationAttempts.orderId, orderId), eq(generationAttempts.fencingToken, token)));
  const checked = checkReading(raw, snippets.map((s) => s.id), facts);
  if (!checked.ok) return fail(`check_${checked.failure}`, usage);

  const saved = await deps.db.transaction(async (tx) => {
    const done = new Date();
    const moved = await tx.update(orders).set({ fulfillmentStatus: "delivered", updatedAt: done })
      .where(and(eq(orders.id, orderId), eq(orders.currentFencingToken, token), eq(orders.paymentStatus, "paid"), eq(orders.fulfillmentStatus, "generating")))
      .returning({ id: orders.id, deliveryEmailEnc: orders.deliveryEmailEnc });
    if (moved.length === 0) {
      await tx.update(generationAttempts).set({ status: "abandoned", errorCode: "superseded_or_refunded", finishedAt: done })
        .where(and(eq(generationAttempts.orderId, orderId), eq(generationAttempts.fencingToken, token)));
      return false;
    }
    const readingId = randomUUID();
    await tx.insert(readings).values({
      id: readingId, orderId,
      contentEnc: encryptPrivate(checked.reading, aad("readings", readingId, "content"), deps.ring),
      usedSnippetIds: checked.reading.usedSnippetIds, promptVersion: PROMPT_VERSION, modelId, policyVersion: chart.policyVersion, libraryVersion: snippetsVersion, deliveredAt: done,
    });
    await tx.update(generationAttempts).set({ status: "succeeded", finishedAt: done })
      .where(and(eq(generationAttempts.orderId, orderId), eq(generationAttempts.fencingToken, token)));
    const enc = moved[0]!.deliveryEmailEnc;
    if (enc) await queueEmailInTx(tx, deps.boss, deps.ring, { kind: "delivery", orderId, to: decryptPrivate<string>(enc, aad("orders", orderId, "delivery_email"), deps.ring) });
    return true;
  });
  return saved ? "delivered" : "skipped";
}

/**
 * Terminal failure (CC1a F1). ONE transaction: fulfillment → failed, refund claim + `refund.execute` job, apology
 * email. A crash before commit changes nothing (the deadline sweep retries); after commit the queued job finishes
 * the refund. Guards stop a stale worker (old fencing token) or a stale sweep from failing an order that moved on.
 */
export async function failAndRefund(
  deps: Pick<GenerateDeps, "db" | "ring" | "boss" | "payments" | "now">, orderId: string, code: string,
  guard: { fencingToken?: string; deadlineBefore?: Date },
): Promise<GenerateOutcome> {
  const now = deps.now?.() ?? new Date();
  const res = await deps.db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order || !["queued", "generating"].includes(order.fulfillmentStatus)) return null;
    if (guard.fencingToken && order.currentFencingToken !== guard.fencingToken) return null;
    if (guard.deadlineBefore && !(order.fulfillmentDeadlineAt && order.fulfillmentDeadlineAt < guard.deadlineBefore)) return null;
    await tx.update(orders).set({ fulfillmentStatus: "failed", currentFencingToken: null, updatedAt: now }).where(eq(orders.id, orderId));
    const refund = await claimRefundInTx(tx, deps.boss, { orderId, reason: "service_failure", requestedBy: guard.deadlineBefore ? "deadline_cron" : "worker", now, livemode: deps.payments.livemode });
    // Free (100% code) orders have nothing to refund: a different apology that promises no refund.
    const free = (order.totalCents ?? 0) === 0 && !order.stripePaymentIntentId;
    if (order.deliveryEmailEnc && (refund.ok || free)) {
      await queueEmailInTx(tx, deps.boss, deps.ring, { kind: free ? "apology_free" : "apology", orderId, to: decryptPrivate<string>(order.deliveryEmailEnc, aad("orders", orderId, "delivery_email"), deps.ring) });
    }
    return { refundId: refund.ok ? refund.refundId : null, error: refund.ok ? null : refund.error };
  });
  if (!res) return "skipped";
  console.error(`[fulfillment] order failed code=${code}${res.error ? ` refund=${res.error}` : ""}`);
  // Best effort now; the committed job and reconciliation finish it otherwise.
  if (res.refundId) await executeRefund(deps, res.refundId).catch(() => undefined);
  return "failed_refunded";
}

/** Cron (every minute): paid orders past their fulfillment deadline go down the failure path (ARCHITECTURE §4.4.5). */
export async function sweepDeadlines(deps: Pick<GenerateDeps, "db" | "ring" | "boss" | "payments" | "now">): Promise<{ failed: number; slow: number }> {
  const now = deps.now?.() ?? new Date();
  const late = await deps.db.select({ id: orders.id }).from(orders)
    .where(and(eq(orders.paymentStatus, "paid"), inArray(orders.fulfillmentStatus, ["queued", "generating"]), lt(orders.fulfillmentDeadlineAt, now)));
  let failed = 0;
  for (const o of late) if ((await failAndRefund(deps, o.id, "deadline", { deadlineBefore: now })) === "failed_refunded") failed++;
  const [{ slow } = { slow: 0 }] = await deps.db.select({ slow: count() }).from(orders)
    .where(and(eq(orders.paymentStatus, "paid"), eq(orders.deliveryPromise, "minutes"), inArray(orders.fulfillmentStatus, ["queued", "generating"]), lt(orders.paidAt, new Date(now.getTime() - 5 * 60_000))));
  return { failed, slow };
}

/** Cron (every minute): deferred "24h" orders whose time has come get their generation job back (F13). */
export async function releaseDeferred(deps: Pick<GenerateDeps, "db" | "boss" | "now">): Promise<number> {
  const now = deps.now?.() ?? new Date();
  let released = 0;
  const due = await deps.db.select({ id: orders.id }).from(orders)
    .where(and(eq(orders.paymentStatus, "paid"), eq(orders.fulfillmentStatus, "queued"), lte(orders.fulfillmentNotBefore, now))).limit(500);
  for (const o of due) {
    await deps.db.transaction(async (tx) => {
      const [locked] = await tx.select({ id: orders.id }).from(orders)
        .where(and(eq(orders.id, o.id), eq(orders.fulfillmentStatus, "queued"), lte(orders.fulfillmentNotBefore, now))).for("update");
      if (!locked) return;
      // Clear the marker only when a job was really created: if one is still active (deduplicated), keep the
      // marker so the next run tries again after it ends.
      const job = await enqueueInTx(deps.boss, tx, QUEUES.generateReading, { orderId: o.id }, { singletonKey: o.id, duplicateExpected: true });
      if (job) { await tx.update(orders).set({ fulfillmentNotBefore: null, updatedAt: now }).where(eq(orders.id, o.id)); released++; }
    });
  }
  return released;
}
