// POST /api/checkout/paypal {chartRevisionId, consent, promise, email} → PayPal order id for the PayPal/Venmo
// buttons (CC4c). Same checks, snapshot and one-active-order rule as the card checkout; email typed on our page.
import { z } from "zod";
import { dailyCap, paymentAdapter, paypalAdapter } from "@/server/deps";
import { llmConfigured, paymentsConfigured, paypalConfigured } from "@/server/env";
import { findGuest, GUEST_COOKIE } from "@/server/guest";
import { json, readCookie, sameOrigin, serverContext } from "@/server/http";
import { allowRequest, clientIp } from "@/server/ratelimit";
import { startCheckout } from "@/server/payments/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ chartRevisionId: z.uuid(), consent: z.literal(true), promise: z.enum(["minutes", "24h"]).default("minutes"), email: z.email().max(254) }).strict();

export async function POST(request: Request): Promise<Response> {
  const ctx = serverContext();
  if (!sameOrigin(request, ctx.env)) return json({ error: "forbidden" }, 403);
  if (!allowRequest(clientIp(request), "checkout", 20, 86400000)) return json({ error: "rate_limited" }, 429);
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "invalid" }, 400);
  const paypal = paypalAdapter(ctx.env);
  // Sales need the card checkout configured too (the one we always offer), AI, and PayPal allowed (tax OFF).
  if (!paypal || !paypalConfigured(ctx.env) || !paymentsConfigured(ctx.env) || !llmConfigured(ctx.env)) return json({ error: "sales_closed" }, 409);
  const guest = await findGuest(ctx.db, readCookie(request, GUEST_COOKIE));
  if (!guest) return json({ error: "not_found" }, 404);
  const r = await startCheckout({
    db: ctx.db, ring: ctx.ring, payments: paypal, others: { stripe: paymentAdapter(ctx.env) }, priceId: "saju_reading",
    origin: new URL(ctx.env.APP_ORIGIN).origin, automaticTax: false,
    approvedSnippetsOnly: ctx.env.APP_ENV === "production", allowPromotionCodes: false, dailyCap: dailyCap(ctx.env),
  }, guest.id, body.data.chartRevisionId, true, "saju_reading", body.data.promise, { email: body.data.email });
  if (r.ok) return json({ orderId: r.orderId, paypalOrderId: r.providerCheckoutId });
  const status = r.error === "not_found" ? 404 : r.error === "provider_error" ? 502 : 409;
  return json({ error: r.error, ...("orderId" in r ? { orderId: r.orderId } : {}), ...("promise" in r ? { promise: r.promise } : {}) }, status);
}
