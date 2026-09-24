// POST /api/unsubscribe?t=… : RFC 8058 one-click (List-Unsubscribe-Post) and the confirm form. No login. C4.
import { unsubscribe } from "@/server/email/capture";
import { serverContext } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const ctx = serverContext();
  const url = new URL(request.url);
  const form = await request.formData().catch(() => null);
  const token = String(url.searchParams.get("t") ?? form?.get("t") ?? "");
  await unsubscribe(ctx.db, token); // unknown or used tokens look the same
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/html")) return new Response(null, { status: 303, headers: { Location: `${new URL(ctx.env.APP_ORIGIN).origin}/unsubscribe?done=1` } });
  return new Response(null, { status: 200 });
}
