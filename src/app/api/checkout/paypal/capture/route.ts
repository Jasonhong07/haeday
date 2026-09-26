// POST /api/checkout/paypal/capture {orderId}: the buyer approved in the PayPal/Venmo window (onApprove). Only the
// order's owner (guest cookie or session) may trigger it; the server captures and runs the normal paid transition.
import { z } from "zod";
import { paymentAdapter, paypalAdapter } from "@/server/deps";
import { customerFromSession, SESSION_COOKIE } from "@/server/auth";
import { findGuest, GUEST_COOKIE } from "@/server/guest";
import { json, readCookie, sameOrigin, serverContext } from "@/server/http";
import { loadOrderView } from "@/server/orders";
import { captureAndApply } from "@/server/payments/webhook";
import { getWebBoss } from "@/server/queue/boss";
import { orders } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ orderId: z.uuid() }).strict();

export async function POST(request: Request): Promise<Response> {
  const ctx = serverContext();
  if (!sameOrigin(request, ctx.env)) return json({ error: "forbidden" }, 403);
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "invalid" }, 400);
  const paypal = paypalAdapter(ctx.env);
  if (!paypal) return json({ error: "unavailable" }, 409);
  const guest = await findGuest(ctx.db, readCookie(request, GUEST_COOKIE));
  const customerId = await customerFromSession(ctx.db, readCookie(request, SESSION_COOKIE));
  const view = await loadOrderView(ctx.db, body.data.orderId, { guestId: guest?.id ?? null, customerId });
  if (!view) return json({ error: "not_found" }, 404);
  const [o] = await ctx.db.select({ checkoutId: orders.providerCheckoutId }).from(orders).where(and(eq(orders.id, view.id), eq(orders.paymentProvider, "paypal")));
  if (!o?.checkoutId) return json({ error: "not_found" }, 404);
  const r = await captureAndApply({ db: ctx.db, ring: ctx.ring, boss: await getWebBoss(ctx.env.DATABASE_URL!), payments: paypal, others: { stripe: paymentAdapter(ctx.env) }, paymentsMode: ctx.env.PAYMENTS_MODE, priceId: "saju_reading" }, o.checkoutId);
  // declined: the buyer picks another funding source in the PayPal window (actions.restart()). Everything else goes
  // to the order page, which shows the truth (paid, still confirming, or closed with nothing charged).
  if (r.outcome === "declined") return json({ status: "declined" });
  if (r.outcome === "not_approved") return json({ status: "not_approved" });
  if (r.outcome === "failed") return json({ status: "failed" });
  return json({ status: r.outcome === "paid" || r.outcome === "no_transition" || r.outcome === "duplicate" ? "paid" : r.outcome === "closed" ? "closed" : "processing", orderId: view.id });
}
