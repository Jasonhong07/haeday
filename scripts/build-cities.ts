// Builds data/cities.json from GeoNames cities15000.txt + data/admin1_names.json (see data/README.md).
// Usage: pnpm places:build   (needs data/cities15000.txt, which is not committed)
import { readFileSync, writeFileSync } from "node:fs";
import { IANAZone } from "luxon";

const SRC = "data/cities15000.txt";
const admin1 = JSON.parse(readFileSync("data/admin1_names.json", "utf8")) as Record<string, string>;
const countries = new Intl.DisplayNames(["en"], { type: "region" });
const countryName = (cc: string) => {
  try { return countries.of(cc) ?? cc; } catch { return cc; }
};

/** Row: [geonameId, name, region, countryCode, lat, lon, tz, population, asciiName ("" if same), hint ("" if none)] */
type Row = [number, string, string, string, number, number, string, number, string, string];
const rows: Row[] = [];
const dropped = { badTz: 0, noTz: 0 };

for (const line of readFileSync(SRC, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const c = line.split("\t");
  const [id, name, ascii, , lat, lon, , , cc, , code, , , , pop, , , tz] = c as string[];
  if (!tz) { dropped.noTz++; continue; }
  if (!IANAZone.isValidZone(tz)) { dropped.badTz++; continue; }
  // US: state postal code (GeoNames admin1 for US is the postal code). Elsewhere: region name when known.
  let region = cc === "US" ? (code ?? "") : (code && code !== "00" ? admin1[`${cc}.${code}`] ?? "" : "");
  const plain = (x: string) => x.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  if (plain(region) === plain(name!)) region = ""; // "Seoul, South Korea", not "Seoul, Seoul, South Korea"
  rows.push([Number(id), name!, region, cc!, Math.round(Number(lat) * 1e4) / 1e4, Math.round(Number(lon) * 1e4) / 1e4, tz,
    Number(pop), ascii && ascii !== name ? ascii : "", ""]);
}
rows.sort((a, b) => b[7] - a[7] || a[0] - b[0]);

// Same visible label twice: within 50 km it is the same place listed twice (keep the larger);
// farther apart, add "near <closest larger city>" so the customer can tell them apart.
const km = (a: Row, b: Row) => Math.hypot(a[4] - b[4], (a[5] - b[5]) * Math.cos((a[4] * Math.PI) / 180)) * 111.2;
const keyOf = (r: Row) => `${r[1]}|${r[2]}|${r[3]}`;
const seen = new Map<string, Row[]>();
const kept: Row[] = [];
const dedup = { merged: 0, hinted: 0 };
for (const r of rows) {
  const same = seen.get(keyOf(r)) ?? [];
  if (same.some((o) => km(o, r) < 50)) { dedup.merged++; continue; }
  same.push(r); seen.set(keyOf(r), same); kept.push(r);
}
for (const group of seen.values()) {
  if (group.length < 2) continue;
  for (const r of group) {
    let best: Row | undefined, bestKm = Infinity;
    for (const o of kept) {
      if (o[7] <= r[7] || o[1] === r[1] || o[3] !== r[3]) continue;
      const d = km(o, r);
      if (d < bestKm) { bestKm = d; best = o; }
    }
    if (best) { r[9] = `near ${best[1]}`; (r as Row & { km?: number }).km = Math.round(bestKm); dedup.hinted++; }
  }
  // Still ambiguous (both near the same bigger city): show the distance too.
  const hints = group.map((r) => r[9]);
  for (const r of group) if (r[9] && hints.filter((h) => h === r[9]).length > 1) r[9] = `${(r as Row & { km?: number }).km} km from ${r[9].slice(5)}`;
  for (const r of group) delete (r as Row & { km?: number }).km;
}
rows.length = 0; rows.push(...kept);

const countryNames: Record<string, string> = {};
for (const r of rows) countryNames[r[3]] ??= countryName(r[3]);

const out = {
  source: "GeoNames cities15000 (https://www.geonames.org), CC BY 4.0. Region names derived via reverse_geocoder 1.5.1 (GeoNames-derived).",
  fields: ["id", "name", "region", "country", "lat", "lon", "tz", "population", "asciiName", "hint"],
  countries: Object.fromEntries(Object.entries(countryNames).sort()),
  // Full US state names so "chicago, illinois" matches rows whose region is the postal code.
  usStates: Object.fromEntries(Object.entries({ ...admin1, "US.DC": "District of Columbia" }).filter(([k]) => k.startsWith("US.")).map(([k, v]) => [k.slice(3), v])),
  rows,
};
writeFileSync("data/cities.json", JSON.stringify(out));
console.log(`cities: ${rows.length}, dropped: ${JSON.stringify(dropped)}, duplicates: ${JSON.stringify(dedup)}`);
