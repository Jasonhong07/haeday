// L6: dev-only LLM stand-in. Writes a reading that passes every content check from the facts and snippet ids it
// is given (so the end-to-end flow exercises the real checks and storage). Never constructed outside devFakes().
import type { LlmAdapter, LlmRequest, LlmResult } from "./llm";
import { DISCLAIMER, type ReadingFacts } from "../fulfillment/prompt";

export class DevLlm implements LlmAdapter {
  readonly modelId = "dev-fake";
  async generate(req: LlmRequest): Promise<LlmResult> {
    const { facts, snippets } = JSON.parse(req.user) as { facts: ReadingFacts; snippets: Array<{ id: string }> };
    const para = (topic: string) => Array.from({ length: 6 }, (_, i) =>
      `Your chart suggests a steady way of meeting ${topic}, and sentence ${i + 1} invites you to notice what already feels natural and kind in your days.`).join(" ");
    const json = {
      summary: `Your day pillar is ${facts.pillars.day}. ${para("the world")}`, dayMaster: para("yourself"), elements: para("balance"),
      love: para("love"), workMoney: para("work"), year2027: `The 丁未 year begins at 立春. ${para("the coming year")}`,
      reflection: `${para("change")} What would you like to grow this year?`, usedSnippetIds: snippets.slice(0, 3).map((s) => s.id), disclaimer: DISCLAIMER,
    };
    return { json, modelId: this.modelId, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  }
}
