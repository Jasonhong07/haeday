// M7 / CLAUDE.md rule 9: run a whole customer journey with recognisable birth data and email, then prove none of it
// appears (1) in anything written to the console (what Railway keeps as logs), or (2) as plaintext anywhere in the
// database, job queue included (Sentry sees only what reaches the console/exceptions, and is scrubbed separately:
// tests/sentry-scrub.test.ts). Encrypted columns are fine; a readable copy anywhere else is the bug.
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FakeEmail } from "../../src/server/adapters/email";
import { FakeLlm } from "../../src/server/adapters/llm";
import { FakePaymentAdapter } from "../../src/server/adapters/fake-payments";
import { checkAlerts } from "../../src/server/alerts";
import { createChart } from "../../src/server/charts/service";
import type { DbHandle } from "../../src/server/db/client";
import { emailOutbox, orders } from "../../src/server/db/schema";
import { requestChartEmail } from "../../src/server/email/capture";
import { sendQueuedEmail } from "../../src/server/email/outbox";
import { generateReading } from "../../src/server/fulfillment/generate";
import { buildFacts, selectSnippets } from "../../src/server/fulfillment/prompt";
import { ensureGuest } from "../../src/server/guest";
import { startCheckout, type OrderSnapshot } from "../../src/server/payments/checkout";
import { requestRefund } from "../../src/server/payments/refunds";
import { handlePaymentEvent } from "../../src/server/payments/webhook";
import { searchPlaces } from "../../src/server/places";
import { createBoss, ensureQueues } from "../../src/server/queue/boss";
import { findOrders, resendDelivery } from "../../src/server/support";
import { decryptPrivate, type Keyring } from "../../src/server/security/encryption";
import { aad } from "../../src/server/security/keyring";
import { resetSettingsCache, setSalesEnabled } from "../../src/server/settings";
import { validReading } from "../helpers/reading";
import { TEST_DATABASE_URL, freshDb, hasDb } from "./helpers";

const ring: Keyring = { activeId: "t1", keys: { t1: randomBytes(32) }, lookupKey: randomBytes(32) };
const EMAIL = "Sentinel.Leak.Q7@Example.test";
const DATE = "1977-07-07";
const TIME = "07:07";
const place = searchPlaces("reykjavik")[0]!;
// Strings that must never appear in logs or plaintext storage.
const NEEDLES = [/sentinel\.leak\.q7/i, /1977-07-07/, /07:07/, /1977\/07\/07|07\/07\/1977|July 7, 1977/i, /reykjav/i];

describe.skipIf(!hasDb)("no birth data or email in logs or plaintext storage (rule 9, M7)", () => {
  let h: DbHandle; let boss: PgBoss;
  const logged: string[] = [];
  beforeAll(async () => {
    h = await freshDb();
    boss = createBoss(TEST_DATABASE_URL!); await boss.start(); await ensureQueues(boss);
    for (const m of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { logged.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : typeof a === "string" ? a : JSON.stringify(a))).join(" ")); });
    }
  });
  afterAll(async () => { vi.restoreAllMocks(); await boss?.stop({ graceful: false }); await h?.pool.end(); });

  it("a full journey leaves no readable birth data or email outside encrypted columns", async () => {
    expect(place).toBeDefined();
    resetSettingsCache(); await setSalesEnabled(h.db, true, "test");
    const pay = new FakePaymentAdapter(); const llm = new FakeLlm(); const mail = new FakeEmail();
    const PRICE = "price_test_saju";
    const g = await ensureGuest(h.db, undefined);
    const chart = (await createChart(h.db, ring, g.id, { birthDate: DATE, time: { kind: "exact", hhmm: TIME }, placeId: place.placeId })) as { id: string };
    expect(await requestChartEmail({ db: h.db, ring, boss }, { guestId: g.id, chartId: chart.id, email: EMAIL, marketing: true })).toBe("queued");
    const r = await startCheckout({ db: h.db, ring, payments: pay, priceId: PRICE, origin: "https://haeday.test", automaticTax: false, approvedSnippetsOnly: false }, g.id, chart.id, true);
    if (!r.ok) throw new Error(r.error);
    const o = (await h.db.query.orders.findFirst({ where: eq(orders.id, r.orderId) }))!;
    pay.complete(o.stripeSessionId!, { customerEmail: EMAIL });
    const wh = { db: h.db, ring, boss, payments: pay, paymentsMode: "test" as const, priceId: PRICE };
    expect((await handlePaymentEvent(wh, { id: "evt_leak_1", livemode: false, type: "checkout.completed", sessionId: o.stripeSessionId! })).outcome).toBe("paid");
    const snap = decryptPrivate<OrderSnapshot>((await h.db.query.orders.findFirst({ where: eq(orders.id, r.orderId) }))!.snapshotEnc!, aad("orders", r.orderId, "snapshot"), ring);
    const facts = buildFacts((snap.response as { chart: Parameters<typeof buildFacts>[0] }).chart);
    llm.queue.push(validReading(facts, selectSnippets(facts, false).map((s) => s.id)));
    expect(await generateReading({ db: h.db, ring, boss, llm, payments: pay, approvedSnippetsOnly: false, dailyCap: 100 }, r.orderId)).toBe("delivered");
    const send = { db: h.db, ring, email: mail, origin: "https://haeday.test", supportEmail: "s@haeday.test" };
    for (const row of await h.db.select({ k: emailOutbox.dedupeKey }).from(emailOutbox)) await sendQueuedEmail(send, row.k);
    expect(mail.sent.length).toBeGreaterThanOrEqual(2); // the chart email and the delivery email really went out
    expect(await findOrders(h.db, ring, EMAIL)).toHaveLength(1);
    expect(await resendDelivery({ db: h.db, boss, ring, now: () => new Date(Date.now() + 3_600_000) }, r.orderId, "customer")).toBe("queued");
    expect((await requestRefund({ db: h.db, payments: pay, boss }, { orderId: r.orderId, reason: "goodwill", requestedBy: "customer" })).ok).toBe(true);
    await checkAlerts({ db: h.db, boss, ring, adminEmails: ["admin@haeday.test"] });

    // (1) Console output of the whole journey.
    const all = logged.join("\n");
    for (const n of NEEDLES) expect(all, `console output matched ${n}`).not.toMatch(n);

    // (2) Every text/json column in every table, the job queue included.
    const cols = (await h.db.execute(sql`
      select table_schema s, table_name t, column_name c from information_schema.columns
      where table_schema in ('public', 'pgboss') and data_type in ('text', 'jsonb', 'json', 'character varying')`)).rows as Array<{ s: string; t: string; c: string }>;
    expect(cols.length).toBeGreaterThan(20);
    const hits: string[] = [];
    for (const { s, t, c } of cols) {
      const rows = (await h.db.execute(sql.raw(`select "${c}"::text v from "${s}"."${t}" where "${c}" is not null`))).rows as Array<{ v: string }>;
      for (const { v } of rows) for (const n of NEEDLES) if (n.test(v)) hits.push(`${s}.${t}.${c} ~ ${n}`);
    }
    expect(hits).toEqual([]);
  });
});
