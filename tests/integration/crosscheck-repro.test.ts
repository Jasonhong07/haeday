// Reproductions for the 2026-09-24 ChatGPT cross-check (docs/review/CROSSCHECK_TRIAGE_2026-09-24.md).
// Each test states the CORRECT behaviour. A failing test = issue reproduced; it turns green when fixed.
// Marked it.fails until fixed: CI stays green while the reproduction is kept. Remove ".fails" in the fixing commit.
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
import { customers, guests, orders, refunds } from "../../src/server/db/schema";
import { failAndRefund, sweepDeadlines } from "../../src/server/fulfillment/generate";
import { buildFacts, selectSnippets } from "../../src/server/fulfillment/prompt";
import { ensureGuest } from "../../src/server/guest";
import { startCheckout, type CheckoutDeps } from "../../src/server/payments/checkout";
import { reconcileRefunds, requestRefund } from "../../src/server/payments/refunds";
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

  // A: crash between "failed" and the refund claim
  it.fails("A: a crash after marking failed still ends in a refund claim (sweep or reconcile recovers it)", async () => {
    const { orderId } = await paidOrder();
    const crashing = new Proxy(h.db, { get: (t, p) => (p === "transaction" ? () => { throw new Error("process killed"); } : Reflect.get(t, p)) });
    await expect(failAndRefund({ db: crashing as typeof h.db, ring, boss, payments: pay }, orderId, "deadline")).rejects.toThrow();
    expect(await order(orderId)).toMatchObject({ paymentStatus: "paid", fulfillmentStatus: "failed" });
    const later = () => new Date(Date.now() + 60 * 60_000);
    await sweepDeadlines({ db: h.db, ring, boss, payments: pay, now: later });
    await reconcileRefunds({ db: h.db, payments: pay, now: later });
    expect(await refundRows(orderId)).toHaveLength(1);
  });

  // B: refund webhook arrives before the API response is stored
  it.fails("B: webhook-first refund merges into the service refund row (no duplicate, no unique-violation)", async () => {
    const { orderId, pi } = await paidOrder();
    const orig = pay.createRefund.bind(pay);
    pay.createRefund = async (req) => {
      const r = await orig(req);
      await handlePaymentEvent(wh, refundEvt(pi, r.id, "succeeded"));
      return r;
    };
    const out = await requestRefund({ db: h.db, payments: pay }, { orderId, reason: "admin", requestedBy: "admin" });
    expect(out.ok).toBe(true);
    expect(await refundRows(orderId)).toHaveLength(1);
  });

  // C: reconciliation and retries
  it.fails("C1: reconcile applies a confirmed 'failed' result to the order (back to paid)", async () => {
    const { orderId } = await paidOrder();
    pay.nextRefund = () => { throw new Error("network"); };
    await requestRefund({ db: h.db, payments: pay }, { orderId, reason: "admin", requestedBy: "admin" });
    pay.nextRefund = "failed";
    await reconcileRefunds({ db: h.db, payments: pay });
    expect((await order(orderId)).paymentStatus).toBe("paid");
  });

  it.fails("C2: after a confirmed failed refund, a new refund attempt is possible", async () => {
    const { orderId } = await paidOrder();
    pay.nextRefund = "failed";
    await requestRefund({ db: h.db, payments: pay }, { orderId, reason: "admin", requestedBy: "admin" });
    pay.nextRefund = "succeeded";
    const again = await requestRefund({ db: h.db, payments: pay }, { orderId, reason: "admin", requestedBy: "admin" });
    expect(again).toMatchObject({ ok: true, status: "succeeded" });
  });

  it.fails("C3: a late 'pending' event does not move a succeeded refund back", async () => {
    const { orderId, pi } = await paidOrder();
    await requestRefund({ db: h.db, payments: pay }, { orderId, reason: "admin", requestedBy: "admin" });
    const [r] = await refundRows(orderId);
    await handlePaymentEvent(wh, refundEvt(pi, r!.stripeRefundId!, "pending"));
    expect((await refundRows(orderId))[0]!.status).toBe("succeeded");
  });

  it.fails("C4: two partial refunds that add up to the total mark the order refunded", async () => {
    const { orderId, pi } = await paidOrder();
    await handlePaymentEvent(wh, refundEvt(pi, "re_part1", "succeeded", 200));
    await handlePaymentEvent(wh, refundEvt(pi, "re_part2", "succeeded", 199));
    expect((await order(orderId)).paymentStatus).toBe("refunded");
  });

  it.fails("C5: long-pending refunds are looked up by reconciliation", async () => {
    const { orderId } = await paidOrder();
    pay.nextRefund = "pending";
    await requestRefund({ db: h.db, payments: pay }, { orderId, reason: "admin", requestedBy: "admin" });
    const before = pay.calls.createRefund;
    await reconcileRefunds({ db: h.db, payments: pay, now: () => new Date(Date.now() + 2 * 86_400_000) });
    expect(pay.calls.createRefund).toBeGreaterThan(before);
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

  // G: paid at Stripe but our validation rejected it
  it.fails("G: a paid session that fails validation leaves a recoverable record (not just a rejected event)", async () => {
    const { orderId, res } = await paidOrder(undefined, { amountSubtotal: 1 });
    expect(res.outcome).toBe("rejected");
    const o = await order(orderId);
    const rows = await refundRows(orderId);
    expect(o.paymentStatus !== "open" || rows.length > 0).toBe(true);
  });

  // 3: login, goodwill, enumeration
  it("3a: an ADMIN_EMAILS address can get its first link on a fresh database", async () => {
    const mail = new FakeEmail();
    const r = await requestMagicLink({ db: h.db, ring, email: mail, origin: "https://haeday.test", supportEmail: "s@haeday.test", adminEmails: ["owner@haeday.test"] } as never, "owner@haeday.test");
    expect(r).toBe("sent");
  });

  it.fails("3b: concurrent goodwill refunds on two orders of the same email → only one succeeds", async () => {
    let doubled = 0;
    for (let i = 0; i < 5; i++) {
      const email = `gw${i}-${++n}@example.test`;
      const a = await paidOrder(email); const b = await paidOrder(email);
      const res = await Promise.all([a, b].map((x) => requestRefund({ db: h.db, payments: pay }, { orderId: x.orderId, reason: "goodwill", requestedBy: "customer" })));
      if (res.filter((r) => r.ok).length > 1) doubled++;
    }
    expect(doubled).toBe(0);
  });

  // 3c now tests the real HTTP boundary in tests/auth-request-route.test.ts.
  // Internal service outcomes intentionally remain distinct for operational handling.
});
