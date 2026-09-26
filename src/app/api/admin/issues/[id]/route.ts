// CC4a: admin marks a payment issue as seen (stops alert emails) or resolved.
import { requireAdmin } from "@/server/admin-guard";
import { adminBack } from "@/server/admin-redirect";
import { setIssueStatus } from "@/server/support";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const a = await requireAdmin(request);
  if (!a) return new Response(null, { status: 404 });
  const form = await request.formData().catch(() => null);
  const status = form?.get("status");
  if (status !== "acknowledged" && status !== "resolved") return new Response(null, { status: 400 });
  const ok = await setIssueStatus(a.ctx.db, (await params).id, status, a.actorId);
  const orderId = String(form?.get("orderId") ?? "") || null;
  return adminBack(a.ctx, form, orderId, ok ? `issue_${status}` : "issue_unchanged");
}
