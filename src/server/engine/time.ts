// Wall clock → UTC with DST gap/fold detection (ENGINE_SPEC §2.2), using the runtime's IANA data via Luxon.
import { IANAZone } from "luxon";

export type WallResult =
  | { status: "valid"; utc: [number] }
  | { status: "fold"; utc: [number, number] }
  | { status: "gap"; utc: [] };

export function zoneOf(tz: string): IANAZone {
  const zone = IANAZone.create(tz);
  if (!zone.isValid) throw new Error("unknown time zone");
  return zone;
}

/** All UTC instants whose local wall time equals the input minute. 0 = gap, 2 = fold. */
export function wallToUtc(date: string, hhmm: string, tz: string): WallResult {
  const zone = zoneOf(tz);
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const [h, mi] = hhmm.split(":").map(Number) as [number, number];
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  const offsets = new Set<number>();
  for (const probe of [-26, -2, 0, 2, 26]) offsets.add(zone.offset(naive + probe * 3_600_000));
  const found = new Set<number>();
  for (const off of offsets) {
    const utc = naive - off * 60_000;
    if (zone.offset(utc) === off) found.add(utc);
  }
  const list = [...found].sort((a, b) => a - b);
  if (list.length === 0) return { status: "gap", utc: [] };
  if (list.length === 1) return { status: "valid", utc: [list[0]!] };
  return { status: "fold", utc: [list[0]!, list[list.length - 1]!] };
}

const DAY = 86_400_000;
const PROBE_DAYS = [90, 182, 273, 365];
const MAX_DST_MINUTES = 180;

/**
 * Standard (non-DST) offset in minutes at an instant. JavaScript does not expose the tzdata isdst flag, so:
 * the current offset is DST only if the zone returns to a lower offset (within 3 h) both before and after
 * this instant (probes at ±3, 6, 9, 12 months); the standard offset is then the lowest of those.
 * Offsets more than 3 h away are a different regime (date-line moves such as Samoa 2011, Kwajalein 1993)
 * and are ignored; a permanent change of standard time (Seoul 1954, 1961) is not mistaken for DST because
 * the offset does not come back on the future side.
 * Pillars do not depend on this value (see trueSolarAt); it feeds the audit fields.
 */
export function standardOffsetMinutes(utcMs: number, tz: string): number {
  const zone = zoneOf(tz);
  const offset = zone.offset(utcMs);
  const side = (sign: 1 | -1) => {
    const same = PROBE_DAYS.map((d) => zone.offset(utcMs + sign * d * DAY)).filter((o) => Math.abs(o - offset) <= MAX_DST_MINUTES);
    return { lower: same.filter((o) => o < offset), otherRegime: same.length === 0 };
  };
  const before = side(-1), after = side(1);
  // DST = the offset drops back on both sides; a side that lies entirely in another regime (date-line move) does not count against it.
  const dropsBefore = before.lower.length > 0 || before.otherRegime;
  const dropsAfter = after.lower.length > 0 || after.otherRegime;
  const lower = [...before.lower, ...after.lower];
  if (!dropsBefore || !dropsAfter || lower.length === 0) return offset;
  return Math.min(...lower);
}

export const runtimeTzdataVersion = (): string => process.versions.tz ?? "unknown";
