// CC4a: admin re-sends the delivery email to the checkout address (max 3 per order).
import { requireAdmin } from "@/server/admin-guard";
import { adminBack } from "@/server/admin-redirect";
import { getWebBoss } from "@/server/queue/boss";
import { resendDelivery } from "@/server/support";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const a = await requireAdmin(request);
  if (!a) return new Response(null, { status: 404 });
  const form = await request.formData().catch(() => null);
  const id = (await params).id;
  const r = await resendDelivery({ db: a.ctx.db, boss: await getWebBoss(a.ctx.env.DATABASE_URL!), ring: a.ctx.ring }, id, "admin", a.actorId);
  return adminBack(a.ctx, form, id, `resend_${r}`);
}
