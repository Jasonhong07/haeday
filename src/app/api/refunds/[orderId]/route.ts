// POST /api/refunds/[orderId]: customer goodwill refund through the single refund service (ARCHITECTURE §4.8, D18).
import { paymentAdapter } from "@/server/deps";
import { findGuest, GUEST_COOKIE } from "@/server/guest";
import { customerFromSession, SESSION_COOKIE } from "@/server/auth";
import { json, readCookie, sameOrigin, serverContext } from "@/server/http";
import { loadOrderView } from "@/server/orders";
import { requestRefund } from "@/server/payments/refunds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }): Promise<Response> {
  const ctx = serverContext();
  if (!sameOrigin(request, ctx.env)) return json({ error: "forbidden" }, 403);
  const { orderId } = await params;
  const guest = await findGuest(ctx.db, readCookie(request, GUEST_COOKIE));
  const customerId = await customerFromSession(ctx.db, readCookie(request, SESSION_COOKIE));
  const view = await loadOrderView(ctx.db, orderId, { guestId: guest?.id ?? null, customerId });
  if (!view) return json({ error: "unavailable" }, 404);
  const payments = paymentAdapter(ctx.env);
  if (!payments) return json({ error: "temporary_failure" }, 503);
  const r = await requestRefund({ db: ctx.db, payments }, { orderId: view.id, reason: "goodwill", requestedBy: "customer" });
  if (r.ok) return json({ status: r.status === "succeeded" ? "refunded" : "pending" });
  const map = { not_found: "unavailable", not_paid: "unavailable", already_refunded: "already_refunded", in_progress: "pending", outside_window: "outside_window", goodwill_used: "outside_window" } as const;
  return json({ error: map[r.error] }, 409);
}
