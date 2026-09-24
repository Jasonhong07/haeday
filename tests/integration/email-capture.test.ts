// C4 / D41 email capture, C2 preview gate, D42 sample gate (real Postgres + pg-boss).
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeEmail } from "../../src/server/adapters/email";
import { createChart } from "../../src/server/charts/service";
import type { DbHandle } from "../../src/server/db/client";
import { emailOutbox, marketingContacts } from "../../src/server/db/schema";
import { issueUnsubscribeToken, marketingAllowed, requestChartEmail, unsubscribe } from "../../src/server/email/capture";
import { sendQueuedEmail } from "../../src/server/email/outbox";
import { freePreview } from "../../src/server/fulfillment/prompt";
import { ensureGuest } from "../../src/server/guest";
import { searchPlaces } from "../../src/server/places";
import { createBoss, ensureQueues } from "../../src/server/queue/boss";
import { emailLookup, type Keyring } from "../../src/server/security/encryption";
import { DAY_MASTER_SNIPPETS } from "../../src/content/snippets";
import { SAMPLE_READING } from "../../src/content/sample";
import { TEST_DATABASE_URL, freshDb, hasDb } from "./helpers";

const ring: Keyring = { activeId: "t1", keys: { t1: randomBytes(32) }, lookupKey: randomBytes(32) };
const nyc = searchPlaces("new york")[0]!.placeId;

describe.skipIf(!hasDb)("email capture (C4) and gated content (C2, D42)", () => {
  let h: DbHandle; let boss: PgBoss;
  beforeAll(async () => { h = await freshDb(); boss = createBoss(TEST_DATABASE_URL!); await boss.start(); await ensureQueues(boss); });
  afterAll(async () => { await boss?.stop({ graceful: false }); await h?.pool.end(); });
  const deps = () => ({ db: h.db, ring, boss });
  async function chart() {
    const g = await ensureGuest(h.db, undefined);
    const c = (await createChart(h.db, ring, g.id, { birthDate: "1985-03-20", time: { kind: "exact", hhmm: "14:15" }, placeId: nyc })) as { id: string };
    return { guestId: g.id, chartId: c.id };
  }

  it("emails the chart summary only (no birth date, time or place) and records NO marketing consent unless ticked", async () => {
    const { guestId, chartId } = await chart();
    expect(await requestChartEmail(deps(), { guestId, chartId, email: "Chart@Example.test", marketing: false })).toBe("queued");
    const [row] = await h.db.select().from(emailOutbox).where(eq(emailOutbox.kind, "chart"));
    const mail = new FakeEmail();
    expect(await sendQueuedEmail({ db: h.db, ring, email: mail, origin: "https://haeday.test", supportEmail: "s@haeday.test" }, row!.dedupeKey)).toBe("sent");
    expect(mail.sent[0]!.to).toBe("chart@example.test");
    expect(mail.sent[0]!.text).toMatch(/Day Master/);
    expect(mail.sent[0]!.text).not.toMatch(/1985|14:15|New York/);
    expect(await h.db.select().from(marketingContacts)).toHaveLength(0);
  });

  it("another browser cannot email someone else's chart; one browser max 3 addresses a day", async () => {
    const { guestId, chartId } = await chart();
    const other = await ensureGuest(h.db, undefined);
    expect(await requestChartEmail(deps(), { guestId: other.id, chartId, email: "x@example.test", marketing: false })).toBe("not_found");
    for (let i = 0; i < 3; i++) expect(await requestChartEmail(deps(), { guestId, chartId, email: `a${i}@example.test`, marketing: false })).toBe("queued");
    expect(await requestChartEmail(deps(), { guestId, chartId, email: "a4@example.test", marketing: false })).toBe("rate_limited");
  });

  it("one address gets at most 2 chart emails a day, whoever asks (unverified address: no mail-bombing)", async () => {
    const results = [];
    for (let i = 0; i < 3; i++) { const { guestId, chartId } = await chart(); results.push(await requestChartEmail(deps(), { guestId, chartId, email: "victim@example.test", marketing: false })); }
    expect(results).toEqual(["queued", "queued", "rate_limited"]);
  });

  it("marketing consent is recorded with version/time; one-click unsubscribe works without login; re-opt-in is explicit", async () => {
    const { guestId, chartId } = await chart();
    await requestChartEmail(deps(), { guestId, chartId, email: "fan@example.test", marketing: true });
    const lookup = emailLookup("fan@example.test", ring);
    const [c] = await h.db.select().from(marketingContacts).where(eq(marketingContacts.emailLookup, lookup));
    expect(c).toMatchObject({ source: "free_chart", consentVersion: "marketing-2026-09-24", unsubscribedAt: null });
    expect(c!.emailEnc).not.toContain("fan@");
    expect(await marketingAllowed(h.db, lookup, false)).toBe(false); // D48: marketing sending is OFF
    expect(await marketingAllowed(h.db, lookup, true)).toBe(true);
    const token = await issueUnsubscribeToken(h.db, ring, c!.id);
    await unsubscribe(h.db, "not-a-real-token-at-all-000000000"); // unknown token: no effect, no error
    await unsubscribe(h.db, token);
    expect(await marketingAllowed(h.db, lookup, true)).toBe(false);
    await requestChartEmail(deps(), { guestId, chartId, email: "fan@example.test", marketing: false }).catch(() => undefined);
    expect(await marketingAllowed(h.db, lookup, true)).toBe(false); // not ticking again never re-subscribes
    const [gone] = await h.db.select().from(marketingContacts).where(eq(marketingContacts.id, c!.id));
    expect(gone!.emailEnc).toBeNull(); // unsubscribe drops the address; the keyed lookup stays as suppression
    // Anyone can type any address: ticking the box again must NEVER undo an opt-out (CAN-SPAM).
    await h.db.update(emailOutbox).set({ createdAt: new Date(Date.now() - 2 * 86_400_000) }); // clear the daily caps
    expect(await requestChartEmail(deps(), { guestId, chartId, email: "fan@example.test", marketing: true })).toBe("queued");
    const rows = await h.db.select().from(marketingContacts).where(eq(marketingContacts.emailLookup, lookup));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.emailEnc).toBeNull();
    expect(await marketingAllowed(h.db, lookup, true)).toBe(false);
    // The token is stable: a link from an older email still matches the same contact.
    expect(await issueUnsubscribeToken(h.db, ring, c!.id)).toBe(token);
    expect(c!.consentGuestId).toBe(guestId);
  });

  it("C2 preview shows ONLY Jason-approved day-master text; D42 sample stays hidden until approved", () => {
    expect(freePreview("甲")).toBeNull(); // drafts today
    const core = DAY_MASTER_SNIPPETS["甲"]!.find((s) => s.id.endsWith(".core"))!;
    const saved = core.approvedBy;
    try { (core as { approvedBy: string | null }).approvedBy = "jason"; expect(freePreview("甲")).toBe(core.text); } finally { (core as { approvedBy: string | null }).approvedBy = saved; }
    expect(SAMPLE_READING.approvedBy).toBeNull();
  });
});
