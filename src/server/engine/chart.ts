// haeday-chart-v1 (ENGINE_SPEC). Pure functions, no I/O besides the bundled jie table and runtime tz data.
import { JIE_LONS, JIE_TIMES, equationOfTimeMinutes, jieIndexAt } from "./astro";
import {
  BRANCHES, BRANCH_ELEMENT, BRANCH_EN, BRANCH_MAIN_STEM, JIE_LON_TO_BRANCH, STEMS, STEM_ELEMENT, STEM_EN, STEM_YINYANG,
  dayIndex60, hourBranch, hourStem, join60, mod, monthStem, split60, tenGod, yearIndex60,
  type Element, type TenGod, type YinYang,
} from "./tables";
import { runtimeTzdataVersion, standardOffsetMinutes, wallToUtc, zoneOf } from "./time";

export const POLICY_VERSION = "haeday-chart-v1";
export const COVERAGE_VERSION = "cov-1";
export type DayBoundary = "midnight" | "zi_23";

export interface Place { label: string; lat: number; lon: number; tz: string }
export interface ChartInput {
  birthDate: string;
  time: { kind: "exact" | "approximate"; hhmm: string } | { kind: "unknown" };
  place: Place; // resolved server-side from placeId (never from the client)
  foldChoice?: "earlier" | "later";
  /** Index of the time window the customer picked from `questions` (unknown time only). */
  boundaryChoice?: number;
  dayBoundary?: DayBoundary;
  today?: string; // for tests; defaults to the current UTC date
}

export interface Pillar { stem: string; branch: string; stemEn: string; branchEn: string; stemElement: Element; branchElement: Element }
export interface Pillars { year: Pillar; month: Pillar; day: Pillar; hour: Pillar | null }
export type Warning = "hourBoundary" | "dayBoundary" | "termBoundary" | "pre1970Tz" | "approximateTime";
export interface Candidate { reason: Warning | "timeWindow"; pillars: Pillars; window?: { from: string; to: string } }
/** askCustomer: true only when windows differ in year or month pillar (D25). Day-only splits are disclosed, not asked. */
export interface BoundaryQuestion { type: "timeWindow"; askCustomer: boolean; windows: Array<{ index: number; from: string; to: string; minutes: number }>; defaultIndex: number }
export interface Audit {
  inputLocal: string; tz: string; tzdataVersion: string; utc: string | null; offsetMinutes: number | null;
  stdOffsetMinutes: number | null; lonCorrectionMin: number | null; eotMin: number | null; trueSolar: string | null;
  jieBefore: string | null; jieAfter: string | null; eotMethod: "noaa-meeus";
}
export interface Chart {
  pillars: Pillars;
  dayMaster: { stem: string; element: Element; yinYang: YinYang };
  visibleElements: Record<Element, number>;
  denominator: 6 | 8;
  tenGods: Array<{ position: "year_stem" | "year_branch" | "month_stem" | "month_branch" | "day_branch" | "hour_stem" | "hour_branch"; god: TenGod }>;
  timeBasis: "exact" | "approximate" | "unknown";
  disclosure: string | null;
  policyVersion: typeof POLICY_VERSION;
  coverageVersion: typeof COVERAGE_VERSION;
  audit: Audit;
}
export type ChartResponse =
  | { kind: "computed"; chart: Chart; alternatives: Candidate[]; warnings: Warning[]; questions: BoundaryQuestion[] }
  | { kind: "needs_fold_choice"; utcCandidates: [string, string] }
  | { kind: "invalid_input"; reason: "nonexistent_local_time" | "date_out_of_range" | "unknown_place" | "bad_format" };

// ---------- core pieces ----------
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const naiveIso = (ms: number) => new Date(ms).toISOString().slice(0, 19);
const wrap180 = (x: number) => { const r = mod(x + 180, 360) - 180; return r === -180 ? 180 : r; };

function pillar(idx60: number): Pillar {
  const [s, b] = split60(idx60);
  return { stem: STEMS[s]!, branch: BRANCHES[b]!, stemEn: STEM_EN[s]!, branchEn: BRANCH_EN[b]!, stemElement: STEM_ELEMENT[s]!, branchElement: BRANCH_ELEMENT[b]! };
}

interface Solar { utc: number; std: number; lonCorr: number; eot: number; trueSolar: number /* naive ms */ }
export function trueSolarAt(utc: number, place: Place): Solar {
  const std = standardOffsetMinutes(utc, place.tz);
  const lonCorr = wrap180(place.lon - std / 4) * 4;
  const eot = equationOfTimeMinutes(utc);
  return { utc, std, lonCorr, eot, trueSolar: utc + (std + lonCorr + eot) * 60_000 };
}

function yearMonth(utc: number) {
  const i = jieIndexAt(utc);
  let j = i;
  while (JIE_LONS[j] !== 315) j -= 1;
  const solarYear = new Date(JIE_TIMES[j]!).getUTCFullYear();
  const y60 = yearIndex60(solarYear);
  const monthBranch = JIE_LON_TO_BRANCH[JIE_LONS[i]!]!;
  const m60 = join60(monthStem(mod(y60, 10), monthBranch), monthBranch);
  return { y60, m60, jieBefore: JIE_TIMES[i]!, jieAfter: JIE_TIMES[i + 1]! };
}

function dayHour(trueSolar: number, withHour: boolean, boundary: DayBoundary) {
  const minutes = Math.floor(mod(trueSolar, 86_400_000) / 60_000);
  let epochDay = Math.floor(trueSolar / 86_400_000);
  if (boundary === "zi_23" && minutes >= 23 * 60) epochDay += 1;
  const d60 = dayIndex60(epochDay);
  let h60: number | null = null;
  if (withHour) {
    const stemForZi = boundary === "midnight" && minutes >= 23 * 60 ? mod(d60 + 1, 10) : mod(d60, 10);
    const hb = hourBranch(minutes);
    h60 = join60(hourStem(stemForZi, hb), hb);
  }
  return { d60, h60 };
}

function pillarsAt(utc: number, place: Place, withHour: boolean, boundary: DayBoundary) {
  const solar = trueSolarAt(utc, place);
  const ym = yearMonth(utc);
  const dh = dayHour(solar.trueSolar, withHour, boundary);
  const pillars: Pillars = { year: pillar(ym.y60), month: pillar(ym.m60), day: pillar(dh.d60), hour: dh.h60 === null ? null : pillar(dh.h60) };
  return { solar, ym, pillars };
}

function derive(pillars: Pillars) {
  const dm = STEMS.indexOf(pillars.day.stem as (typeof STEMS)[number]);
  const counts: Record<Element, number> = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  const list = [pillars.year, pillars.month, pillars.day, ...(pillars.hour ? [pillars.hour] : [])];
  for (const p of list) { counts[p.stemElement] += 1; counts[p.branchElement] += 1; }
  const stemIdx = (p: Pillar) => STEMS.indexOf(p.stem as (typeof STEMS)[number]);
  const branchMain = (p: Pillar) => BRANCH_MAIN_STEM[BRANCHES.indexOf(p.branch as (typeof BRANCHES)[number])]!;
  const tenGods: Chart["tenGods"] = [
    { position: "year_stem", god: tenGod(dm, stemIdx(pillars.year)) },
    { position: "year_branch", god: tenGod(dm, branchMain(pillars.year)) },
    { position: "month_stem", god: tenGod(dm, stemIdx(pillars.month)) },
    { position: "month_branch", god: tenGod(dm, branchMain(pillars.month)) },
    { position: "day_branch", god: tenGod(dm, branchMain(pillars.day)) },
  ];
  if (pillars.hour) {
    tenGods.push({ position: "hour_stem", god: tenGod(dm, stemIdx(pillars.hour)) });
    tenGods.push({ position: "hour_branch", god: tenGod(dm, branchMain(pillars.hour)) });
  }
  return {
    dayMaster: { stem: STEMS[dm]!, element: STEM_ELEMENT[dm]!, yinYang: STEM_YINYANG[dm]! },
    visibleElements: counts,
    denominator: (pillars.hour ? 8 : 6) as 6 | 8,
    tenGods,
  };
}

// ---------- warnings and alternatives ----------
const MIN = 60_000;
function warningsAndAlternatives(utc: number, place: Place, solar: Solar, ym: { jieBefore: number; jieAfter: number },
  birthYear: number, approximate: boolean, boundary: DayBoundary) {
  const warnings: Warning[] = [];
  const alternatives: Candidate[] = [];
  const minutes = mod(solar.trueSolar, 86_400_000) / MIN;
  const hourWindow = approximate ? 60 : 5;
  // hour-branch edges at odd hours
  let nearest = 0, dist = Infinity;
  for (let e = 1; e < 24; e += 2) {
    const dd = Math.abs(mod(minutes - 60 * e + 720, 1440) - 720);
    if (dd < dist) { dist = dd; nearest = e; }
  }
  if (dist <= hourWindow) {
    warnings.push("hourBoundary");
    const delta = mod(minutes - 60 * nearest + 720, 1440) - 720; // signed minutes from edge
    const shift = (delta >= 0 ? -(delta + 1) : -delta + 1) * MIN; // cross to the other side
    alternatives.push({ reason: "hourBoundary", pillars: pillarsAt(utc + shift, place, true, boundary).pillars });
  }
  const dayDist = Math.min(minutes, 1440 - minutes);
  if (dayDist <= hourWindow) {
    warnings.push("dayBoundary");
    const shift = (minutes < 720 ? -(minutes + 1) : 1440 - minutes + 1) * MIN;
    alternatives.push({ reason: "dayBoundary", pillars: pillarsAt(utc + shift, place, true, boundary).pillars });
  }
  const toBefore = utc - ym.jieBefore, toAfter = ym.jieAfter - utc;
  if (Math.min(toBefore, toAfter) <= 30 * MIN) {
    warnings.push("termBoundary");
    const target = toBefore <= toAfter ? ym.jieBefore - MIN : ym.jieAfter;
    alternatives.push({ reason: "termBoundary", pillars: pillarsAt(target, place, true, boundary).pillars });
  }
  if (birthYear < 1970) warnings.push("pre1970Tz");
  if (approximate) warnings.push("approximateTime");
  return { warnings, alternatives };
}

// ---------- unknown time (ENGINE_SPEC §4) ----------
interface Group { from: string; to: string; minutes: number; key: string; pillars: Pillars }
function unknownGroups(birthDate: string, place: Place, boundary: DayBoundary): { groups: Group[]; sample: number } {
  const groups: Group[] = [];
  let sample = 0;
  for (let m = 0; m < 1440; m++) {
    const hhmm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const wall = wallToUtc(birthDate, hhmm, place.tz);
    for (const utc of wall.utc) {
      const { pillars } = pillarsAt(utc, place, false, boundary);
      const key = `${pillars.year.stem}${pillars.year.branch}${pillars.month.stem}${pillars.month.branch}${pillars.day.stem}${pillars.day.branch}`;
      const last = groups[groups.length - 1];
      if (last && last.key === key) { last.to = hhmm; last.minutes += 1; }
      else { groups.push({ from: hhmm, to: hhmm, minutes: 1, key, pillars }); }
      sample = utc;
    }
  }
  return { groups, sample };
}

export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function describeDifference(from: Pillars, to: Pillars): string {
  const parts: string[] = [];
  for (const key of ["year", "month", "day"] as const) {
    const a = from[key], b = to[key];
    if (a.stem + a.branch !== b.stem + b.branch) parts.push(`your ${key} pillar would be ${b.stem}${b.branch} (${b.stemEn} ${b.branchEn}) instead of ${a.stem}${a.branch}`);
  }
  return parts.join(", and ");
}

// ---------- entry point ----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function computeChart(input: ChartInput): ChartResponse {
  const boundary = input.dayBoundary ?? "midnight";
  if (!DATE_RE.test(input.birthDate) || ("hhmm" in input.time && !TIME_RE.test(input.time.hhmm))) return { kind: "invalid_input", reason: "bad_format" };
  const [y, mo, d] = input.birthDate.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return { kind: "invalid_input", reason: "bad_format" };
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  if (y < 1900 || input.birthDate > today) return { kind: "invalid_input", reason: "date_out_of_range" };

  const baseAudit = { inputLocal: `${input.birthDate} ${"hhmm" in input.time ? input.time.hhmm : "unknown"}`, tz: input.place.tz, tzdataVersion: runtimeTzdataVersion(), eotMethod: "noaa-meeus" as const };

  if (input.time.kind === "unknown") {
    const { groups } = unknownGroups(input.birthDate, input.place, boundary);
    const defaultIndex = groups.reduce((best, g, i) => (g.minutes > groups[best]!.minutes ? i : best), 0);
    const chosen = input.boundaryChoice !== undefined && groups[input.boundaryChoice] ? input.boundaryChoice : defaultIndex;
    const g = groups[chosen]!;
    let disclosure: string | null = null;
    if (groups.length > 1 && input.boundaryChoice === undefined) {
      disclosure = groups.filter((_, i) => i !== chosen)
        .map((o) => `If you were born between ${formatClock(o.from)} and ${formatClock(o.to)}, ${describeDifference(g.pillars, o.pillars)}.`)
        .join(" ");
    }
    const ym = (p: Pillars) => `${p.year.stem}${p.year.branch}${p.month.stem}${p.month.branch}`;
    const askCustomer = new Set(groups.map((w) => ym(w.pillars))).size > 1;
    const questions: BoundaryQuestion[] = groups.length > 1
      ? [{ type: "timeWindow", askCustomer, windows: groups.map((w, index) => ({ index, from: w.from, to: w.to, minutes: w.minutes })), defaultIndex }]
      : [];
    const chart: Chart = {
      pillars: g.pillars, ...derive(g.pillars), timeBasis: "unknown", disclosure,
      policyVersion: POLICY_VERSION, coverageVersion: COVERAGE_VERSION,
      audit: { ...baseAudit, utc: null, offsetMinutes: null, stdOffsetMinutes: null, lonCorrectionMin: null, eotMin: null, trueSolar: null, jieBefore: null, jieAfter: null },
    };
    const alternatives: Candidate[] = groups.filter((_, i) => i !== chosen).map((o) => ({ reason: "timeWindow", pillars: o.pillars, window: { from: o.from, to: o.to } }));
    return { kind: "computed", chart, alternatives, warnings: y < 1970 ? ["pre1970Tz"] : [], questions };
  }

  const wall = wallToUtc(input.birthDate, input.time.hhmm, input.place.tz);
  if (wall.status === "gap") return { kind: "invalid_input", reason: "nonexistent_local_time" };
  if (wall.status === "fold" && !input.foldChoice) return { kind: "needs_fold_choice", utcCandidates: [iso(wall.utc[0]), iso(wall.utc[1])] };
  const utc = wall.status === "fold" && input.foldChoice === "later" ? wall.utc[1] : wall.utc[0];
  const { solar, ym, pillars } = pillarsAt(utc, input.place, true, boundary);
  const approximate = input.time.kind === "approximate";
  const { warnings, alternatives } = warningsAndAlternatives(utc, input.place, solar, ym, y, approximate, boundary);
  const chart: Chart = {
    pillars, ...derive(pillars), timeBasis: input.time.kind, disclosure: null,
    policyVersion: POLICY_VERSION, coverageVersion: COVERAGE_VERSION,
    audit: {
      ...baseAudit, utc: iso(utc), offsetMinutes: zoneOf(input.place.tz).offset(utc),
      stdOffsetMinutes: solar.std, lonCorrectionMin: round3(solar.lonCorr), eotMin: round3(solar.eot),
      trueSolar: naiveIso(solar.trueSolar), jieBefore: iso(ym.jieBefore), jieAfter: iso(ym.jieAfter),
    },
  };
  return { kind: "computed", chart, alternatives, warnings, questions: [] };
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
