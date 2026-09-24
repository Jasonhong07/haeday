import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptPrivate, emailLookup, encryptPrivate, type Keyring } from "../src/server/security/encryption";
const ring: Keyring = { activeId:"k1", keys:{k1:randomBytes(32)}, lookupKey:randomBytes(32) };
describe("private data encryption", () => {
  it("encrypts with unique nonces and round trips", () => {
    const data={email:"person@example.com",birthDate:"1990-01-01"};
    const a=encryptPrivate(data,"customers:123:email",ring);
    const b=encryptPrivate(data,"customers:123:email",ring);
    expect(a).not.toBe(b); expect(a).not.toContain(data.email);
    expect(decryptPrivate(a,"customers:123:email",ring)).toEqual(data);
  });
  it("rejects swapping ciphertext to another row or field", () => {
    const a=encryptPrivate("private","orders:1:email",ring);
    expect(() => decryptPrivate(a,"orders:2:email",ring)).toThrow("Private data");
  });
  it("rejects authentication-tag tampering", () => {
    const parts=encryptPrivate("private","orders:1",ring).split(".");
    const tag=Buffer.from(parts[3]!,"base64url"); tag[0]=tag[0]!^1; parts[3]=tag.toString("base64url");
    expect(() => decryptPrivate(parts.join("."),"orders:1",ring)).toThrow();
  });
  it("never falls back to plaintext with missing keys", () => {
    expect(() => encryptPrivate("private","x",{...ring,keys:{}})).toThrow();
    expect(() => decryptPrivate("plaintext","x",ring)).toThrow();
  });
  it("supports old keys during rotation", () => {
    const a=encryptPrivate("private","x",ring);
    const next={...ring,activeId:"k2",keys:{...ring.keys,k2:randomBytes(32)}};
    expect(decryptPrivate(a,"x",next)).toBe("private");
    expect(encryptPrivate("private","x",next).split(".")[1]).toBe("k2");
  });
  it("uses keyed normalized lookup without exposing email", () => {
    expect(emailLookup(" Person@Example.com ",ring)).toBe(emailLookup("person@example.com",ring));
    expect(emailLookup("person@example.com",ring)).not.toContain("person");
    expect(emailLookup("other@example.com",ring)).not.toBe(emailLookup("person@example.com",ring));
    // NFKC: full-width characters normalize to the same lookup
    expect(emailLookup("ｐｅｒｓｏｎ@example.com",ring)).toBe(emailLookup("person@example.com",ring));
  });
});
