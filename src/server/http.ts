// Small helpers shared by route handlers: origin check (CSRF, ARCHITECTURE §6), cookies, JSON errors.
import { getDb, type Db } from "./db/client";
import { getEnv, type Env } from "./env";
import type { Keyring } from "./security/encryption";
import { loadKeyring } from "./security/keyring";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...extra } });
}

/** POSTs must come from our own pages. Browsers always send Origin on cross-site POSTs. */
export function sameOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(env.APP_ORIGIN).origin;
}

export function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

export interface ServerContext { env: Env; db: Db; ring: Keyring }
export function serverContext(): ServerContext {
  const env = getEnv();
  return { env, db: getDb(env.DATABASE_URL).db, ring: loadKeyring(env) };
}

export const isSecureOrigin = (env: Env) => env.APP_ORIGIN.startsWith("https://");
