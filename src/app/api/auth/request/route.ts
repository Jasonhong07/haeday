// POST /api/auth/request {email} → same message whether or not the email is known (ARCHITECTURE §4.7).
import { z } from "zod";
import { requestMagicLink } from "@/server/auth";
import { emailAdapter, supportEmail } from "@/server/deps";
import { json, sameOrigin, serverContext } from "@/server/http";
import { allowRequest, clientIp } from "@/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Body = z.object({ email: z.email().max(254) }).strict();

export async function POST(request: Request): Promise<Response> {
  const ctx = serverContext();
  if (!sameOrigin(request, ctx.env)) return json({ error: "forbidden" }, 403);
  if (!allowRequest(clientIp(request), "magic", 10, 3600000)) return json({ error: "rate_limited" }, 429);
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "bad_email" }, 400);
  await requestMagicLink({ db: ctx.db, ring: ctx.ring, email: emailAdapter(ctx.env), origin: new URL(ctx.env.APP_ORIGIN).origin, supportEmail: supportEmail(ctx.env), adminEmails: ctx.env.ADMIN_EMAILS }, body.data.email);
  // D38: delivery failures and per-address throttling must not reveal whether an address is known.
  return json({ status: "ok" });
}
