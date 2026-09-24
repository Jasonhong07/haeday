// Chart revisions (ARCHITECTURE §4.1, D16/D17): compute with the engine, store encrypted, immutable.
// An edit or an answered question creates a new revision in the same chart group; old revisions never change.
import { randomUUID } from "node:crypto";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import { chartRevisions, orders } from "../db/schema";
import { computeChart, COVERAGE_VERSION, POLICY_VERSION, type ChartResponse } from "../engine";
import { runtimeTzdataVersion } from "../engine/time";
import { decryptPrivate, encryptPrivate, type Keyring } from "../security/encryption";
import { aad } from "../security/keyring";
import { resolvePlace } from "../places";
import { LIBRARY_VERSION } from "@/content/library";

export const RETENTION_UNPAID_DAYS = 30;
export const CHARTS_PER_HOUR = 30; // ARCHITECTURE §6

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const ChartRequest = z.object({
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.discriminatedUnion("kind", [
    z.object({ kind: z.enum(["exact", "approximate"]), hhmm: HHMM }),
    z.object({ kind: z.literal("unknown") }),
  ]),
  placeId: z.string().max(20),
  chartGroupId: z.uuid().optional(),
}).strict();
export type ChartRequest = z.infer<typeof ChartRequest>;

export const AnswerRequest = z.union([
  z.object({ foldChoice: z.enum(["earlier", "later"]) }).strict(),
  z.object({ boundaryChoice: z.number().int().min(0).max(10) }).strict(),
]);
export type AnswerRequest = z.infer<typeof AnswerRequest>;

/** What we keep about the customer's input (encrypted). */
export interface StoredInput {
  birthDate: string;
  time: ChartRequest["time"];
  placeId: string;
  placeLabel: string;
  foldChoice?: "earlier" | "later";
  boundaryChoice?: number;
}

export type CreateResult =
  | { ok: true; id: string; chartGroupId: string }
  | { ok: false; error: "invalid_input"; reason: "nonexistent_local_time" | "date_out_of_range" | "unknown_place" | "bad_format" }
  | { ok: false; error: "rate_limited" | "not_found" };

export interface LoadedChart {
  id: string;
  chartGroupId: string;
  input: StoredInput;
  response: Exclude<ChartResponse, { kind: "invalid_input" }>;
  createdAt: Date;
  ownedOrderId: string | null;
}

async function storeRevision(db: Db, ring: Keyring, guestId: string, chartGroupId: string, input: StoredInput, now: Date): Promise<CreateResult> {
  const place = resolvePlace(input.placeId);
  if (!place) return { ok: false, error: "invalid_input", reason: "unknown_place" };
  const response = computeChart({
    birthDate: input.birthDate, time: input.time, place,
    foldChoice: input.foldChoice, boundaryChoice: input.boundaryChoice,
    // The latest civil date on Earth (UTC+14), so a baby born "today" in Asia or the Pacific is accepted.
    today: new Date(now.getTime() + 14 * 3_600_000).toISOString().slice(0, 10),
  });
  if (response.kind === "invalid_input") return { ok: false, error: "invalid_input", reason: response.reason };

  const id = randomUUID();
  await db.insert(chartRevisions).values({
    id, chartGroupId, guestId,
    inputEnc: encryptPrivate(input, aad("chart_revisions", id, "input"), ring),
    responseEnc: encryptPrivate(response, aad("chart_revisions", id, "response"), ring),
    policyVersion: POLICY_VERSION, coverageVersion: COVERAGE_VERSION,
    tzdataVersion: runtimeTzdataVersion(), libraryVersion: LIBRARY_VERSION,
    deleteAfter: new Date(now.getTime() + RETENTION_UNPAID_DAYS * 86_400_000),
  });
  return { ok: true, id, chartGroupId };
}

async function withinRateLimit(db: Db, guestId: string, now: Date): Promise<boolean> {
  const [row] = await db.select({ n: count() }).from(chartRevisions)
    .where(and(eq(chartRevisions.guestId, guestId), gt(chartRevisions.createdAt, new Date(now.getTime() - 3_600_000))));
  return (row?.n ?? 0) < CHARTS_PER_HOUR;
}

/** New chart (or an edit when chartGroupId belongs to this guest). */
export async function createChart(db: Db, ring: Keyring, guestId: string, req: ChartRequest, now = new Date()): Promise<CreateResult> {
  if (!(await withinRateLimit(db, guestId, now))) return { ok: false, error: "rate_limited" };
  let group: string = randomUUID();
  if (req.chartGroupId) {
    const owned = await db.query.chartRevisions.findFirst({
      where: and(eq(chartRevisions.chartGroupId, req.chartGroupId), eq(chartRevisions.guestId, guestId)), columns: { id: true },
    });
    if (!owned) return { ok: false, error: "not_found" };
    group = req.chartGroupId;
  }
  const place = resolvePlace(req.placeId);
  if (!place) return { ok: false, error: "invalid_input", reason: "unknown_place" };
  return storeRevision(db, ring, guestId, group, { birthDate: req.birthDate, time: req.time, placeId: req.placeId, placeLabel: place.label }, now);
}

/** Loads a revision only for its owner. Anything else looks like "not found". */
export async function loadChart(db: Db, ring: Keyring, id: string, guestId: string | null): Promise<LoadedChart | null> {
  if (!guestId || !z.uuid().safeParse(id).success) return null;
  const row = await db.query.chartRevisions.findFirst({ where: and(eq(chartRevisions.id, id), eq(chartRevisions.guestId, guestId)) });
  if (!row || !row.inputEnc || !row.responseEnc) return null;
  const input = decryptPrivate<StoredInput>(row.inputEnc, aad("chart_revisions", id, "input"), ring);
  const response = decryptPrivate<LoadedChart["response"]>(row.responseEnc, aad("chart_revisions", id, "response"), ring);
  const paid = await db.query.orders.findFirst({
    where: and(eq(orders.chartRevisionId, id), eq(orders.guestId, guestId), eq(orders.paymentStatus, "paid")), columns: { id: true },
  });
  return { id, chartGroupId: row.chartGroupId, input, response, createdAt: row.createdAt, ownedOrderId: paid?.id ?? null };
}

/** D40 step 4: the owner saw this free chart (first time only). */
export async function markChartViewed(db: Db, id: string, now = new Date()): Promise<void> {
  await db.update(chartRevisions).set({ firstViewedAt: now }).where(and(eq(chartRevisions.id, id), isNull(chartRevisions.firstViewedAt)));
}

/** Answering a fold or time-window question creates a new revision; the answered one stays as it was. */
export async function answerQuestion(db: Db, ring: Keyring, id: string, guestId: string, answer: AnswerRequest, now = new Date()): Promise<CreateResult> {
  const current = await loadChart(db, ring, id, guestId);
  if (!current) return { ok: false, error: "not_found" };
  if (!(await withinRateLimit(db, guestId, now))) return { ok: false, error: "rate_limited" };
  const next: StoredInput = { ...current.input };
  if ("foldChoice" in answer) {
    if (current.response.kind !== "needs_fold_choice") return { ok: false, error: "invalid_input", reason: "bad_format" };
    next.foldChoice = answer.foldChoice;
  } else {
    const q = current.response.kind === "computed" ? current.response.questions[0] : undefined;
    if (!q || !q.windows.some((w) => w.index === answer.boundaryChoice)) return { ok: false, error: "invalid_input", reason: "bad_format" };
    next.boundaryChoice = answer.boundaryChoice;
  }
  return storeRevision(db, ring, guestId, current.chartGroupId, next, now);
}
