// CC4c: PayPal/Venmo checkout, capture, reconciliation, refunds and disputes against a real Postgres + pg-boss,
// with in-memory PayPal and Stripe stand-ins. Every path must reach the SAME validated transition as Stripe.
import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakePaymentAdapter } from "../../src/server/adapters/fake-payments";
import { FakePayPalAdapter } from "../../src/server/adapters/fake-paypal";
import { createChart } from "../../src/server/charts/service";
import type { DbHandle } from "../../src/server/db/client";
import { disputes, orders, paymentIssues, refunds } from "../../src/server/db/schema";
import { ensureGuest } from "../../src/server/guest";
import { startCheckout, type CheckoutDeps } from "../../src/server/payments/checkout";
import { reconcileOpenSessions } from "../../src/server/payments/reconcile";
import { executeRefund, requestRefund, syncOrderRefunds } from "../../src/server/payments/refunds";
import { captureAndApply, handlePaymentEvent, type WebhookDeps } from "../../src/server/payments/webhook";
import { searchPlaces } from "../../src/server/places";
import { createBoss, ensureQueues } from "../../src/server/queue/boss";
import { decryptPrivate, emailLookup, type Keyring } from "../../src/server/security/encryption";
import { aad } from "../../src/server/security/keyring";
import { resetSettingsCache, setSalesEnabled } from "../../src/server/settings";
import { TEST_DATABASE_URL, freshDb, hasDb } from "./helpers";

const ring: Keyring = { activeId: "t1", keys: { t1: randomBytes(32) }, lookupKey: randomBytes(32) };
const nyc = searchPlaces("new york")[0]!.placeId;

describe.skipIf(!hasDb)("PayPal / Venmo (CC4c)", () => {
  let h: DbHandle; let boss: PgBoss;
  let pp: FakePayPalAdapter; let stripe: FakePaymentAdapter;
  let co: CheckoutDeps; let coStripe: CheckoutDeps; let wh: WebhookDeps; let whStripe: WebhookDeps;
  beforeAll(async () => { h = await freshDb(); boss = createBoss(TEST_DATABASE_URL!); await boss.start(); await ensureQueues(boss); });
  afterAll(async () => { await boss?.stop({ graceful: false }); await h?.pool.end(); });
  beforeEach(async () => {
    pp = new FakePayPalAdapter(); stripe = new FakePaymentAdapter();
    const base = { db: h.db, ring, origin: "https://haeday.test", automaticTax: false, approvedSnippetsOnly: false };
    co = { ...base, payments: pp, others: { stripe }, priceId: "saju_reading", allowPromotionCodes: false };
    coStripe = { ...base, payments: stripe, others: { paypal: pp }, priceId: "price_test_saju" };
    wh = { db: h.db, ring, boss, payments: pp, others: { stripe }, paymentsMode: "test", priceId: "saju_reading" };
    whStripe = { db: h.db, ring, boss, payments: stripe, others: { paypal: pp }, paymentsMode: "test", priceId: "price_test_saju" };
    resetSettingsCache(); await setSalesEnabled(h.db, true, "test");
  });

  async function chart() {
    const g = await ensureGuest(h.db, undefined);
    const c = (await createChart(h.db, ring, g.id, { birthDate: "1985-03-20", time: { kind: "exact", hhmm: "14:15" }, placeId: nyc })) as { id: string };
    return { guestId: g.id, chartId: c.id };
  }
  const order = async (id: string) => (await h.db.query.orders.findFirst({ where: eq(orders.id, id) }))!;
  const genJobs = async (orderId: string) => ((await h.db.execute(sql`select count(*)::int n from pgboss.job where name = 'reading.generate' and singleton_key = ${orderId}`)).rows[0] as { n: number }).n;
  async function start(email = "Buyer.PP@Example.test") {
    const { guestId, chartId } = await chart();
    const r = await startCheckout(co, guestId, chartId, true, "saju_reading", "minutes", { email });
    if (!r.ok) throw new Error(r.error);
    return { guestId, chartId, orderId: r.orderId, ppId: r.providerCheckoutId };
  }
  async function paid(email?: string) {
    const s = await start(email);
    pp.approve(s.ppId);
    expect((await captureAndApply(wh, s.ppId)).outcome).toBe("paid");
    return s;
  }

  it("PP01 creates a PayPal order with the typed email on file (encrypted), frozen body, and reuses it on a double click", async () => {
    const { guestId, chartId } = await chart();
    const a = await startCheckout(co, guestId, chartId, true, "saju_reading", "minutes", { email: "Me@Example.test" });
    const b = await startCheckout(co, guestId, chartId, true, "saju_reading", "minutes", { email: "me@example.test" });
    if (!a.ok || !b.ok) throw new Error("checkout failed");
    expect(a.url).toBeNull();
    expect(b.providerCheckoutId).toBe(a.providerCheckoutId);
    expect(pp.calls.create).toBe(1);
    const o = await order(a.orderId);
    expect(o.paymentProvider).toBe("paypal");
    expect(o.deliveryEmailEnc).not.toMatch(/example/i);
    expect(decryptPrivate<string>(o.deliveryEmailEnc!, aad("orders", o.id, "delivery_email"), ring)).toBe("me@example.test");
    expect(o.deliveryEmailLookup).toBe(emailLookup("me@example.test", ring));
    expect(await startCheckout(co, guestId, chartId, true, "saju_reading", "minutes", {})).toEqual({ ok: false, error: "consent_required" }); // PayPal needs the email
  });

  it("PP02 approve → capture → paid through the SAME validation; delivery email is the typed one; a second capture changes nothing", async () => {
    const s = await paid("typed@example.test");
    const o = await order(s.orderId);
    expect(o).toMatchObject({ paymentStatus: "paid", fulfillmentStatus: "queued", totalCents: 399, paymentProvider: "paypal" });
    expect(o.providerPaymentId).toMatch(/^CAPFAKE/);
    expect(decryptPrivate<string>(o.deliveryEmailEnc!, aad("orders", o.id, "delivery_email"), ring)).toBe("typed@example.test");
    expect(await genJobs(s.orderId)).toBe(1);
    expect((await captureAndApply(wh, s.ppId)).outcome).toBe("no_transition");
    expect(pp.calls.capture).toBe(1);
    expect(await genJobs(s.orderId)).toBe(1);
  });

  it("PP03 not approved yet / declined: nothing is charged and the order stays open for another try", async () => {
    const s = await start();
    expect((await captureAndApply(wh, s.ppId)).outcome).toBe("not_approved");
    pp.approve(s.ppId);
    pp.captureNext = "declined";
    expect((await captureAndApply(wh, s.ppId)).outcome).toBe("declined");
    expect((await order(s.orderId)).paymentStatus).toBe("open");
    expect((await captureAndApply(wh, s.ppId)).outcome).toBe("paid");
  });

  it("PP04 capture response lost: reconciliation finds the completed order and unlocks it once (one capture)", async () => {
    const s = await start();
    pp.approve(s.ppId);
    pp.captureNext = "lost";
    expect((await captureAndApply(wh, s.ppId)).outcome).toBe("provider_error");
    expect((await order(s.orderId)).paymentStatus).toBe("open");
    const later = new Date(Date.now() + 5 * 60_000);
    expect((await reconcileOpenSessions({ ...wh, now: () => later })).paid).toBe(1);
    expect((await order(s.orderId)).paymentStatus).toBe("paid");
    expect(pp.calls.capture).toBe(1);
    expect(await genJobs(s.orderId)).toBe(1);
  });

  it("PP05 approved but never captured (buyer closed the window): reconciliation captures it", async () => {
    const s = await start();
    pp.approve(s.ppId);
    const later = new Date(Date.now() + 5 * 60_000);
    expect((await reconcileOpenSessions({ ...wh, now: () => later })).paid).toBe(1);
    expect((await order(s.orderId)).paymentStatus).toBe("paid");
  });

  it("PP06 webhooks: ORDER.APPROVED captures and unlocks; the later CAPTURE.COMPLETED and a redelivery change nothing", async () => {
    const s = await start();
    pp.approve(s.ppId);
    expect((await handlePaymentEvent(wh, { id: "WH-1", livemode: false, type: "checkout.approved", sessionId: s.ppId })).outcome).toBe("paid");
    expect((await handlePaymentEvent(wh, { id: "WH-2", livemode: false, type: "checkout.completed", sessionId: s.ppId })).outcome).toBe("no_transition");
    expect((await handlePaymentEvent(wh, { id: "WH-1", livemode: false, type: "checkout.approved", sessionId: s.ppId })).outcome).toBe("duplicate");
    expect(await genJobs(s.orderId)).toBe(1);
  });

  it("PP07 an order we closed is never captured, even if the buyer approves an old PayPal window", async () => {
    const s = await start();
    await h.db.update(orders).set({ paymentStatus: "expired" }).where(eq(orders.id, s.orderId));
    pp.approve(s.ppId);
    expect((await captureAndApply(wh, s.ppId)).outcome).toBe("closed");
    expect(pp.calls.capture).toBe(0);
    const later = new Date(Date.now() + 5 * 60_000);
    await reconcileOpenSessions({ ...wh, now: () => later });
    expect(pp.calls.capture).toBe(0);
  });

  it("PP08 a capture under PayPal review waits (no rejection recorded) and unlocks when PayPal completes it", async () => {
    const s = await start();
    pp.approve(s.ppId);
    pp.captureNext = "pending";
    expect((await captureAndApply(wh, s.ppId)).outcome).toBe("pending");
    const later = new Date(Date.now() + 5 * 60_000);
    expect((await reconcileOpenSessions({ ...wh, now: () => later })).paid).toBe(0);
    expect((await order(s.orderId)).paymentStatus).toBe("open");
    pp.completeCapture(s.ppId);
    expect((await handlePaymentEvent(wh, { id: "WH-P1", livemode: false, type: "checkout.completed", sessionId: s.ppId })).outcome).toBe("paid");
  });

  it("PP09 switching card ↔ PayPal closes the other open order (Stripe session expired too); only one order stays open", async () => {
    const { guestId, chartId } = await chart();
    const card = await startCheckout(coStripe, guestId, chartId, true);
    if (!card.ok) throw new Error(card.error);
    const pay = await startCheckout(co, guestId, chartId, true, "saju_reading", "minutes", { email: "switch@example.test" });
    if (!pay.ok) throw new Error(pay.error);
    expect((await order(card.orderId)).paymentStatus).toBe("expired");
    expect(stripe.sessions.get(card.providerCheckoutId)!.ref.status).toBe("expired");
    const back = await startCheckout(coStripe, guestId, chartId, true);
    if (!back.ok) throw new Error(back.error);
    expect((await order(pay.orderId)).paymentStatus).toBe("expired");
    const open = await h.db.select().from(orders).where(and(eq(orders.chartRevisionId, chartId), eq(orders.paymentStatus, "open")));
    expect(open.map((o) => o.id)).toEqual([back.orderId]);
  });

  it("PP10 a Stripe event can never pay a PayPal order (provider mismatch: rejected, no unlock, no automatic refund)", async () => {
    const s = await start();
    // Forge: a Stripe session that claims this PayPal order in its references.
    const { guestId, chartId } = await chart();
    const card = await startCheckout(coStripe, guestId, chartId, true);
    if (!card.ok) throw new Error(card.error);
    stripe.complete(card.providerCheckoutId, { clientReferenceId: s.orderId, metadataOrderId: s.orderId });
    const r = await handlePaymentEvent(whStripe, { id: "evt_forge", livemode: false, type: "checkout.completed", sessionId: card.providerCheckoutId });
    expect(r).toMatchObject({ outcome: "rejected", reason: "provider_mismatch" });
    expect((await order(s.orderId)).paymentStatus).toBe("open");
    expect(await h.db.select().from(refunds).where(eq(refunds.orderId, s.orderId))).toHaveLength(0);
  });

  it("PP11 a PayPal refund goes to PayPal with a stable request id and the order becomes refunded", async () => {
    const s = await paid("refund@example.test");
    const r = await requestRefund({ db: h.db, payments: stripe, paypal: pp, boss }, { orderId: s.orderId, reason: "goodwill", requestedBy: "customer" });
    expect(r).toMatchObject({ ok: true, status: "succeeded" });
    expect(pp.calls.createRefund).toBe(1);
    expect(stripe.calls.createRefund).toBe(0);
    expect((await order(s.orderId)).paymentStatus).toBe("refunded");
    const [row] = await h.db.select().from(refunds).where(eq(refunds.orderId, s.orderId));
    expect(row!.providerRefundId).toMatch(/^REFAKE/);
  });

  it("PP12 PayPal refund answer lost and the idempotency window passed: never a blind second refund, a person checks PayPal", async () => {
    const s = await paid();
    pp.nextRefund = "lost";
    const r = await requestRefund({ db: h.db, payments: stripe, paypal: pp, boss }, { orderId: s.orderId, reason: "admin", requestedBy: "admin" });
    expect(r).toMatchObject({ ok: true, status: "unknown" });
    const [row] = await h.db.select().from(refunds).where(eq(refunds.orderId, s.orderId));
    const late = () => new Date(Date.now() + 25 * 3_600_000);
    expect(await executeRefund({ db: h.db, payments: stripe, paypal: pp, now: late }, row!.id)).toBe("unknown");
    expect(pp.calls.createRefund).toBe(1);
    const [issue] = await h.db.select().from(paymentIssues).where(eq(paymentIssues.providerObjectId, row!.id));
    expect(issue).toMatchObject({ kind: "refund_unknown_stale", nextAction: "check_paypal_dashboard_for_this_refund" });
    expect((await h.db.select().from(refunds).where(eq(refunds.id, row!.id)))[0]!.status).toBe("unknown");
  });

  it("PP13 a refund made in the PayPal dashboard: the webhook records its id, the sync reads it, the order is refunded", async () => {
    const s = await paid();
    const cap = (await order(s.orderId)).providerPaymentId!;
    const refundId = pp.dashboardRefund(cap, 399);
    expect((await handlePaymentEvent(wh, { id: "WH-R1", livemode: false, type: "refund.updated", refundId, paymentIntentId: cap, status: "succeeded", amountCents: 399, orderId: null, refundRowId: null })).outcome).toBe("refund_updated");
    expect(await syncOrderRefunds({ db: h.db, payments: stripe, paypal: pp }, s.orderId)).toBe("synced");
    expect((await order(s.orderId)).paymentStatus).toBe("refunded");
    const rows = await h.db.select().from(refunds).where(eq(refunds.orderId, s.orderId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "provider", providerRefundId: refundId, requestedBy: "paypal_dashboard", status: "succeeded" });
  });

  it("PP14 a PayPal dispute is recorded against the order and blocks refunds", async () => {
    const s = await paid();
    const cap = (await order(s.orderId)).providerPaymentId!;
    expect((await handlePaymentEvent(wh, { id: "WH-D1", livemode: false, type: "dispute.updated", disputeId: "PP-D-1", paymentIntentId: cap, status: "open", reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED", evidenceDueBy: null })).outcome).toBe("dispute_updated");
    const [d] = await h.db.select().from(disputes).where(eq(disputes.providerDisputeId, "PP-D-1"));
    expect(d!.orderId).toBe(s.orderId);
    expect(await requestRefund({ db: h.db, payments: stripe, paypal: pp, boss }, { orderId: s.orderId, reason: "admin", requestedBy: "admin" })).toEqual({ ok: false, error: "disputed" });
  });

  it("PP15 an old unapproved PayPal order is replaced on the next click, and reconciliation closes stale ones", async () => {
    const { guestId, chartId } = await chart();
    const a = await startCheckout(co, guestId, chartId, true, "saju_reading", "minutes", { email: "old@example.test" });
    if (!a.ok) throw new Error(a.error);
    const later = () => new Date(Date.now() + 70 * 60_000);
    const b = await startCheckout({ ...co, now: later }, guestId, chartId, true, "saju_reading", "minutes", { email: "old@example.test" });
    if (!b.ok) throw new Error(b.error);
    expect(b.orderId).not.toBe(a.orderId);
    expect((await order(a.orderId)).paymentStatus).toBe("expired");
    const muchLater = new Date(Date.now() + 5 * 3_600_000); // b was created at +70 min
    expect((await reconcileOpenSessions({ ...wh, now: () => muchLater })).expired).toBeGreaterThanOrEqual(1);
    expect((await order(b.orderId)).paymentStatus).toBe("expired");
  });

  it("PP16 without the PayPal adapter configured, a PayPal refund waits (never sent to Stripe)", async () => {
    const s = await paid();
    const r = await requestRefund({ db: h.db, payments: stripe, paypal: null, boss }, { orderId: s.orderId, reason: "admin", requestedBy: "admin" });
    expect(r).toMatchObject({ ok: true, status: "requested" });
    expect(stripe.calls.createRefund).toBe(0);
    const [row] = await h.db.select().from(refunds).where(eq(refunds.orderId, s.orderId));
    expect(await executeRefund({ db: h.db, payments: stripe, paypal: pp }, row!.id)).toBe("succeeded"); // a worker that has PayPal finishes it
  });

  it("PP17 switching to card while the PayPal order is approved/in review does NOT close it (the payment is being finished)", async () => {
    const s = await start();
    pp.approve(s.ppId);
    const r = await startCheckout(coStripe, s.guestId, s.chartId, true);
    expect(r).toEqual({ ok: false, error: "processing", orderId: s.orderId });
    expect((await order(s.orderId)).paymentStatus).toBe("open");
    expect(stripe.calls.createSession).toBe(0);
  });

  it("PP18 a PayPal order we closed that PayPal still completed is found by the safety net and honoured (D51)", async () => {
    const s = await start();
    pp.approve(s.ppId);
    expect(await pp.capture(s.ppId, "external")).toEqual({ outcome: "completed" }); // captured, but our side never heard
    await h.db.update(orders).set({ paymentStatus: "expired", updatedAt: new Date(Date.now() - 3_600_000) }).where(eq(orders.id, s.orderId));
    expect((await reconcileOpenSessions(wh)).paid).toBe(1);
    const o = await order(s.orderId);
    expect(o.paymentStatus).toBe("paid");
    expect(o.duplicateOfOrderId).toBeNull();
    expect(await genJobs(s.orderId)).toBe(1);
  });

  it("PP19 after a decline the retry is a NEW capture request (a replayed failure can never wedge the order)", async () => {
    const s = await start();
    pp.approve(s.ppId);
    pp.captureNext = "declined";
    expect((await captureAndApply(wh, s.ppId)).outcome).toBe("declined");
    expect((await captureAndApply(wh, s.ppId)).outcome).toBe("paid"); // the fake replays failures for a repeated key
  });

  it("PP20 PayPal refuses the capture for good: our order closes, an issue opens, nothing is retried forever", async () => {
    const s = await start();
    pp.approve(s.ppId);
    pp.captureNext = "failed";
    expect((await captureAndApply(wh, s.ppId)).outcome).toBe("failed");
    expect((await order(s.orderId)).paymentStatus).toBe("expired");
    const [issue] = await h.db.select().from(paymentIssues).where(eq(paymentIssues.providerObjectId, s.ppId));
    expect(issue).toMatchObject({ kind: "paypal_capture_failed", nextAction: "capture_refused_COMPLIANCE_VIOLATION_nothing_charged" });
    // The webhook for the same approval is answered (no 500 → no 3-day redelivery loop).
    expect((await handlePaymentEvent(wh, { id: "WH-F1", livemode: false, type: "checkout.approved", sessionId: s.ppId })).outcome).toBe("closed");
  });

  it("PP21 a refund/dispute event for a Stripe payment id is never applied to a PayPal order (provider filter)", async () => {
    const s = await paid();
    const cap = (await order(s.orderId)).providerPaymentId!;
    const r = await handlePaymentEvent(whStripe, { id: "evt_x", livemode: false, type: "charge.refunded", paymentIntentId: cap, amountRefundedCents: 399, amountCents: 399 });
    expect(r).toMatchObject({ outcome: "ignored", reason: "unknown_payment_intent" });
  });
});
