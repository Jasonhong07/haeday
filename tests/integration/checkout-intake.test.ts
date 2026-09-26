// CC1b checkout intake contract (PROPOSAL_V2_CODEX.md §6 CO01–CO05, RC01–RC03; F4/F7/F12/F15; D51) against real
// Postgres + pg-boss. FakePaymentAdapter enforces Stripe's rules: same key needs same parameters, expires_at must be
// ≥30 min ahead at creation, and "lost" responses still create the session.
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeLlm } from "../../src/server/adapters/llm";
import { FakePaymentAdapter } from "../../src/server/adapters/fake-payments";
import { createChart } from "../../src/server/charts/service";
import type { DbHandle } from "../../src/server/db/client";
import { checkoutAttempts, orders, paymentIssues, readings, refunds, settings } from "../../src/server/db/schema";
import { dashboard } from "../../src/server/admin";
import { failAndRefund, generateReading } from "../../src/server/fulfillment/generate";
import { buildFacts, contentReady, requiredSnippets } from "../../src/server/fulfillment/prompt";
import { ensureGuest } from "../../src/server/guest";
import { startCheckout, type CheckoutDeps, type OrderSnapshot } from "../../src/server/payments/checkout";
import { reconcileOpenSessions, reconcileStripeSessions, CURSOR_KEY } from "../../src/server/payments/reconcile";
import { requestRefund } from "../../src/server/payments/refunds";
import { applyPaidSession, handlePaymentEvent, type WebhookDeps } from "../../src/server/payments/webhook";
import { searchPlaces } from "../../src/server/places";
import { QUEUES, createBoss, ensureQueues } from "../../src/server/queue/boss";
import { decryptPrivate, type Keyring } from "../../src/server/security/encryption";
import { aad } from "../../src/server/security/keyring";
import { resetSettingsCache, setSalesEnabled } from "../../src/server/settings";
import { validReading } from "../helpers/reading";
import { TEST_DATABASE_URL, freshDb, hasDb } from "./helpers";

const ring: Keyring = { activeId: "t1", keys: { t1: randomBytes(32) }, lookupKey: randomBytes(32) };
const PRICE = "price_test_saju";
const nyc = searchPlaces("new york")[0]!.placeId;

describe.skipIf(!hasDb)("checkout intake (CC1b)", () => {
  let h: DbHandle; let boss: PgBoss; let pay: FakePaymentAdapter; let co: CheckoutDeps; let wh: WebhookDeps;
  let evt = 0;
  beforeAll(async () => { h = await freshDb(); boss = createBoss(TEST_DATABASE_URL!); await boss.start(); await ensureQueues(boss); });
  afterAll(async () => { await boss?.stop({ graceful: false }); await h?.pool.end(); });
  beforeEach(async () => {
    pay = new FakePaymentAdapter();
    co = { db: h.db, ring, payments: pay, priceId: PRICE, origin: "https://haeday.test", automaticTax: false, approvedSnippetsOnly: false };
    wh = { db: h.db, ring, boss, payments: pay, paymentsMode: "test", priceId: PRICE };
    resetSettingsCache(); await setSalesEnabled(h.db, true, "test");
  });

  async function newChart() {
    const g = await ensureGuest(h.db, undefined);
    const c = (await createChart(h.db, ring, g.id, { birthDate: "1985-03-20", time: { kind: "exact", hhmm: "14:15" }, placeId: nyc })) as { id: string };
    return { guestId: g.id, chartId: c.id };
  }
  const order = async (id: string) => (await h.db.query.orders.findFirst({ where: eq(orders.id, id) }))!;
  const ordersOf = (chartId: string) => h.db.select().from(orders).where(eq(orders.chartRevisionId, chartId));
  const completed = (sessionId: string) => ({ id: `evt_ci${++evt}`, livemode: false, type: "checkout.completed" as const, sessionId });
  const jobs = async (key: string) => ((await h.db.execute(sql`select count(*)::int as n from pgboss.job where name = ${QUEUES.generateReading} and singleton_key = ${key}`)).rows[0] as { n: number }).n;
  const at = (minutes: number) => () => new Date(Date.now() + minutes * 60_000);

  // ---------------- F4 ----------------
  it("CO01: a retry after a redeploy (price/origin/tax/promo settings changed) re-sends the ORIGINAL frozen request", async () => {
    const { guestId, chartId } = await newChart();
    pay.nextSession = "down";
    expect(await startCheckout(co, guestId, chartId, true)).toEqual({ ok: false, error: "provider_error" });
    const [o] = await ordersOf(chartId);
    const changed = { ...co, priceId: "price_new", origin: "https://other.test", automaticTax: true, allowPromotionCodes: false };
    const r = await startCheckout(changed, guestId, chartId, true);
    expect(r).toMatchObject({ ok: true, orderId: o!.id });
    const sent = [...pay.sessions.values()][0]!.req;
    expect(sent).toMatchObject({ priceId: PRICE, successUrl: `https://haeday.test/order/${o!.id}`, automaticTax: false, allowPromotionCodes: true });
    expect((await order(o!.id)).providerCheckoutId).toBe([...pay.sessions.keys()][0]);
  });

  it("CO01b: an ADAPTER change between attempts (new provider body) still replays the frozen body (no idempotency error)", async () => {
    const { guestId, chartId } = await newChart();
    pay.nextSession = "down";
    await startCheckout(co, guestId, chartId, true);
    const original = pay.buildCheckoutParams.bind(pay);
    pay.buildCheckoutParams = (req) => ({ ...original(req), bodyVersion: 2, payment_method_types: ["card", "link"] });
    const r = await startCheckout(co, guestId, chartId, true);
    expect(r.ok).toBe(true);
    expect([...pay.sessions.values()][0]!.req.providerParams).toMatchObject({ bodyVersion: 1 });
  });

  it("CO01c: if a key ever meets a different body, the order is closed with an issue and a new order opens (never wedged)", async () => {
    const { guestId, chartId } = await newChart();
    pay.nextSession = "lost"; // the session exists at the provider under this key
    await startCheckout(co, guestId, chartId, true);
    const [first] = await ordersOf(chartId);
    const [att] = await h.db.select().from(checkoutAttempts).where(eq(checkoutAttempts.orderId, first!.id));
    await h.db.update(checkoutAttempts).set({ request: { ...(att!.request as object), providerParams: { tampered: true } } }).where(eq(checkoutAttempts.id, att!.id));
    const r = await startCheckout(co, guestId, chartId, true);
    expect(r.ok).toBe(true);
    expect((await order(first!.id)).paymentStatus).toBe("expired");
    expect((await h.db.select().from(paymentIssues).where(eq(paymentIssues.orderId, first!.id))).map((i) => i.kind)).toContain("checkout_idempotency_mismatch");
  });

  it("CO02: session created but the response was lost → the next click gets the SAME session (no second session)", async () => {
    const { guestId, chartId } = await newChart();
    pay.nextSession = "lost";
    expect(await startCheckout(co, guestId, chartId, true)).toEqual({ ok: false, error: "provider_error" });
    expect(pay.sessions.size).toBe(1);
    const r = await startCheckout(co, guestId, chartId, true);
    expect(r.ok).toBe(true);
    expect(pay.sessions.size).toBe(1);
    const [att] = await h.db.select().from(checkoutAttempts);
    expect(att).toBeTruthy();
  });

  it("CO02b: lost response and the customer paid anyway → reconciliation links and unlocks with full proof", async () => {
    const { guestId, chartId } = await newChart();
    pay.nextSession = "lost";
    await startCheckout(co, guestId, chartId, true);
    const [o] = await ordersOf(chartId);
    expect(o!.providerCheckoutId).toBeNull();
    const [sid] = [...pay.sessions.keys()].slice(-1);
    pay.complete(sid!);
    await reconcileStripeSessions(wh);
    expect(await order(o!.id)).toMatchObject({ paymentStatus: "paid", fulfillmentStatus: "queued", providerCheckoutId: sid });
    expect(await jobs(o!.id)).toBe(1);
  });

  it("CO02c: 31 min later, never created at Stripe → proven unsent (Stripe rejects the stale expiry) → new order opens", async () => {
    const { guestId, chartId } = await newChart();
    pay.nextSession = "down";
    await startCheckout(co, guestId, chartId, true);
    const [first] = await ordersOf(chartId);
    pay.nowUnix = () => Math.floor(Date.now() / 1000) + 31 * 60;
    const r = await startCheckout({ ...co, now: at(31) }, guestId, chartId, true);
    expect(r.ok).toBe(true);
    expect((await order(first!.id)).paymentStatus).toBe("expired");
    expect((r as { orderId: string }).orderId).not.toBe(first!.id);
  });

  it("CO02d: 31 min later but Stripe DID create it → the same key replays that session (no new order)", async () => {
    const { guestId, chartId } = await newChart();
    pay.nextSession = "lost";
    await startCheckout(co, guestId, chartId, true);
    const [first] = await ordersOf(chartId);
    pay.nowUnix = () => Math.floor(Date.now() / 1000) + 31 * 60;
    const r = await startCheckout({ ...co, now: at(31) }, guestId, chartId, true);
    expect(r).toMatchObject({ ok: true, orderId: first!.id });
    expect(pay.sessions.size).toBe(1);
  });

  // ---------------- D51 / CO03 ----------------
  it("CO03: order expired on our side but the customer completed the linked session → paid and delivered (D51)", async () => {
    const { guestId, chartId } = await newChart();
    const r = await startCheckout(co, guestId, chartId, true) as { orderId: string };
    const o = await order(r.orderId);
    await h.db.update(orders).set({ paymentStatus: "expired" }).where(eq(orders.id, o.id)); // e.g. hard stop marked it
    pay.complete(o.providerCheckoutId!);
    expect((await handlePaymentEvent(wh, completed(o.providerCheckoutId!))).outcome).toBe("paid");
    expect(await order(o.id)).toMatchObject({ paymentStatus: "paid", fulfillmentStatus: "queued" });
  });

  it("CO03b: …and the customer had already started a NEW order → that open order is closed; one paid order remains", async () => {
    const { guestId, chartId } = await newChart();
    const r1 = await startCheckout(co, guestId, chartId, true) as { orderId: string };
    const first = await order(r1.orderId);
    await h.db.update(orders).set({ paymentStatus: "expired" }).where(eq(orders.id, first.id));
    const r2 = await startCheckout(co, guestId, chartId, true) as { orderId: string };
    pay.complete(first.providerCheckoutId!);
    expect((await handlePaymentEvent(wh, completed(first.providerCheckoutId!))).outcome).toBe("paid");
    expect((await order(r2.orderId)).paymentStatus).toBe("expired");
    expect((await ordersOf(chartId)).filter((x) => x.paymentStatus === "paid")).toHaveLength(1);
  });

  it("CO03c: …but if the NEW order was already paid, the late one is a duplicate: refunded, never unlocked", async () => {
    const { guestId, chartId } = await newChart();
    const r1 = await startCheckout(co, guestId, chartId, true) as { orderId: string };
    const first = await order(r1.orderId);
    await h.db.update(orders).set({ paymentStatus: "expired" }).where(eq(orders.id, first.id));
    const r2 = await startCheckout(co, guestId, chartId, true) as { orderId: string };
    const second = await order(r2.orderId);
    pay.complete(second.providerCheckoutId!);
    await handlePaymentEvent(wh, completed(second.providerCheckoutId!));
    pay.complete(first.providerCheckoutId!);
    expect(await handlePaymentEvent(wh, completed(first.providerCheckoutId!))).toEqual({ outcome: "rejected", reason: "duplicate_purchase" });
    expect(await order(first.id)).toMatchObject({ paymentStatus: "refund_pending", fulfillmentStatus: "none" });
    expect((await h.db.select().from(refunds).where(eq(refunds.orderId, first.id)))[0]!.reason).toBe("duplicate");
    expect(await jobs(first.id)).toBe(0);
  });

  it("CO03d: expired order + open sibling, and the late payment FAILS validation → refunded as a duplicate-safe row (no index crash)", async () => {
    const { guestId, chartId } = await newChart();
    const r1 = await startCheckout(co, guestId, chartId, true) as { orderId: string };
    const first = await order(r1.orderId);
    await h.db.update(orders).set({ paymentStatus: "expired" }).where(eq(orders.id, first.id));
    const r2 = await startCheckout(co, guestId, chartId, true) as { orderId: string };
    const second = await order(r2.orderId);
    pay.complete(second.providerCheckoutId!);
    await handlePaymentEvent(wh, completed(second.providerCheckoutId!)); // sibling is paid
    pay.complete(first.providerCheckoutId!, { amountSubtotal: 100, amountTotal: 100 });
    expect(await handlePaymentEvent(wh, completed(first.providerCheckoutId!))).toEqual({ outcome: "rejected", reason: "subtotal_mismatch" });
    expect(await order(first.id)).toMatchObject({ paymentStatus: "refund_pending", fulfillmentStatus: "none", duplicateOfOrderId: second.id });
  });

  // ---------------- F15 ----------------
  it("CO04: a 100% promotion code → free entitlement: delivered like a sale, not counted as revenue, never refunded", async () => {
    const { guestId, chartId } = await newChart();
    const r = await startCheckout(co, guestId, chartId, true) as { orderId: string };
    const o = await order(r.orderId);
    pay.complete(o.providerCheckoutId!, { paymentStatus: "no_payment_required", paymentIntentId: null, amountDiscount: 399, amountTotal: 0, promotionCodeId: "promo_free1", customerEmail: "free@example.test" });
    expect((await handlePaymentEvent(wh, completed(o.providerCheckoutId!))).outcome).toBe("paid");
    expect(await order(o.id)).toMatchObject({ paymentStatus: "paid", totalCents: 0, discountCents: 399, promotionCodeId: "promo_free1", providerPaymentId: null });
    expect(await requestRefund({ db: h.db, payments: pay, boss }, { orderId: o.id, reason: "goodwill", requestedBy: "customer" })).toEqual({ ok: false, error: "not_paid" });
    const d = await dashboard(h.db, 1);
    expect(d.freeOrders).toBeGreaterThanOrEqual(1);
    // A generation failure on a free order promises no refund.
    await h.db.update(orders).set({ fulfillmentStatus: "generating" }).where(eq(orders.id, o.id));
    expect(await failAndRefund({ db: h.db, ring, boss, payments: pay }, o.id, "test", {})).toBe("failed_refunded");
    const kinds = (await h.db.execute(sql`select kind from email_outbox where order_id = ${o.id}`)).rows.map((x) => (x as { kind: string }).kind);
    expect(kinds).toEqual(["apology_free"]);
  });

  it("CO04b: a 50% code is a normal sale for the discounted amount", async () => {
    const { guestId, chartId } = await newChart();
    const r = await startCheckout(co, guestId, chartId, true) as { orderId: string };
    const o = await order(r.orderId);
    pay.complete(o.providerCheckoutId!, { amountDiscount: 200, amountTotal: 199 });
    expect((await handlePaymentEvent(wh, completed(o.providerCheckoutId!))).outcome).toBe("paid");
    expect(await order(o.id)).toMatchObject({ totalCents: 199, discountCents: 200 });
  });

  it.each([
    ["forged discount (total does not add up)", { amountDiscount: 100, amountTotal: 399 }, "total_mismatch"],
    ["discount larger than the price", { amountDiscount: 500, amountTotal: 0 }, "discount_mismatch"],
    ["'free' without a full discount", { paymentStatus: "no_payment_required" as const, paymentIntentId: null, amountDiscount: 100, amountTotal: 299 }, "free_mismatch"],
    ["shipping appears", { amountShipping: 50, amountTotal: 449 }, "shipping_mismatch"],
  ])("CO05: rejects %s and never unlocks", async (_n, override, reason) => {
    const { guestId, chartId } = await newChart();
    const r = await startCheckout(co, guestId, chartId, true) as { orderId: string };
    const o = await order(r.orderId);
    pay.complete(o.providerCheckoutId!, override);
    expect(await handlePaymentEvent(wh, completed(o.providerCheckoutId!))).toEqual({ outcome: "rejected", reason });
    expect((await order(o.id)).fulfillmentStatus).toBe("none");
    expect(await jobs(o.id)).toBe(0);
  });

  it("CO05b: a real overcharge that fails validation refunds the ACTUAL captured amount, and the customer can still buy", async () => {
    const { guestId, chartId } = await newChart();
    const r = await startCheckout(co, guestId, chartId, true) as { orderId: string };
    const o = await order(r.orderId);
    pay.complete(o.providerCheckoutId!, { amountShipping: 50, amountTotal: 449 });
    await handlePaymentEvent(wh, completed(o.providerCheckoutId!));
    expect((await h.db.select().from(refunds).where(eq(refunds.orderId, o.id)))[0]).toMatchObject({ reason: "validation_failure", amountCents: 449 });
    // The refunded, never-unlocked payment is not a purchase: a new checkout opens a new order.
    const again = await startCheckout(co, guestId, chartId, true);
    expect(again).toMatchObject({ ok: true });
    expect((again as { orderId: string }).orderId).not.toBe(o.id);
  });

  // ---------------- F7 ----------------
  it("F7: the order freezes the exact content; generation uses it even if the deployed library changes later", async () => {
    const { guestId, chartId } = await newChart();
    const r = await startCheckout(co, guestId, chartId, true) as { orderId: string };
    const o = await order(r.orderId);
    const snap = decryptPrivate<OrderSnapshot>(o.snapshotEnc!, aad("orders", o.id, "snapshot"), ring);
    expect(snap.content?.snippets.length).toBeGreaterThan(5);
    // Simulate a later deploy that changed a text: tamper the frozen copy and prove generation sends the frozen one.
    snap.content!.snippets[0]!.text = "FROZEN-TEXT-MARKER";
    snap.content!.snippets.forEach((x) => { x.approvedBy = "jason"; }); // as if checked out from an approved library
    const { encryptPrivate } = await import("../../src/server/security/encryption");
    await h.db.update(orders).set({ snapshotEnc: encryptPrivate(snap, aad("orders", o.id, "snapshot"), ring) }).where(eq(orders.id, o.id));
    pay.complete(o.providerCheckoutId!);
    await handlePaymentEvent(wh, completed(o.providerCheckoutId!));
    const llm = new FakeLlm();
    const facts = buildFacts((snap.response as { chart: Parameters<typeof buildFacts>[0] }).chart);
    llm.queue.push(validReading(facts, snap.content!.snippets.map((s) => s.id)));
    const out = await generateReading({ db: h.db, ring, boss, llm, payments: pay, approvedSnippetsOnly: true, dailyCap: 100 }, o.id);
    expect(out).toBe("delivered");
    expect(llm.calls[0]!.user).toContain("FROZEN-TEXT-MARKER");
    expect((await h.db.select().from(readings).where(eq(readings.orderId, o.id)))[0]!.libraryVersion).toBe(snap.content!.snippetsVersion);
  });

  it("F7c: production refuses to generate from frozen DRAFT content (defence in depth), even if checkout let it through", async () => {
    const { guestId, chartId } = await newChart();
    const r = await startCheckout(co, guestId, chartId, true) as { orderId: string }; // staging checkout: drafts frozen
    const o = await order(r.orderId);
    pay.complete(o.providerCheckoutId!);
    await handlePaymentEvent(wh, completed(o.providerCheckoutId!));
    const llm = new FakeLlm();
    await expect(generateReading({ db: h.db, ring, boss, llm, payments: pay, approvedSnippetsOnly: true, dailyCap: 100 }, o.id)).rejects.toThrow(/content_not_approved/);
    expect(llm.calls).toHaveLength(0);
  });

  it("F7b: contentReady needs EVERY required snippet approved (one missing = not ready)", () => {
    const facts = { dayMaster: { stem: "甲" }, visibleElements: { wood: 3, fire: 0, earth: 1, metal: 1, water: 1 }, tenGods: [{ god: "companion" }] } as unknown as Parameters<typeof requiredSnippets>[0];
    const req = requiredSnippets(facts);
    expect(contentReady(facts, false)).toBe(true);
    expect(contentReady(facts, true)).toBe(false);
    const saved = req.map((s) => s.approvedBy);
    try {
      req.forEach((s) => { (s as { approvedBy: string | null }).approvedBy = "jason"; });
      expect(contentReady(facts, true)).toBe(true);
      (req[1] as { approvedBy: string | null }).approvedBy = null;
      expect(contentReady(facts, true)).toBe(false);
    } finally {
      req.forEach((s, i) => { (s as { approvedBy: string | null }).approvedBy = saved[i]!; });
    }
  });

  // ---------------- F12 ----------------
  it("RC01: webhook never arrived → the 3-minute check unlocks the paid order once; a late webhook is a no-op", async () => {
    const { guestId, chartId } = await newChart();
    const r = await startCheckout(co, guestId, chartId, true) as { orderId: string };
    const o = await order(r.orderId);
    pay.complete(o.providerCheckoutId!);
    await h.db.update(orders).set({ updatedAt: new Date(Date.now() - 5 * 60_000) }).where(eq(orders.id, o.id));
    expect((await reconcileOpenSessions(wh)).paid).toBeGreaterThanOrEqual(1);
    expect(await order(o.id)).toMatchObject({ paymentStatus: "paid", fulfillmentStatus: "queued" });
    expect((await handlePaymentEvent(wh, completed(o.providerCheckoutId!))).outcome).toBe("no_transition");
    expect(await jobs(o.id)).toBe(1);
  });

  it("RC02: after a 72-hour outage the wide scan (persistent cursor + overlap, >100 sessions) still finds it", async () => {
    const { guestId, chartId } = await newChart();
    const r = await startCheckout(co, guestId, chartId, true) as { orderId: string };
    const o = await order(r.orderId);
    pay.complete(o.providerCheckoutId!);
    // 120 other completed sessions (pagination), all older noise from another integration.
    for (let i = 0; i < 120; i++) {
      const id = `cs_test_noise_${i}`;
      pay.sessions.set(id, { ref: { id, url: null, status: "complete" }, req: { ...pay.sessions.get(o.providerCheckoutId!)!.req, orderId: "not-a-uuid" }, details: { paymentStatus: "paid", clientReferenceId: "not-a-uuid", metadataOrderId: "not-a-uuid" }, created: Math.floor(Date.now() / 1000) - 3600 });
    }
    const threeDaysAgo = Math.floor(Date.now() / 1000) - 72 * 3600;
    await h.db.insert(settings).values({ key: CURSOR_KEY, value: threeDaysAgo, updatedBy: "test" }).onConflictDoUpdate({ target: settings.key, set: { value: threeDaysAgo } });
    const res = await reconcileStripeSessions(wh);
    expect(res.scanned).toBeGreaterThan(100);
    expect(await order(o.id)).toMatchObject({ paymentStatus: "paid" });
    expect(res.cursor).toBeGreaterThan(threeDaysAgo);
    const noise = await h.db.select().from(paymentIssues).where(eq(paymentIssues.kind, "unlinked_paid_session"));
    expect(noise.length).toBeGreaterThanOrEqual(120); // paid sessions with no order of ours: surfaced, never refunded
    const again = await reconcileStripeSessions(wh); // second pass: nothing new, no duplicate issues
    expect(again.paid).toBe(0);
    expect((await h.db.select().from(paymentIssues).where(eq(paymentIssues.kind, "unlinked_paid_session"))).every((i) => i.occurrences === 1)).toBe(true);
  });

  it("RC03: webhook and reconciliation at the same time → one transition, one generation job", async () => {
    const { guestId, chartId } = await newChart();
    const r = await startCheckout(co, guestId, chartId, true) as { orderId: string };
    const o = await order(r.orderId);
    pay.complete(o.providerCheckoutId!);
    const d = await pay.getCheckoutDetails(o.providerCheckoutId!);
    const res = await Promise.all([
      handlePaymentEvent(wh, completed(o.providerCheckoutId!)),
      applyPaidSession(wh, d, { eventId: `reconcile:${d.id}`, type: "reconcile.completed", livemode: false }),
    ]);
    expect(res.map((x) => x.outcome).sort()).toEqual(["no_transition", "paid"]);
    expect(await jobs(o.id)).toBe(1);
  });

  it("RC05: a session that fails every run blocks the scan only 3 times, then becomes an issue and later sessions proceed", async () => {
    const a = await newChart(); const b = await newChart();
    const broken = await order(((await startCheckout(co, a.guestId, a.chartId, true)) as { orderId: string }).orderId);
    const good = await order(((await startCheckout(co, b.guestId, b.chartId, true)) as { orderId: string }).orderId);
    pay.complete(broken.providerCheckoutId!); pay.complete(good.providerCheckoutId!); // same second, broken listed first
    const real = pay.getCheckoutDetails.bind(pay);
    pay.getCheckoutDetails = async (id) => { if (id === broken.providerCheckoutId) throw new Error("always broken"); return real(id); };
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) { await reconcileStripeSessions(wh); seen.push((await order(good.id)).paymentStatus); }
    pay.getCheckoutDetails = real;
    expect(seen).toEqual(["open", "open", "paid"]); // blocked on runs 1–2; on run 3 the issue takes over and the scan moves on
    const [issue] = await h.db.select().from(paymentIssues).where(eq(paymentIssues.providerObjectId, broken.providerCheckoutId!));
    expect(issue).toMatchObject({ kind: "reconcile_session_failed", status: "open", occurrences: 3 });
  });

  it("RC06: the 3-minute check rotates every order, so failing reads cannot starve the batch", async () => {
    const { guestId, chartId } = await newChart();
    const r = await startCheckout(co, guestId, chartId, true) as { orderId: string };
    const old = new Date(Date.now() - 10 * 60_000);
    await h.db.update(orders).set({ updatedAt: old }).where(eq(orders.id, r.orderId));
    const real = pay.getCheckoutDetails.bind(pay);
    pay.getCheckoutDetails = async () => { throw new Error("down"); };
    await reconcileOpenSessions(wh);
    pay.getCheckoutDetails = real;
    expect((await order(r.orderId)).updatedAt.getTime()).toBeGreaterThan(old.getTime());
  });

  it("RC04: a provider error mid-scan keeps the cursor before the failure (retried next run)", async () => {
    const before = ((await h.db.select().from(settings).where(eq(settings.key, CURSOR_KEY)))[0]?.value as number | undefined) ?? 0;
    const { guestId, chartId } = await newChart();
    const r = await startCheckout(co, guestId, chartId, true) as { orderId: string };
    const o = await order(r.orderId);
    pay.complete(o.providerCheckoutId!);
    const real = pay.getCheckoutDetails.bind(pay);
    pay.getCheckoutDetails = async () => { throw new Error("provider down"); };
    const res = await reconcileStripeSessions(wh);
    pay.getCheckoutDetails = real;
    expect((await order(o.id)).paymentStatus).toBe("open");
    expect(res.cursor).toBeLessThanOrEqual(Math.max(before, [...pay.sessions.values()].find((s) => s.ref.id === o.providerCheckoutId)!.created));
    await reconcileStripeSessions(wh);
    expect((await order(o.id)).paymentStatus).toBe("paid");
  });
});
