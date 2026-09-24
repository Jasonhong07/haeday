// M6 access tests: magic links, order linking, admin allowlist (TASKS M6).
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeEmail } from "../../src/server/adapters/email";
import { customerFromSession, isAdmin, requestMagicLink, verifyMagicLink } from "../../src/server/auth";
import type { DbHandle } from "../../src/server/db/client";
import { guests, orders } from "../../src/server/db/schema";
import { loadOrderView } from "../../src/server/orders";
import { emailLookup, type Keyring } from "../../src/server/security/encryption";
import { freshDb, hasDb } from "./helpers";

const ring: Keyring = { activeId: "t1", keys: { t1: randomBytes(32) }, lookupKey: randomBytes(32) };
const tokenFrom = (m: FakeEmail) => new URL(m.sent.at(-1)!.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;

describe.skipIf(!hasDb)("magic-link sign-in and access", () => {
  let h: DbHandle; let mail: FakeEmail;
  const deps = () => ({ db: h.db, ring, email: mail, origin: "https://haeday.test", supportEmail: "hello@haeday.test" });
  beforeAll(async () => { h = await freshDb(); });
  afterAll(async () => { await h?.pool.end(); });

  async function paidOrderFor(email: string) {
    const [g] = await h.db.insert(guests).values({ cookieHash: randomBytes(8).toString("hex") }).returning();
    const [o] = await h.db.insert(orders).values({ guestId: g!.id, sku: "saju_reading", unitAmountCents: 399, consentVersion: "c", paymentStatus: "paid", paidAt: new Date(), deliveryEmailLookup: emailLookup(email, ring) }).returning();
    return o!;
  }

  it("unknown emails get the same answer and no email; known buyers get one link", async () => {
    mail = new FakeEmail();
    expect(await requestMagicLink(deps(), "nobody@example.test")).toBe("not_sent");
    expect(mail.sent).toHaveLength(0);
    await paidOrderFor("Buyer@Example.test");
    expect(await requestMagicLink(deps(), " buyer@example.TEST ")).toBe("sent");
    expect(mail.sent).toHaveLength(1);
  });

  it("a link works once; two concurrent uses → one session; orders are linked after verification only", async () => {
    mail = new FakeEmail();
    const o = await paidOrderFor("once@example.test");
    expect(await loadOrderView(h.db, o.id, { guestId: null, customerId: null })).toBeNull();
    await requestMagicLink(deps(), "once@example.test");
    const t = tokenFrom(mail);
    const [a, b] = await Promise.all([verifyMagicLink(h.db, t), verifyMagicLink(h.db, t)]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const win = (a.ok ? a : b) as { sessionToken: string; customerId: string; linkedOrders: number };
    expect(win.linkedOrders).toBe(1);
    expect(await customerFromSession(h.db, win.sessionToken)).toBe(win.customerId);
    expect((await loadOrderView(h.db, o.id, { guestId: null, customerId: win.customerId }))?.id).toBe(o.id);
    expect(await verifyMagicLink(h.db, t)).toEqual({ ok: false, error: "used" });
  });

  it("expired and invalid links are reported distinctly", async () => {
    mail = new FakeEmail();
    await paidOrderFor("late@example.test");
    await requestMagicLink({ ...deps(), now: () => new Date(Date.now() - 20 * 60_000) }, "late@example.test");
    expect(await verifyMagicLink(h.db, tokenFrom(mail))).toEqual({ ok: false, error: "expired" });
    expect(await verifyMagicLink(h.db, "x".repeat(43))).toEqual({ ok: false, error: "invalid" });
    expect(await verifyMagicLink(h.db, "short")).toEqual({ ok: false, error: "invalid" });
  });

  it("throttles at 5 links per hour per email", async () => {
    mail = new FakeEmail();
    await paidOrderFor("spam@example.test");
    for (let i = 0; i < 5; i++) expect(await requestMagicLink(deps(), "spam@example.test")).toBe("sent");
    expect(await requestMagicLink(deps(), "spam@example.test")).toBe("throttled");
  });

  it("paying with the admin's email grants no admin access; only a verified session on the allowlist does", async () => {
    mail = new FakeEmail();
    const attackerOrder = await paidOrderFor("admin@haeday.test"); // attacker typed the admin email at checkout
    // Without clicking the link sent to the real admin inbox, nobody has a session.
    expect(await isAdmin(h.db, ring, null, ["admin@haeday.test"])).toBe(false);
    expect(await loadOrderView(h.db, attackerOrder.id, { guestId: null, customerId: null })).toBeNull();
    await requestMagicLink(deps(), "admin@haeday.test");
    const v = await verifyMagicLink(h.db, tokenFrom(mail)); // the real admin, from their own inbox
    expect(v.ok && (await isAdmin(h.db, ring, v.customerId, ["admin@haeday.test"]))).toBe(true);
    const [someoneElse] = await h.db.insert(guests).values({ cookieHash: "x-guest" }).returning();
    expect(await loadOrderView(h.db, attackerOrder.id, { guestId: someoneElse!.id, customerId: null })).toBeNull();
    expect((await h.db.query.orders.findFirst({ where: eq(orders.id, attackerOrder.id) }))!.customerId).not.toBeNull();
  });
});
