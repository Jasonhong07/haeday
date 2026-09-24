// POST /api/chart-email {chartId, email, marketing} → queue "your chart" email (+ optional marketing consent). C4/D41.
import { z } from "zod";
import { requestChartEmail } from "@/server/email/capture";
import { findGuest, GUEST_COOKIE } from "@/server/guest";
import { json, readCookie, sameOrigin, serverContext } from "@/server/http";
import { getWebBoss } from "@/server/queue/boss";
import { allowRequest, clientIp } from "@/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Body = z.object({ chartId: z.uuid(), email: z.email().max(254), marketing: z.boolean() }).strict();

export async function POST(request: Request): Promise<Response> {
  const ctx = serverContext();
  if (!sameOrigin(request, ctx.env)) return json({ error: "forbidden" }, 403);
  if (!allowRequest(clientIp(request), "chart-email", 10, 3_600_000)) return json({ error: "rate_limited" }, 429);
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "bad_email" }, 400);
  const guest = await findGuest(ctx.db, readCookie(request, GUEST_COOKIE));
  if (!guest) return json({ error: "not_found" }, 404);
  const r = await requestChartEmail({ db: ctx.db, ring: ctx.ring, boss: await getWebBoss(ctx.env.DATABASE_URL!) }, { guestId: guest.id, ...body.data });
  if (r === "queued") return json({ status: "ok" });
  return json({ error: r }, r === "rate_limited" ? 429 : 404);
}
