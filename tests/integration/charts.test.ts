// Chart revisions: encrypted at rest, owner-only, immutable, rate limited (ARCHITECTURE §4.1, §4.6, §6; D16/D17).
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "../../src/server/db/client";
import { chartRevisions } from "../../src/server/db/schema";
import { answerQuestion, CHARTS_PER_HOUR, createChart, loadChart } from "../../src/server/charts/service";
import { ensureGuest, findGuest } from "../../src/server/guest";
import { searchPlaces } from "../../src/server/places";
import type { Keyring } from "../../src/server/security/encryption";
import { freshDb, hasDb } from "./helpers";

const ring: Keyring = { activeId: "t1", keys: { t1: randomBytes(32) }, lookupKey: randomBytes(32) };
const nyc = searchPlaces("new york")[0]!.placeId;
const chicago = searchPlaces("chicago")[0]!.placeId;

describe.skipIf(!hasDb)("chart revisions", () => {
  let h: DbHandle;
  beforeAll(async () => { h = await freshDb(); });
  afterAll(async () => { await h?.pool.end(); });

  it("creates a guest from a cookie token and finds it again by hash only", async () => {
    const g = await ensureGuest(h.db, undefined);
    expect(g.newToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await findGuest(h.db, g.newToken))?.id).toBe(g.id);
    expect(await findGuest(h.db, "x".repeat(43))).toBeNull();
    const rows = await h.db.execute(sql`select cookie_hash from guests`);
    expect(JSON.stringify(rows.rows)).not.toContain(g.newToken!);
  });

  it("stores input and chart encrypted; no birth data in plaintext columns", async () => {
    const g = await ensureGuest(h.db, undefined);
    const r = await createChart(h.db, ring, g.id, { birthDate: "1985-03-20", time: { kind: "exact", hhmm: "14:15" }, placeId: nyc });
    expect(r.ok).toBe(true);
    const row = (await h.db.execute(sql`select * from chart_revisions`)).rows[0];
    const text = JSON.stringify(row);
    expect(text).not.toMatch(/1985|14:15|New York|己卯|戊午/);
    expect(text).toMatch(/v1\.t1\./);
    const loaded = await loadChart(h.db, ring, (r as { id: string }).id, g.id);
    expect(loaded?.input.placeLabel).toBe("New York City, NY, United States");
    expect(loaded?.response.kind).toBe("computed");
    expect(loaded?.ownedOrderId).toBeNull();
  });

  it("sets deleteAfter 30 days out", async () => {
    const g = await ensureGuest(h.db, undefined);
    const now = new Date("2026-09-24T12:00:00Z");
    const r = await createChart(h.db, ring, g.id, { birthDate: "1990-05-12", time: { kind: "unknown" }, placeId: chicago }, now);
    const row = await h.db.query.chartRevisions.findFirst({ where: eq(chartRevisions.id, (r as { id: string }).id) });
    expect(row!.deleteAfter.toISOString()).toBe("2026-10-24T12:00:00.000Z");
  });

  it("only the owner can load a chart; other guests and bad ids see nothing", async () => {
    const a = await ensureGuest(h.db, undefined), b = await ensureGuest(h.db, undefined);
    const r = await createChart(h.db, ring, a.id, { birthDate: "1990-05-12", time: { kind: "exact", hhmm: "09:30" }, placeId: chicago });
    const id = (r as { id: string }).id;
    expect(await loadChart(h.db, ring, id, b.id)).toBeNull();
    expect(await loadChart(h.db, ring, id, null)).toBeNull();
    expect(await loadChart(h.db, ring, "not-a-uuid", a.id)).toBeNull();
    expect(await createChart(h.db, ring, b.id, { birthDate: "1990-05-12", time: { kind: "unknown" }, placeId: chicago, chartGroupId: (await loadChart(h.db, ring, id, a.id))!.chartGroupId }))
      .toEqual({ ok: false, error: "not_found" });
  });

  it("does not store invalid input (gap time, unknown place, future date)", async () => {
    const g = await ensureGuest(h.db, undefined);
    const before = (await h.db.execute(sql`select count(*)::int as n from chart_revisions where guest_id = ${g.id}`)).rows[0] as { n: number };
    expect(await createChart(h.db, ring, g.id, { birthDate: "1995-04-02", time: { kind: "exact", hhmm: "02:30" }, placeId: nyc }))
      .toEqual({ ok: false, error: "invalid_input", reason: "nonexistent_local_time" });
    expect(await createChart(h.db, ring, g.id, { birthDate: "1995-04-02", time: { kind: "unknown" }, placeId: "gn:1" }))
      .toEqual({ ok: false, error: "invalid_input", reason: "unknown_place" });
    expect(await createChart(h.db, ring, g.id, { birthDate: "2999-01-01", time: { kind: "unknown" }, placeId: nyc }))
      .toEqual({ ok: false, error: "invalid_input", reason: "date_out_of_range" });
    const after = (await h.db.execute(sql`select count(*)::int as n from chart_revisions where guest_id = ${g.id}`)).rows[0] as { n: number };
    expect(after.n).toBe(before.n);
  });

  it("fold answer creates a new revision in the same group; the old one is unchanged", async () => {
    const g = await ensureGuest(h.db, undefined);
    const r = await createChart(h.db, ring, g.id, { birthDate: "1995-10-29", time: { kind: "exact", hhmm: "01:30" }, placeId: nyc });
    const id = (r as { id: string }).id;
    const first = await loadChart(h.db, ring, id, g.id);
    expect(first!.response.kind).toBe("needs_fold_choice");
    const beforeRow = await h.db.query.chartRevisions.findFirst({ where: eq(chartRevisions.id, id) });
    const ans = await answerQuestion(h.db, ring, id, g.id, { foldChoice: "later" });
    expect(ans.ok).toBe(true);
    const next = await loadChart(h.db, ring, (ans as { id: string }).id, g.id);
    expect(next!.chartGroupId).toBe(first!.chartGroupId);
    expect(next!.input.foldChoice).toBe("later");
    expect(next!.response.kind).toBe("computed");
    const afterRow = await h.db.query.chartRevisions.findFirst({ where: eq(chartRevisions.id, id) });
    expect(afterRow).toEqual(beforeRow);
    // A fold answer on a chart that has no fold question is refused.
    expect((await answerQuestion(h.db, ring, next!.id, g.id, { foldChoice: "earlier" })).ok).toBe(false);
  });

  it("time-window answer accepts only offered windows", async () => {
    const g = await ensureGuest(h.db, undefined);
    // 2024-02-04 in New York: 立春 at 03:27:08 local splits the day by year and month (askCustomer).
    const r = await createChart(h.db, ring, g.id, { birthDate: "2024-02-04", time: { kind: "unknown" }, placeId: nyc });
    const c = await loadChart(h.db, ring, (r as { id: string }).id, g.id);
    const q = c!.response.kind === "computed" ? c!.response.questions[0] : undefined;
    expect(q?.askCustomer).toBe(true);
    expect((await answerQuestion(h.db, ring, c!.id, g.id, { boundaryChoice: 9 })).ok).toBe(false);
    const ans = await answerQuestion(h.db, ring, c!.id, g.id, { boundaryChoice: 0 });
    const next = await loadChart(h.db, ring, (ans as { id: string }).id, g.id);
    expect(next!.input.boundaryChoice).toBe(0);
    expect(next!.response.kind === "computed" && next!.response.chart.disclosure).toBeNull();
  });

  it(`rate limits at ${CHARTS_PER_HOUR} charts per guest per hour`, async () => {
    const g = await ensureGuest(h.db, undefined);
    const req = { birthDate: "2000-01-01", time: { kind: "unknown" as const }, placeId: chicago };
    for (let i = 0; i < CHARTS_PER_HOUR; i++) expect((await createChart(h.db, ring, g.id, req)).ok).toBe(true);
    expect(await createChart(h.db, ring, g.id, req)).toEqual({ ok: false, error: "rate_limited" });
    const other = await ensureGuest(h.db, undefined);
    expect((await createChart(h.db, ring, other.id, req)).ok).toBe(true);
  });
});
