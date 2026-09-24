import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GET } from "../src/app/api/places/route";
import { normalize, resolvePlace, searchPlaces } from "../src/server/places";
import { computeChart } from "../src/server/engine";
import manifest from "../fixtures/manifest.json";

const first = (q: string) => searchPlaces(q)[0]?.label;

describe("city search", () => {
  it.each([
    ["chicago", "Chicago, IL, United States"],
    ["Chicago, IL", "Chicago, IL, United States"],
    ["chicago illinois", "Chicago, IL, United States"],
    ["new york", "New York City, NY, United States"],
    ["NYC", "New York City, NY, United States"],
    ["LA", "Los Angeles, CA, United States"],
    ["seoul", "Seoul, South Korea"],
    ["busan", "Busan, South Korea"],
    ["sydney", "Sydney, New South Wales, Australia"],
    ["sydney, canada", "Sydney, Nova Scotia, Canada"],
    ["saint louis, mo", "St. Louis, MO, United States"],
    ["sao paulo", "São Paulo, Brazil"],
    ["springfield, il", "Springfield, IL, United States"],
    ["washington, dc", "Washington, DC, United States"],
    ["anchorage", "Anchorage, AK, United States"],
  ])("%s → %s", (q, label) => {
    expect(first(q)).toBe(label);
  });

  it("ranks the most populous exact match first and returns at most the limit", () => {
    const r = searchPlaces("portland");
    expect(r[0]!.label).toBe("Portland, OR, United States");
    expect(r.some((p) => p.label === "Portland, ME, United States")).toBe(true);
    expect(searchPlaces("san", 5)).toHaveLength(5);
  });

  it("returns nothing for one-letter or junk queries", () => {
    expect(searchPlaces("c")).toEqual([]);
    expect(searchPlaces("zzqxqz")).toEqual([]);
    expect(searchPlaces("   ")).toEqual([]);
  });

  it("gives every city a unique visible label", () => {
    const labels = searchPlaces("brentwood", 10).map((p) => p.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.filter((l) => l.startsWith("Brentwood, CA"))).toHaveLength(2);
  });

  it("normalizes accents, punctuation and saint/mount/fort", () => {
    expect(normalize("São  Paulo")).toBe("sao paulo");
    expect(normalize("St. Louis")).toBe(normalize("Saint Louis"));
    expect(normalize("Mount Vernon")).toBe("mt vernon");
  });
});

describe("placeId resolution (server side)", () => {
  it("resolves a suggestion to lat/lon/tz", () => {
    const id = searchPlaces("chicago")[0]!.placeId;
    expect(id).toMatch(/^gn:\d+$/);
    expect(resolvePlace(id)).toMatchObject({ label: "Chicago, IL, United States", tz: "America/Chicago" });
  });

  it.each(["", "gn:", "gn:999999999", "5128581", "gn:12;drop", "gn:-1", "GN:5128581"])("rejects %j", (id) => {
    expect(resolvePlace(id)).toBeNull();
  });

  it("agrees with the engine fixture places (same tz, within 0.1°)", () => {
    const queries: Record<string, string> = {
      seoul: "seoul", nyc: "new york", la: "los angeles, ca", chicago: "chicago", anchorage: "anchorage",
      detroit: "detroit", phoenix: "phoenix", honolulu: "honolulu", indianapolis: "indianapolis",
      sydney: "sydney, australia",
    };
    // Kiritimati (pop. ~6k) is below the cities15000 cutoff; it stays an engine-only date-line fixture.
    expect(searchPlaces("kiritimati")).toEqual([]);
    for (const [key, place] of Object.entries(manifest.places).filter(([k]) => k !== "kiritimati")) {
      const hit = searchPlaces(queries[key]!)[0];
      expect(hit, key).toBeDefined();
      const p = resolvePlace(hit!.placeId)!;
      expect(p.tz, key).toBe(place.tz);
      expect(Math.abs(p.lat - place.lat), key).toBeLessThan(0.1);
      expect(Math.abs(p.lon - place.lon), key).toBeLessThan(0.1);
    }
  });

  it("every time zone in the dataset works in the engine", () => {
    const data = JSON.parse(readFileSync("data/cities.json", "utf8")) as { rows: [number, string, string, string, number, number, string][] };
    const byTz = new Map<string, number>();
    for (const r of data.rows) if (!byTz.has(r[6])) byTz.set(r[6], r[0]);
    expect(byTz.size).toBeGreaterThan(300);
    for (const [tz, id] of byTz) {
      const place = resolvePlace(`gn:${id}`)!;
      const r = computeChart({ birthDate: "1995-01-01", time: { kind: "exact", hhmm: "12:00" }, place });
      expect(r.kind, tz).toBe("computed");
    }
  });
});

describe("GET /api/places", () => {
  const call = (qs: string) => GET(new Request(`http://localhost/api/places${qs}`));

  it("returns suggestions without coordinates", async () => {
    const res = call("?q=chicago");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("max-age");
    const body = (await res.json()) as { results: Record<string, unknown>[] };
    expect(body.results[0]).toMatchObject({ label: "Chicago, IL, United States", country: "US" });
    expect(body.results[0]).not.toHaveProperty("lat");
    expect(body.results[0]).not.toHaveProperty("lon");
  });

  it.each(["", "?q=", `?q=${"a".repeat(81)}`, "?q=chicago&limit=50", "?q=chicago&limit=x"])("rejects %j with 400", async (qs) => {
    const res = call(qs);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_query" });
  });
});
