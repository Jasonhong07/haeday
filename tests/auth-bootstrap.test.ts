import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { requestMagicLink, isAdmin } from "../src/server/auth";
import { FakeEmail } from "../src/server/adapters/email";
import type { Db } from "../src/server/db/client";
import { emailLookup, type Keyring } from "../src/server/security/encryption";

describe("D38 administrator bootstrap", () => {
  it("requires mailbox verification even when a new owner can request a link", async () => {
    const ring: Keyring = { activeId: "t", keys: { t: randomBytes(32) }, lookupKey: randomBytes(32) };
    const customer = { id: "owner", verifiedAt: null as Date | null, emailLookup: emailLookup("owner@example.test", ring) };
    let created = false;
    const insert = vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoNothing: () => ({ returning: async () => { created = true; return [customer]; } }) })) }));
    const db = {
      query: { customers: { findFirst: async () => created ? customer : undefined }, orders: { findFirst: async () => undefined } },
      insert,
      select: () => ({ from: () => ({ where: async () => [{ n: 0 }] }) }),
    } as unknown as Db;
    const email = new FakeEmail();
    const deps = { db, ring, email, origin: "https://haeday.test", supportEmail: "support@example.test", adminEmails: ["OWNER@example.test"] };
    expect(await requestMagicLink(deps, "stranger@example.test")).toBe("not_sent");
    expect(insert).not.toHaveBeenCalled();
    expect(await requestMagicLink(deps, " owner@example.test ")).toBe("sent");
    expect(email.sent).toHaveLength(1);
    expect(await isAdmin(db, ring, customer.id, deps.adminEmails)).toBe(false);
    customer.verifiedAt = new Date();
    expect(await isAdmin(db, ring, customer.id, deps.adminEmails)).toBe(true);
    expect(await isAdmin(db, ring, customer.id, [])).toBe(false);
  });
});
