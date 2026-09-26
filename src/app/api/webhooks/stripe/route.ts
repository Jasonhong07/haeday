// POST /api/webhooks/stripe: raw body, signature verified, then the transactional handler (ARCHITECTURE §4.3).
import * as Sentry from "@sentry/nextjs";
import { paymentAdapter, paypalAdapter } from "@/server/deps";
import { json, serverContext } from "@/server/http";
import { handlePaymentEvent } from "@/server/payments/webhook";
import { getWebBoss } from "@/server/queue/boss";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const ctx = serverContext();
  const payments = paymentAdapter(ctx.env);
  if (!payments || !ctx.env.STRIPE_PRICE_SAJU) return json({ error: "not_configured" }, 503);
  const raw = await request.text();
  let event;
  try { event = payments.parseWebhook(raw, request.headers.get("stripe-signature")); } catch { return json({ error: "bad_signature" }, 400); }
  try {
    const boss = await getWebBoss(ctx.env.DATABASE_URL!);
    const res = await handlePaymentEvent({ db: ctx.db, ring: ctx.ring, boss, payments, others: { paypal: paypalAdapter(ctx.env) }, paymentsMode: ctx.env.PAYMENTS_MODE, priceId: ctx.env.STRIPE_PRICE_SAJU }, event);
    if (res.outcome === "rejected") Sentry.captureMessage(`Payment event rejected: ${res.reason ?? "unknown"}`, "error");
    return json({ received: true, outcome: res.outcome });
  } catch (e) {
    Sentry.captureException(e);
    return json({ error: "retry" }, 500); // Stripe retries; the event row was not committed
  }
}
