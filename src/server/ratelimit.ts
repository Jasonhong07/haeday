// Per-instance sliding-window limiter by client IP (defence in depth next to the DB-backed per-guest limits).
// Railway runs one web instance at launch; if we scale out, move this to Postgres or Redis.
const hits = new Map<string, number[]>();

export function clientIp(request: Request): string {
  return (request.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || request.headers.get("x-real-ip") || "unknown";
}

export function allowRequest(ip: string, bucket: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const key = `${bucket}:${ip}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) { hits.set(key, recent); return false; }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 50_000) hits.clear(); // memory guard
  return true;
}
