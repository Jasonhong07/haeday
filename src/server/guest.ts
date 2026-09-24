// Guest identity (ARCHITECTURE §4.6): a random cookie; the database stores only its SHA-256.
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "./db/client";
import { guests } from "./db/schema";

export const GUEST_COOKIE = "hd_guest";
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url

export const hashGuestToken = (token: string) => createHash("sha256").update("guest:v1\0").update(token).digest("hex");

/** Existing guest for this cookie value, or null. Never creates rows. */
export async function findGuest(db: Db, token: string | undefined): Promise<{ id: string } | null> {
  if (!token || !TOKEN_RE.test(token)) return null;
  const row = await db.query.guests.findFirst({ where: eq(guests.cookieHash, hashGuestToken(token)), columns: { id: true } });
  return row ?? null;
}

/** Guest for this cookie, creating one (and a new token) when missing or unknown. */
export async function ensureGuest(db: Db, token: string | undefined): Promise<{ id: string; newToken?: string }> {
  const existing = await findGuest(db, token);
  if (existing) return existing;
  const fresh = randomBytes(32).toString("base64url");
  const [row] = await db.insert(guests).values({ cookieHash: hashGuestToken(fresh) }).returning({ id: guests.id });
  return { id: row!.id, newToken: fresh };
}

export function guestCookie(token: string, secure: boolean): string {
  return [`${GUEST_COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${60 * 60 * 24 * 365}`, secure ? "Secure" : ""]
    .filter(Boolean).join("; ");
}
