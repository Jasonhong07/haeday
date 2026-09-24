// Engine vs lunar_python (6tail), a third-party 八字 library with its own solar-term algorithm
// (fixtures/lunar_sample.json from tools/oracle/crosscheck_lunar.py). See that script for how the comparison is set up.
import { describe, expect, it } from "vitest";
import sample from "../../fixtures/lunar_sample.json";
import { computeChart, type ChartInput, type Pillars } from "../../src/server/engine";

interface Case { input: ChartInput; lunar: { year: string; month: string; day: string; hour: string } }
const cases = (sample as unknown as { cases: Case[] }).cases;
const gz = (p: Pillars) => ({ year: p.year.stem + p.year.branch, month: p.month.stem + p.month.branch, day: p.day.stem + p.day.branch, hour: p.hour!.stem + p.hour!.branch });

describe("engine agrees with lunar_python on random births 1901–2025", () => {
  it("has thousands of samples, including 23:xx births", () => {
    expect(cases.length).toBeGreaterThanOrEqual(3000);
    expect(cases.some((c) => "hhmm" in c.input.time && c.input.time.hhmm.startsWith("23"))).toBe(true);
  });

  it("matches all four pillars on every sample", () => {
    const mismatches: string[] = [];
    for (const c of cases) {
      const res = computeChart({ ...c.input, today: "2026-09-24" });
      if (res.kind !== "computed") { mismatches.push(`${JSON.stringify(c.input)} → ${res.kind}`); continue; }
      const got = gz(res.chart.pillars);
      if (JSON.stringify(got) !== JSON.stringify(c.lunar)) mismatches.push(`${c.input.birthDate} ${JSON.stringify(c.input.time)} ${c.input.place.label}: ours ${JSON.stringify(got)} lunar ${JSON.stringify(c.lunar)}`);
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
  });
});
