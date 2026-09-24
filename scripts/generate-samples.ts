// M5: generate 15 sample readings for Jason's quality review (PRD §7 quality gate).
// Usage: LLM_API_KEY=... LLM_MODEL=... pnpm samples   → docs/samples/NN-*.md (facts above each reading + check result)
// Without a key it writes the exact prompts instead, so the inputs can be reviewed first.
import { mkdirSync, writeFileSync } from "node:fs";
import { AnthropicLlm } from "../src/server/adapters/llm";
import { computeChart, type Chart } from "../src/server/engine";
import { checkReading } from "../src/server/fulfillment/checks";
import { READING_JSON_SCHEMA, SYSTEM_PROMPT, buildFacts, buildUserMessage, selectSnippets } from "../src/server/fulfillment/prompt";
import { resolvePlace, searchPlaces } from "../src/server/places";

const place = (q: string) => resolvePlace(searchPlaces(q)[0]!.placeId)!;
const seoul = place("seoul"), nyc = place("new york"), la = place("los angeles");

function chartFor(date: string, time: { kind: "exact"; hhmm: string } | { kind: "unknown" }, p = seoul): Chart | null {
  const r = computeChart({ birthDate: date, time, place: p, today: "2026-09-24" });
  return r.kind === "computed" ? r.chart : null;
}

const cases: Array<{ label: string; chart: Chart }> = [];
const seen = new Set<string>();
for (let d = Date.UTC(1988, 0, 1); seen.size < 10; d += 86_400_000) { // one exact-time chart per day master
  const date = new Date(d).toISOString().slice(0, 10);
  const c = chartFor(date, { kind: "exact", hhmm: "14:30" }, cases.length % 2 ? la : seoul);
  if (c && !seen.has(c.dayMaster.stem)) { seen.add(c.dayMaster.stem); cases.push({ label: `exact-${c.dayMaster.stem}`, chart: c }); }
}
for (const date of ["1992-06-10", "1979-11-20"]) cases.push({ label: `unknown-${date}`, chart: chartFor(date, { kind: "unknown" }, seoul)! });
for (const date of ["1990-11-03", "2001-03-15", "1995-08-08"]) { // NYC unknown time: day-split disclosure
  const c = chartFor(date, { kind: "unknown" }, nyc)!;
  cases.push({ label: `disclosure-${date}`, chart: c });
}

async function main() {
  mkdirSync("docs/samples", { recursive: true });
  const key = process.env.LLM_API_KEY, model = process.env.LLM_MODEL;
  const llm = key && model ? new AnthropicLlm(key, model) : null;
  let passed = 0;
  for (const [i, c] of cases.entries()) {
    const facts = buildFacts(c.chart);
    const snippets = selectSnippets(facts, false);
    const header = `# Sample ${String(i + 1).padStart(2, "0")} · ${c.label}\n\nFacts given to the model:\n\n\`\`\`json\n${JSON.stringify(facts, null, 1)}\n\`\`\`\n\nSnippets: ${snippets.map((s) => s.id).join(", ")}\n\n`;
    let body: string;
    if (!llm) {
      body = `(No LLM key: prompt only)\n\n## System\n\n${SYSTEM_PROMPT}\n\n## User\n\n\`\`\`json\n${buildUserMessage(facts, snippets)}\n\`\`\`\n`;
    } else {
      const res = await llm.generate({ system: SYSTEM_PROMPT, user: buildUserMessage(facts, snippets), jsonSchema: READING_JSON_SCHEMA, maxTokens: 3000, timeoutMs: 90_000 });
      const check = checkReading(res.json, snippets.map((s) => s.id), facts);
      if (check.ok) passed++;
      const r = res.json as Record<string, string | string[]>;
      body = `Model: ${res.modelId} · tokens in/out ${res.inputTokens}/${res.outputTokens} · gate: ${check.ok ? `PASS (${check.wordCount} words)` : `FAIL (${check.failure})`}\n\n`
        + ["summary", "dayMaster", "elements", "love", "workMoney", "year2027", "reflection"].map((k) => `## ${k}\n\n${r[k] ?? ""}`).join("\n\n")
        + `\n\nusedSnippetIds: ${JSON.stringify(r.usedSnippetIds)}\n\n## Jason's score (1–5 each)\n- Grounding: \n- Personal: \n- English: \n- No contradiction: \n- No forbidden claims (yes/no): \n`;
    }
    writeFileSync(`docs/samples/${String(i + 1).padStart(2, "0")}-${c.label}.md`, header + body);
  }
  console.log(llm ? `wrote ${cases.length} samples, gate passed ${passed}/${cases.length}` : `wrote ${cases.length} prompt files (set LLM_API_KEY and LLM_MODEL to generate readings)`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : "failed"); process.exit(1); });
