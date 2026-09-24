import { customerFromSession, isAdmin, SESSION_COOKIE } from "./auth";
import { readCookie, sameOrigin, serverContext, type ServerContext } from "./http";

/** For admin POST routes: same origin + verified session on the ADMIN_EMAILS allowlist. */
export async function requireAdmin(request: Request): Promise<{ ctx: ServerContext; actorId: string } | null> {
  const ctx = serverContext();
  if (!sameOrigin(request, ctx.env)) return null;
  const customerId = await customerFromSession(ctx.db, readCookie(request, SESSION_COOKIE));
  if (!(await isAdmin(ctx.db, ctx.ring, customerId, ctx.env.ADMIN_EMAILS))) return null;
  return { ctx, actorId: customerId! };
}
