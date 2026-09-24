import type { Env } from "../env";
import type { Keyring } from "./encryption";

function decodeKey(value: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("Encryption key unavailable");
  return key;
}

/**
 * Builds the keyring from deployment secrets (D17). Missing or malformed keys fail closed:
 * private-data operations throw, while liveness and public pages keep working.
 */
export function loadKeyring(env: Pick<Env, "ENCRYPTION_KEYS" | "ENCRYPTION_ACTIVE_KEY_ID" | "EMAIL_LOOKUP_KEY">): Keyring {
  if (!env.ENCRYPTION_KEYS || !env.ENCRYPTION_ACTIVE_KEY_ID || !env.EMAIL_LOOKUP_KEY) throw new Error("Encryption key unavailable");
  let raw: unknown;
  try { raw = JSON.parse(env.ENCRYPTION_KEYS); } catch { throw new Error("Encryption key unavailable"); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Encryption key unavailable");
  const keys: Record<string, Buffer> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "string") throw new Error("Encryption key unavailable");
    keys[id] = decodeKey(value);
  }
  if (!keys[env.ENCRYPTION_ACTIVE_KEY_ID]) throw new Error("Encryption key unavailable");
  return { activeId: env.ENCRYPTION_ACTIVE_KEY_ID, keys, lookupKey: decodeKey(env.EMAIL_LOOKUP_KEY) };
}

/** Associated data binding a ciphertext to its table, row and field (D17). */
export function aad(table: string, rowId: string, field: string): string {
  return `${table}:${rowId}:${field}`;
}
