// POST /api/webhooks/paypal: verified with PayPal's API (CC4c), then the same transactional handler as Stripe.
import * as Sentry from "@sentry/nextjs";
import { paymentAdapter, paypalAdapter } from "@/server/deps";
import { json, serverContext } from "@/server/http";
import { handlePaymentEvent } from "@/server/payments/webhook";
import { PaymentProviderError } from "@/server/payments/adapter";
import { getWebBoss } from "@/server/queue/boss";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const ctx = serverContext();
  const paypal = paypalAdapter(ctx.env);
  if (!paypal?.verifyWebhook) return json({ error: "not_configured" }, 503);
  const raw = await request.text();
  let event;
  try { event = await paypal.verifyWebhook(raw, request.headers); }
  catch (e) {
    // PayPal's verify API down = try again later (503); anything else = not a genuine PayPal event (400).
    if (e instanceof PaymentProviderError && e.kind === "transient") return json({ error: "retry" }, 503);
    return json({ error: "bad_signature" }, 400);
  }
  try {
    const boss = await getWebBoss(ctx.env.DATABASE_URL!);
    const res = await handlePaymentEvent({ db: ctx.db, ring: ctx.ring, boss, payments: paypal, others: { stripe: paymentAdapter(ctx.env) }, paymentsMode: ctx.env.PAYMENTS_MODE, priceId: "saju_reading" }, event);
    if (res.outcome === "rejected") Sentry.captureMessage(`PayPal event rejected: ${res.reason ?? "unknown"}`, "error");
    return json({ received: true, outcome: res.outcome });
  } catch (e) {
    Sentry.captureException(e);
    return json({ error: "retry" }, 500); // PayPal redelivers; nothing was committed for this event
  }
}
