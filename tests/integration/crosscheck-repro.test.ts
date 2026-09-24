// Reproductions for the 2026-09-24 ChatGPT cross-check (docs/review/CROSSCHECK_TRIAGE_2026-09-24.md).
// Each test states the CORRECT behaviour. A failing test = issue reproduced; it turns green when fixed.
// Marked it.fails until fixed: CI stays green while the reproduction is kept. Remove ".fails" in the fixing commit.
// CC1a (2026-09-24): A, B, C1–C5, G and 3b fixed. Their expectations were restated for the new design (atomic
// failure+claim, provider-truth sync) without weakening the invariant; the deeper cases live in refund-recovery.test.ts.
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakePaymentAdapter } from "../../src/server/adapters/fake-payments";
import { FakeEmail } from "../../src/server/adapters/email";
import { retryOrder } from "../../src/server/admin";
import { requestMagicLink } from "../../src/server/auth";
import { createChart, loadChart } from "../../src/server/charts/service";
import type { DbHandle } from "../../src/server/db/client";
import { customers, guests, orders, paymentIssues, refunds } from "../../src/server/db/schema";
import { failAndRefund, sweepDeadlines } from "../../src/server/fulfillment/generate";
import { buildFacts, selectSnippets } from "../../src/server/fulfillment/prompt";
import { ensureGuest } from "../../src/server/guest";
import { startCheckout, type CheckoutDeps } from "../../src/server/payments/checkout";
import { executeRefund, reconcileRefunds, requestRefund, syncOrderRefunds } from "../../src/server/payments/refunds";
import { handlePaymentEvent, type WebhookDeps } from "../../src/server/payments/webhook";
import { searchPlaces } from "../../src/server/places";
import { QUEUES, createBoss, ensureQueues } from "../../src/server/queue/boss";
import type { Keyring } from "../../src/server/security/encryption";
import { resetSettingsCache, setSalesEnabled } from "../../src/server/settings";
import { TEST_DATABASE_URL, freshDb, hasDb } from "./helpers";

const ring: Keyring = { activeId: "t1", keys: { t1: randomBytes(32) }, lookupKey: randomBytes(32) };
const PRICE = "price_test_saju";
const nyc = searchPlaces("new york")[0]!.placeId;

describe.skipIf(!hasDb)("cross-check reproductions", () => {
  let h: DbHandle; let boss: PgBoss; let pay: FakePaymentAdapter;
  let co: CheckoutDeps; let wh: WebhookDeps;
  let evt = 0; let n = 0;

  beforeAll(async () => { h = await freshDb(); boss = createBoss(TEST_DATABASE_URL!); await boss.start(); await ensureQueues(boss); });
  afterAll(async () => { await boss?.stop({ graceful: false }); await h?.pool.end(); });
  beforeEach(async () => {
    pay = new FakePaymentAdapter();
    co = { db: h.db, ring, payments: pay, priceId: PRICE, origin: "https://haeday.test", automaticTax: false };
    wh = { db: h.db, ring, boss, payments: pay, paymentsMode: "test", priceId: PRICE };
    resetSettingsCache(); await setSalesEnabled(h.db, true, "test");
  });

  async function newChart() {
    const g = await ensureGuest(h.db, undefined);
    const c = await createChart(h.db, ring, g.id, { birthDate: "1985-03-20", time: { kind: "exact", hhmm: "14:15" }, placeId: nyc });
    return { guestId: g.id, chartId: (c as { id: string }).id };
  }
  async function paidOrder(email = `b${++n}@example.test`, override = {}) {
    const { guestId, chartId } = await newChart();
    const r = await startCheckout(co, guestId, chartId, true);
    if (!r.ok) throw new Error(r.error);
    const o = (await h.db.query.orders.findFirst({ where: eq(orders.id, r.orderId) }))!;
    pay.complete(o.stripeSessionId!, { customerEmail: email, ...override });
    const res = await handlePaymentEvent(wh, { id: `evt_x${++evt}`, livemode: false, type: "checkout.completed", sessionId: o.stripeSessionId! });
    return { orderId: r.orderId, res, pi: `pi_${o.stripeSessionId!.slice(8, 24)}` };
  }
  const order = async (id: string) => (await h.db.query.orders.findFirst({ where: eq(orders.id, id) }))!;
  const refundRows = (orderId: string) => h.db.select().from(refunds).where(eq(refunds.orderId, orderId));
  const refundEvt = (pi: string, refundId: string, status: "pending" | "succeeded" | "failed", amountCents = 399) =>
    ({ id: `evt_r${++evt}`, livemode: false, type: "refund.updated" as const, refundId, paymentIntentId: pi, status, amountCents, orderId: null });

  const rd = () => ({ db: h.db, payments: pay, boss });
  const issues = async (orderId: string) => (await h.db.select().from(paymentIssues).where(eq(paymentIssues.orderId, orderId))).map((i) => i.kind);

  // A: crash between "failed" and the refund claim → now one transaction; a crash before commit changes nothing
  it("A: a crash while failing an order leaves it recoverable, and the sweep ends in exactly one refund", async () => {
    const { orderId } = await paidOrder();
    const killedBeforeCommit = new Proxy(h.db, { get: (t, p) => (p === "transaction"
      ? (fn: Parameters<typeof h.db.transaction>[0]) => t.transaction(async (tx) => { await fn(tx); throw new Error("process killed before commit"); })
      : Reflect.get(t, p)) });
    await expect(failAndRefund({ db: killedBeforeCommit as typeof h.db, ring, boss, payments: pay }, orderId, "deadline", {})).rejects.toThrow();
    expect(await order(orderId)).toMatchObject({ paymentStatus: "paid", fulfillmentStatus: "queued" }); // rolled back, not stuck
    expect(await refundRows(orderId)).toHaveLength(0);
    const later = () => new Date(Date.now() + 60 * 60_000);
    await sweepDeadlines({ db: h.db, ring, boss, payments: pay, now: later });
    await reconcileRefunds({ db: h.db, payments: pay, now: later });
    expect(await refundRows(orderId)).toHaveLength(1);
    expect(await order(orderId)).toMatchObject({ paymentStatus: "refunded", fulfillmentStatus: "failed" });
    expect(pay.calls.createRefund).toBe(1);
  });

  // B: refund webhook arrives before the API response is stored
  it("B: webhook-first refund merges into the service refund row (no duplicate, no unique-violation)", async () => {
    const { orderId, pi } = await paidOrder();
    pay.hooks.afterCreateRefund = async (r) => {
      await handlePaymentEvent(wh, refundEvt(pi, r.id, "succeeded"));
      await syncOrderRefunds({ db: h.db, payments: pay }, orderId); // the refund.sync job, running first
    };
    const out = await requestRefund(rd(), { orderId, reason: "admin", requestedBy: "admin" });
    expect(out).toMatchObject({ ok: true, status: "succeeded" });
    const rows = await refundRows(orderId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "service", status: "succeeded" });
    expect((await order(orderId)).paymentStatus).toBe("refunded");
  });

  // C: reconciliation and retries
  it("C1: a confirmed 'failed' refund returns the order to paid AND opens a refund_failed issue (obligation kept)", async () => {
    const { orderId } = await paidOrder();
    pay.nextRefund = () => { throw new Error("network"); };
    await requestRefund(rd(), { orderId, reason: "admin", requestedBy: "admin" });
    pay.nextRefund = "failed";
    await reconcileRefunds({ db: h.db, payments: pay });
    expect((await order(orderId)).paymentStatus).toBe("paid");
    expect(await issues(orderId)).toContain("refund_failed");
  });

  it("C2: after a confirmed failed refund, a new refund attempt uses a NEW idempotency key", async () => {
    const { orderId } = await paidOrder();
    pay.nextRefund = "failed";
    await requestRefund(rd(), { orderId, reason: "admin", requestedBy: "admin" });
    pay.nextRefund = "succeeded";
    const again = await requestRefund(rd(), { orderId, reason: "admin", requestedBy: "admin" });
    expect(again).toMatchObject({ ok: true, status: "succeeded" });
    expect((await refundRows(orderId)).map((r) => r.idempotencyKey).sort()).toEqual([`refund:${orderId}:1`, `refund:${orderId}:2`]);
  });

  it("C3: a late 'pending' event does not move a succeeded refund back", async () => {
    const { orderId, pi } = await paidOrder();
    await requestRefund(rd(), { orderId, reason: "admin", requestedBy: "admin" });
    const [r] = await refundRows(orderId);
    await handlePaymentEvent(wh, refundEvt(pi, r!.stripeRefundId!, "pending"));
    await syncOrderRefunds({ db: h.db, payments: pay }, orderId);
    expect((await refundRows(orderId))[0]!.status).toBe("succeeded");
    expect((await order(orderId)).paymentStatus).toBe("refunded");
  });

  it("C4: two partial refunds that add up to the total mark the order refunded", async () => {
    const { orderId, pi } = await paidOrder();
    const r1 = pay.dashboardRefund(pi, 200); await handlePaymentEvent(wh, refundEvt(pi, r1, "succeeded", 200));
    await syncOrderRefunds({ db: h.db, payments: pay }, orderId);
    expect((await order(orderId)).paymentStatus).toBe("partially_refunded");
    const r2 = pay.dashboardRefund(pi, 199); await handlePaymentEvent(wh, refundEvt(pi, r2, "succeeded", 199));
    await syncOrderRefunds({ db: h.db, payments: pay }, orderId);
    expect((await order(orderId)).paymentStatus).toBe("refunded");
  });

  it("C5: long-pending refunds are re-read from the provider (no new refund is created)", async () => {
    const { orderId } = await paidOrder();
    pay.nextRefund = "pending";
    await requestRefund(rd(), { orderId, reason: "admin", requestedBy: "admin" });
    const [r] = await refundRows(orderId);
    pay.setRefundStatus(r!.stripeRefundId!, "succeeded");
    const creates = pay.calls.createRefund; const reads = pay.calls.getRefundSummary;
    await reconcileRefunds({ db: h.db, payments: pay, now: () => new Date(Date.now() + 2 * 86_400_000) });
    expect(pay.calls.createRefund).toBe(creates);
    expect(pay.calls.getRefundSummary).toBeGreaterThan(reads);
    expect((await order(orderId)).paymentStatus).toBe("refunded");
  });

  // E: content gate before checkout
  it.fails("E: checkout is refused when the chart's reading has no approved content", async () => {
    const { guestId, chartId } = await newChart();
    const chart = (await loadChart(h.db, ring, chartId, guestId))!;
    if (chart.response.kind !== "computed") throw new Error("setup");
    expect(selectSnippets(buildFacts(chart.response.chart), true)).toHaveLength(0); // today: nothing approved
    const r = await startCheckout(co, guestId, chartId, true);
    expect(r.ok).toBe(false);
  });

  // F: admin retry must enqueue inside the same transaction
  it("F: if the admin retry transaction rolls back, no generation job is left behind", async () => {
    const [g] = await h.db.insert(guests).values({ cookieHash: randomBytes(6).toString("hex") }).returning();
    const [admin] = await h.db.insert(customers).values({ emailLookup: `adm${++n}`, emailEnc: "v1.a.b.c.d", verifiedAt: new Date() }).returning();
    const [o] = await h.db.insert(orders).values({ guestId: g!.id, sku: "saju_reading", unitAmountCents: 399, totalCents: 399, consentVersion: "c", paymentStatus: "paid", paidAt: new Date(), fulfillmentStatus: "generating" }).returning();
    const flaky = new Proxy(boss, { get: (t, p) => (p === "send" ? async (...a: Parameters<PgBoss["send"]>) => { await t.send(...a); throw new Error("ack lost"); } : Reflect.get(t, p)) });
    await expect(retryOrder(h.db, flaky, o!.id, admin!.id)).rejects.toThrow();
    const jobs = (await h.db.execute(sql`select count(*)::int as n from pgboss.job where name = ${QUEUES.generateReading} and singleton_key = ${o!.id}`)).rows[0] as { n: number };
    expect((await order(o!.id)).fulfillmentStatus).toBe("generating"); // rolled back
    expect(jobs.n).toBe(0);
  });

  // G: paid at Stripe but our validation rejected it (D34)
  it("G: a linked paid session that fails validation is refunded (actual captured amount) and never unlocked", async () => {
    const { orderId, res } = await paidOrder(undefined, { amountSubtotal: 1, amountTotal: 250 });
    expect(res.outcome).toBe("rejected");
    expect(await order(orderId)).toMatchObject({ paymentStatus: "refund_pending", fulfillmentStatus: "none" });
    const [row] = await refundRows(orderId);
    expect(row).toMatchObject({ reason: "validation_failure", amountCents: 250, status: "requested" });
    expect(await issues(orderId)).toContain("validation_failure_refund");
    const jobs = (await h.db.execute(sql`select count(*)::int as n from pgboss.job where name = ${QUEUES.refundExecute} and singleton_key = ${row!.id}`)).rows[0] as { n: number };
    expect(jobs.n).toBe(1); // committed with the event
    await executeRefund({ db: h.db, payments: pay }, row!.id); // the job
    expect(await order(orderId)).toMatchObject({ paymentStatus: "refunded", fulfillmentStatus: "none" });
  });

  it("G2: a paid session we cannot tie to the order is never refunded automatically (issue only)", async () => {
    const { orderId, res } = await paidOrder(undefined, { clientReferenceId: "someone-else" });
    expect(res.outcome).toBe("rejected");
    expect(await refundRows(orderId)).toHaveLength(0);
    expect(pay.calls.createRefund).toBe(0);
    expect(await issues(orderId)).toContain("unlinked_paid_session");
  });

  // 3: login, goodwill, enumeration
  it("3a: an ADMIN_EMAILS address can get its first link on a fresh database", async () => {
    const mail = new FakeEmail();
    const r = await requestMagicLink({ db: h.db, ring, email: mail, origin: "https://haeday.test", supportEmail: "s@haeday.test", adminEmails: ["owner@haeday.test"] } as never, "owner@haeday.test");
    expect(r).toBe("sent");
  });

  it("3b: concurrent goodwill refunds on two orders of the same email → exactly one succeeds (forced race)", async () => {
    const email = `gw-${++n}@example.test`;
    const a = await paidOrder(email); const b = await paidOrder(email);
    // Barrier: both transactions are open before either checks eligibility, so only the lock can serialize them.
    let arrived = 0; let release!: () => void; const both = new Promise<void>((r) => { release = r; });
    const goodwillStart = async () => { if (++arrived === 2) release(); await both; };
    const res = await Promise.all([a, b].map((x) => requestRefund({ ...rd(), hooks: { goodwillStart } }, { orderId: x.orderId, reason: "goodwill", requestedBy: "customer" })));
    expect(res.filter((r) => r.ok)).toHaveLength(1);
    expect(res.filter((r) => !r.ok)).toEqual([{ ok: false, error: "goodwill_used" }]);
  });

  // 3c now tests the real HTTP boundary in tests/auth-request-route.test.ts.
  // Internal service outcomes intentionally remain distinct for operational handling.
});
