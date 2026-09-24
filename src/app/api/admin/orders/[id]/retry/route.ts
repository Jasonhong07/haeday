import { requireAdmin } from "@/server/admin-guard";
import { retryOrder } from "@/server/admin";
import { getWebBoss } from "@/server/queue/boss";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const a = await requireAdmin(request);
  if (!a) return new Response(null, { status: 404 });
  const form = await request.formData().catch(() => null);
  const requestId = String(form?.get("requestId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return new Response(null, { status: 400 });
  const r = await retryOrder(a.ctx.db, await getWebBoss(a.ctx.env.DATABASE_URL!), (await params).id, a.actorId, requestId);
  return new Response(null, { status: 303, headers: { Location: `${new URL(a.ctx.env.APP_ORIGIN).origin}/admin?retry=${r}` } });
}
