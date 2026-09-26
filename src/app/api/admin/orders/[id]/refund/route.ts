import { requireAdmin } from "@/server/admin-guard";
import { audit } from "@/server/admin";
import { paymentAdapter } from "@/server/deps";
import { requestRefund } from "@/server/payments/refunds";
import { getWebBoss } from "@/server/queue/boss";
import { adminBack } from "@/server/admin-redirect";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const a = await requireAdmin(request);
  if (!a) return new Response(null, { status: 404 });
  const payments = paymentAdapter(a.ctx.env);
  const id = (await params).id;
  const form = await request.formData().catch(() => null);
  const r = payments ? await requestRefund({ db: a.ctx.db, payments, boss: await getWebBoss(a.ctx.env.DATABASE_URL!) }, { orderId: id, reason: "admin", requestedBy: "admin" }) : null;
  await audit(a.ctx.db, a.actorId, "refund", id);
  const msg = !r ? "refund_payments_not_configured" : r.ok ? `refund_${r.status}` : `refund_${r.error}`;
  return adminBack(a.ctx, form, id, msg);
}
