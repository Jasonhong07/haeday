// CC4a: operator alerts (email once a day per problem) and support tools (search, resend, issue status).
import { randomBytes } from "node:crypto";
import { eq, like, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeEmail } from "../../src/server/adapters/email";
import { FakeLlm } from "../../src/server/adapters/llm";
import { FakePaymentAdapter } from "../../src/server/adapters/fake-payments";
import { checkAlerts, raiseAlert } from "../../src/server/alerts";
import { createChart } from "../../src/server/charts/service";
import type { DbHandle } from "../../src/server/db/client";
import { adminAlerts, customers, emailOutbox, orders, paymentIssues } from "../../src/server/db/schema";
import { sendQueuedEmail } from "../../src/server/email/outbox";
import { generateReading, type GenerateDeps } from "../../src/server/fulfillment/generate";
import { buildFacts, selectSnippets } from "../../src/server/fulfillment/prompt";
import { ensureGuest } from "../../src/server/guest";
import { startCheckout, type CheckoutDeps, type OrderSnapshot } from "../../src/server/payments/checkout";
import { openIssue } from "../../src/server/payments/issues";
import { handlePaymentEvent, type WebhookDeps } from "../../src/server/payments/webhook";
import { searchPlaces } from "../../src/server/places";
import { createBoss, ensureQueues } from "../../src/server/queue/boss";
import { runRetention } from "../../src/server/retention";
import { decryptPrivate, emailLookup, encryptPrivate, type Keyring } from "../../src/server/security/encryption";
import { aad } from "../../src/server/security/keyring";
import { resetSettingsCache, setSalesEnabled } from "../../src/server/settings";
import { findOrders, orderDetail, resendDelivery, setIssueStatus } from "../../src/server/support";
import { validReading } from "../helpers/reading";
import { TEST_DATABASE_URL, freshDb, hasDb } from "./helpers";

const ring: Keyring = { activeId: "t1", keys: { t1: randomBytes(32) }, lookupKey: randomBytes(32) };
const PRICE = "price_test_saju";
const nyc = searchPlaces("new york")[0]!.placeId;
const ADMINS = ["jason@haeday.test", "backup@haeday.test"];

describe.skipIf(!hasDb)("CC4a support tools and operator alerts", () => {
  let h: DbHandle; let boss: PgBoss;
  let pay: FakePaymentAdapter; let llm: FakeLlm;
  let co: CheckoutDeps; let wh: WebhookDeps; let gen: GenerateDeps;
  let adminId: string;

  beforeAll(async () => {
    h = await freshDb();
    boss = createBoss(TEST_DATABASE_URL!); await boss.start(); await ensureQueues(boss);
    const id = crypto.randomUUID();
    await h.db.insert(customers).values({ id, emailLookup: emailLookup(ADMINS[0]!, ring), emailEnc: encryptPrivate(ADMINS[0]!, aad("customers", id, "email"), ring), verifiedAt: new Date() });
    adminId = id;
  });
  afterAll(async () => { await boss?.stop({ graceful: false }); await h?.pool.end(); });
  beforeEach(async () => {
    pay = new FakePaymentAdapter(); llm = new FakeLlm();
    co = { db: h.db, ring, payments: pay, priceId: PRICE, origin: "https://haeday.test", automaticTax: false, approvedSnippetsOnly: false };
    wh = { db: h.db, ring, boss, payments: pay, paymentsMode: "test", priceId: PRICE };
    gen = { db: h.db, ring, boss, llm, payments: pay, approvedSnippetsOnly: false, dailyCap: 100 };
    resetSettingsCache(); await setSalesEnabled(h.db, true, "test");
  });

  let evt = 0;
  async function paidOrder(email: string) {
    const g = await ensureGuest(h.db, undefined);
    const c = (await createChart(h.db, ring, g.id, { birthDate: "1985-03-20", time: { kind: "exact", hhmm: "14:15" }, placeId: nyc })) as { id: string };
    const r = await startCheckout(co, g.id, c.id, true);
    if (!r.ok) throw new Error(r.error);
    const o = (await h.db.query.orders.findFirst({ where: eq(orders.id, r.orderId) }))!;
    pay.complete(o.providerCheckoutId!, { customerEmail: email });
    expect((await handlePaymentEvent(wh, { id: `evt_s${++evt}`, livemode: false, type: "checkout.completed", sessionId: o.providerCheckoutId! })).outcome).toBe("paid");
    return { orderId: r.orderId, sessionId: o.providerCheckoutId! };
  }
  async function delivered(email: string) {
    const p = await paidOrder(email);
    const o = (await h.db.query.orders.findFirst({ where: eq(orders.id, p.orderId) }))!;
    const snap = decryptPrivate<OrderSnapshot>(o.snapshotEnc!, aad("orders", p.orderId, "snapshot"), ring);
    const facts = buildFacts((snap.response as { chart: Parameters<typeof buildFacts>[0] }).chart);
    llm.queue.push(validReading(facts, selectSnippets(facts, false).map((s) => s.id)));
    expect(await generateReading(gen, p.orderId)).toBe("delivered");
    return p;
  }
  const deliveryRows = (orderId: string) => h.db.select().from(emailOutbox).where(like(emailOutbox.dedupeKey, `${orderId}:delivery%`));

  // ---------------- search ----------------
  it("S1 finds orders by checkout email (any case), order id prefix and Stripe session id; nothing else leaks", async () => {
    const a = await paidOrder("Finder@Example.test");
    await paidOrder("someone-else@example.test");
    const byEmail = await findOrders(h.db, ring, "  finder@EXAMPLE.test ");
    expect(byEmail.map((r) => r.id)).toEqual([a.orderId]);
    expect((await findOrders(h.db, ring, a.orderId.slice(0, 8))).map((r) => r.id)).toContain(a.orderId);
    expect((await findOrders(h.db, ring, a.sessionId)).map((r) => r.id)).toEqual([a.orderId]);
    expect(await findOrders(h.db, ring, "robert'); drop table orders;--")).toEqual([]);
    expect(await findOrders(h.db, ring, "ab")).toEqual([]);
    const d = (await orderDetail(h.db, a.orderId))!;
    expect(JSON.stringify(d)).not.toMatch(/finder@|1985|14:15/i); // statuses and ids only
    expect(d.hasEmail).toBe(true);
  });

  // ---------------- resend ----------------
  it("S2 resends the delivery email only to the checkout address, with gaps and a cap of 3", async () => {
    const p = await paidOrder("undelivered@example.test");
    expect(await resendDelivery({ db: h.db, boss, ring }, p.orderId, "admin", adminId)).toBe("not_delivered");

    const d = await delivered("resend@example.test");
    let clock = Date.now() + 11 * 60_000;
    const deps = { db: h.db, boss, ring, now: () => new Date(clock) };
    expect(await resendDelivery(deps, d.orderId, "customer")).toBe("queued");
    expect(await resendDelivery(deps, d.orderId, "customer")).toBe("too_soon");   // 10-minute gap for customers
    clock += 2 * 60_000;
    expect(await resendDelivery(deps, d.orderId, "admin", adminId)).toBe("queued"); // admin: 1-minute gap
    clock += 2 * 60_000;
    expect(await resendDelivery(deps, d.orderId, "admin", adminId)).toBe("queued");
    clock += 60 * 60_000;
    expect(await resendDelivery(deps, d.orderId, "customer")).toBe("limit");
    const rows = await deliveryRows(d.orderId);
    expect(rows.map((r) => r.dedupeKey).sort()).toEqual([`${d.orderId}:delivery`, `${d.orderId}:delivery:r1`, `${d.orderId}:delivery:r2`, `${d.orderId}:delivery:r3`]);
    for (const r of rows) expect(decryptPrivate<string>(r.toEmailEnc!, aad("email_outbox", r.id, "to_email"), ring)).toBe("resend@example.test");
    const mail = new FakeEmail();
    expect(await sendQueuedEmail({ db: h.db, ring, email: mail, origin: "https://haeday.test", supportEmail: "s@haeday.test" }, `${d.orderId}:delivery:r1`)).toBe("sent");
    expect(mail.sent[0]!.text).toMatch(/https:\/\/haeday\.test\/r\//);
  });

  it("S3 a double click (two concurrent admin resends) queues one email", async () => {
    const d = await delivered("double@example.test");
    const later = () => new Date(Date.now() + 5 * 60_000);
    const res = await Promise.all([1, 2].map(() => resendDelivery({ db: h.db, boss, ring, now: later }, d.orderId, "admin", adminId)));
    expect(res.sort()).toEqual(["queued", "too_soon"]);
  });

  // ---------------- alerts ----------------
  it("A1 an open payment issue mails every admin once per day; 'seen' stops it; a new day mails again", async () => {
    await h.db.delete(adminAlerts);
    await h.db.update(orders).set({ fulfillmentStatus: "delivered" }).where(eq(orders.paymentStatus, "paid")); // only the issue should alert here
    await openIssue(h.db, { kind: "refund_failed", objectId: "re_test_1", livemode: false, nextAction: "contact_customer" });
    const day1 = new Date("2026-10-05T12:00:00Z");
    const deps = { db: h.db, boss, ring, adminEmails: ADMINS, now: () => day1 };
    expect(await checkAlerts(deps)).toContain("payment_issue");
    expect(await checkAlerts(deps)).not.toContain("payment_issue"); // same day: nothing new
    const mails = await h.db.select().from(emailOutbox).where(eq(emailOutbox.kind, "admin_alert"));
    expect(mails).toHaveLength(2);
    const mail = new FakeEmail();
    for (const m of mails) expect(await sendQueuedEmail({ db: h.db, ring, email: mail, origin: "https://haeday.test", supportEmail: "s@haeday.test", envLabel: "staging" }, m.dedupeKey)).toBe("sent");
    expect(mail.sent.map((m) => m.to).sort()).toEqual([...ADMINS].sort());
    expect(mail.sent[0]!.subject).toBe("[staging] [Haeday] Payment issue needs you");
    expect(mail.sent[0]!.text).toMatch(/refund_failed.*contact_customer/s);

    const day2 = new Date("2026-10-06T12:00:00Z");
    expect(await checkAlerts({ ...deps, now: () => day2 })).toContain("payment_issue");
    const [issue] = await h.db.select().from(paymentIssues).where(eq(paymentIssues.providerObjectId, "re_test_1"));
    expect(await setIssueStatus(h.db, issue!.id, "acknowledged", adminId)).toBe(true);
    expect(await checkAlerts({ ...deps, now: () => new Date("2026-10-07T12:00:00Z") })).not.toContain("payment_issue");
    // Happens again → reopens → alerts again.
    await openIssue(h.db, { kind: "refund_failed", objectId: "re_test_1", livemode: false, nextAction: "contact_customer" });
    expect(await checkAlerts({ ...deps, now: () => new Date("2026-10-07T12:00:00Z") })).toContain("payment_issue");
    expect(await setIssueStatus(h.db, issue!.id, "resolved", adminId)).toBe(true);
    expect(await setIssueStatus(h.db, issue!.id, "resolved", adminId)).toBe(false);
  });

  it("A2 a paid 'about a minute' order still undelivered after 10 minutes raises one late-delivery alert", async () => {
    await h.db.delete(adminAlerts);
    await h.db.update(orders).set({ fulfillmentStatus: "delivered" }).where(eq(orders.paymentStatus, "paid")); // earlier tests' orders
    const p = await paidOrder("late@example.test");
    const now = new Date(Date.now() + 11 * 60_000);
    const deps = { db: h.db, boss, ring, adminEmails: ADMINS, now: () => now };
    expect(await checkAlerts(deps)).toContain("late_delivery");
    const [a] = await h.db.select().from(adminAlerts).where(eq(adminAlerts.kind, "late_delivery"));
    expect(a!.summary).toContain(p.orderId.slice(0, 8));
    expect(a!.summary).not.toMatch(/late@/);
  });

  it("A3 without ADMIN_EMAILS the alert is recorded for /admin but nothing is mailed", async () => {
    const before = (await h.db.select().from(emailOutbox).where(eq(emailOutbox.kind, "admin_alert"))).length;
    const at = () => new Date("2026-10-09T08:00:00Z");
    const a = { kind: "email_volume" as const, subjects: ["daily"], daily: true, summary: () => "Emails sent today reached 70" };
    expect(await raiseAlert({ db: h.db, boss, ring, adminEmails: [], now: at }, a)).toBe(true);
    expect((await h.db.select().from(emailOutbox).where(eq(emailOutbox.kind, "admin_alert"))).length).toBe(before);
    // ADMIN_EMAILS set later the same day: the alert is still mailed (the no-recipient record used its own key).
    expect(await raiseAlert({ db: h.db, boss, ring, adminEmails: ADMINS, now: at }, a)).toBe(true);
    expect((await h.db.select().from(emailOutbox).where(eq(emailOutbox.kind, "admin_alert"))).length).toBe(before + 2);
    expect(await raiseAlert({ db: h.db, boss, ring, adminEmails: ADMINS, now: at }, a)).toBe(false);
  });

  it("A5 a second late order on the same day gets its own email (the first one is not repeated)", async () => {
    await h.db.delete(adminAlerts);
    await h.db.update(orders).set({ fulfillmentStatus: "delivered" }).where(eq(orders.paymentStatus, "paid"));
    const first = await paidOrder("late-a@example.test");
    const now = new Date(Date.now() + 11 * 60_000);
    const deps = { db: h.db, boss, ring, adminEmails: ["jason@haeday.test"], now: () => now };
    expect(await checkAlerts(deps)).toContain("late_delivery");
    const second = await paidOrder("late-b@example.test");
    const later = new Date(now.getTime() + 11 * 60_000);
    expect(await checkAlerts({ ...deps, now: () => later })).toContain("late_delivery");
    expect(await checkAlerts({ ...deps, now: () => later })).not.toContain("late_delivery");
    const mails = await h.db.select().from(emailOutbox).where(eq(emailOutbox.kind, "admin_alert")).orderBy(emailOutbox.createdAt);
    const texts = mails.slice(-2).map((m) => decryptPrivate<{ summary: string }>(m.payloadEnc!, aad("email_outbox", m.id, "payload"), ring).summary);
    expect(texts[0]).toContain(first.orderId.slice(0, 8));
    expect(texts[1]).toContain(second.orderId.slice(0, 8));
    expect(texts[1]).not.toContain(first.orderId.slice(0, 8));
  });

  it("S4 no resend while a refund is pending or after it", async () => {
    const d = await delivered("refunding@example.test");
    await h.db.update(orders).set({ paymentStatus: "refund_pending" }).where(eq(orders.id, d.orderId));
    expect(await resendDelivery({ db: h.db, boss, ring, now: () => new Date(Date.now() + 3_600_000) }, d.orderId, "admin", adminId)).toBe("not_delivered");
  });

  it("A4 alert emails lose the admin address and summary after 30 days (retention)", async () => {
    await runRetention(h.db, new Date(Date.now() + 31 * 86_400_000));
    const left = await h.db.execute(sql`select count(*)::int n from email_outbox where kind = 'admin_alert' and (to_email_enc is not null or payload_enc is not null)`);
    expect((left.rows[0] as { n: number }).n).toBe(0);
  });
});
