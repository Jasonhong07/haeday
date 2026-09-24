import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptPrivate, encryptPrivate } from "../src/server/security/encryption";
import { aad, loadKeyring } from "../src/server/security/keyring";

const k = () => randomBytes(32).toString("base64");
describe("keyring loading (D17)", () => {
  it("fails closed when any key is missing or malformed", () => {
    expect(() => loadKeyring({})).toThrow("Encryption key unavailable");
    expect(() => loadKeyring({ ENCRYPTION_KEYS: "not json", ENCRYPTION_ACTIVE_KEY_ID: "k1", EMAIL_LOOKUP_KEY: k() })).toThrow();
    expect(() => loadKeyring({ ENCRYPTION_KEYS: JSON.stringify({ k1: "short" }), ENCRYPTION_ACTIVE_KEY_ID: "k1", EMAIL_LOOKUP_KEY: k() })).toThrow();
    expect(() => loadKeyring({ ENCRYPTION_KEYS: JSON.stringify({ k1: k() }), ENCRYPTION_ACTIVE_KEY_ID: "k2", EMAIL_LOOKUP_KEY: k() })).toThrow();
  });
  it("loads rotation keys and round trips with row-bound context", () => {
    const ring = loadKeyring({ ENCRYPTION_KEYS: JSON.stringify({ k1: k(), k2: k() }), ENCRYPTION_ACTIVE_KEY_ID: "k2", EMAIL_LOOKUP_KEY: k() });
    const ctx = aad("orders", "123", "delivery_email");
    expect(decryptPrivate(encryptPrivate("a@b.co", ctx, ring), ctx, ring)).toBe("a@b.co");
    expect(() => decryptPrivate(encryptPrivate("a@b.co", ctx, ring), aad("orders", "124", "delivery_email"), ring)).toThrow();
  });
});
