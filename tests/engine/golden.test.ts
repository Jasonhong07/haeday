// Engine vs independent Python oracle (fixtures/golden.json). Never edit expected values to pass (CLAUDE.md rule 1).
import { describe, expect, it } from "vitest";
import golden from "../../fixtures/golden.json";
import { computeChart, type ChartInput, type Pillars } from "../../src/server/engine";

type Exp = Record<string, unknown> & { kind: string };
interface Case { id: string; input: ChartInput & { place: ChartInput["place"] }; expected: Exp }
const cases = (golden as unknown as { cases: Case[]; eotToleranceSeconds: number }).cases;
const TOL_MIN = (golden as { eotToleranceSeconds: number }).eotToleranceSeconds / 60;
const gz = (p: Pillars) => ({ year: p.year.stem + p.year.branch, month: p.month.stem + p.month.branch, day: p.day.stem + p.day.branch, hour: p.hour ? p.hour.stem + p.hour.branch : null });
const naive = (s: string) => Date.parse(s + "Z");

describe("engine matches the oracle on every fixture", () => {
  it("has at least 30 fixtures", () => expect(cases.length).toBeGreaterThanOrEqual(30));

  for (const c of cases) {
    it(`${c.id}`, () => {
      const res = computeChart({ ...c.input, today: "2026-09-24" });
      const e = c.expected;
      expect(res.kind).toBe(e.kind === "unknown" ? "computed" : e.kind);
      if (e.kind === "needs_fold_choice" && res.kind === "needs_fold_choice") expect(res.utcCandidates).toEqual(e.utcCandidates);
      if (e.kind === "invalid_input" && res.kind === "invalid_input") expect(res.reason).toBe(e.reason);
      if (e.kind === "computed" && res.kind === "computed") {
        const a = res.chart.audit;
        expect(a.utc).toBe(e.utc);
        expect(a.stdOffsetMinutes).toBe(e.stdOffsetMinutes);
        expect(Math.abs(a.lonCorrectionMin! - (e.lonCorrectionMin as number))).toBeLessThan(0.01);
        expect(Math.abs(a.eotMin! - (e.eotMin as number))).toBeLessThanOrEqual(TOL_MIN);
        expect(Math.abs(naive(a.trueSolar!) - naive(e.trueSolar as string)) / 60_000).toBeLessThanOrEqual(TOL_MIN + 1 / 60);
        expect(a.jieBefore).toBe(e.jieBefore);
        expect(a.jieAfter).toBe(e.jieAfter);
        expect(gz(res.chart.pillars)).toEqual(e.pillars);
        expect([...res.warnings].sort()).toEqual([...(e.warnings as string[])].sort());
      }
      if (e.kind === "unknown" && res.kind === "computed") {
        const groups = e.groups as Array<{ from: string; to: string; minutes: number; pillars: Record<string, string> }>;
        if (groups.length === 1) {
          expect(res.questions).toEqual([]);
          const { hour: _h, ...p } = gz(res.chart.pillars);
          expect(p).toEqual(groups[0]!.pillars);
        } else {
          const windows = res.questions[0]!.windows;
          expect(windows.map((w) => [w.from, w.to, w.minutes])).toEqual(groups.map((g) => [g.from, g.to, g.minutes]));
          const d = res.questions[0]!.defaultIndex;
          const { hour: _h, ...p } = gz(res.chart.pillars);
          expect(p).toEqual(groups[d]!.pillars);
          expect(res.chart.disclosure).toMatch(/^If you were born between/);
          for (const alt of res.alternatives) {
            const g = groups.find((x) => x.from === alt.window!.from)!;
            const { hour: _hh, ...ap } = gz(alt.pillars);
            expect(ap).toEqual(g.pillars);
          }
        }
        expect(res.chart.pillars.hour).toBeNull();
        expect(res.chart.denominator).toBe(6);
      }
    });
  }
});
