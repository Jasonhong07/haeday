// POST /api/charts/[id]/answer {foldChoice | boundaryChoice} → new revision in the same chart group.
import { answerQuestion, AnswerRequest } from "@/server/charts/service";
import { findGuest, GUEST_COOKIE } from "@/server/guest";
import { json, readCookie, sameOrigin, serverContext } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = serverContext();
  if (!sameOrigin(request, ctx.env)) return json({ error: "forbidden" }, 403);
  const body = AnswerRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "bad_request" }, 400);
  const guest = await findGuest(ctx.db, readCookie(request, GUEST_COOKIE));
  if (!guest) return json({ error: "not_found" }, 404);
  const result = await answerQuestion(ctx.db, ctx.ring, (await params).id, guest.id, body.data);
  if (result.ok) return json({ id: result.id }, 201);
  if (result.error === "invalid_input") return json({ error: "invalid_input", reason: result.reason }, 422);
  if (result.error === "rate_limited") return json({ error: "rate_limited" }, 429);
  return json({ error: "not_found" }, 404);
}
