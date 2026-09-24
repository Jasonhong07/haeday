// GET /api/places?q=chi → city autocomplete. Public data; the query itself is never logged (CLAUDE.md rule 9).
import { z } from "zod";
import { searchPlaces } from "@/server/places";

export const runtime = "nodejs";

const Query = z.object({
  q: z.string().trim().min(1).max(80),
  limit: z.coerce.number().int().min(1).max(10).default(8),
});

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = Query.safeParse({ q: params.get("q") ?? "", limit: params.get("limit") ?? undefined });
  if (!parsed.success) {
    return Response.json({ error: "bad_query" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const results = searchPlaces(parsed.data.q, parsed.data.limit);
  return Response.json({ results }, { headers: { "Cache-Control": "public, max-age=86400" } });
}
