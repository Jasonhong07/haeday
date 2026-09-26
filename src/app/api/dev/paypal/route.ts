// L6/CC4c: dev-only stand-in for the PayPal window. {action:"approve", paypalOrderId} = the buyer approves;
// {action:"generate", orderId} = what the worker would do next (no worker runs in the end-to-end test).
// 404 unless devFakes(). The capture itself goes through the REAL capture route.
import { z } from "zod";
import { dailyCap, llmAdapter, paymentAdapter, paypalAdapter } from "@/server/deps";
import { devFakes } from "@/server/env";
import { FakePayPalAdapter } from "@/server/adapters/fake-paypal";
import { generateReading } from "@/server/fulfillment/generate";
import { json, sameOrigin, serverContext } from "@/server/http";
import { getWebBoss } from "@/server/queue/boss";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.union([z.object({ action: z.literal("approve"), paypalOrderId: z.string().max(40) }), z.object({ action: z.literal("generate"), orderId: z.uuid() })]);

export async function POST(request: Request): Promise<Response> {
  const ctx = serverContext();
  if (!devFakes(ctx.env) || !sameOrigin(request, ctx.env)) return new Response(null, { status: 404 });
  const pp = paypalAdapter(ctx.env);
  const pay = paymentAdapter(ctx.env);
  if (!(pp instanceof FakePayPalAdapter) || !pay) return new Response(null, { status: 404 });
  const b = Body.safeParse(await request.json().catch(() => null));
  if (!b.success) return new Response(null, { status: 400 });
  if (b.data.action === "approve") {
    if (!pp.orders.has(b.data.paypalOrderId)) return new Response(null, { status: 404 });
    pp.approve(b.data.paypalOrderId);
    return json({ ok: true });
  }
  const boss = await getWebBoss(ctx.env.DATABASE_URL!);
  await generateReading({ db: ctx.db, ring: ctx.ring, boss, llm: llmAdapter(ctx.env), payments: pay, paypal: pp, approvedSnippetsOnly: false, dailyCap: dailyCap(ctx.env) }, b.data.orderId).catch(() => undefined);
  return json({ ok: true });
}
