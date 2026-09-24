// POST /api/charts → compute + store an encrypted chart revision for this guest (ARCHITECTURE §4.1).
// Returns only the revision id; the page renders the free fields server-side.
import { createChart, ChartRequest } from "@/server/charts/service";
import { ensureGuest, GUEST_COOKIE, guestCookie } from "@/server/guest";
import { isSecureOrigin, json, readCookie, sameOrigin, serverContext } from "@/server/http";
import { resolvePlace } from "@/server/places";
import { allowRequest, clientIp } from "@/server/ratelimit";
import { FIRST_TOUCH_COOKIE, VISITOR_COOKIE, validChannel, validVisitor } from "@/server/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const ctx = serverContext();
  if (!sameOrigin(request, ctx.env)) return json({ error: "forbidden" }, 403);
  const body = ChartRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "bad_request" }, 400);

  // Cheap checks first, so bots and bad input don't create guest rows.
  if (!resolvePlace(body.data.placeId)) return json({ error: "invalid_input", reason: "unknown_place" }, 422);
  if (!allowRequest(clientIp(request), "charts", 60, 3_600_000)) return json({ error: "rate_limited" }, 429);
  const guest = await ensureGuest(ctx.db, readCookie(request, GUEST_COOKIE), {
    visitorId: validVisitor(readCookie(request, VISITOR_COOKIE)) ? readCookie(request, VISITOR_COOKIE)! : null,
    channel: validChannel(readCookie(request, FIRST_TOUCH_COOKIE)),
  });
  const extra: Record<string, string> = guest.newToken ? { "Set-Cookie": guestCookie(guest.newToken, isSecureOrigin(ctx.env)) } : {};
  const result = await createChart(ctx.db, ctx.ring, guest.id, body.data);
  if (result.ok) return json({ id: result.id }, 201, extra);
  if (result.error === "invalid_input") return json({ error: "invalid_input", reason: result.reason }, 422, extra);
  if (result.error === "rate_limited") return json({ error: "rate_limited" }, 429, extra);
  return json({ error: "not_found" }, 404, extra);
}
