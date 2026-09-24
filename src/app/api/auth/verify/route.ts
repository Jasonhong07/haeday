// POST /api/auth/verify (form) → consume the link, open a session, go to `next` (same-site path only).
import { SESSION_COOKIE, sessionCookie, verifyMagicLink } from "@/server/auth";
import { isSecureOrigin, readCookie, sameOrigin, serverContext } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const safeNext = (n: unknown) => (typeof n === "string" && /^\/(r|order|my)(\/[A-Za-z0-9-]*)?$/.test(n) ? n : "/my");

export async function POST(request: Request): Promise<Response> {
  const ctx = serverContext();
  const origin = new URL(ctx.env.APP_ORIGIN).origin;
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  if (!sameOrigin(request, ctx.env)) return new Response(null, { status: 403, headers });
  const form = await request.formData().catch(() => null);
  const token = String(form?.get("token") ?? "");
  const r = await verifyMagicLink(ctx.db, token, readCookie(request, SESSION_COOKIE));
  if (!r.ok) return new Response(null, { status: 303, headers: { ...headers, Location: `${origin}/login/verify?error=${r.error}` } });
  return new Response(null, { status: 303, headers: { ...headers, Location: `${origin}${safeNext(form?.get("next"))}`, "Set-Cookie": sessionCookie(r.sessionToken, isSecureOrigin(ctx.env)) } });
}
