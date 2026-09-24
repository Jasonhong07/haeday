// Reading contract (PRD §7): the LLM receives facts + approved snippets only and returns strict JSON.
// It never computes pillars, strength, 用神 or 대운 (CLAUDE.md rule 3); every fact below comes from the engine.
import { z } from "zod";
import {
  DAY_MASTER_SNIPPETS, ELEMENT_SNIPPETS, SNIPPETS_VERSION, TEN_GOD_SNIPPETS, TONE, YEAR_2027_BY_DM, YEAR_2027_GENERAL,
  type Snippet, type TenGodKey,
} from "@/content/snippets";
import type { Chart } from "../engine";
import { tenGod, STEMS } from "../engine/tables";

export const PROMPT_VERSION = "prompt-1";
export const DISCLAIMER = "For entertainment and reflection. Not a prediction or professional advice.";
export const WORDS = { min: 700, max: 1100 } as const;

export const ReadingSchema = z.object({
  summary: z.string().min(1),
  dayMaster: z.string().min(1),
  elements: z.string().min(1),
  love: z.string().min(1),
  workMoney: z.string().min(1),
  year2027: z.string().min(1),
  reflection: z.string().min(1),
  usedSnippetIds: z.array(z.string()),
  disclaimer: z.literal(DISCLAIMER),
}).strict();
export type Reading = z.infer<typeof ReadingSchema>;
export const READING_SECTIONS = ["summary", "dayMaster", "elements", "love", "workMoney", "year2027", "reflection"] as const;

/** JSON schema handed to the model's structured-output / tool interface. */
export const READING_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [...READING_SECTIONS, "usedSnippetIds", "disclaimer"],
  properties: {
    ...Object.fromEntries(READING_SECTIONS.map((k) => [k, { type: "string" }])),
    usedSnippetIds: { type: "array", items: { type: "string" } },
    disclaimer: { type: "string", enum: [DISCLAIMER] },
  },
} as const;

export interface ReadingFacts {
  pillars: Record<"year" | "month" | "day" | "hour", string | null>;
  pillarsEnglish: Record<"year" | "month" | "day" | "hour", string | null>;
  dayMaster: { stem: string; element: string; yinYang: string };
  visibleElements: Chart["visibleElements"];
  denominator: 6 | 8;
  tenGods: Chart["tenGods"];
  timeBasis: Chart["timeBasis"];
  disclosure: string | null;
  year2027: { pillar: "丁未"; startsAt: "立春 2027 (around February 4, 2027)"; stemRelation: TenGodKey; branchRelation: TenGodKey };
}

export function buildFacts(chart: Chart): ReadingFacts {
  const p = chart.pillars;
  const gz = (x: Chart["pillars"]["year"] | null) => (x ? x.stem + x.branch : null);
  const en = (x: Chart["pillars"]["year"] | null) => (x ? `${x.stemEn} ${x.branchEn}` : null);
  const dm = STEMS.indexOf(chart.dayMaster.stem as (typeof STEMS)[number]);
  return {
    pillars: { year: gz(p.year), month: gz(p.month), day: gz(p.day), hour: gz(p.hour) },
    pillarsEnglish: { year: en(p.year), month: en(p.month), day: en(p.day), hour: en(p.hour) },
    dayMaster: chart.dayMaster,
    visibleElements: chart.visibleElements,
    denominator: chart.denominator,
    tenGods: chart.tenGods,
    timeBasis: chart.timeBasis,
    disclosure: chart.disclosure,
    // 丁 = stem index 3; 未's main hidden stem is 己 = index 5 (tables.BRANCH_MAIN_STEM).
    year2027: { pillar: "丁未", startsAt: "立春 2027 (around February 4, 2027)", stemRelation: tenGod(dm, 3), branchRelation: tenGod(dm, 5) },
  };
}

/** Every snippet this chart's reading needs, deterministic from the facts (F7: the full set, before filtering). */
export function requiredSnippets(facts: ReadingFacts): Snippet[] {
  const out: Snippet[] = [TONE, ...(DAY_MASTER_SNIPPETS[facts.dayMaster.stem] ?? [])];
  for (const [el, n] of Object.entries(facts.visibleElements) as Array<[keyof typeof ELEMENT_SNIPPETS, number]>) {
    if (n >= 3) out.push(ELEMENT_SNIPPETS[el].high);
    if (n === 0) out.push(ELEMENT_SNIPPETS[el].low);
  }
  for (const g of new Set(facts.tenGods.map((t) => t.god))) out.push(TEN_GOD_SNIPPETS[g]);
  out.push(YEAR_2027_GENERAL);
  const y = YEAR_2027_BY_DM[facts.dayMaster.stem];
  if (y) out.push(y);
  return out;
}

/**
 * F7 / D37: can this chart's reading be sold? In production every required snippet must be approved by Jason,
 * the day-master set and the day-master 2027 entry must exist, and ids must be unique. Staging may use drafts.
 */
export function contentReady(facts: ReadingFacts, approvedOnly: boolean): boolean {
  const req = requiredSnippets(facts);
  const structural = (DAY_MASTER_SNIPPETS[facts.dayMaster.stem]?.length ?? 0) > 0 && Boolean(YEAR_2027_BY_DM[facts.dayMaster.stem])
    && req.every((s) => s && s.id && s.text) && new Set(req.map((s) => s.id)).size === req.length;
  return structural && (!approvedOnly || req.every((s) => s.approvedBy === "jason"));
}

/** Deterministic snippet choice from the facts. approvedOnly = production. */
export function selectSnippets(facts: ReadingFacts, approvedOnly: boolean): Snippet[] {
  const out = requiredSnippets(facts);
  return approvedOnly ? out.filter((s) => s.approvedBy === "jason") : out;
}

export const SYSTEM_PROMPT = `You write one personal Korean saju (Four Pillars) reading in warm, specific, second-person US English.
Rules:
- Use ONLY the facts and snippets provided. Never compute, add or change pillars, elements, ten gods, strength, 用神, 대운 or monthly luck.
- Paraphrase the snippets in your own words and connect them to this person's facts; list the ids of every snippet you used in usedSnippetIds.
- If timeBasis is "unknown", do not mention the hour pillar or birth hour at all.
- If a disclosure is given, mention it once, plainly, in the summary.
- No predictions or claims about death, illness, health, pregnancy, legal matters, investments or lottery. No fear, curses, urgency, guarantees or upsell.
- Sections: summary, dayMaster, elements, love, workMoney, year2027 (the 丁未 year starting at 立春 2027), reflection (end with one open question).
- Total length of all sections together: ${WORDS.min}–${WORDS.max} words. Plain text only: no markdown, no HTML, no emoji.
- disclaimer must be exactly: "${DISCLAIMER}"`;

export function buildUserMessage(facts: ReadingFacts, snippets: Array<Pick<Snippet, "id" | "text">>): string {
  return JSON.stringify({ facts, snippets: snippets.map((s) => ({ id: s.id, text: s.text })) }, null, 1);
}

export const PROMPT_META = { promptVersion: PROMPT_VERSION, snippetsVersion: SNIPPETS_VERSION };

/**
 * C2 / D46 free preview: the day master's core text, ONLY if Jason approved it. Returns null otherwise (nothing
 * unapproved is ever shown, and nothing from the paid reading is sent to the page).
 */
export function freePreview(stem: string): string | null {
  const core = (DAY_MASTER_SNIPPETS[stem] ?? []).find((s) => s.id.endsWith(".core"));
  return core && core.approvedBy === "jason" ? core.text : null;
}
