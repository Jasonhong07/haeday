import { requireAdmin } from "@/server/admin-guard";
import { audit } from "@/server/admin";
import { paymentAdapter } from "@/server/deps";
import { orders } from "@/server/db/schema";
import { setSalesEnabled } from "@/server/settings";
import { and, eq, isNotNull } from "drizzle-orm";

export const runtime = "nodejs";
/** Form POST: mode=on | soft_stop | hard_stop (hard stop also expires every open Stripe session, ARCHITECTURE §5). */
export async function POST(request: Request): Promise<Response> {
  const a = await requireAdmin(request);
  if (!a) return new Response(null, { status: 404 });
  const mode = String((await request.formData()).get("mode") ?? "");
  if (!["on", "soft_stop", "hard_stop"].includes(mode)) return new Response(null, { status: 400 });
  await setSalesEnabled(a.ctx.db, mode === "on", `admin:${a.actorId}`);
  if (mode === "hard_stop") {
    const payments = paymentAdapter(a.ctx.env);
    const open = await a.ctx.db.select({ s: orders.stripeSessionId }).from(orders).where(and(eq(orders.paymentStatus, "open"), isNotNull(orders.stripeSessionId)));
    for (const o of open) { try { await payments?.expireCheckoutSession(o.s!); } catch { /* already expired or completed */ } }
  }
  await audit(a.ctx.db, a.actorId, `sales:${mode}`, null);
  return new Response(null, { status: 303, headers: { Location: `${new URL(a.ctx.env.APP_ORIGIN).origin}/admin` } });
}
