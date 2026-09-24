// D40 funnel (L5) against real Postgres: allowlisted first-party events, one per browser/event/day, activity vs
// cohort views, sales excluding free/duplicate/never-unlocked payments, and no personal data in event rows.
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { funnel } from "../../src/server/admin";
import { recordEvent } from "../../src/server/analytics";
import type { DbHandle } from "../../src/server/db/client";
import { chartRevisions, guests, orders, readings } from "../../src/server/db/schema";
import { freshDb, hasDb } from "./helpers";

describe.skipIf(!hasDb)("funnel (D40)", () => {
  let h: DbHandle;
  beforeAll(async () => { h = await freshDb(); });
  afterAll(async () => { await h?.pool.end(); });

  async function journey(opts: { channel: string | null; steps: number; free?: boolean }) {
    const v = randomUUID();
    await recordEvent(h.db, "visit", v, opts.channel);
    await recordEvent(h.db, "visit", v, opts.channel); // same day → counted once
    if (opts.steps < 2) return;
    await recordEvent(h.db, "form_started", v, opts.channel);
    if (opts.steps < 3) return;
    const [g] = await h.db.insert(guests).values({ cookieHash: randomBytes(8).toString("hex"), visitorId: v }).returning();
    const [c] = await h.db.insert(chartRevisions).values({ chartGroupId: randomUUID(), guestId: g!.id, inputEnc: "x", responseEnc: "x", policyVersion: "p", coverageVersion: "c", tzdataVersion: "t", libraryVersion: "l", deleteAfter: new Date(Date.now() + 1e9), firstViewedAt: opts.steps >= 4 ? new Date() : null }).returning();
    if (opts.steps < 5) return;
    const paid = opts.steps >= 6;
    const [o] = await h.db.insert(orders).values({ guestId: g!.id, chartRevisionId: c!.id, sku: "saju_reading", unitAmountCents: 399, totalCents: opts.free ? 0 : 399, consentVersion: "c", paymentStatus: paid ? "paid" : "open", paidAt: paid ? new Date() : null, fulfillmentStatus: paid ? "delivered" : "none" }).returning();
    if (opts.steps < 7) return;
    await h.db.insert(readings).values({ orderId: o!.id, contentEnc: "x", promptVersion: "p", modelId: "m", policyVersion: "v", firstViewedAt: opts.steps >= 8 ? new Date() : null });
  }

  it("activity and cohort for 8 steps, per channel", async () => {
    await journey({ channel: "tiktok", steps: 8 });
    await journey({ channel: "tiktok", steps: 5 });
    await journey({ channel: null, steps: 2 });
    await journey({ channel: "search", steps: 8, free: true }); // free order: not a sale
    const f = await funnel(h.db, 7);
    expect(f.cohort.visit).toBe(4);
    expect(f.activity.visit).toBe(4); // duplicates on the same day collapsed
    expect(f.cohort.formStarted).toBe(4);
    expect(f.cohort.chartCreated).toBe(3);
    expect(f.cohort.checkoutStarted).toBe(3);
    expect(f.cohort.paid).toBe(1);
    expect(f.activity.paid).toBe(1);
    expect(f.cohort.opened).toBe(2);
    const tiktok = f.byChannel.find((c) => c.channel === "tiktok")!;
    expect(tiktok).toMatchObject({ visitors: 2, buyers: 1 });
    expect(f.byChannel.find((c) => c.channel === "direct")).toMatchObject({ visitors: 1, buyers: 0 });
  });

  it("event rows hold no personal data: only a random id, an event name and a channel label", async () => {
    const cols = (await h.db.execute(sql`select column_name from information_schema.columns where table_name = 'funnel_events'`)).rows.map((r) => (r as { column_name: string }).column_name).sort();
    expect(cols).toEqual(["channel", "created_at", "id", "name", "visitor_id"]);
    const bad = (await h.db.execute(sql`select count(*)::int n from funnel_events where channel ~ '@' or channel ~ '/' or visitor_id !~ '^[0-9a-f-]{36}$'`)).rows[0] as { n: number };
    expect(bad.n).toBe(0);
  });
});
