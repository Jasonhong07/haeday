// POST /api/csp-report: CSP violations, reduced to directive + blocked host (no URLs, no query strings).
import { sanitizeReport } from "@/server/csp";
import { allowRequest, clientIp } from "@/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!allowRequest(clientIp(request), "csp", 60, 3_600_000)) return new Response(null, { status: 204 });
  const text = await request.text().catch(() => "");
  let raw: unknown = null;
  try { raw = JSON.parse(text.slice(0, 20_000)); } catch { /* ignore */ }
  const v = sanitizeReport(raw);
  if (v) console.warn(`[csp] violation directive=${v.directive} blocked=${v.blocked}`);
  return new Response(null, { status: 204 });
}
