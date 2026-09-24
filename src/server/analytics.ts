// First-party funnel events (D40, L5). Allowlisted names only; the visitor id is a random value we issue.
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { funnelEvents } from "./db/schema";

export const VISITOR_COOKIE = "hd_v";
export const FIRST_TOUCH_COOKIE = "hd_ft";
export const EVENT_NAMES = ["visit", "form_started"] as const;
export type EventName = (typeof EVENT_NAMES)[number];
const VISITOR_RE = /^[0-9a-f-]{36}$/;
const CHANNEL_RE = /^[a-z0-9-]{1,20}$/;

export const newVisitorId = () => randomUUID();
export const validVisitor = (v: string | undefined): v is string => Boolean(v && VISITOR_RE.test(v));
export const validChannel = (v: string | undefined): string | null => (v && CHANNEL_RE.test(v) ? v : null);

/** One row per visitor, event and UTC day (repeat page views do not inflate the funnel). */
export async function recordEvent(db: Db, name: EventName, visitorId: string, channel: string | null): Promise<void> {
  await db.insert(funnelEvents).values({ name, visitorId, channel }).onConflictDoNothing();
}

export function cookie(name: string, value: string, maxAgeDays: number, secure: boolean): string {
  return [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeDays * 86_400}`, secure ? "Secure" : ""].filter(Boolean).join("; ");
}

export async function purgeOldEvents(db: Db, days = 400): Promise<void> {
  await db.execute(sql`delete from funnel_events where created_at < now() - make_interval(days => ${days})`);
}
