// M3 + M4 + refund core against a real Postgres + pg-boss, with fake payment/LLM/email adapters.
// Covers TASKS M3/M4/M6 test lists: duplicates, tampering, late events, concurrency, fencing, deadlines.
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeEmail, EmailError } from "../../src/server/adapters/email";
import { FakeLlm, LlmError } from "../../src/server/adapters/llm";
import { FakePaymentAdapter } from "../../src/server/adapters/fake-payments";
import { createChart } from "../../src/server/charts/service";
import type { DbHandle } from "../../src/server/db/client";
import { emailOutbox, generationAttempts, orders, readings, refunds } from "../../src/server/db/schema";
import { sendQueuedEmail } from "../../src/server/email/outbox";
import { generateReading, RetryGeneration, sweepDeadlines, type GenerateDeps } from "../../src/server/fulfillment/generate";
import { buildFacts, selectSnippets } from "../../src/server/fulfillment/prompt";
import { validReading } from "../helpers/reading";
import { ensureGuest } from "../../src/server/guest";
import { startCheckout, type CheckoutDeps, type OrderSnapshot } from "../../src/server/payments/checkout";
import { reconcileRefunds, requestRefund, syncOrderRefunds } from "../../src/server/payments/refunds";
import { handlePaymentEvent, type WebhookDeps } from "../../src/server/payments/webhook";
import { searchPlaces } from "../../src/server/places";
import { QUEUES, createBoss, ensureQueues } from "../../src/server/queue/boss";
import { decryptPrivate, type Keyring } from "../../src/server/security/encryption";
import { aad } from "../../src/server/security/keyring";
import { resetSettingsCache, setSalesEnabled } from "../../src/server/settings";
import { TEST_DATABASE_URL, freshDb, hasDb } from "./helpers";

const ring: Keyring = { activeId: "t1", keys: { t1: randomBytes(32) }, lookupKey: randomBytes(32) };
const PRICE = "price_test_saju";
const nyc = searchPlaces("new york")[0]!.placeId;

describe.skipIf(!hasDb)("commerce core (checkout → webhook → generation → email, refunds)", () => {
  let h: DbHandle; let boss: PgBoss;
  let pay: FakePaymentAdapter; let llm: FakeLlm; let mail: FakeEmail;
  let co: CheckoutDeps; let wh: WebhookDeps; let gen: GenerateDeps;

  beforeAll(async () => {
    h = await freshDb();
    boss = createBoss(TEST_DATABASE_URL!); await boss.start(); await ensureQueues(boss);
  });
  afterAll(async () => { await boss?.stop({ graceful: false }); await h?.pool.end(); });
  beforeEach(async () => {
    pay = new FakePaymentAdapter(); llm = new FakeLlm(); mail = new FakeEmail();
    co = { db: h.db, ring, payments: pay, priceId: PRICE, origin: "https://haeday.test", automaticTax: false, approvedSnippetsOnly: false };
    wh = { db: h.db, ring, boss, payments: pay, paymentsMode: "test", priceId: PRICE };
    gen = { db: h.db, ring, boss, llm, payments: pay, approvedSnippetsOnly: false, dailyCap: 100 };
    resetSettingsCache(); await setSalesEnabled(h.db, true, "test");
  });

  async function newChart(time: { kind: "exact"; hhmm: string } | { kind: "unknown" } = { kind: "exact", hhmm: "14:15" }, date = "1985-03-20") {
    const g = await ensureGuest(h.db, undefined);
    const c = await createChart(h.db, ring, g.id, { birthDate: date, time, placeId: nyc });
    return { guestId: g.id, chartId: (c as { id: string }).id };
  }
  let evt = 0;
  const completed = (sessionId: string) => ({ id: `evt_${++evt}`, livemode: false, type: "checkout.completed" as const, sessionId });
  async function paidOrder(email = "buyer@example.test") {
    const { guestId, chartId } = await newChart();
    const r = await startCheckout(co, guestId, chartId, true);
    if (!r.ok) throw new Error(r.error);
    const order = (await h.db.query.orders.findFirst({ where: eq(orders.id, r.orderId) }))!;
    pay.complete(order.providerCheckoutId!, { customerEmail: email });
    expect((await handlePaymentEvent(wh, completed(order.providerCheckoutId!))).outcome).toBe("paid");
    return { guestId, chartId, orderId: r.orderId };
  }
  const jobs = async (queue: string, key: string) =>
    ((await h.db.execute(sql`select count(*)::int as n from pgboss.job where name = ${queue} and singleton_key = ${key}`)).rows[0] as { n: number }).n;
  const order = async (id: string) => (await h.db.query.orders.findFirst({ where: eq(orders.id, id) }))!;

  // ---------------- checkout ----------------
  it("refuses without consent, when sales are closed, or for a chart that still needs an answer", async () => {
    const { guestId, chartId } = await newChart();
    expect(await startCheckout(co, guestId, chartId, false)).toEqual({ ok: false, error: "consent_required" });
    await setSalesEnabled(h.db, false, "test");
    expect(await startCheckout(co, guestId, chartId, true)).toEqual({ ok: false, error: "sales_closed" });
    await setSalesEnabled(h.db, true, "test");
    const fold = await newChart({ kind: "exact", hhmm: "01:30" }, "1995-10-29");
    expect(await startCheckout(co, fold.guestId, fold.chartId, true)).toEqual({ ok: false, error: "needs_answer" });
    const other = await ensureGuest(h.db, undefined);
    expect(await startCheckout(co, other.id, chartId, true)).toEqual({ ok: false, error: "not_found" });
  });

  it("double click creates one order and one session; the snapshot is encrypted and frozen", async () => {
    const { guestId, chartId } = await newChart();
    const [a, b] = await Promise.all([startCheckout(co, guestId, chartId, true), startCheckout(co, guestId, chartId, true)]);
    expect(a.ok && b.ok).toBe(true);
    expect((a as { url: string }).url).toBe((b as { url: string }).url);
    const rows = await h.db.select().from(orders).where(eq(orders.chartRevisionId, chartId));
    expect(rows).toHaveLength(1);
    expect(pay.sessions.size).toBe(1);
    const raw = JSON.stringify((await h.db.execute(sql`select * from orders where id = ${rows[0]!.id}`)).rows[0]);
    expect(raw).not.toMatch(/1985|New York|戊午/);
    const snap = decryptPrivate<OrderSnapshot>(rows[0]!.snapshotEnc!, aad("orders", rows[0]!.id, "snapshot"), ring);
    expect(snap).toMatchObject({ chartRevisionId: chartId, amountCents: 399, currency: "usd", sku: "saju_reading" });
    // Reopening the checkout reuses the still-open session.
    const again = await startCheckout(co, guestId, chartId, true);
    expect((again as { url: string }).url).toBe((a as { url: string }).url);
  });

  it("an expired session is replaced by a new order", async () => {
    const { guestId, chartId } = await newChart();
    const first = await startCheckout(co, guestId, chartId, true);
    const o = await order((first as { orderId: string }).orderId);
    await pay.expireCheckoutSession(o.providerCheckoutId!);
    const second = await startCheckout(co, guestId, chartId, true);
    expect((second as { orderId: string }).orderId).not.toBe(o.id);
    expect((await order(o.id)).paymentStatus).toBe("expired");
  });

  // ---------------- webhook ----------------
  it("a validated completion marks paid, stores amounts and email lookup, and enqueues exactly one job; duplicates are no-ops", async () => {
    const { guestId, chartId } = await newChart();
    const r = await startCheckout(co, guestId, chartId, true);
    const o = await order((r as { orderId: string }).orderId);
    pay.complete(o.providerCheckoutId!, { amountTax: 31, amountTotal: 430 });
    const e = completed(o.providerCheckoutId!);
    expect((await handlePaymentEvent(wh, e)).outcome).toBe("paid");
    expect((await handlePaymentEvent(wh, e)).outcome).toBe("duplicate");
    const after = await order(o.id);
    expect(after).toMatchObject({ paymentStatus: "paid", fulfillmentStatus: "queued", subtotalCents: 399, taxCents: 31, totalCents: 430 });
    expect(after.deliveryEmailLookup).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(after)).not.toContain("buyer@example.test");
    expect(await jobs(QUEUES.generateReading, o.id)).toBe(1);
    expect(await startCheckout(co, guestId, chartId, true)).toEqual({ ok: false, error: "already_owned", orderId: o.id });
  });

  it.each([
    ["livemode_mismatch", { livemode: true }],
    ["line_item_mismatch", { lineItems: [{ priceId: "price_other", quantity: 1 }] }],
    ["subtotal_mismatch", { amountSubtotal: 100, amountTotal: 100 }],
    ["currency_mismatch", { currency: "eur" }],
    ["order_reference_mismatch", { clientReferenceId: "00000000-0000-0000-0000-000000000000" }],
    ["not_paid", { paymentStatus: "unpaid" as const }],
  ])("rejects a completion with %s and does not unlock", async (reason, override) => {
    const { guestId, chartId } = await newChart();
    const r = await startCheckout(co, guestId, chartId, true);
    const o = await order((r as { orderId: string }).orderId);
    pay.complete(o.providerCheckoutId!, override);
    const res = await handlePaymentEvent(wh, completed(o.providerCheckoutId!));
    expect(res).toEqual({ outcome: "rejected", reason });
    const after = await order(o.id);
    expect(after.fulfillmentStatus).toBe("none"); // never unlocked
    expect(await jobs(QUEUES.generateReading, o.id)).toBe(0);
    // D34: money-shape mismatches on a provably linked, paid session are refunded; identity mismatches never are.
    const linked = ["line_item_mismatch", "subtotal_mismatch", "currency_mismatch"].includes(reason);
    expect(after.paymentStatus).toBe(linked ? "refund_pending" : "open");
    expect((await h.db.select().from(refunds).where(eq(refunds.orderId, o.id))).map((x) => x.reason)).toEqual(linked ? ["validation_failure"] : []);
  });

  it("an event from the other mode (live vs test) is rejected before touching orders", async () => {
    const res = await handlePaymentEvent(wh, { id: "evt_live_1", livemode: true, type: "checkout.completed", sessionId: "cs_x" });
    expect(res.outcome).toBe("rejected");
  });

  it("a late completion after a refund keeps the order refunded", async () => {
    const { orderId } = await paidOrder("late@example.test");
    expect((await requestRefund({ db: h.db, payments: pay, boss }, { orderId, reason: "admin", requestedBy: "admin" })).ok).toBe(true);
    const o = await order(orderId);
    expect(o.paymentStatus).toBe("refunded");
    const res = await handlePaymentEvent(wh, completed(o.providerCheckoutId!));
    expect(res.outcome).toBe("no_transition");
    expect((await order(orderId)).paymentStatus).toBe("refunded");
  });

  it("expired event closes an open order", async () => {
    const { guestId, chartId } = await newChart();
    const r = await startCheckout(co, guestId, chartId, true);
    const o = await order((r as { orderId: string }).orderId);
    expect((await handlePaymentEvent(wh, { id: `evt_exp_${o.id}`, livemode: false, type: "checkout.expired", sessionId: o.providerCheckoutId! })).outcome).toBe("expired");
    expect((await order(o.id)).paymentStatus).toBe("expired");
  });

  // ---------------- refunds ----------------
  it("customer, admin and cron refunding at once make exactly one provider refund", async () => {
    const { orderId } = await paidOrder("race@example.test");
    const results = await Promise.all([
      requestRefund({ db: h.db, payments: pay, boss }, { orderId, reason: "goodwill", requestedBy: "customer" }),
      requestRefund({ db: h.db, payments: pay, boss }, { orderId, reason: "admin", requestedBy: "admin" }),
      requestRefund({ db: h.db, payments: pay, boss }, { orderId, reason: "service_failure", requestedBy: "deadline_cron" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(pay.calls.createRefund).toBe(1);
    expect(await h.db.select().from(refunds).where(eq(refunds.orderId, orderId))).toHaveLength(1);
    expect((await order(orderId)).paymentStatus).toBe("refunded");
  });

  it("a pending refund is shown as pending until Stripe confirms it", async () => {
    const { orderId } = await paidOrder("pending@example.test");
    pay.nextRefund = "pending";
    const r = await requestRefund({ db: h.db, payments: pay, boss }, { orderId, reason: "admin", requestedBy: "admin" });
    expect(r).toMatchObject({ ok: true, status: "pending" });
    expect((await order(orderId)).paymentStatus).toBe("refund_pending");
    const row = (await h.db.select().from(refunds).where(eq(refunds.orderId, orderId)))[0]!;
    const evtBody = { livemode: false, type: "refund.updated" as const, refundId: row.providerRefundId!, paymentIntentId: (await order(orderId)).providerPaymentId, status: "succeeded" as const, amountCents: 399, orderId };
    // The event body alone never changes state: Stripe still says pending, so the order stays pending.
    await handlePaymentEvent(wh, { id: `evt_ref_a_${orderId}`, ...evtBody });
    await syncOrderRefunds({ db: h.db, payments: pay }, orderId);
    expect((await order(orderId)).paymentStatus).toBe("refund_pending");
    pay.setRefundStatus(row.providerRefundId!, "succeeded");
    await handlePaymentEvent(wh, { id: `evt_ref_b_${orderId}`, ...evtBody });
    await syncOrderRefunds({ db: h.db, payments: pay }, orderId);
    expect((await order(orderId)).paymentStatus).toBe("refunded");
  });

  it("a network error leaves the claim 'unknown'; reconciliation finishes it with the same idempotency key", async () => {
    const { orderId } = await paidOrder("net@example.test");
    pay.nextRefund = () => { throw new Error("socket hang up"); };
    expect(await requestRefund({ db: h.db, payments: pay, boss }, { orderId, reason: "admin", requestedBy: "admin" })).toMatchObject({ ok: true, status: "unknown" });
    expect((await order(orderId)).paymentStatus).toBe("refund_pending");
    expect(await requestRefund({ db: h.db, payments: pay, boss }, { orderId, reason: "admin", requestedBy: "admin" })).toEqual({ ok: false, error: "in_progress" });
    pay.nextRefund = "succeeded";
    expect(await reconcileRefunds({ db: h.db, payments: pay })).toBeGreaterThanOrEqual(1);
    expect((await order(orderId)).paymentStatus).toBe("refunded");
    const keys = [...pay.refunds.values()].map((r) => r.idempotencyKey);
    expect(keys).toContain(`refund:${orderId}:1`);
  });

  it("goodwill: only within 7 days and once per checkout email; service failures do not count", async () => {
    const a = await paidOrder("goodwill@example.test");
    const b = await paidOrder("goodwill@example.test");
    const later = () => new Date(Date.now() + 8 * 86_400_000);
    expect(await requestRefund({ db: h.db, payments: pay, boss, now: later }, { orderId: a.orderId, reason: "goodwill", requestedBy: "customer" })).toEqual({ ok: false, error: "outside_window" });
    expect((await requestRefund({ db: h.db, payments: pay, boss }, { orderId: a.orderId, reason: "goodwill", requestedBy: "customer" })).ok).toBe(true);
    expect(await requestRefund({ db: h.db, payments: pay, boss }, { orderId: b.orderId, reason: "goodwill", requestedBy: "customer" })).toEqual({ ok: false, error: "goodwill_used" });
    expect((await requestRefund({ db: h.db, payments: pay, boss }, { orderId: b.orderId, reason: "service_failure", requestedBy: "worker" })).ok).toBe(true);
  });

  it("goodwill resets after 12 months (Jason 2026-09-24): an older goodwill refund no longer blocks", async () => {
    const a = await paidOrder("reset@example.test");
    const b = await paidOrder("reset@example.test");
    expect((await requestRefund({ db: h.db, payments: pay, boss }, { orderId: a.orderId, reason: "goodwill", requestedBy: "customer" })).ok).toBe(true);
    expect(await requestRefund({ db: h.db, payments: pay, boss }, { orderId: b.orderId, reason: "goodwill", requestedBy: "customer" })).toEqual({ ok: false, error: "goodwill_used" });
    await h.db.update(refunds).set({ createdAt: new Date(Date.now() - 366 * 86_400_000) }).where(eq(refunds.orderId, a.orderId));
    expect((await requestRefund({ db: h.db, payments: pay, boss }, { orderId: b.orderId, reason: "goodwill", requestedBy: "customer" })).ok).toBe(true);
  });

  // ---------------- generation ----------------
  async function queueReading(orderId: string) {
    const o = await order(orderId);
    const snap = decryptPrivate<OrderSnapshot>(o.snapshotEnc!, aad("orders", orderId, "snapshot"), ring);
    const facts = buildFacts((snap.response as { chart: Parameters<typeof buildFacts>[0] }).chart);
    return validReading(facts, selectSnippets(facts, false).map((s) => s.id));
  }

  it("generates, stores the reading encrypted, delivers exactly one email", async () => {
    const { orderId } = await paidOrder("happy@example.test");
    llm.queue.push(await queueReading(orderId));
    expect(await generateReading(gen, orderId)).toBe("delivered");
    const o = await order(orderId);
    expect(o.fulfillmentStatus).toBe("delivered");
    const r = (await h.db.select().from(readings).where(eq(readings.orderId, orderId)))[0]!;
    expect(JSON.stringify(r)).not.toMatch(/steady way of meeting/);
    expect(llm.calls[0]!.user).not.toMatch(/buyer|@example|New York|1985/);
    const box = (await h.db.select().from(emailOutbox).where(eq(emailOutbox.orderId, orderId)))[0]!;
    expect(box.kind).toBe("delivery");
    expect(await jobs(QUEUES.sendEmail, box.dedupeKey)).toBe(1);
    const send = { db: h.db, ring, email: mail, origin: "https://haeday.test", supportEmail: "hello@haeday.test" };
    expect(await sendQueuedEmail(send, box.dedupeKey)).toBe("sent");
    expect(await sendQueuedEmail(send, box.dedupeKey)).toBe("skipped");
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]!.to).toBe("happy@example.test");
    expect(mail.sent[0]!.text).toContain(`https://haeday.test/r/${r.id}`);
    // A second job for the same order does nothing.
    expect(await generateReading(gen, orderId)).toBe("skipped");
  });

  it("timeout twice then success: one reading, one email, three attempts", async () => {
    const { orderId } = await paidOrder("retry@example.test");
    llm.queue.push(new LlmError("timeout"), new LlmError("timeout"), await queueReading(orderId));
    await expect(generateReading(gen, orderId)).rejects.toBeInstanceOf(RetryGeneration);
    await expect(generateReading(gen, orderId)).rejects.toBeInstanceOf(RetryGeneration);
    expect(await generateReading(gen, orderId)).toBe("delivered");
    expect(await h.db.select().from(readings).where(eq(readings.orderId, orderId))).toHaveLength(1);
    expect(await h.db.select().from(emailOutbox).where(eq(emailOutbox.orderId, orderId))).toHaveLength(1);
    expect(await h.db.select().from(generationAttempts).where(eq(generationAttempts.orderId, orderId))).toHaveLength(3);
  });

  it("three failed attempts → failed, refunded through the refund service, apology queued", async () => {
    const { orderId } = await paidOrder("fail@example.test");
    llm.queue.push({ nope: 1 }, { nope: 2 }, { nope: 3 });
    await expect(generateReading(gen, orderId)).rejects.toBeInstanceOf(RetryGeneration);
    await expect(generateReading(gen, orderId)).rejects.toBeInstanceOf(RetryGeneration);
    expect(await generateReading(gen, orderId)).toBe("failed_refunded");
    const o = await order(orderId);
    expect(o).toMatchObject({ fulfillmentStatus: "failed", paymentStatus: "refunded" });
    expect((await h.db.select().from(refunds).where(eq(refunds.orderId, orderId)))[0]!.reason).toBe("service_failure");
    expect((await h.db.select().from(emailOutbox).where(eq(emailOutbox.orderId, orderId))).map((e) => e.kind)).toEqual(["apology"]);
  });

  it("a refund that starts during generation means the late result is not saved", async () => {
    const { orderId } = await paidOrder("late-result@example.test");
    const reading = await queueReading(orderId);
    llm.generate = async () => {
      await requestRefund({ db: h.db, payments: pay, boss }, { orderId, reason: "admin", requestedBy: "admin" });
      return { json: reading, modelId: "fake", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
    };
    expect(await generateReading(gen, orderId)).toBe("skipped");
    expect(await h.db.select().from(readings).where(eq(readings.orderId, orderId))).toHaveLength(0);
    expect(await h.db.select().from(emailOutbox).where(eq(emailOutbox.orderId, orderId))).toHaveLength(0);
  });

  it("a stale worker (older fencing token) cannot save after a newer attempt started", async () => {
    const { orderId } = await paidOrder("fence@example.test");
    const reading = await queueReading(orderId);
    let inner: Promise<unknown> | null = null;
    llm.generate = async () => {
      if (!inner) { inner = generateReading({ ...gen, llm: { modelId: "x", generate: async () => ({ json: reading, modelId: "x", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }) } }, orderId); await inner; }
      return { json: reading, modelId: "fake", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
    };
    expect(await generateReading(gen, orderId)).toBe("skipped");
    expect(await inner).toBe("delivered");
    expect(await h.db.select().from(readings).where(eq(readings.orderId, orderId))).toHaveLength(1);
  });

  it("the deadline sweep fails and refunds paid orders that were never delivered", async () => {
    const { orderId } = await paidOrder("deadline@example.test");
    const later = () => new Date(Date.now() + 16 * 60_000);
    const res = await sweepDeadlines({ ...gen, now: later });
    expect(res.failed).toBeGreaterThanOrEqual(1);
    expect(await order(orderId)).toMatchObject({ fulfillmentStatus: "failed", paymentStatus: "refunded" });
  });

  it("LLM misconfiguration never delivers: missing key or cap leads to retry, then refund", async () => {
    const { orderId } = await paidOrder("nollm@example.test");
    const g = { ...gen, llm: null };
    await expect(generateReading(g, orderId)).rejects.toBeInstanceOf(RetryGeneration);
    await expect(generateReading(g, orderId)).rejects.toBeInstanceOf(RetryGeneration);
    expect(await generateReading(g, orderId)).toBe("failed_refunded");
  });

  // ---------------- email ----------------
  it("email failures retry and never cause regeneration or refunds; permanent rejection is marked bounced", async () => {
    const { orderId } = await paidOrder("bounce@example.test");
    llm.queue.push(await queueReading(orderId));
    await generateReading(gen, orderId);
    const box = (await h.db.select().from(emailOutbox).where(eq(emailOutbox.orderId, orderId)))[0]!;
    const send = { db: h.db, ring, email: mail, origin: "https://haeday.test", supportEmail: "hello@haeday.test" };
    mail.failNext = new EmailError("http");
    await expect(sendQueuedEmail(send, box.dedupeKey)).rejects.toBeInstanceOf(EmailError);
    mail.failNext = new EmailError("rejected", true);
    expect(await sendQueuedEmail(send, box.dedupeKey)).toBe("failed");
    expect((await h.db.select().from(emailOutbox).where(eq(emailOutbox.id, box.id)))[0]!.status).toBe("bounced");
    expect(await order(orderId)).toMatchObject({ fulfillmentStatus: "delivered", paymentStatus: "paid" });
    expect(await h.db.select().from(readings).where(eq(readings.orderId, orderId))).toHaveLength(1);
  });
});
