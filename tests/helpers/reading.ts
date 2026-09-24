import { DISCLAIMER, type ReadingFacts } from "../../src/server/fulfillment/prompt";

/** A reading that passes every content check, built only from the facts and snippet ids given. */
export function validReading(facts: ReadingFacts, snippetIds: string[]) {
  const para = (topic: string) => Array.from({ length: 6 }, (_, i) =>
    `Your chart suggests a steady way of meeting ${topic}, and sentence ${i + 1} invites you to notice what already feels natural and kind in your days.`).join(" ");
  return {
    summary: `Your day pillar is ${facts.pillars.day}. ${para("the world")}`, dayMaster: para("yourself"), elements: para("balance"),
    love: para("love"), workMoney: para("work"), year2027: `The 丁未 year begins at 立春. ${para("the coming year")}`,
    reflection: `${para("change")} What would you like to grow this year?`, usedSnippetIds: snippetIds.slice(0, 3), disclaimer: DISCLAIMER,
  };
}

