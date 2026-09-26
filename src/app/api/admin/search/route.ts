// CC4a: admin order search. POST (JSON) so a typed email never lands in a URL, access log or browser history.
import { requireAdmin } from "@/server/admin-guard";
import { audit } from "@/server/admin";
import { findOrders } from "@/server/support";

export const runtime = "nodejs";
export async function POST(request: Request): Promise<Response> {
  const a = await requireAdmin(request);
  if (!a) return new Response(null, { status: 404 });
  const body = (await request.json().catch(() => null)) as { q?: unknown } | null;
  const q = typeof body?.q === "string" ? body.q.slice(0, 200) : "";
  const rows = await findOrders(a.ctx.db, a.ctx.ring, q);
  await audit(a.ctx.db, a.actorId, "order_search", null); // what was searched is not recorded
  return Response.json({ rows }, { headers: { "Cache-Control": "no-store" } });
}
