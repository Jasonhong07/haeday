import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

/** Readiness: database reachable and queue schema installed. No internals in the response. */
export async function GET(): Promise<Response> {
  try {
    const { db } = getDb(getEnv().DATABASE_URL);
    await db.execute(sql`select 1`);
    const queue = await db.execute(sql`select to_regclass('pgboss.job') is not null as ok`);
    const ok = (queue.rows[0] as { ok?: boolean } | undefined)?.ok === true;
    return Response.json({ status: ok ? "ready" : "not_ready" }, { status: ok ? 200 : 503, headers });
  } catch {
    return Response.json({ status: "not_ready" }, { status: 503, headers });
  }
}
