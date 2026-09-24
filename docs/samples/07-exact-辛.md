# Sample 07 · exact-辛

Facts given to the model:

```json
{
 "pillars": {
  "year": "丁卯",
  "month": "癸丑",
  "day": "辛酉",
  "hour": "乙未"
 },
 "pillarsEnglish": {
  "year": "Yin Fire Rabbit",
  "month": "Yin Water Ox",
  "day": "Yin Metal Rooster",
  "hour": "Yin Wood Goat"
 },
 "dayMaster": {
  "stem": "辛",
  "element": "metal",
  "yinYang": "yin"
 },
 "visibleElements": {
  "wood": 2,
  "fire": 1,
  "earth": 2,
  "metal": 2,
  "water": 1
 },
 "denominator": 8,
 "tenGods": [
  {
   "position": "year_stem",
   "god": "seven_killings"
  },
  {
   "position": "year_branch",
   "god": "indirect_wealth"
  },
  {
   "position": "month_stem",
   "god": "eating_god"
  },
  {
   "position": "month_branch",
   "god": "indirect_resource"
  },
  {
   "position": "day_branch",
   "god": "companion"
  },
  {
   "position": "hour_stem",
   "god": "indirect_wealth"
  },
  {
   "position": "hour_branch",
   "god": "indirect_resource"
  }
 ],
 "timeBasis": "exact",
 "disclosure": null,
 "year2027": {
  "pillar": "丁未",
  "startsAt": "立春 2027 (around February 4, 2027)",
  "stemRelation": "seven_killings",
  "branchRelation": "indirect_resource"
 }
}
```

Snippets: tone.v1, dm.xin.core, dm.xin.love, dm.xin.work, dm.xin.shadow, tg.seven_killings, tg.indirect_wealth, tg.eating_god, tg.indirect_resource, tg.companion, y2027.general, y2027.xin

(No LLM key: prompt only)

## System

You write one personal Korean saju (Four Pillars) reading in warm, specific, second-person US English.
Rules:
- Use ONLY the facts and snippets provided. Never compute, add or change pillars, elements, ten gods, strength, 用神, 대운 or monthly luck.
- Paraphrase the snippets in your own words and connect them to this person's facts; list the ids of every snippet you used in usedSnippetIds.
- If timeBasis is "unknown", do not mention the hour pillar or birth hour at all.
- If a disclosure is given, mention it once, plainly, in the summary.
- No predictions or claims about death, illness, health, pregnancy, legal matters, investments or lottery. No fear, curses, urgency, guarantees or upsell.
- Sections: summary, dayMaster, elements, love, workMoney, year2027 (the 丁未 year starting at 立春 2027), reflection (end with one open question).
- Total length of all sections together: 700–1100 words. Plain text only: no markdown, no HTML, no emoji.
- disclaimer must be exactly: "For entertainment and reflection. Not a prediction or professional advice."

## User

```json
{
 "facts": {
  "pillars": {
   "year": "丁卯",
   "month": "癸丑",
   "day": "辛酉",
   "hour": "乙未"
  },
  "pillarsEnglish": {
   "year": "Yin Fire Rabbit",
   "month": "Yin Water Ox",
   "day": "Yin Metal Rooster",
   "hour": "Yin Wood Goat"
  },
  "dayMaster": {
   "stem": "辛",
   "element": "metal",
   "yinYang": "yin"
  },
  "visibleElements": {
   "wood": 2,
   "fire": 1,
   "earth": 2,
   "metal": 2,
   "water": 1
  },
  "denominator": 8,
  "tenGods": [
   {
    "position": "year_stem",
    "god": "seven_killings"
   },
   {
    "position": "year_branch",
    "god": "indirect_wealth"
   },
   {
    "position": "month_stem",
    "god": "eating_god"
   },
   {
    "position": "month_branch",
    "god": "indirect_resource"
   },
   {
    "position": "day_branch",
    "god": "companion"
   },
   {
    "position": "hour_stem",
    "god": "indirect_wealth"
   },
   {
    "position": "hour_branch",
    "god": "indirect_resource"
   }
  ],
  "timeBasis": "exact",
  "disclosure": null,
  "year2027": {
   "pillar": "丁未",
   "startsAt": "立春 2027 (around February 4, 2027)",
   "stemRelation": "seven_killings",
   "branchRelation": "indirect_resource"
  }
 },
 "snippets": [
  {
   "id": "tone.v1",
   "text": "Warm, specific, second person, US English. Curious rather than certain: 'your chart suggests', 'many people with this day master'. Encourage reflection, never fear. No predictions about death, illness, pregnancy, legal or investment outcomes. No curses, urgency or upsell."
  },
  {
   "id": "dm.xin.core",
   "text": "Yin Metal is the jewel: refined, sensitive and exacting. It notices quality, fairness and detail, and it tends to hold itself to a high standard."
  },
  {
   "id": "dm.xin.love",
   "text": "In love, Yin Metal values respect and thoughtfulness. It shines when it feels appreciated and chosen."
  },
  {
   "id": "dm.xin.work",
   "text": "At work, Yin Metal excels in design, analysis, finance and anywhere precision and taste are rewarded."
  },
  {
   "id": "dm.xin.shadow",
   "text": "The jewel's shadow is perfectionism and pride: small flaws can feel larger than they are."
  },
  {
   "id": "tg.seven_killings",
   "text": "Seven Killings (七殺) stands for pressure and courage: challenges that test you and the drive to rise to them."
  },
  {
   "id": "tg.indirect_wealth",
   "text": "Indirect Wealth (偏財) stands for opportunity and generosity: money and connections that come through movement, deals and people."
  },
  {
   "id": "tg.eating_god",
   "text": "Eating God (食神) stands for easy creativity and enjoyment: talents that come naturally and the pleasure of making things."
  },
  {
   "id": "tg.indirect_resource",
   "text": "Indirect Resource (偏印) stands for unusual insight: intuition, niche knowledge and learning on your own terms."
  },
  {
   "id": "tg.companion",
   "text": "Companion (比肩) stands for peers and self-reliance: the part of you that likes to do things your own way, side by side with equals."
  },
  {
   "id": "y2027.general",
   "text": "2027 is a 丁未 year: Yin Fire (the candle) over the Goat, a summer Earth sign. It is often read as a warm, reflective year that favors craft, care and steady relationships over big leaps. In saju the year begins at 立春, around February 4, 2027."
  },
  {
   "id": "y2027.xin",
   "text": "For Yin Metal, the year's Fire is pressure that polishes (Seven Killings) and its Earth is insight (Indirect Resource): challenges arrive with the tools to meet them; pace yourself."
  }
 ]
}
```
