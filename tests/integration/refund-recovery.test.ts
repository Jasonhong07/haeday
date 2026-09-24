// CC1a refund recovery contract (docs/review/PROPOSAL_V2_CODEX.md §6 RF01–RF08) against real Postgres + pg-boss.
// Provider behaviour comes from FakePaymentAdapter, which mirrors Stripe's refund list / amount_refunded model.
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakePaymentAdapter } from "../../src/server/adapters/fake-payments";
import { createChart } from "../../src/server/charts/service";
import type { DbHandle } from "../../src/server/db/client";
import { disputes, orders, paymentIssues, refunds } from "../../src/server/db/schema";
import { sweepDeadlines } from "../../src/server/fulfillment/generate";
import { ensureGuest } from "../../src/server/guest";
import { startCheckout, type CheckoutDeps } from "../../src/server/payments/checkout";
import { LEASE_MS, executeRefund, reconcileRefunds, requestRefund, syncOrderRefunds } from "../../src/server/payments/refunds";
import { handlePaymentEvent, type WebhookDeps } from "../../src/server/payments/webhook";
import { searchPlaces } from "../../src/server/places";
import { QUEUES, createBoss, ensureQueues } from "../../src/server/queue/boss";
import type { Keyring } from "../../src/server/security/encryption";
import { resetSettingsCache, setSalesEnabled } from "../../src/server/settings";
import { TEST_DATABASE_URL, freshDb, hasDb } from "./helpers";

const ring: Keyring = { activeId: "t1", keys: { t1: randomBytes(32) }, lookupKey: randomBytes(32) };
const PRICE = "price_test_saju";
const nyc = searchPlaces("new york")[0]!.placeId;

describe.skipIf(!hasDb)("refund recovery (CC1a RF01–RF08)", () => {
  let h: DbHandle; let boss: PgBoss; let pay: FakePaymentAdapter; let co: CheckoutDeps; let wh: WebhookDeps;
  let evt = 0; let n = 0;
  beforeAll(async () => { h = await freshDb(); boss = createBoss(TEST_DATABASE_URL!); await boss.start(); await ensureQueues(boss); });
  afterAll(async () => { await boss?.stop({ graceful: false }); await h?.pool.end(); });
  beforeEach(async () => {
    pay = new FakePaymentAdapter();
    co = { db: h.db, ring, payments: pay, priceId: PRICE, origin: "https://haeday.test", automaticTax: false, approvedSnippetsOnly: false };
    wh = { db: h.db, ring, boss, payments: pay, paymentsMode: "test", priceId: PRICE };
    resetSettingsCache(); await setSalesEnabled(h.db, true, "test");
  });

  async function paidOrder() {
    const g = await ensureGuest(h.db, undefined);
    const c = (await createChart(h.db, ring, g.id, { birthDate: "1985-03-20", time: { kind: "exact", hhmm: "14:15" }, placeId: nyc })) as { id: string };
    const r = await startCheckout(co, g.id, c.id, true);
    if (!r.ok) throw new Error(r.error);
    const o = (await h.db.query.orders.findFirst({ where: eq(orders.id, r.orderId) }))!;
    pay.complete(o.stripeSessionId!, { customerEmail: `rf${++n}@example.test` });
    await handlePaymentEvent(wh, { id: `evt_rf${++evt}`, livemode: false, type: "checkout.completed", sessionId: o.stripeSessionId! });
    return { orderId: r.orderId, pi: `pi_${o.stripeSessionId!.slice(8, 24)}` };
  }
  const rd = () => ({ db: h.db, payments: pay, boss });
  const order = async (id: string) => (await h.db.query.orders.findFirst({ where: eq(orders.id, id) }))!;
  const rows = (orderId: string) => h.db.select().from(refunds).where(eq(refunds.orderId, orderId));
  const issues = async (orderId: string) => (await h.db.select().from(paymentIssues).where(eq(paymentIssues.orderId, orderId))).map((i) => i.kind);
  const providerRefunds = (pi: string) => [...pay.refunds.values()].filter((r) => r.paymentIntentId === pi);
  const after = (ms: number) => () => new Date(Date.now() + ms);

  it("RF02: provider succeeds but the answer is lost → later run stores it with the SAME key; one provider refund", async () => {
    const { orderId, pi } = await paidOrder();
    pay.hooks.afterCreateRefund = async () => { pay.hooks = {}; throw new Error("process died after provider success"); };
    expect(await requestRefund(rd(), { orderId, reason: "admin", requestedBy: "admin" })).toMatchObject({ ok: true, status: "unknown" });
    expect((await order(orderId)).paymentStatus).toBe("refund_pending");
    await reconcileRefunds({ db: h.db, payments: pay });
    expect(providerRefunds(pi)).toHaveLength(1);
    expect((await rows(orderId))[0]).toMatchObject({ status: "succeeded", stripeRefundId: providerRefunds(pi)[0]!.id });
    expect((await order(orderId)).paymentStatus).toBe("refunded");
  });

  it("RF02b: killed after the provider call but before saving → the lease expires and reconciliation finishes", async () => {
    const { orderId, pi } = await paidOrder();
    let k = 0; // executor transactions: 1 = take lease, 2 = save the provider answer (dies here)
    const killed = new Proxy(h.db, { get: (t, p) => (p === "transaction" ? (fn: Parameters<typeof h.db.transaction>[0]) => (++k === 2 ? Promise.reject(new Error("killed")) : t.transaction(fn)) : Reflect.get(t, p)) });
    // Claim normally, then run the executor with a DB that dies on its second transaction (the save).
    pay.nextRefund = () => { throw new Error("hold"); };
    await requestRefund(rd(), { orderId, reason: "admin", requestedBy: "admin" }); // claim + unknown
    pay.nextRefund = "succeeded";
    const [row] = await rows(orderId);
    await h.db.update(refunds).set({ status: "requested" }).where(eq(refunds.id, row!.id));
    await expect(executeRefund({ db: killed as typeof h.db, payments: pay }, row!.id)).rejects.toThrow();
    expect((await rows(orderId))[0]!.leaseToken).not.toBeNull(); // lease left behind by the dead executor
    expect(await reconcileRefunds({ db: h.db, payments: pay })).toBe(0); // lease still valid: nobody touches it
    await reconcileRefunds({ db: h.db, payments: pay, now: after(LEASE_MS + 1000) });
    expect(providerRefunds(pi)).toHaveLength(1);
    expect((await order(orderId)).paymentStatus).toBe("refunded");
  });

  it("RF03: three executors at once → one provider call", async () => {
    const { orderId, pi } = await paidOrder();
    pay.nextRefund = () => { throw new Error("hold"); };
    await requestRefund(rd(), { orderId, reason: "admin", requestedBy: "admin" });
    pay.nextRefund = "succeeded";
    const calls = pay.calls.createRefund;
    const [row] = await rows(orderId);
    pay.hooks.beforeCreateRefund = () => new Promise((r) => setTimeout(r, 150)); // slow provider: the others arrive meanwhile
    await Promise.all([1, 2, 3].map(() => executeRefund({ db: h.db, payments: pay }, row!.id)));
    expect(pay.calls.createRefund - calls).toBe(1);
    expect(providerRefunds(pi)).toHaveLength(1);
  });

  it("RF05: a slow, older provider read never overwrites a newer one (dirty re-read)", async () => {
    const { orderId } = await paidOrder();
    pay.nextRefund = "pending";
    await requestRefund(rd(), { orderId, reason: "admin", requestedBy: "admin" });
    const [row] = await rows(orderId);
    let once = true;
    pay.hooks.beforeSummaryReturn = async () => {
      if (!once) return; once = false;
      pay.setRefundStatus(row!.stripeRefundId!, "succeeded"); // provider moves on while A's snapshot says pending
      expect(await syncOrderRefunds({ db: h.db, payments: pay }, orderId)).toBe("busy"); // B marks dirty
    };
    expect(await syncOrderRefunds({ db: h.db, payments: pay }, orderId)).toBe("synced"); // A saves, sees dirty, re-reads
    expect((await rows(orderId))[0]!.status).toBe("succeeded");
    expect((await order(orderId)).paymentStatus).toBe("refunded");
  });

  it("RF05b: if A's lease expired and B took over, A's stale result is discarded", async () => {
    const { orderId } = await paidOrder();
    pay.nextRefund = "pending";
    await requestRefund(rd(), { orderId, reason: "admin", requestedBy: "admin" });
    const [row] = await rows(orderId);
    let once = true;
    pay.hooks.beforeSummaryReturn = async () => {
      if (!once) return; once = false;
      pay.setRefundStatus(row!.stripeRefundId!, "succeeded");
      expect(await syncOrderRefunds({ db: h.db, payments: pay, now: after(LEASE_MS + 1000) }, orderId)).toBe("synced"); // B
    };
    expect(await syncOrderRefunds({ db: h.db, payments: pay }, orderId)).toBe("stale"); // A: its token was replaced
    expect((await rows(orderId))[0]!.status).toBe("succeeded");
  });

  it("RF06: outcome unknown for >24 h → looked up, never re-created; not found → issue, no second refund", async () => {
    const { orderId, pi } = await paidOrder();
    pay.nextRefund = () => { throw new Error("network before provider"); };
    await requestRefund(rd(), { orderId, reason: "admin", requestedBy: "admin" });
    pay.nextRefund = "succeeded";
    const calls = pay.calls.createRefund;
    await reconcileRefunds({ db: h.db, payments: pay, now: after(25 * 3_600_000) });
    expect(pay.calls.createRefund).toBe(calls);
    expect(providerRefunds(pi)).toHaveLength(0);
    // Confirmed absent from the provider's full list → attempt closed, obligation kept as an issue.
    expect((await rows(orderId))[0]).toMatchObject({ status: "failed", failureReason: "never_created" });
    expect(await issues(orderId)).toContain("refund_unknown_stale");
    expect((await order(orderId)).paymentStatus).toBe("paid");
    // A deliberate new attempt is possible and uses a new key.
    expect(await requestRefund(rd(), { orderId, reason: "admin", requestedBy: "admin" })).toMatchObject({ ok: true, status: "succeeded" });
    expect(providerRefunds(pi)).toHaveLength(1);
  });

  it("RF09: a 'requested' claim first sent >24 h ago is looked up, never re-sent (executor died after the provider call)", async () => {
    const { orderId, pi } = await paidOrder();
    pay.hooks.afterCreateRefund = async () => { pay.hooks = {}; throw new Error("died"); };
    await requestRefund(rd(), { orderId, reason: "admin", requestedBy: "admin" });
    const [row] = await rows(orderId);
    await h.db.update(refunds).set({ status: "requested", leaseToken: null, leaseExpiresAt: null }).where(eq(refunds.id, row!.id));
    const calls = pay.calls.createRefund;
    await reconcileRefunds({ db: h.db, payments: pay, now: after(25 * 3_600_000) });
    expect(pay.calls.createRefund).toBe(calls);
    expect(providerRefunds(pi)).toHaveLength(1);
    expect((await order(orderId)).paymentStatus).toBe("refunded");
  });

  it("RF10: a refund.failed webhook whose sync job gave up is still picked up by reconciliation (dirty)", async () => {
    const { orderId, pi } = await paidOrder();
    await requestRefund(rd(), { orderId, reason: "admin", requestedBy: "admin" });
    const [row] = await rows(orderId);
    pay.setRefundStatus(row!.stripeRefundId!, "failed", "lost_or_stolen_card");
    await handlePaymentEvent(wh, { id: `evt_rf${++evt}`, livemode: false, type: "refund.updated", refundId: row!.stripeRefundId!, paymentIntentId: pi, status: "failed", amountCents: 399, orderId: null });
    // The sync job runs during a provider outage and every retry fails (this used to clear `dirty`).
    const real = pay.getRefundSummary.bind(pay);
    pay.getRefundSummary = async () => { throw new Error("provider outage"); };
    for (let i = 0; i < 3; i++) await expect(syncOrderRefunds({ db: h.db, payments: pay }, orderId)).rejects.toThrow();
    pay.getRefundSummary = real;
    expect((await rows(orderId))[0]!.status).toBe("succeeded"); // not yet known here
    await reconcileRefunds({ db: h.db, payments: pay });
    expect((await rows(orderId))[0]!.status).toBe("failed");
    expect(await issues(orderId)).toContain("refund_failed");
  });

  it("RF11: a resolved refund_failed issue is not reopened by later syncs of the same failed refund", async () => {
    const { orderId } = await paidOrder();
    pay.nextRefund = "failed";
    await requestRefund(rd(), { orderId, reason: "admin", requestedBy: "admin" });
    await h.db.update(paymentIssues).set({ status: "resolved", resolvedAt: new Date() }).where(eq(paymentIssues.orderId, orderId));
    await syncOrderRefunds({ db: h.db, payments: pay }, orderId);
    await syncOrderRefunds({ db: h.db, payments: pay }, orderId);
    const open = await h.db.select().from(paymentIssues).where(eq(paymentIssues.orderId, orderId));
    expect(open.map((i) => [i.kind, i.status, i.occurrences])).toEqual([["refund_failed", "resolved", 1]]);
  });

  it("RF06b: outcome unknown for >24 h but the provider DID create it → matched by our row id, no second refund", async () => {
    const { orderId, pi } = await paidOrder();
    pay.hooks.afterCreateRefund = async () => { pay.hooks = {}; throw new Error("response lost"); };
    await requestRefund(rd(), { orderId, reason: "admin", requestedBy: "admin" });
    const calls = pay.calls.createRefund;
    await reconcileRefunds({ db: h.db, payments: pay, now: after(25 * 3_600_000) });
    expect(pay.calls.createRefund).toBe(calls);
    expect(providerRefunds(pi)).toHaveLength(1);
    expect((await rows(orderId))[0]).toMatchObject({ status: "succeeded", source: "service" });
    expect((await order(orderId)).paymentStatus).toBe("refunded");
  });

  it("RF07: a dashboard partial refund is respected; our later refund covers only the rest; its failure keeps the obligation", async () => {
    const { orderId, pi } = await paidOrder();
    const dash = pay.dashboardRefund(pi, 100);
    await handlePaymentEvent(wh, { id: `evt_rf${++evt}`, livemode: false, type: "refund.updated", refundId: dash, paymentIntentId: pi, status: "succeeded", amountCents: 100, orderId: null });
    await syncOrderRefunds({ db: h.db, payments: pay }, orderId);
    expect((await order(orderId)).paymentStatus).toBe("partially_refunded");
    pay.nextRefund = "pending";
    await requestRefund(rd(), { orderId, reason: "admin", requestedBy: "admin" });
    const ours = (await rows(orderId)).find((r) => r.source === "service")!;
    expect(ours.amountCents).toBe(299);
    pay.setRefundStatus(ours.stripeRefundId!, "failed", "expired_or_canceled_card");
    await syncOrderRefunds({ db: h.db, payments: pay }, orderId);
    expect((await order(orderId)).paymentStatus).toBe("partially_refunded");
    expect((await rows(orderId)).find((r) => r.id === ours.id)).toMatchObject({ status: "failed", failureReason: "expired_or_canceled_card" });
    expect(await issues(orderId)).toContain("refund_failed");
  });

  it("RF07b: succeeded → failed at the bank reopens the obligation (issue), order back to paid as a payment fact", async () => {
    const { orderId } = await paidOrder();
    await requestRefund(rd(), { orderId, reason: "admin", requestedBy: "admin" });
    expect((await order(orderId)).paymentStatus).toBe("refunded");
    const [row] = await rows(orderId);
    pay.setRefundStatus(row!.stripeRefundId!, "failed", "lost_or_stolen_card");
    await syncOrderRefunds({ db: h.db, payments: pay }, orderId);
    expect((await order(orderId)).paymentStatus).toBe("paid");
    // Fulfillment was stopped when the refund was claimed, so the sweep cannot open a new claim by itself.
    expect((await order(orderId)).fulfillmentStatus).toBe("failed");
    expect(await issues(orderId)).toContain("refund_failed");
    const calls = pay.calls.createRefund;
    await sweepDeadlines({ db: h.db, ring, boss, payments: pay, now: after(60 * 60_000) });
    expect(pay.calls.createRefund).toBe(calls);
  });

  it("RF08: an open dispute blocks automatic refunds (before claim and between claim and execute)", async () => {
    const a = await paidOrder();
    await h.db.insert(disputes).values({ orderId: a.orderId, stripeDisputeId: `dp_${++evt}`, status: "needs_response" });
    expect(await requestRefund(rd(), { orderId: a.orderId, reason: "goodwill", requestedBy: "customer" })).toEqual({ ok: false, error: "disputed" });
    expect(await issues(a.orderId)).toContain("refund_blocked_dispute");

    const b = await paidOrder();
    pay.nextRefund = () => { throw new Error("hold"); };
    await requestRefund(rd(), { orderId: b.orderId, reason: "admin", requestedBy: "admin" });
    const [row] = await rows(b.orderId);
    await h.db.update(refunds).set({ status: "requested" }).where(eq(refunds.id, row!.id));
    await h.db.insert(disputes).values({ orderId: b.orderId, stripeDisputeId: `dp_${++evt}`, status: "needs_response" });
    pay.nextRefund = "succeeded";
    const calls = pay.calls.createRefund;
    await executeRefund({ db: h.db, payments: pay }, row!.id);
    expect(pay.calls.createRefund).toBe(calls);
    expect(await issues(b.orderId)).toContain("refund_blocked_dispute");
  });

  it("refund webhooks queue one sync job per order (duplicates collapse) inside the event transaction", async () => {
    const { orderId, pi } = await paidOrder();
    for (let i = 0; i < 3; i++) await handlePaymentEvent(wh, { id: `evt_rf${++evt}`, livemode: false, type: "charge.refunded", paymentIntentId: pi, amountRefundedCents: 0, amountCents: 399 });
    const q = (await h.db.execute(sql`select count(*)::int as n from pgboss.job where name = ${QUEUES.refundSync} and singleton_key = ${orderId} and state = 'created'`)).rows[0] as { n: number };
    expect(q.n).toBe(1);
  });
});
