// Next 16 proxy (formerly middleware): per-request CSP nonce (L1). CSP_MODE=report-only (default) | enforce | off.
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, cspHeaderName, type CspMode } from "./server/csp";

export function proxy(request: NextRequest) {
  const mode = (process.env.CSP_MODE ?? "report-only") as CspMode;
  if (mode === "off") return NextResponse.next();
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV === "development", https: (process.env.APP_ORIGIN ?? "").startsWith("https://") });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp); // Next reads the nonce from here and stamps its own scripts
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(cspHeaderName(mode), csp);
  return response;
}

export const config = {
  matcher: [{
    source: "/((?!api|go|_next/static|_next/image|favicon.ico|icon|opengraph-image|robots.txt|sitemap.xml|manifest.webmanifest).*)",
    missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }],
  }],
};
