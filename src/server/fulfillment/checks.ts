// Output gate for LLM readings (PRD §7): schema, length, grounding, forbidden claims. Fail = retry, never publish.
import { READING_SECTIONS, ReadingSchema, WORDS, type Reading, type ReadingFacts } from "./prompt";

export type CheckFailure =
  | "schema" | "too_short" | "too_long" | "unknown_snippet" | "no_snippets" | "forbidden_claim" | "hour_mentioned" | "markup" | "wrong_pillar";

/** Phrases that must never appear (predictions about health, death, money outcomes, fear or pressure). */
const FORBIDDEN: RegExp[] = [
  /\b(die|dies|died|death|deadly|fatal|terminal)\b/i,
  /\b(illness|disease|cancer|diagnos\w*|surgery|sick(ness)?)\b/i,
  /\b(pregnan\w*|miscarriage|infertil\w*)\b/i,
  /\b(lawsuit|court case|arrest\w*|prison|jail)\b/i,
  /\b(investments?|stock market|stocks|crypto\w*|bitcoin|lottery|gambl\w*)\b/i,
  /\b(curse[ds]?|doomed|misfortune will|bad luck will|disaster)\b/i,
  /\b(guarantee[ds]?|will definitely|act now|limited time|upgrade|subscribe)\b|100%/i,
];

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function checkReading(raw: unknown, providedIds: string[], facts: ReadingFacts):
  { ok: true; reading: Reading; wordCount: number } | { ok: false; failure: CheckFailure } {
  const parsed = ReadingSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, failure: "schema" };
  const r = parsed.data;
  const body = READING_SECTIONS.map((k) => r[k]).join("\n");
  const n = words(body);
  if (n < WORDS.min) return { ok: false, failure: "too_short" };
  if (n > WORDS.max) return { ok: false, failure: "too_long" };
  if (r.usedSnippetIds.length === 0) return { ok: false, failure: "no_snippets" };
  const allowed = new Set(providedIds);
  if (r.usedSnippetIds.some((id) => !allowed.has(id))) return { ok: false, failure: "unknown_snippet" };
  if (FORBIDDEN.some((re) => re.test(body))) return { ok: false, failure: "forbidden_claim" };
  if (/<[a-z/][^>]*>|\*\*|^#+\s/im.test(body)) return { ok: false, failure: "markup" };
  if (facts.timeBasis === "unknown" && /\bhour (pillar|of (your )?birth)\b|\bbirth hour\b/i.test(body)) return { ok: false, failure: "hour_mentioned" };
  // Any sexagenary pair quoted in the text must be one of this chart's pillars or the 2027 pillar.
  const known = new Set([...Object.values(facts.pillars).filter(Boolean) as string[], "丁未"]);
  const quoted = body.match(/[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/g) ?? [];
  if (quoted.some((q) => !known.has(q))) return { ok: false, failure: "wrong_pillar" };
  return { ok: true, reading: r, wordCount: n };
}
