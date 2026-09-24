// Bundled city dataset (GeoNames cities15000, CC BY 4.0): autocomplete + server-side placeId resolution.
// The client only ever sends a placeId; lat/lon/tz come from here (ENGINE_SPEC §1).
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Place } from "../engine";

type Row = [number, string, string, string, number, number, string, number, string, string];
interface Dataset { countries: Record<string, string>; usStates: Record<string, string>; rows: Row[] }

export interface PlaceSuggestion { placeId: string; label: string; name: string; region: string; country: string; tz: string }

interface Entry {
  row: Row;
  label: string;
  names: string[]; // normalized city names (name + ASCII name)
  qualifiers: string[]; // normalized words that "City, <qualifier>" may match: region, state name, country, codes
}

/** Common short forms people type for big US cities. */
const ALIASES: Record<string, number> = { nyc: 5128581, la: 5368361, sf: 5391959, dc: 4140963, philly: 4560349 };

/** Lowercase, strip accents and punctuation, unify saint/st, mount/mt, fort/ft. */
export function normalize(s: string): string {
  return s
    .normalize("NFKD").replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .map((w) => ({ saint: "st", mount: "mt", fort: "ft" })[w] ?? w)
    .join(" ");
}

let cache: { entries: Entry[]; byId: Map<number, Entry> } | null = null;

function load() {
  if (cache) return cache;
  const file = path.join(process.cwd(), "data", "cities.json");
  const data = JSON.parse(readFileSync(file, "utf8")) as Dataset;
  const entries: Entry[] = [];
  const byId = new Map<number, Entry>();
  for (const row of data.rows) {
    const [id, name, region, cc, , , , , ascii, hint] = row;
    const country = data.countries[cc] ?? cc;
    const label = [name, region, country].filter(Boolean).join(", ") + (hint ? ` (${hint})` : "");
    const qualifierText = [region, cc === "US" ? data.usStates[region] ?? "" : "", country, cc, cc === "US" ? "USA" : "", cc === "GB" ? "UK" : ""];
    const entry: Entry = {
      row,
      label,
      names: [...new Set([normalize(name), ascii ? normalize(ascii) : ""].filter(Boolean))],
      qualifiers: [...new Set(qualifierText.filter(Boolean).map(normalize))],
    };
    entries.push(entry);
    byId.set(id, entry);
  }
  cache = { entries, byId };
  return cache;
}

function toSuggestion(e: Entry): PlaceSuggestion {
  const [id, name, region, cc] = e.row;
  return { placeId: `gn:${id}`, label: e.label, name, region, country: cc, tz: e.row[6] };
}

/** 3 = exact name, 2 = name starts with query, 1 = a later word of the name starts with query, 0 = no match. */
function nameScore(e: Entry, q: string): number {
  let best = 0;
  for (const n of e.names) {
    if (n === q) return 3;
    if (n.startsWith(q)) best = Math.max(best, 2);
    else if (n.includes(` ${q}`)) best = Math.max(best, 1);
  }
  return best;
}

/** Every qualifier word must be the start of some qualifier (so "il", "illinois", "united states", "us" all work). */
function qualifies(e: Entry, qualifier: string): boolean {
  if (!qualifier) return true;
  return e.qualifiers.some((q) => q.startsWith(qualifier) || q.split(" ").some((w) => w.startsWith(qualifier)));
}

function rank(cityPart: string, qualifier: string, limit: number): Entry[] {
  const { entries } = load();
  const hits: { e: Entry; score: number }[] = [];
  for (const e of entries) {
    const score = nameScore(e, cityPart);
    if (score > 0 && qualifies(e, qualifier)) hits.push({ e, score });
  }
  // Rows are pre-sorted by population, so a stable sort by score keeps bigger cities first within a tier.
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit).map((h) => h.e);
}

export function searchPlaces(query: string, limit = 8): PlaceSuggestion[] {
  const { byId } = load();
  const parts = query.split(",").map(normalize);
  const cityPart = parts[0] ?? "";
  const qualifier = parts.slice(1).filter(Boolean).join(" ");
  if (cityPart.length < 2 && !ALIASES[cityPart]) return [];

  const out: Entry[] = [];
  const add = (list: Entry[]) => { for (const e of list) if (out.length < limit && !out.includes(e)) out.push(e); };

  const alias = !qualifier ? ALIASES[cityPart] : undefined;
  if (alias && byId.has(alias)) add([byId.get(alias)!]);
  add(rank(cityPart, qualifier, limit));
  // "chicago il" / "springfield illinois": no comma, so try treating trailing words as the qualifier.
  if (out.length < limit && !qualifier && cityPart.includes(" ")) {
    const words = cityPart.split(" ");
    for (let cut = words.length - 1; cut >= 1 && out.length < limit; cut--) {
      add(rank(words.slice(0, cut).join(" "), words.slice(cut).join(" "), limit));
    }
  }
  return out.map(toSuggestion);
}

const PLACE_ID = /^gn:(\d{1,10})$/;

/** Server-side resolution. Returns null for anything that is not a known bundled city. */
export function resolvePlace(placeId: string): (Place & { placeId: string }) | null {
  const m = PLACE_ID.exec(placeId);
  if (!m) return null;
  const e = load().byId.get(Number(m[1]));
  if (!e) return null;
  const [, , , , lat, lon, tz] = e.row;
  return { placeId, label: e.label, lat, lon, tz };
}

export const PLACES_ATTRIBUTION = "City data © GeoNames (geonames.org), licensed under CC BY 4.0.";
