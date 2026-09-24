// POST /api/e {name, c?, ref?} → one first-party funnel event (D40). Only allowlisted names; `c` must be on our
// campaign list and `ref` must be a bare host (the client sends document.referrer's hostname, never the URL).
import { z } from "zod";
import { channelOf } from "@/lib/campaigns";
import { EVENT_NAMES, FIRST_TOUCH_COOKIE, VISITOR_COOKIE, cookie, newVisitorId, recordEvent, validChannel, validVisitor } from "@/server/analytics";
import { isSecureOrigin, json, readCookie, sameOrigin, serverContext } from "@/server/http";
import { allowRequest, clientIp } from "@/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Body = z.object({ name: z.enum(EVENT_NAMES), c: z.string().max(40).optional(), ref: z.string().max(253).optional() }).strict();

export async function POST(request: Request): Promise<Response> {
  const ctx = serverContext();
  if (!sameOrigin(request, ctx.env)) return json({ error: "forbidden" }, 403);
  if (!allowRequest(clientIp(request), "events", 120, 3_600_000)) return json({ ok: true }); // silently drop
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "bad_request" }, 400);
  const secure = isSecureOrigin(ctx.env);
  const setCookies: string[] = [];
  let visitor = readCookie(request, VISITOR_COOKIE);
  if (!validVisitor(visitor)) { visitor = newVisitorId(); setCookies.push(cookie(VISITOR_COOKIE, visitor, 365, secure)); }
  let channel = validChannel(readCookie(request, FIRST_TOUCH_COOKIE));
  if (!channel && body.data.name === "visit") {
    const ch = channelOf({ campaign: body.data.c, refHost: body.data.ref, ownHost: new URL(ctx.env.APP_ORIGIN).hostname });
    channel = ch ?? "direct";
    setCookies.push(cookie(FIRST_TOUCH_COOKIE, channel, 90, secure));
  }
  await recordEvent(ctx.db, body.data.name, visitor, channel === "direct" ? null : channel);
  const res = json({ ok: true });
  for (const c of setCookies) res.headers.append("Set-Cookie", c);
  return res;
}
