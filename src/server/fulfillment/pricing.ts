// F14: model prices for cost accounting, versioned. Source: Anthropic "Models and pricing"
// (https://platform.claude.com/docs/en/about-claude/pricing and /docs/en/models/overview), read 2026-09-24.
// A model that is not listed here is costed as UNKNOWN (null), never guessed. Past attempts keep the price
// version they were costed with, so a later price change never rewrites history.
export interface ModelPrice {
  version: string;
  modelIds: string[];           // exact API ids (and dated aliases) this price applies to
  inputPerMTok: number;         // USD
  outputPerMTok: number;
  cacheWrite5mPerMTok: number;
  cacheReadPerMTok: number;
  effectiveFrom: string;        // date the price was read
  source: string;
}

export const MODEL_PRICES: ModelPrice[] = [
  { version: "anthropic-2026-09-24:sonnet-5", modelIds: ["claude-sonnet-5"], inputPerMTok: 2, outputPerMTok: 10, cacheWrite5mPerMTok: 2.5, cacheReadPerMTok: 0.2, effectiveFrom: "2026-09-24", source: "https://platform.claude.com/docs/en/about-claude/pricing" },
  { version: "anthropic-2026-09-24:haiku-4-5", modelIds: ["claude-haiku-4-5-20251001", "claude-haiku-4-5"], inputPerMTok: 1, outputPerMTok: 5, cacheWrite5mPerMTok: 1.25, cacheReadPerMTok: 0.1, effectiveFrom: "2026-09-24", source: "https://platform.claude.com/docs/en/about-claude/pricing" },
  { version: "anthropic-2026-09-24:opus-5-5", modelIds: ["claude-opus-5-5"], inputPerMTok: 4, outputPerMTok: 20, cacheWrite5mPerMTok: 5, cacheReadPerMTok: 0.2, effectiveFrom: "2026-09-24", source: "https://platform.claude.com/docs/en/about-claude/pricing" },
];

export interface Usage { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }

/** Cost in micro-USD (1e-6 $), rounded up; null when the model has no known price. */
export function costMicroUsd(modelId: string, u: Usage): { micro: number; version: string } | null {
  const p = MODEL_PRICES.find((x) => x.modelIds.includes(modelId));
  if (!p) return null;
  // $/MTok × tokens = micro-USD × 1 (1 $/MTok = 1 µ$/token).
  const micro = u.inputTokens * p.inputPerMTok + u.outputTokens * p.outputPerMTok + u.cacheWriteTokens * p.cacheWrite5mPerMTok + u.cacheReadTokens * p.cacheReadPerMTok;
  return { micro: Math.ceil(micro), version: p.version };
}
