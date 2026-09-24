// Jie boundaries from the canonical table (D21) and equation of time (NOAA solar calculator / Meeus).
import jieData from "../../../data/jie_1900_2050.json";

interface JieRow { utc: string; lon: number }
const rows = (jieData as { jie: JieRow[] }).jie;
export const JIE_TIMES: number[] = rows.map((r) => Date.parse(r.utc));
export const JIE_LONS: number[] = rows.map((r) => r.lon);
export const JIE_RANGE = { first: JIE_TIMES[0]!, last: JIE_TIMES[JIE_TIMES.length - 1]! };

/** Index of the last jie at or before `utcMs` (a boundary instant belongs to the new period). */
export function jieIndexAt(utcMs: number): number {
  let lo = 0, hi = JIE_TIMES.length - 1;
  if (utcMs < JIE_TIMES[0]! || utcMs >= JIE_TIMES[hi]!) throw new RangeError("date outside jie table");
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (JIE_TIMES[mid]! <= utcMs) lo = mid; else hi = mid - 1;
  }
  return lo;
}

const rad = (d: number) => (d * Math.PI) / 180;

/** Equation of time in minutes (apparent − mean solar time), NOAA solar calculator (Meeus) formulation. */
export function equationOfTimeMinutes(utcMs: number): number {
  const jd = utcMs / 86_400_000 + 2440587.5;
  const t = (jd - 2451545) / 36525;
  const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const seconds = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813));
  const eps0 = 23 + (26 + seconds / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(rad(125.04 - 1934.136 * t));
  const y = Math.tan(rad(eps / 2)) ** 2;
  const l0r = rad(l0), mr = rad(m);
  const eq = y * Math.sin(2 * l0r) - 2 * e * Math.sin(mr) + 4 * e * y * Math.sin(mr) * Math.cos(2 * l0r)
    - 0.5 * y * y * Math.sin(4 * l0r) - 1.25 * e * e * Math.sin(2 * mr);
  return (4 * eq * 180) / Math.PI;
}
