import { describe, expect, it } from "vitest";
import { computeChart } from "../../src/server/engine";
import { BRANCHES, STEMS, dayIndex60, hourBranch, hourStem, monthStem, split60, tenGod, yearIndex60 } from "../../src/server/engine/tables";
import { equationOfTimeMinutes, jieIndexAt } from "../../src/server/engine/astro";
import { wallToUtc } from "../../src/server/engine/time";

const gz = (i: number) => { const [s, b] = split60(i); return STEMS[s]! + BRANCHES[b]!; };
const nyc = { label: "New York", lat: 40.7128, lon: -74.006, tz: "America/New_York" };

describe("sexagenary tables", () => {
  it("years: 1984 甲子, 2024 甲辰, 2027 丁未, 1900 庚子", () => {
    expect(gz(yearIndex60(1984))).toBe("甲子");
    expect(gz(yearIndex60(2024))).toBe("甲辰");
    expect(gz(yearIndex60(2027))).toBe("丁未");
    expect(gz(yearIndex60(1900))).toBe("庚子");
  });
  it("五虎遁: 寅 month stem for each year stem", () => {
    // 甲己→丙寅, 乙庚→戊寅, 丙辛→庚寅, 丁壬→壬寅, 戊癸→甲寅
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((y) => STEMS[monthStem(y, 2)])).toEqual(["丙", "戊", "庚", "壬", "甲", "丙", "戊", "庚", "壬", "甲"]);
    expect(STEMS[monthStem(0, 1)]).toBe("丁"); // 甲 year 丑 month (Jan) = 丁丑
  });
  it("五鼠遁: 子 hour stem for each day stem", () => {
    // 甲己→甲子, 乙庚→丙子, 丙辛→戊子, 丁壬→庚子, 戊癸→壬子
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => STEMS[hourStem(d, 0)])).toEqual(["甲", "丙", "戊", "庚", "壬", "甲", "丙", "戊", "庚", "壬"]);
  });
  it("hour branches: 子 23:00–00:59, 丑 01:00, 午 11:00–12:59, 亥 21:00–22:59", () => {
    expect([23 * 60, 59, 60, 11 * 60, 12 * 60 + 59, 13 * 60, 22 * 60 + 59].map((m) => BRANCHES[hourBranch(m)])).toEqual(["子", "子", "丑", "午", "午", "未", "亥"]);
  });
  it("day cycle: published anchors and strict continuity 1900–2050", () => {
    const day = (y: number, m: number, d: number) => gz(dayIndex60(Date.UTC(y, m - 1, d) / 86_400_000));
    expect(day(2000, 1, 1)).toBe("戊午");
    expect(day(1900, 1, 31)).toBe("甲辰");
    for (let t = Date.UTC(1900, 0, 1) / 86_400_000; t < Date.UTC(2050, 0, 1) / 86_400_000; t++) {
      expect((dayIndex60(t + 1) - dayIndex60(t) + 60) % 60).toBe(1);
    }
  });
  it("ten gods for a 甲 (Yang Wood) day master", () => {
    const names = STEMS.map((_, i) => tenGod(0, i));
    expect(names).toEqual(["companion", "rob_wealth", "eating_god", "hurting_officer", "indirect_wealth", "direct_wealth", "seven_killings", "direct_officer", "indirect_resource", "direct_resource"]);
  });
  it("ten gods for a 丁 (Yin Fire) day master", () => {
    expect(tenGod(3, 3)).toBe("companion");
    expect(tenGod(3, 2)).toBe("rob_wealth");
    expect(tenGod(3, 5)).toBe("eating_god");        // 己 Yin Earth
    expect(tenGod(3, 7)).toBe("indirect_wealth");   // 辛 Yin Metal
    expect(tenGod(3, 8)).toBe("direct_officer");    // 壬 Yang Water
    expect(tenGod(3, 0)).toBe("direct_resource");   // 甲 Yang Wood
  });
});

describe("time and astronomy", () => {
  it("detects DST gap and fold", () => {
    expect(wallToUtc("2024-03-10", "02:30", "America/New_York").status).toBe("gap");
    const f = wallToUtc("2024-11-03", "01:30", "America/New_York");
    expect(f.status).toBe("fold");
    expect(f.utc.map((u) => new Date(u).toISOString())).toEqual(["2024-11-03T05:30:00.000Z", "2024-11-03T06:30:00.000Z"]);
  });
  it("equation of time near known extremes", () => {
    expect(equationOfTimeMinutes(Date.UTC(2024, 10, 3, 12))).toBeGreaterThan(16);
    expect(equationOfTimeMinutes(Date.UTC(2024, 1, 11, 12))).toBeLessThan(-14);
  });
  it("jie table boundary belongs to the new period", () => {
    const lichun = Date.parse("2024-02-04T08:27:08Z");
    expect(jieIndexAt(lichun)).toBe(jieIndexAt(lichun + 1000));
    expect(jieIndexAt(lichun - 1000)).toBe(jieIndexAt(lichun) - 1);
  });
});

describe("chart contract", () => {
  it("rejects dates before 1900, in the future, or malformed", () => {
    const base = { time: { kind: "exact" as const, hhmm: "12:00" }, place: nyc, today: "2026-09-24" };
    expect(computeChart({ ...base, birthDate: "1899-12-31" })).toEqual({ kind: "invalid_input", reason: "date_out_of_range" });
    expect(computeChart({ ...base, birthDate: "2026-09-25" })).toEqual({ kind: "invalid_input", reason: "date_out_of_range" });
    expect(computeChart({ ...base, birthDate: "1990-02-30" })).toEqual({ kind: "invalid_input", reason: "bad_format" });
    expect(computeChart({ ...base, birthDate: "1990-02-10", time: { kind: "exact", hhmm: "24:00" } })).toEqual({ kind: "invalid_input", reason: "bad_format" });
  });
  it("counts 8 visible characters with a known time and 6 without", () => {
    const known = computeChart({ birthDate: "1990-05-12", time: { kind: "exact", hhmm: "10:30" }, place: nyc, today: "2026-09-24" });
    const unknown = computeChart({ birthDate: "1990-05-12", time: { kind: "unknown" }, place: nyc, today: "2026-09-24" });
    if (known.kind !== "computed" || unknown.kind !== "computed") throw new Error("expected computed");
    expect(Object.values(known.chart.visibleElements).reduce((a, b) => a + b, 0)).toBe(8);
    expect(known.chart.denominator).toBe(8);
    expect(Object.values(unknown.chart.visibleElements).reduce((a, b) => a + b, 0)).toBe(6);
    expect(unknown.chart.tenGods).toHaveLength(5);
  });
  it("unknown time never blocks and discloses the exact alternative window (D06)", () => {
    const r = computeChart({ birthDate: "1990-11-03", time: { kind: "unknown" }, place: nyc, today: "2026-09-24" });
    if (r.kind !== "computed") throw new Error("expected computed");
    // Policy v2 (D28): New York is 3.98 min east of its meridian, so solar midnight falls at 11:56:01 PM local.
    expect(r.chart.disclosure).toBe("If you were born between 11:57 PM and 11:59 PM, your day pillar would be 癸酉 (Yin Water Rooster) instead of 壬申.");
    expect(r.questions[0]!.askCustomer).toBe(false); // day-only split: disclose, don't ask (D25)
    const lichun = computeChart({ birthDate: "2024-02-04", time: { kind: "unknown" }, place: nyc, today: "2026-09-24" });
    if (lichun.kind !== "computed") throw new Error("expected computed");
    expect(lichun.questions[0]!.askCustomer).toBe(true); // month/year split: ask
    const chosen = computeChart({ birthDate: "1990-11-03", time: { kind: "unknown" }, place: nyc, boundaryChoice: 1, today: "2026-09-24" });
    if (chosen.kind !== "computed") throw new Error("expected computed");
    expect(chosen.chart.pillars.day.stem + chosen.chart.pillars.day.branch).toBe("癸酉");
    expect(chosen.chart.disclosure).toBeNull();
  });
  it("gives every boundary warning a computed alternative", () => {
    const r = computeChart({ birthDate: "1992-06-10", time: { kind: "exact", hhmm: "00:48" }, place: { label: "Chicago", lat: 41.8781, lon: -87.6298, tz: "America/Chicago" }, today: "2026-09-24" });
    if (r.kind !== "computed") throw new Error("expected computed");
    expect(r.warnings).toContain("dayBoundary");
    const alt = r.alternatives.find((a) => a.reason === "dayBoundary")!;
    expect(alt.pillars.day.stem + alt.pillars.day.branch).toBe("丁巳");
  });
});
