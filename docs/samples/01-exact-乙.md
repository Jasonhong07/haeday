# Sample 01 · exact-乙

Facts given to the model:

```json
{
 "pillars": {
  "year": "丁卯",
  "month": "壬子",
  "day": "乙卯",
  "hour": "癸未"
 },
 "pillarsEnglish": {
  "year": "Yin Fire Rabbit",
  "month": "Yang Water Rat",
  "day": "Yin Wood Rabbit",
  "hour": "Yin Water Goat"
 },
 "dayMaster": {
  "stem": "乙",
  "element": "wood",
  "yinYang": "yin"
 },
 "visibleElements": {
  "wood": 3,
  "fire": 1,
  "earth": 1,
  "metal": 0,
  "water": 3
 },
 "denominator": 8,
 "tenGods": [
  {
   "position": "year_stem",
   "god": "eating_god"
  },
  {
   "position": "year_branch",
   "god": "companion"
  },
  {
   "position": "month_stem",
   "god": "direct_resource"
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
   "god": "indirect_resource"
  },
  {
   "position": "hour_branch",
   "god": "indirect_wealth"
  }
 ],
 "timeBasis": "exact",
 "disclosure": null,
 "year2027": {
  "pillar": "丁未",
  "startsAt": "立春 2027 (around February 4, 2027)",
  "stemRelation": "eating_god",
  "branchRelation": "indirect_wealth"
 }
}
```

Snippets: tone.v1, dm.yi.core, dm.yi.love, dm.yi.work, dm.yi.shadow, el.wood.high, el.metal.low, el.water.high, tg.eating_god, tg.companion, tg.direct_resource, tg.indirect_resource, tg.indirect_wealth, y2027.general, y2027.yi

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
   "month": "壬子",
   "day": "乙卯",
   "hour": "癸未"
  },
  "pillarsEnglish": {
   "year": "Yin Fire Rabbit",
   "month": "Yang Water Rat",
   "day": "Yin Wood Rabbit",
   "hour": "Yin Water Goat"
  },
  "dayMaster": {
   "stem": "乙",
   "element": "wood",
   "yinYang": "yin"
  },
  "visibleElements": {
   "wood": 3,
   "fire": 1,
   "earth": 1,
   "metal": 0,
   "water": 3
  },
  "denominator": 8,
  "tenGods": [
   {
    "position": "year_stem",
    "god": "eating_god"
   },
   {
    "position": "year_branch",
    "god": "companion"
   },
   {
    "position": "month_stem",
    "god": "direct_resource"
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
    "god": "indirect_resource"
   },
   {
    "position": "hour_branch",
    "god": "indirect_wealth"
   }
  ],
  "timeBasis": "exact",
  "disclosure": null,
  "year2027": {
   "pillar": "丁未",
   "startsAt": "立春 2027 (around February 4, 2027)",
   "stemRelation": "eating_god",
   "branchRelation": "indirect_wealth"
  }
 },
 "snippets": [
  {
   "id": "tone.v1",
   "text": "Warm, specific, second person, US English. Curious rather than certain: 'your chart suggests', 'many people with this day master'. Encourage reflection, never fear. No predictions about death, illness, pregnancy, legal or investment outcomes. No curses, urgency or upsell."
  },
  {
   "id": "dm.yi.core",
   "text": "Yin Wood is the climbing vine: flexible, social and quietly persistent. It finds the gap in the fence and grows through it, turning people and circumstances into supports."
  },
  {
   "id": "dm.yi.love",
   "text": "In love, Yin Wood is attentive and adaptable, reading what a partner needs. It thrives when that care is returned rather than assumed."
  },
  {
   "id": "dm.yi.work",
   "text": "At work, Yin Wood shines in networks, collaboration and diplomacy, often achieving more through relationships than through force."
  },
  {
   "id": "dm.yi.shadow",
   "text": "The vine's shadow is over-adapting: taking the shape of whatever it leans on until its own direction becomes unclear."
  },
  {
   "id": "el.wood.high",
   "text": "Plenty of Wood in a chart suggests growth energy: plans, ideals and a wish to keep expanding. The practice is to finish what has already sprouted before planting more."
  },
  {
   "id": "el.metal.low",
   "text": "No visible Metal can mean boundaries and endings are hard to set. Clear lists, simple rules and letting go of what is finished bring structure."
  },
  {
   "id": "el.water.high",
   "text": "Plenty of Water suggests depth, intuition and adaptability. The practice is direction: a river needs banks."
  },
  {
   "id": "tg.eating_god",
   "text": "Eating God (食神) stands for easy creativity and enjoyment: talents that come naturally and the pleasure of making things."
  },
  {
   "id": "tg.companion",
   "text": "Companion (比肩) stands for peers and self-reliance: the part of you that likes to do things your own way, side by side with equals."
  },
  {
   "id": "tg.direct_resource",
   "text": "Direct Resource (正印) stands for support and learning: mentors, study and the care you receive and pass on."
  },
  {
   "id": "tg.indirect_resource",
   "text": "Indirect Resource (偏印) stands for unusual insight: intuition, niche knowledge and learning on your own terms."
  },
  {
   "id": "tg.indirect_wealth",
   "text": "Indirect Wealth (偏財) stands for opportunity and generosity: money and connections that come through movement, deals and people."
  },
  {
   "id": "y2027.general",
   "text": "2027 is a 丁未 year: Yin Fire (the candle) over the Goat, a summer Earth sign. It is often read as a warm, reflective year that favors craft, care and steady relationships over big leaps. In saju the year begins at 立春, around February 4, 2027."
  },
  {
   "id": "y2027.yi",
   "text": "For Yin Wood, the year's Fire is easy expression (Eating God) and its Earth is opportunity (Indirect Wealth): a year that rewards sharing your skills and saying yes to the right invitations."
  }
 ]
}
```
