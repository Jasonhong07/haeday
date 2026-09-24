// Email magic-link sign-in (ARCHITECTURE §4.7, D14, D18). Tokens are random, stored only as SHA-256, used once.
// The same response is returned whether or not an email is known. An email typed at checkout proves nothing:
// orders are linked to a customer only after that customer clicks a link sent to the same address.
import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "./db/client";
import { customers, magicLinks, orders, sessions } from "./db/schema";
import type { EmailAdapter } from "./adapters/email";
import { magicLinkEmail } from "./email/templates";
import { emailLookup, encryptPrivate, normalizeEmail, type Keyring } from "./security/encryption";
import { aad } from "./security/keyring";

export const SESSION_COOKIE = "hd_session";
export const MAGIC_LINK_TTL_MIN = 15;
export const MAGIC_LINKS_PER_HOUR = 5;
export const SESSION_DAYS = 30;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const hash = (kind: string, token: string) => createHash("sha256").update(`${kind}:v1\0`).update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

export type LinkRequestResult = "sent" | "throttled" | "not_sent" | "unavailable";

/**
 * Sends a link only to addresses we already know (a verified customer or an address used at checkout).
 * Callers must show the same message for "sent" and "not_sent".
 */
export async function requestMagicLink(deps: { db: Db; ring: Keyring; email: EmailAdapter | null; origin: string; supportEmail: string; now?: () => Date }, rawEmail: string): Promise<LinkRequestResult> {
  const now = deps.now?.() ?? new Date();
  const email = normalizeEmail(rawEmail);
  const lookup = emailLookup(email, deps.ring);
  let customer = await deps.db.query.customers.findFirst({ where: eq(customers.emailLookup, lookup) });
  if (!customer) {
    const bought = await deps.db.query.orders.findFirst({ where: eq(orders.deliveryEmailLookup, lookup), columns: { id: true } });
    if (!bought) return "not_sent";
    const id = crypto.randomUUID();
    [customer] = await deps.db.insert(customers).values({ id, emailLookup: lookup, emailEnc: encryptPrivate(email, aad("customers", id, "email"), deps.ring) })
      .onConflictDoNothing().returning();
    customer ??= await deps.db.query.customers.findFirst({ where: eq(customers.emailLookup, lookup) });
    if (!customer) return "unavailable";
  }
  const [{ n } = { n: 0 }] = await deps.db.select({ n: count() }).from(magicLinks)
    .where(and(eq(magicLinks.customerId, customer.id), gt(magicLinks.createdAt, new Date(now.getTime() - 3_600_000))));
  if (n >= MAGIC_LINKS_PER_HOUR) return "throttled";
  if (!deps.email) return "unavailable";
  const token = newToken();
  await deps.db.insert(magicLinks).values({ customerId: customer.id, tokenHash: hash("magic", token), expiresAt: new Date(now.getTime() + MAGIC_LINK_TTL_MIN * 60_000), createdAt: now });
  try {
    await deps.email.send({ to: email, ...magicLinkEmail(`${deps.origin}/login/verify?token=${token}`, deps.supportEmail), idempotencyKey: `magic:${hash("idem", token).slice(0, 32)}` });
  } catch {
    return "unavailable";
  }
  return "sent";
}

export type VerifyResult =
  | { ok: true; sessionToken: string; customerId: string; linkedOrders: number }
  | { ok: false; error: "invalid" | "expired" | "used" };

/** Consumes the token atomically (two concurrent uses → one success), links this email's orders, opens a session. */
export async function verifyMagicLink(db: Db, token: string, previousSession?: string, now = new Date()): Promise<VerifyResult> {
  if (!TOKEN_RE.test(token)) return { ok: false, error: "invalid" };
  const tokenHash = hash("magic", token);
  return db.transaction(async (tx) => {
    const [used] = await tx.update(magicLinks).set({ consumedAt: now })
      .where(and(eq(magicLinks.tokenHash, tokenHash), isNull(magicLinks.consumedAt), gt(magicLinks.expiresAt, now)))
      .returning({ customerId: magicLinks.customerId });
    if (!used) {
      const row = await tx.query.magicLinks.findFirst({ where: eq(magicLinks.tokenHash, tokenHash) });
      return { ok: false as const, error: !row ? "invalid" as const : row.consumedAt ? "used" as const : "expired" as const };
    }
    const [customer] = await tx.update(customers).set({ verifiedAt: now }).where(eq(customers.id, used.customerId)).returning();
    const linked = await tx.update(orders).set({ customerId: customer!.id, updatedAt: now })
      .where(and(eq(orders.deliveryEmailLookup, customer!.emailLookup), isNull(orders.customerId))).returning({ id: orders.id });
    // Rotate: the previous session (if any) is revoked and a new one issued.
    let rotatedFrom: string | null = null;
    if (previousSession && TOKEN_RE.test(previousSession)) {
      const [old] = await tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.tokenHash, hash("session", previousSession)), isNull(sessions.revokedAt))).returning({ id: sessions.id });
      rotatedFrom = old?.id ?? null;
    }
    const sessionToken = newToken();
    await tx.insert(sessions).values({ customerId: customer!.id, tokenHash: hash("session", sessionToken), rotatedFrom, createdAt: now, expiresAt: new Date(now.getTime() + SESSION_DAYS * 86_400_000) });
    return { ok: true as const, sessionToken, customerId: customer!.id, linkedOrders: linked.length };
  });
}

export async function customerFromSession(db: Db, token: string | undefined, now = new Date()): Promise<string | null> {
  if (!token || !TOKEN_RE.test(token)) return null;
  const s = await db.query.sessions.findFirst({ where: and(eq(sessions.tokenHash, hash("session", token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)), columns: { customerId: true } });
  if (!s) return null;
  const c = await db.query.customers.findFirst({ where: eq(customers.id, s.customerId), columns: { id: true, verifiedAt: true } });
  return c?.verifiedAt ? c.id : null;
}

export async function revokeSession(db: Db, token: string | undefined): Promise<void> {
  if (!token || !TOKEN_RE.test(token)) return;
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, hash("session", token)));
}

export function sessionCookie(token: string, secure: boolean, maxAgeSec = SESSION_DAYS * 86_400): string {
  return [`${SESSION_COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSec}`, secure ? "Secure" : ""].filter(Boolean).join("; ");
}

/** Admin = verified session AND email on the allowlist (D19). Checkout emails grant nothing. */
export async function isAdmin(db: Db, ring: Keyring, customerId: string | null, adminEmails: string[]): Promise<boolean> {
  if (!customerId || adminEmails.length === 0) return false;
  const c = await db.query.customers.findFirst({ where: eq(customers.id, customerId) });
  if (!c?.verifiedAt) return false;
  return adminEmails.some((e) => emailLookup(e, ring) === c.emailLookup);
}
