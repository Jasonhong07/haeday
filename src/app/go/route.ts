// GET /go?c=<campaign> → remember the first-touch channel (our own list only), then open the site (L4).
import { channelOf } from "@/lib/campaigns";
import { FIRST_TOUCH_COOKIE, cookie, validChannel } from "@/server/analytics";
import { isSecureOrigin, readCookie, serverContext } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const TO = new Set(["/", "/saju"]);

export async function GET(request: Request): Promise<Response> {
  const ctx = serverContext();
  const url = new URL(request.url);
  const to = TO.has(url.searchParams.get("to") ?? "/") ? (url.searchParams.get("to") ?? "/") : "/";
  const headers = new Headers({ Location: `${new URL(ctx.env.APP_ORIGIN).origin}${to}`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  if (!validChannel(readCookie(request, FIRST_TOUCH_COOKIE))) {
    const ch = channelOf({ campaign: url.searchParams.get("c") ?? "" }) ?? "other";
    headers.append("Set-Cookie", cookie(FIRST_TOUCH_COOKIE, ch, 90, isSecureOrigin(ctx.env)));
  }
  return new Response(null, { status: 302, headers });
}
