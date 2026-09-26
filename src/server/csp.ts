// L1: Content-Security-Policy. Scripts need a per-request nonce ('strict-dynamic' lets Next's own chunks load).
// Styles allow 'unsafe-inline' because React renders style="" attributes; script injection is the risk CSP guards.
export type CspMode = "report-only" | "enforce" | "off";

/** CC4c: PayPal/Venmo buttons (checkout page only) need PayPal's frames, images and API calls. */
const PAYPAL = { img: "https://*.paypal.com https://*.paypalobjects.com", connect: "https://*.paypal.com https://*.paypalobjects.com https://*.venmo.com", frame: "https://*.paypal.com https://*.venmo.com" };

export function buildCsp(nonce: string, opts: { dev: boolean; https: boolean; paypal?: boolean }): string {
  const pp = opts.paypal === true;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${opts.dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${pp ? ` ${PAYPAL.img}` : ""}`,       // the share image is drawn on a canvas (data:/blob:)
    "font-src 'self'",                  // L2: fonts are self-hosted
    `connect-src 'self'${pp ? ` ${PAYPAL.connect}` : ""}`,               // first-party events only; no third-party analytics in the browser
    `frame-src ${pp ? PAYPAL.frame : "'none'"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(opts.https ? ["upgrade-insecure-requests"] : []),
    "report-uri /api/csp-report",
  ].join("; ");
}

export const cspHeaderName = (mode: CspMode) => (mode === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only");

/** A violation reduced to the directive and the blocked HOST: no paths, query strings or page URLs are kept. */
export function sanitizeReport(raw: unknown): { directive: string; blocked: string } | null {
  const r = (raw as { "csp-report"?: Record<string, unknown> } | null)?.["csp-report"] ?? (Array.isArray(raw) ? (raw[0] as { body?: Record<string, unknown> })?.body : null);
  if (!r || typeof r !== "object") return null;
  const directive = String(r["effective-directive"] ?? r["violated-directive"] ?? r.effectiveDirective ?? "").split(" ")[0]!.slice(0, 40);
  const uri = String(r["blocked-uri"] ?? r.blockedURL ?? "");
  let blocked = uri;
  try { blocked = uri.includes(":") && !/^(inline|eval|data|blob)$/.test(uri) ? new URL(uri).host || new URL(uri).protocol : uri; } catch { blocked = uri.split(/[/?#]/)[0] ?? ""; }
  if (!directive) return null;
  return { directive: directive.replace(/[^a-z-]/g, ""), blocked: blocked.replace(/[^a-z0-9.:-]/gi, "").slice(0, 80) };
}
