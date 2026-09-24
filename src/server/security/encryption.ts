import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

export interface Keyring { activeId: string; keys: Readonly<Record<string, Buffer>>; lookupKey: Buffer; }
function validateKey(key: Buffer | undefined): asserts key is Buffer {
  if (!key || key.length !== 32) throw new Error("Encryption key unavailable");
}
export function encryptPrivate(value: unknown, context: string, ring: Keyring): string {
  const key = ring.keys[ring.activeId];
  validateKey(key);
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(ring.activeId) || !context) throw new Error("Invalid encryption configuration");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", ring.activeId, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}
export function decryptPrivate<T>(envelope: string, context: string, ring: Keyring): T {
  try {
    const parts = envelope.split(".");
    if (parts.length !== 5 || parts[0] !== "v1" || !context) throw new Error();
    const [, keyId = "", nonce = "", tag = "", body = ""] = parts;
    const key = ring.keys[keyId]; validateKey(key);
    const iv = Buffer.from(nonce, "base64url"), authTag = Buffer.from(tag, "base64url");
    if (iv.length !== 12 || authTag.length !== 16) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(authTag);
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8")) as T;
  } catch { throw new Error("Private data could not be read"); }
}
export function emailLookup(email: string, ring: Keyring): string {
  validateKey(ring.lookupKey);
  return createHmac("sha256", ring.lookupKey).update("email:v1\0").update(normalizeEmail(email)).digest("hex");
}

/** Canonical form used for lookups; changing it later would require recomputing every stored lookup. */
export function normalizeEmail(email: string): string {
  return email.normalize("NFKC").trim().toLowerCase();
}
