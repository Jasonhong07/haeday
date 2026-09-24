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

/** Standard (non-DST) offset in minutes at an instant: the lower of the year's January/July offsets when in DST. */
export function standardOffsetMinutes(utcMs: number, tz: string): number {
  const zone = zoneOf(tz);
  const offset = zone.offset(utcMs);
  const year = new Date(utcMs).getUTCFullYear();
  const base = Math.min(zone.offset(Date.UTC(year, 0, 1)), zone.offset(Date.UTC(year, 6, 1)));
  return offset > base ? base : offset;
}

export const runtimeTzdataVersion = (): string => process.versions.tz ?? "unknown";
