// Reading contract (PRD §7): facts, snippet choice, prompt privacy and the output gate.
import { describe, expect, it } from "vitest";
import { computeChart, type Chart } from "../src/server/engine";
import { checkReading } from "../src/server/fulfillment/checks";
import { DISCLAIMER, SYSTEM_PROMPT, buildFacts, buildUserMessage, selectSnippets } from "../src/server/fulfillment/prompt";
import { resolvePlace, searchPlaces } from "../src/server/places";
import { validReading } from "./helpers/reading";

const place = resolvePlace(searchPlaces("seoul")[0]!.placeId)!;
function chart(time: { kind: "exact"; hhmm: string } | { kind: "unknown" }): Chart {
  const r = computeChart({ birthDate: "1990-05-12", time, place, today: "2026-09-24" });
  if (r.kind !== "computed") throw new Error("expected computed");
  return r.chart;
}

describe("facts and snippets", () => {
  it("facts come from the engine, including the 2027 ten-god relations", () => {
    const f = buildFacts(chart({ kind: "exact", hhmm: "09:30" }));
    expect(f.pillars).toEqual({ year: "庚午", month: "辛巳", day: "丁丑", hour: "甲辰" });
    expect(f.dayMaster.stem).toBe("丁");
    expect(f.year2027).toMatchObject({ pillar: "丁未", stemRelation: "companion", branchRelation: "eating_god" });
  });
  it("picks the day master, extreme elements, present ten gods, 2027 and tone; production filters to approved", () => {
    const f = buildFacts(chart({ kind: "exact", hhmm: "09:30" }));
    const ids = selectSnippets(f, false).map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["tone.v1", "dm.ding.core", "el.fire.high", "el.water.low", "y2027.general", "y2027.ding"]));
    expect(ids.some((id) => id.startsWith("tg."))).toBe(true);
    expect(selectSnippets(f, true)).toEqual([]); // nothing approved yet → production refuses to generate
  });
  it("the prompt carries no birth date, place or time", () => {
    const f = buildFacts(chart({ kind: "exact", hhmm: "09:30" }));
    const msg = buildUserMessage(f, selectSnippets(f, false));
    expect(msg).not.toMatch(/1990|05-12|Seoul|09:30/);
    expect(SYSTEM_PROMPT).toContain(DISCLAIMER);
  });
});

describe("output gate", () => {
  const f = buildFacts(chart({ kind: "exact", hhmm: "09:30" }));
  const ids = selectSnippets(f, false).map((s) => s.id);
  const good = () => validReading(f, ids);

  it("accepts a grounded reading", () => { expect(checkReading(good(), ids, f).ok).toBe(true); });
  it.each([
    ["schema", () => ({ ...good(), extra: 1 })],
    ["too_short", () => ({ ...good(), dayMaster: "x", elements: "x", love: "x", workMoney: "x", year2027: "x", reflection: "x", summary: "x" })],
    ["unknown_snippet", () => ({ ...good(), usedSnippetIds: ["made.up"] })],
    ["no_snippets", () => ({ ...good(), usedSnippetIds: [] })],
    ["forbidden_claim", () => ({ ...good(), love: good().love + " You will get pregnant soon." })],
    ["forbidden_claim", () => ({ ...good(), workMoney: good().workMoney + " Put your savings into crypto." })],
    ["markup", () => ({ ...good(), summary: "**Bold** " + good().summary })],
    ["wrong_pillar", () => ({ ...good(), summary: good().summary + " Your year pillar is 甲子." })],
  ])("rejects %s", (failure, make) => {
    expect(checkReading(make(), ids, f)).toEqual({ ok: false, failure });
  });
  it("rejects hour talk when the birth time is unknown", () => {
    const fu = buildFacts(chart({ kind: "unknown" }));
    const idsU = selectSnippets(fu, false).map((s) => s.id);
    const r = validReading(fu, idsU);
    expect(checkReading({ ...r, summary: r.summary + " Your hour pillar adds depth." }, idsU, fu)).toEqual({ ok: false, failure: "hour_mentioned" });
  });
  it("does not flag everyday words like 'invest in yourself'", () => {
    const r = good();
    expect(checkReading({ ...r, workMoney: r.workMoney + " Invest in yourself and your craft." }, ids, f).ok).toBe(true);
  });
});
