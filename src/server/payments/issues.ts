// Payment issues a person must look at (D34, CC1a). Deduped by kind + provider object + mode; ids and codes only.
import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { paymentIssues } from "../db/schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type IssueKind =
  | "validation_failure_refund"   // paid session failed validation, linked to our order → refunding (D34)
  | "unlinked_paid_session"       // paid session we cannot tie to an order → never refunded automatically
  | "refund_failed"               // provider refund ended failed/canceled; the customer is still owed money
  | "refund_unknown_stale"        // provider outcome unknown past the idempotency window; no blind retry
  | "refund_blocked_dispute"      // open dispute: automatic refunds stop
  | "refund_amount_mismatch"      // provider charge total disagrees with the refund list
  | "checkout_idempotency_mismatch" // a checkout key already ran with a different body (F4)
  | "reconcile_session_failed"    // a completed session could not be processed by reconciliation (F12)
  | "reconcile_list_failed"       // the provider session list failed or was truncated; the cursor did not move
  | "llm_capacity_paused";        // D52: AI backlog ≥ 2× daily cap, new payments paused automatically

export async function openIssue(db: Db | Tx, i: { kind: IssueKind; objectId: string; livemode: boolean; orderId?: string | null; nextAction: string }): Promise<void> {
  await db.insert(paymentIssues).values({
    kind: i.kind, dedupeKey: `${i.kind}:${i.objectId}:${i.livemode ? "live" : "test"}`, orderId: i.orderId ?? null,
    providerObjectId: i.objectId, livemode: i.livemode, nextAction: i.nextAction,
  }).onConflictDoUpdate({
    target: paymentIssues.dedupeKey,
    // Seen again: count it and reopen if someone resolved it while the cause is still there.
    set: { occurrences: sql`${paymentIssues.occurrences} + 1`, status: "open", resolvedAt: null, updatedAt: new Date() },
  });
}
