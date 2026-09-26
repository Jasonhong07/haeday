// Where an admin POST goes back to: the order page if the form came from it, else the dashboard. Only fixed paths
// (no user-supplied URL), so the redirect cannot be pointed elsewhere.
import { z } from "zod";
import type { ServerContext } from "./http";

export function adminBack(ctx: ServerContext, form: FormData | null, orderId: string | null, msg: string): Response {
  const origin = new URL(ctx.env.APP_ORIGIN).origin;
  const toOrder = form?.get("back") === "order" && orderId && z.uuid().safeParse(orderId).success;
  const path = toOrder ? `/admin/orders/${orderId}` : "/admin";
  return new Response(null, { status: 303, headers: { Location: `${origin}${path}?msg=${encodeURIComponent(msg)}` } });
}
