// D16 retention: unpaid charts go after 30 days, paid personal data after 12 months, money records stay.
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createChart } from "../../src/server/charts/service";
import type { DbHandle } from "../../src/server/db/client";
import { chartRevisions, orders, readings } from "../../src/server/db/schema";
import { ensureGuest } from "../../src/server/guest";
import { searchPlaces } from "../../src/server/places";
import { runRetention } from "../../src/server/retention";
import type { Keyring } from "../../src/server/security/encryption";
import { freshDb, hasDb } from "./helpers";

const ring: Keyring = { activeId: "t1", keys: { t1: randomBytes(32) }, lookupKey: randomBytes(32) };
const nyc = searchPlaces("new york")[0]!.placeId;

describe.skipIf(!hasDb)("retention", () => {
  let h: DbHandle;
  beforeAll(async () => { h = await freshDb(); });
  afterAll(async () => { await h?.pool.end(); });

  it("deletes unpaid charts after delete_after, scrubs paid data after 12 months, keeps amounts", async () => {
    const g = await ensureGuest(h.db, undefined);
    const mk = async () => ((await createChart(h.db, ring, g.id, { birthDate: "1990-01-01", time: { kind: "unknown" }, placeId: nyc })) as { id: string }).id;
    const unpaidChart = await mk(), paidChart = await mk(), freshChart = await mk();
    const past = new Date(Date.now() - 400 * 86_400_000);
    await h.db.update(chartRevisions).set({ deleteAfter: past }).where(eq(chartRevisions.id, unpaidChart));
    await h.db.update(chartRevisions).set({ deleteAfter: past }).where(eq(chartRevisions.id, paidChart));
    const [paid] = await h.db.insert(orders).values({
      chartRevisionId: paidChart, guestId: g.id, sku: "saju_reading", unitAmountCents: 399, totalCents: 399, consentVersion: "c",
      paymentStatus: "paid", paidAt: past, snapshotEnc: "v1.x.y.z.w", deliveryEmailEnc: "v1.a.b.c.d", deliveryEmailLookup: "abc", fulfillmentStatus: "delivered",
    }).returning();
    await h.db.insert(readings).values({ orderId: paid!.id, contentEnc: "v1.r.e.a.d", promptVersion: "p", modelId: "m", policyVersion: "v" });
    const [stale] = await h.db.insert(orders).values({ chartRevisionId: freshChart, guestId: g.id, sku: "saju_reading", unitAmountCents: 399, consentVersion: "c", paymentStatus: "expired", snapshotEnc: "v1.s.n.a.p", createdAt: past }).returning();

    const r = await runRetention(h.db);
    expect(r).toMatchObject({ chartsDeleted: 1, unpaidOrdersScrubbed: 1, paidOrdersScrubbed: 1 });
    expect(await h.db.query.chartRevisions.findFirst({ where: eq(chartRevisions.id, unpaidChart) })).toBeUndefined();
    const pc = await h.db.query.chartRevisions.findFirst({ where: eq(chartRevisions.id, paidChart) });
    expect(pc).toMatchObject({ inputEnc: null, responseEnc: null });
    expect(pc!.piiDeletedAt).not.toBeNull();
    const po = await h.db.query.orders.findFirst({ where: eq(orders.id, paid!.id) });
    expect(po).toMatchObject({ snapshotEnc: null, deliveryEmailEnc: null, deliveryEmailLookup: null, totalCents: 399, paymentStatus: "paid" });
    expect((await h.db.query.readings.findFirst({ where: eq(readings.orderId, paid!.id) }))!.contentEnc).toBeNull();
    expect((await h.db.query.orders.findFirst({ where: eq(orders.id, stale!.id) }))!.snapshotEnc).toBeNull();
    expect(await h.db.query.chartRevisions.findFirst({ where: eq(chartRevisions.id, freshChart) })).toBeDefined();
    // Second run is a no-op.
    expect(await runRetention(h.db)).toMatchObject({ chartsDeleted: 0, unpaidOrdersScrubbed: 0, paidOrdersScrubbed: 0 });
  });
});
