// POST /api/orders/[id]/resend: the owner asks for the delivery email again (CC4a). Goes only to the checkout
// address; at most 3 times per order and not within 10 minutes of the last one.
import { customerFromSession, SESSION_COOKIE } from "@/server/auth";
import { findGuest, GUEST_COOKIE } from "@/server/guest";
import { json, readCookie, sameOrigin, serverContext } from "@/server/http";
import { loadOrderView } from "@/server/orders";
import { getWebBoss } from "@/server/queue/boss";
import { allowRequest, clientIp } from "@/server/ratelimit";
import { resendDelivery } from "@/server/support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = serverContext();
  if (!sameOrigin(request, ctx.env)) return json({ error: "forbidden" }, 403);
  if (!allowRequest(clientIp(request), "resend", 10, 3_600_000)) return json({ error: "rate_limited" }, 429);
  const guest = await findGuest(ctx.db, readCookie(request, GUEST_COOKIE));
  const customerId = await customerFromSession(ctx.db, readCookie(request, SESSION_COOKIE));
  const view = await loadOrderView(ctx.db, (await params).id, { guestId: guest?.id ?? null, customerId });
  if (!view) return json({ error: "unavailable" }, 404);
  const r = await resendDelivery({ db: ctx.db, boss: await getWebBoss(ctx.env.DATABASE_URL!), ring: ctx.ring }, view.id, "customer");
  if (r === "queued") return json({ status: "queued" });
  return json({ error: r }, 409);
}
