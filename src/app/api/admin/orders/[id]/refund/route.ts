import { requireAdmin } from "@/server/admin-guard";
import { audit } from "@/server/admin";
import { paymentAdapter } from "@/server/deps";
import { requestRefund } from "@/server/payments/refunds";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const a = await requireAdmin(request);
  if (!a) return new Response(null, { status: 404 });
  const payments = paymentAdapter(a.ctx.env);
  const id = (await params).id;
  if (payments) await requestRefund({ db: a.ctx.db, payments }, { orderId: id, reason: "admin", requestedBy: "admin" });
  await audit(a.ctx.db, a.actorId, "refund", id);
  return new Response(null, { status: 303, headers: { Location: `${new URL(a.ctx.env.APP_ORIGIN).origin}/admin` } });
}
