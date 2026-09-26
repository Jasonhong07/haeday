// L6: dev-only "Stripe": completes the fake session, delivers the webhook through the REAL handler, then runs the
// real generation once (there is no worker in the end-to-end run). 404 unless devFakes().
import { dailyCap, llmAdapter, paymentAdapter, paypalAdapter, priceId } from "@/server/deps";
import { devFakes } from "@/server/env";
import { FakePaymentAdapter } from "@/server/adapters/fake-payments";
import { generateReading } from "@/server/fulfillment/generate";
import { sameOrigin, serverContext } from "@/server/http";
import { handlePaymentEvent } from "@/server/payments/webhook";
import { getWebBoss } from "@/server/queue/boss";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const ctx = serverContext();
  if (!devFakes(ctx.env) || !sameOrigin(request, ctx.env)) return new Response(null, { status: 404 });
  const pay = paymentAdapter(ctx.env);
  if (!(pay instanceof FakePaymentAdapter)) return new Response(null, { status: 404 });
  const s = String((await request.formData().catch(() => null))?.get("s") ?? "");
  const session = pay.sessions.get(s);
  if (!session) return new Response(null, { status: 404 });
  pay.complete(s, { customerEmail: null });
  const boss = await getWebBoss(ctx.env.DATABASE_URL!);
  await handlePaymentEvent({ db: ctx.db, ring: ctx.ring, boss, payments: pay, others: { paypal: paypalAdapter(ctx.env) }, paymentsMode: "test", priceId: priceId(ctx.env)! }, { id: `evt_dev_${s}`, livemode: false, type: "checkout.completed", sessionId: s });
  const orderId = session.req.orderId;
  await generateReading({ db: ctx.db, ring: ctx.ring, boss, llm: llmAdapter(ctx.env), payments: pay, approvedSnippetsOnly: false, dailyCap: dailyCap(ctx.env) }, orderId).catch(() => undefined);
  return new Response(null, { status: 303, headers: { Location: `${new URL(ctx.env.APP_ORIGIN).origin}/order/${orderId}` } });
}
