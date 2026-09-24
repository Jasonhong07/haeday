import { revokeSession, SESSION_COOKIE, sessionCookie } from "@/server/auth";
import { isSecureOrigin, readCookie, sameOrigin, serverContext } from "@/server/http";

export const runtime = "nodejs";
export async function POST(request: Request): Promise<Response> {
  const ctx = serverContext();
  if (!sameOrigin(request, ctx.env)) return new Response(null, { status: 403 });
  await revokeSession(ctx.db, readCookie(request, SESSION_COOKIE));
  return new Response(null, { status: 303, headers: { Location: `${new URL(ctx.env.APP_ORIGIN).origin}/`, "Set-Cookie": sessionCookie("", isSecureOrigin(ctx.env), 0), "Cache-Control": "no-store" } });
}
