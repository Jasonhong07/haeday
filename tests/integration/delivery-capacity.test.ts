// CC1c delivery contract (PROPOSAL_V2_CODEX.md §6 DL01–DL05, EM01–EM04; F13 D35/D47/D52, F14, L7 D45) against
// real Postgres + pg-boss.
import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeEmail, EmailError } from "../../src/server/adapters/email";
import { FakeLlm, LlmError, type LlmAdapter } from "../../src/server/adapters/llm";
import { FakePaymentAdapter } from "../../src/server/adapters/fake-payments";
import { createChart } from "../../src/server/charts/service";
import type { DbHandle } from "../../src/server/db/client";
import { emailBudget, emailOutbox, generationAttempts, guests, orders } from "../../src/server/db/schema";
import { dashboard } from "../../src/server/admin";
import { reserveEmail } from "../../src/server/email/budget";
import { queueEmailInTx, requeueDueEmails, sendQueuedEmail } from "../../src/server/email/outbox";
import { capacityState, nextDayStart } from "../../src/server/fulfillment/capacity";
import { RetryGeneration, failAndRefund, generateReading, releaseDeferred, sweepDeadlines, type GenerateDeps } from "../../src/server/fulfillment/generate";
import { buildFacts, selectSnippets } from "../../src/server/fulfillment/prompt";
import { ensureGuest } from "../../src/server/guest";
import { startCheckout, type CheckoutDeps, type OrderSnapshot } from "../../src/server/payments/checkout";
import { handlePaymentEvent, type WebhookDeps } from "../../src/server/payments/webhook";
import { CONSENT_VERSION_DELAYED } from "../../src/server/payments/sku";
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
const CAP = 10;

describe.skipIf(!hasDb)("delivery capacity, AI cost, email budget (CC1c)", () => {
  let h: DbHandle; let boss: PgBoss; let pay: FakePaymentAdapter; let co: CheckoutDeps; let wh: WebhookDeps; let evt = 0;
  beforeAll(async () => { h = await freshDb(); boss = createBoss(TEST_DATABASE_URL!); await boss.start(); await ensureQueues(boss); });
  afterAll(async () => { await boss?.stop({ graceful: false }); await h?.pool.end(); });
  beforeEach(async () => {
    // Every test starts with an empty day: no attempts, no waiting orders, no email count.
    await h.db.execute(sql`delete from generation_attempts; delete from attempt_grants; delete from email_budget; update orders set fulfillment_status = 'delivered' where fulfillment_status in ('queued', 'generating')`);
    pay = new FakePaymentAdapter();
    co = { db: h.db, ring, payments: pay, priceId: PRICE, origin: "https://haeday.test", automaticTax: false, approvedSnippetsOnly: false, dailyCap: CAP };
    wh = { db: h.db, ring, boss, payments: pay, paymentsMode: "test", priceId: PRICE };
    resetSettingsCache(); await setSalesEnabled(h.db, true, "test");
  });

  async function useSlots(n: number, at = new Date()) {
    const [g] = await h.db.insert(guests).values({ cookieHash: randomBytes(6).toString("hex") }).returning();
    const [o] = await h.db.insert(orders).values({ guestId: g!.id, sku: "saju_reading", unitAmountCents: 399, consentVersion: "c", paymentStatus: "paid", fulfillmentStatus: "delivered" }).returning();
    for (let i = 1; i <= n; i++) await h.db.insert(generationAttempts).values({ orderId: o!.id, attemptNo: i, status: "succeeded", startedAt: at });
  }
  async function paid(promise: "minutes" | "24h" = "minutes") {
    const g = await ensureGuest(h.db, undefined);
    const c = (await createChart(h.db, ring, g.id, { birthDate: "1985-03-20", time: { kind: "exact", hhmm: "14:15" }, placeId: nyc })) as { id: string };
    const r = await startCheckout(co, g.id, c.id, true, "saju_reading", promise);
    if (!r.ok) throw new Error(r.error);
    const o = (await h.db.query.orders.findFirst({ where: eq(orders.id, r.orderId) }))!;
    pay.complete(o.providerCheckoutId!, { customerEmail: `dc${++evt}@example.test` });
    await handlePaymentEvent(wh, { id: `evt_dc${++evt}`, livemode: false, type: "checkout.completed", sessionId: o.providerCheckoutId! });
    return (await h.db.query.orders.findFirst({ where: eq(orders.id, r.orderId) }))!;
  }
  async function readingFor(orderId: string) {
    const o = (await h.db.query.orders.findFirst({ where: eq(orders.id, orderId) }))!;
    const snap = decryptPrivate<OrderSnapshot>(o.snapshotEnc!, aad("orders", orderId, "snapshot"), ring);
    const facts = buildFacts((snap.response as { chart: Parameters<typeof buildFacts>[0] }).chart);
    return validReading(facts, selectSnippets(facts, false).map((s) => s.id));
  }
  const gen = (llm: LlmAdapter | null, now?: () => Date): GenerateDeps => ({ db: h.db, ring, boss, llm, payments: pay, approvedSnippetsOnly: false, dailyCap: CAP, now });
  const attempts = async (orderId: string) => h.db.select().from(generationAttempts).where(eq(generationAttempts.orderId, orderId));
  const order = async (id: string) => (await h.db.query.orders.findFirst({ where: eq(orders.id, id) }))!;

  // ---------------- F13 checkout promise ----------------
  it("DL01: the page quoted 'minutes' but capacity is now tight → nothing is created; accepting '24h' creates a 24h order", async () => {
    await useSlots(9); // 90% of 10
    expect((await capacityState(h.db, CAP)).state).toBe("24h");
    const g = await ensureGuest(h.db, undefined);
    const c = (await createChart(h.db, ring, g.id, { birthDate: "1990-01-01", time: { kind: "exact", hhmm: "10:00" }, placeId: nyc })) as { id: string };
    expect(await startCheckout(co, g.id, c.id, true, "saju_reading", "minutes")).toEqual({ ok: false, error: "promise_changed", promise: "24h" });
    expect(pay.calls.createSession).toBe(0);
    const r = await startCheckout(co, g.id, c.id, true, "saju_reading", "24h");
    expect(r.ok).toBe(true);
    expect(await order((r as { orderId: string }).orderId)).toMatchObject({ deliveryPromise: "24h", consentVersion: CONSENT_VERSION_DELAYED });
  });

  it("DL01b: waiting 24h backlog ≥ 2× cap → new payments pause by themselves (D52)", async () => {
    await useSlots(10);
    for (let i = 0; i < 2 * CAP; i++) await paid("24h");
    expect((await capacityState(h.db, CAP)).state).toBe("paused");
    const g = await ensureGuest(h.db, undefined);
    const c = (await createChart(h.db, ring, g.id, { birthDate: "1991-01-01", time: { kind: "exact", hhmm: "10:00" }, placeId: nyc })) as { id: string };
    expect(await startCheckout(co, g.id, c.id, true, "saju_reading", "24h")).toEqual({ ok: false, error: "busy" });
  });

  it("D47: a 24h order's deadline is 24 h after the PROVIDER's payment time; missed → refunded, generation stops", async () => {
    await useSlots(9);
    const o = await paid("24h");
    const created = [...pay.sessions.values()].find((s) => s.ref.id === o.providerCheckoutId)!.created;
    expect(o.fulfillmentDeadlineAt!.getTime()).toBe((created * 1000) + 24 * 3_600_000);
    await sweepDeadlines({ db: h.db, ring, boss, payments: pay, now: () => new Date(o.fulfillmentDeadlineAt!.getTime() + 60_000) });
    expect(await order(o.id)).toMatchObject({ fulfillmentStatus: "failed", paymentStatus: "refunded" });
  });

  // ---------------- F13 generation ----------------
  it("DL02: cap used up → a 24h order waits for the next UTC day (no attempt, no LLM call), then runs", async () => {
    await useSlots(9);
    const o = await paid("24h");
    await useSlots(1); // now at the cap
    const llm = new FakeLlm();
    expect(await generateReading(gen(llm), o.id)).toBe("deferred");
    expect(await attempts(o.id)).toHaveLength(0);
    expect(llm.calls).toHaveLength(0);
    const after = await order(o.id);
    const midnight = nextDayStart(new Date()).getTime();
    expect(after.fulfillmentNotBefore!.getTime()).toBeGreaterThanOrEqual(midnight);
    expect(after.fulfillmentNotBefore!.getTime()).toBeLessThanOrEqual(midnight + 30 * 60_000);
    const tomorrow = () => new Date(midnight + 31 * 60_000);
    // The webhook's job ended when generateReading returned "deferred" (the worker completes it).
    await h.db.execute(sql`delete from pgboss.job where name = ${QUEUES.generateReading} and singleton_key = ${o.id}`);
    expect(await releaseDeferred({ db: h.db, boss, now: tomorrow })).toBe(1);
    llm.queue.push(await readingFor(o.id));
    expect(await generateReading(gen(llm, tomorrow), o.id)).toBe("delivered");
  });

  it("DL03: ten workers at once with room for six → exactly six LLM calls (atomic per-day admission)", async () => {
    await useSlots(6); // minutes orders may use up to 1.2 × 10 = 12 → 6 slots left
    const os = [];
    for (let i = 0; i < 10; i++) os.push(await paid("minutes"));
    const llm = new FakeLlm();
    for (const o of os) llm.queue.push(await readingFor(o.id));
    // Barrier (with a timeout, so the locked version cannot deadlock): without the per-day lock every worker
    // counts "6 used" at the same moment and all ten would be admitted.
    let arrived = 0;
    const afterCapacityCount = async () => { arrived++; const t = Date.now(); while (arrived < os.length && Date.now() - t < 150) await new Promise((r) => setTimeout(r, 5)); };
    const res = await Promise.allSettled(os.map((o) => generateReading({ ...gen(llm), hooks: { afterCapacityCount } }, o.id)));
    expect(llm.calls).toHaveLength(6);
    expect(res.filter((r) => r.status === "rejected" && r.reason instanceof RetryGeneration && r.reason.code === "llm_daily_cap")).toHaveLength(4);
    const n = ((await h.db.execute(sql`select count(*)::int as n from generation_attempts`)).rows[0] as { n: number }).n;
    expect(n).toBe(12); // no phantom attempts for the refused ones
  });

  it("DL04: an urgent 24h order (≤6 h left) runs above the cap up to 2× (D52); beyond 2× it re-checks in 15 min", async () => {
    // Same UTC day throughout: make the orders urgent by moving their deadline, not the clock.
    await useSlots(9);
    const o = await paid("24h");
    await useSlots(6); // 15 used: above cap, below 2× cap
    await h.db.update(orders).set({ fulfillmentDeadlineAt: new Date(Date.now() + 5 * 3_600_000) }).where(eq(orders.id, o.id));
    const llm = new FakeLlm(); llm.queue.push(await readingFor(o.id));
    expect(await generateReading(gen(llm), o.id)).toBe("delivered");

    const o2 = await paid("24h");
    await useSlots(10); // ≥ 2× cap
    await h.db.update(orders).set({ fulfillmentDeadlineAt: new Date(Date.now() + 5 * 3_600_000) }).where(eq(orders.id, o2.id));
    const t0 = Date.now();
    expect(await generateReading(gen(new FakeLlm()), o2.id)).toBe("deferred");
    const nb = (await order(o2.id)).fulfillmentNotBefore!.getTime();
    expect(nb).toBeGreaterThanOrEqual(t0 + 15 * 60_000 - 1000);
    expect(nb).toBeLessThanOrEqual(Date.now() + 15 * 60_000);
  });

  it("DL05: a worker that lost its token (admin retry, newer attempt) cannot fail or refund the order", async () => {
    const o = await paid("minutes");
    await h.db.update(orders).set({ fulfillmentStatus: "generating", currentFencingToken: randomUUID() }).where(eq(orders.id, o.id));
    expect(await failAndRefund({ db: h.db, ring, boss, payments: pay }, o.id, "late", { fencingToken: randomUUID() })).toBe("skipped");
    expect(await order(o.id)).toMatchObject({ fulfillmentStatus: "generating", paymentStatus: "paid" });
  });

  // ---------------- F14 ----------------
  it("F14: each attempt stores provider usage and a versioned cost; unknown model → null cost; timeout → null usage", async () => {
    const priced: LlmAdapter = { modelId: "claude-sonnet-5", generate: async () => ({ json: await readingFor(o1.id), modelId: "claude-sonnet-5", inputTokens: 1000, outputTokens: 1500, cacheReadTokens: 0, cacheWriteTokens: 0 }) };
    const o1 = await paid();
    expect(await generateReading(gen(priced), o1.id)).toBe("delivered");
    expect((await attempts(o1.id))[0]).toMatchObject({ modelId: "claude-sonnet-5", inputTokens: 1000, outputTokens: 1500, costMicroUsd: 17_000, pricingVersion: "anthropic-2026-09-24:sonnet-5" });

    const o2 = await paid();
    const llm = new FakeLlm(); llm.queue.push(await readingFor(o2.id));
    await generateReading(gen(llm), o2.id);
    expect((await attempts(o2.id))[0]).toMatchObject({ modelId: "fake-llm", inputTokens: 1000, costMicroUsd: null });

    const o3 = await paid();
    const t = new FakeLlm(); t.queue.push(new LlmError("timeout"));
    await expect(generateReading(gen(t), o3.id)).rejects.toBeInstanceOf(RetryGeneration);
    expect((await attempts(o3.id))[0]).toMatchObject({ status: "failed", inputTokens: null, costMicroUsd: null });

    const o4 = await paid();
    const billedFail: LlmAdapter = { modelId: "claude-sonnet-5", generate: async () => { throw new LlmError("no_tool_output", { modelId: "claude-sonnet-5", inputTokens: 500, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 }); } };
    await expect(generateReading(gen(billedFail), o4.id)).rejects.toBeInstanceOf(RetryGeneration);
    expect((await attempts(o4.id))[0]).toMatchObject({ costMicroUsd: 1_100 }); // failed calls still cost money

    const d = await dashboard(h.db, 1);
    expect(d.aiCostMicroUsd).toBeGreaterThanOrEqual(18_100);
    expect(d.aiUnknownCostAttempts).toBeGreaterThanOrEqual(2);
  });

  // ---------------- L7 ----------------
  const limits = { daily: 30, monthly: 1000, alertAt: 5 };

  it("EM01: tiers under concurrency — 40 sign-in links at once get exactly 30; deliveries stop 20 earlier", async () => {
    const res = await Promise.all(Array.from({ length: 40 }, () => reserveEmail(h.db, "magic", limits)));
    expect(res.filter((r) => r.ok)).toHaveLength(30);
    expect(res.filter((r) => r.ok && r.alert)).toHaveLength(1); // alert fires once, at 5
    await h.db.delete(emailBudget);
    const d = [];
    for (let i = 0; i < 12; i++) d.push(await reserveEmail(h.db, "delivery", limits));
    expect(d.filter((r) => r.ok)).toHaveLength(10);
    expect(await reserveEmail(h.db, "magic", limits)).toMatchObject({ ok: true }); // sign-in still works
  });

  it("EM01b: the monthly limit counts every day of the month", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const earlier = today.slice(0, 8) + (today.endsWith("-01") ? "01" : "01");
    if (earlier !== today) await h.db.insert(emailBudget).values({ day: earlier, sent: 995 });
    else await h.db.insert(emailBudget).values({ day: today, sent: 0 });
    const res = [];
    for (let i = 0; i < 8; i++) res.push(await reserveEmail(h.db, "magic", { ...limits, daily: 100 }));
    if (earlier !== today) expect(res.filter((r) => r.ok)).toHaveLength(5);
  });

  it("EM03: over budget → the outbox email waits for the next UTC day (attempt not burned), then is requeued", async () => {
    const o = await paid();
    await h.db.transaction(async (tx) => { await queueEmailInTx(tx, boss, ring, { kind: "apology", orderId: o.id, to: "late@example.test" }); });
    const [row] = await h.db.select().from(emailOutbox).where(eq(emailOutbox.orderId, o.id));
    await h.db.insert(emailBudget).values({ day: new Date().toISOString().slice(0, 10), sent: 29 });
    const mail = new FakeEmail();
    const send = { db: h.db, ring, email: mail, origin: "https://haeday.test", supportEmail: "s@haeday.test", limits };
    expect(await sendQueuedEmail(send, row!.dedupeKey)).toBe("deferred");
    const waiting = (await h.db.select().from(emailOutbox).where(eq(emailOutbox.id, row!.id)))[0]!;
    expect(waiting).toMatchObject({ status: "pending", attempts: 0, lastError: "budget_daily" });
    expect(waiting.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(nextDayStart(new Date()).getTime());
    expect(mail.sent).toHaveLength(0);
    expect(await requeueDueEmails(h.db, boss, new Date(waiting.nextAttemptAt.getTime() + 1000))).toBeGreaterThanOrEqual(0);
    const jobs = (await h.db.execute(sql`select count(*)::int as n from pgboss.job where name = ${QUEUES.sendEmail} and singleton_key = ${row!.dedupeKey}`)).rows[0] as { n: number };
    expect(jobs.n).toBeGreaterThanOrEqual(1);
  });

  it("EM04: provider accepted but the answer was lost → the retry reuses the idempotency key (one email)", async () => {
    const o = await paid();
    await h.db.transaction(async (tx) => { await queueEmailInTx(tx, boss, ring, { kind: "apology", orderId: o.id, to: "lost@example.test" }); });
    const [row] = await h.db.select().from(emailOutbox).where(eq(emailOutbox.orderId, o.id));
    const mail = new FakeEmail();
    const accepted = mail.send.bind(mail);
    let first = true;
    mail.send = async (m) => { const r = await accepted(m); if (first) { first = false; throw new EmailError("http"); } return r; };
    const send = { db: h.db, ring, email: mail, origin: "https://haeday.test", supportEmail: "s@haeday.test", limits: { daily: 1000, monthly: 10000, alertAt: 999 } };
    await expect(sendQueuedEmail(send, row!.dedupeKey)).rejects.toBeInstanceOf(EmailError);
    expect(await sendQueuedEmail(send, row!.dedupeKey)).toBe("sent");
    expect(mail.sent).toHaveLength(1);
  });

  it("DL06: an open checkout made under the OTHER promise is closed (and its Stripe session expired), a new one opens", async () => {
    const g = await ensureGuest(h.db, undefined);
    const c = (await createChart(h.db, ring, g.id, { birthDate: "1992-02-02", time: { kind: "exact", hhmm: "10:00" }, placeId: nyc })) as { id: string };
    const r1 = await startCheckout(co, g.id, c.id, true, "saju_reading", "minutes") as { orderId: string };
    const first = await order(r1.orderId);
    await useSlots(9); // capacity is now tight
    const r2 = await startCheckout(co, g.id, c.id, true, "saju_reading", "24h") as { orderId: string };
    expect(r2.orderId).not.toBe(first.id);
    expect((await order(first.id)).paymentStatus).toBe("expired");
    expect([...pay.sessions.values()].find((x) => x.ref.id === first.providerCheckoutId)!.ref.status).toBe("expired");
    expect((await order(r2.orderId)).deliveryPromise).toBe("24h");
  });

  it("DL07: attempts that failed before any LLM call do not use AI capacity", async () => {
    const o = await paid();
    await useSlots(8);
    await h.db.insert(generationAttempts).values({ orderId: o.id, attemptNo: 1, status: "failed", errorCode: "snapshot_missing" });
    await h.db.insert(generationAttempts).values({ orderId: o.id, attemptNo: 2, status: "failed", errorCode: "llm_timeout" });
    expect((await capacityState(h.db, CAP)).used).toBe(9); // 8 + the timeout (it may have been billed), not the snapshot error
  });

  it("EM05: an email stuck in 'sending' by a crashed worker is requeued after 10 minutes", async () => {
    const o = await paid();
    await h.db.transaction(async (tx) => { await queueEmailInTx(tx, boss, ring, { kind: "apology", orderId: o.id, to: "stuck@example.test" }); });
    const [row] = await h.db.select().from(emailOutbox).where(eq(emailOutbox.orderId, o.id));
    await h.db.update(emailOutbox).set({ status: "sending", nextAttemptAt: new Date(Date.now() - 11 * 60_000) }).where(eq(emailOutbox.id, row!.id));
    await h.db.execute(sql`delete from pgboss.job where name = ${QUEUES.sendEmail} and singleton_key = ${row!.dedupeKey}`);
    expect(await requeueDueEmails(h.db, boss)).toBeGreaterThanOrEqual(1);
    const mail = new FakeEmail();
    expect(await sendQueuedEmail({ db: h.db, ring, email: mail, origin: "https://haeday.test", supportEmail: "s@haeday.test" }, row!.dedupeKey)).toBe("sent");
  });
});
