// Reading generation (ARCHITECTURE §4.4). Fencing tokens make sure only the latest attempt can save a reading,
// and only while the order is still paid. LLM and refund calls run outside transactions.
import { randomUUID } from "node:crypto";
import { and, count, eq, gte, inArray, lt } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { Db } from "../db/client";
import { generationAttempts, orders, readings } from "../db/schema";
import type { LlmAdapter } from "../adapters/llm";
import type { PaymentAdapter } from "../payments/adapter";
import type { OrderSnapshot } from "../payments/checkout";
import { claimRefundInTx, executeRefund } from "../payments/refunds";
import { queueEmailInTx } from "../email/outbox";
import { decryptPrivate, encryptPrivate, type Keyring } from "../security/encryption";
import { aad } from "../security/keyring";
import type { Chart, ChartResponse } from "../engine";
import { checkReading } from "./checks";
import { PROMPT_VERSION, READING_JSON_SCHEMA, SYSTEM_PROMPT, buildFacts, buildUserMessage, selectSnippets } from "./prompt";

export const MAX_ATTEMPTS = 3;
export const LLM_TIMEOUT_MS = 60_000;
export const LLM_MAX_TOKENS = 3_000;

export interface GenerateDeps {
  db: Db; ring: Keyring; boss: PgBoss; llm: LlmAdapter | null; payments: PaymentAdapter;
  approvedSnippetsOnly: boolean; dailyCap: number; now?: () => Date;
}

/** Thrown to make pg-boss retry the job (it re-enters generateReading, which starts a new attempt). */
export class RetryGeneration extends Error { constructor(public readonly code: string) { super(`generation retry: ${code}`); this.name = "RetryGeneration"; } }

export type GenerateOutcome = "delivered" | "skipped" | "failed_refunded";

export async function generateReading(deps: GenerateDeps, orderId: string): Promise<GenerateOutcome> {
  const now = deps.now?.() ?? new Date();
  const token = randomUUID();

  const claim = await deps.db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order || order.paymentStatus !== "paid" || !["queued", "generating"].includes(order.fulfillmentStatus)) return null;
    const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(generationAttempts).where(eq(generationAttempts.orderId, orderId));
    // Earlier attempts that never finished (worker crash) are closed so their token can no longer save.
    await tx.update(generationAttempts).set({ status: "abandoned", finishedAt: now })
      .where(and(eq(generationAttempts.orderId, orderId), eq(generationAttempts.status, "running")));
    if (n >= MAX_ATTEMPTS) return { order, attemptNo: n + 1, exhausted: true as const };
    await tx.insert(generationAttempts).values({ orderId, attemptNo: n + 1, fencingToken: token, startedAt: now });
    await tx.update(orders).set({ fulfillmentStatus: "generating", currentFencingToken: token, updatedAt: now }).where(eq(orders.id, orderId));
    return { order, attemptNo: n + 1, exhausted: false as const };
  });
  if (!claim) return "skipped";
  if (claim.exhausted) return failAndRefund(deps, orderId, "attempts_exhausted", {});

  const fail = async (code: string): Promise<GenerateOutcome> => {
    await deps.db.update(generationAttempts).set({ status: "failed", errorCode: code, finishedAt: deps.now?.() ?? new Date() })
      .where(and(eq(generationAttempts.orderId, orderId), eq(generationAttempts.fencingToken, token)));
    if (claim.attemptNo >= MAX_ATTEMPTS) return failAndRefund(deps, orderId, code, { fencingToken: token });
    throw new RetryGeneration(code);
  };

  if (!deps.llm) return fail("llm_not_configured");
  if (deps.dailyCap <= 0) return fail("llm_cap_not_set");
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [{ used } = { used: 0 }] = await deps.db.select({ used: count() }).from(generationAttempts).where(gte(generationAttempts.startedAt, dayStart));
  if (used > deps.dailyCap) return fail("llm_daily_cap");

  if (!claim.order.snapshotEnc) return fail("snapshot_missing");
  const snapshot = decryptPrivate<OrderSnapshot>(claim.order.snapshotEnc, aad("orders", orderId, "snapshot"), deps.ring);
  const response = snapshot.response as ChartResponse;
  if (response.kind !== "computed") return fail("snapshot_not_computed");
  const chart: Chart = response.chart;
  const facts = buildFacts(chart);
  const snippets = selectSnippets(facts, deps.approvedSnippetsOnly);
  if (snippets.length === 0) return fail("no_approved_snippets");

  let raw: unknown; let modelId: string;
  try {
    const res = await deps.llm.generate({ system: SYSTEM_PROMPT, user: buildUserMessage(facts, snippets), jsonSchema: READING_JSON_SCHEMA, maxTokens: LLM_MAX_TOKENS, timeoutMs: LLM_TIMEOUT_MS });
    raw = res.json; modelId = res.modelId;
  } catch (e) {
    return fail(e instanceof Error && "code" in e ? `llm_${String((e as { code: unknown }).code)}` : "llm_error");
  }
  const checked = checkReading(raw, snippets.map((s) => s.id), facts);
  if (!checked.ok) return fail(`check_${checked.failure}`);

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
      usedSnippetIds: checked.reading.usedSnippetIds, promptVersion: PROMPT_VERSION, modelId, policyVersion: chart.policyVersion, deliveredAt: done,
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
    if (order.deliveryEmailEnc && refund.ok) {
      await queueEmailInTx(tx, deps.boss, deps.ring, { kind: "apology", orderId, to: decryptPrivate<string>(order.deliveryEmailEnc, aad("orders", orderId, "delivery_email"), deps.ring) });
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
    .where(and(eq(orders.paymentStatus, "paid"), inArray(orders.fulfillmentStatus, ["queued", "generating"]), lt(orders.paidAt, new Date(now.getTime() - 5 * 60_000))));
  return { failed, slow };
}
