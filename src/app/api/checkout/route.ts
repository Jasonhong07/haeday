// POST /api/checkout {chartRevisionId, consent} → Stripe Checkout URL (ARCHITECTURE §4.2).
import { z } from "zod";
import { paymentAdapter } from "@/server/deps";
import { llmConfigured, paymentsConfigured } from "@/server/env";
import { findGuest, GUEST_COOKIE } from "@/server/guest";
import { json, readCookie, sameOrigin, serverContext } from "@/server/http";
import { allowRequest, clientIp } from "@/server/ratelimit";
import { startCheckout } from "@/server/payments/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ chartRevisionId: z.uuid(), consent: z.literal(true) }).strict();

export async function POST(request: Request): Promise<Response> {
  const ctx = serverContext();
  if (!sameOrigin(request, ctx.env)) return json({ error: "forbidden" }, 403);
  if (!allowRequest(clientIp(request), "checkout", 20, 86400000)) return json({ error: "rate_limited" }, 429);
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "consent_required" }, 400);
  const payments = paymentAdapter(ctx.env);
  if (!payments || !paymentsConfigured(ctx.env) || !llmConfigured(ctx.env)) return json({ error: "sales_closed" }, 409);
  const guest = await findGuest(ctx.db, readCookie(request, GUEST_COOKIE));
  if (!guest) return json({ error: "not_found" }, 404);
  const r = await startCheckout({
    db: ctx.db, ring: ctx.ring, payments, priceId: ctx.env.STRIPE_PRICE_SAJU!,
    origin: new URL(ctx.env.APP_ORIGIN).origin, automaticTax: ctx.env.STRIPE_AUTOMATIC_TAX,
    approvedSnippetsOnly: ctx.env.APP_ENV === "production", allowPromotionCodes: true,
  }, guest.id, body.data.chartRevisionId, true);
  if (r.ok) return json({ url: r.url });
  const status = r.error === "not_found" ? 404 : r.error === "provider_error" ? 502 : 409;
  return json({ error: r.error, ...("orderId" in r ? { orderId: r.orderId } : {}) }, status);
}
