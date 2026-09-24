# Sample 03 · exact-丁

Facts given to the model:

```json
{
 "pillars": {
  "year": "丁卯",
  "month": "壬子",
  "day": "丁巳",
  "hour": "丁未"
 },
 "pillarsEnglish": {
  "year": "Yin Fire Rabbit",
  "month": "Yang Water Rat",
  "day": "Yin Fire Snake",
  "hour": "Yin Fire Goat"
 },
 "dayMaster": {
  "stem": "丁",
  "element": "fire",
  "yinYang": "yin"
 },
 "visibleElements": {
  "wood": 1,
  "fire": 4,
  "earth": 1,
  "metal": 0,
  "water": 2
 },
 "denominator": 8,
 "tenGods": [
  {
   "position": "year_stem",
   "god": "companion"
  },
  {
   "position": "year_branch",
   "god": "indirect_resource"
  },
  {
   "position": "month_stem",
   "god": "direct_officer"
  },
  {
   "position": "month_branch",
   "god": "seven_killings"
  },
  {
   "position": "day_branch",
   "god": "rob_wealth"
  },
  {
   "position": "hour_stem",
   "god": "companion"
  },
  {
   "position": "hour_branch",
   "god": "eating_god"
  }
 ],
 "timeBasis": "exact",
 "disclosure": null,
 "year2027": {
  "pillar": "丁未",
  "startsAt": "立春 2027 (around February 4, 2027)",
  "stemRelation": "companion",
  "branchRelation": "eating_god"
 }
}
```

Snippets: tone.v1, dm.ding.core, dm.ding.love, dm.ding.work, dm.ding.shadow, el.fire.high, el.metal.low, tg.companion, tg.indirect_resource, tg.direct_officer, tg.seven_killings, tg.rob_wealth, tg.eating_god, y2027.general, y2027.ding

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
   "day": "丁巳",
   "hour": "丁未"
  },
  "pillarsEnglish": {
   "year": "Yin Fire Rabbit",
   "month": "Yang Water Rat",
   "day": "Yin Fire Snake",
   "hour": "Yin Fire Goat"
  },
  "dayMaster": {
   "stem": "丁",
   "element": "fire",
   "yinYang": "yin"
  },
  "visibleElements": {
   "wood": 1,
   "fire": 4,
   "earth": 1,
   "metal": 0,
   "water": 2
  },
  "denominator": 8,
  "tenGods": [
   {
    "position": "year_stem",
    "god": "companion"
   },
   {
    "position": "year_branch",
    "god": "indirect_resource"
   },
   {
    "position": "month_stem",
    "god": "direct_officer"
   },
   {
    "position": "month_branch",
    "god": "seven_killings"
   },
   {
    "position": "day_branch",
    "god": "rob_wealth"
   },
   {
    "position": "hour_stem",
    "god": "companion"
   },
   {
    "position": "hour_branch",
    "god": "eating_god"
   }
  ],
  "timeBasis": "exact",
  "disclosure": null,
  "year2027": {
   "pillar": "丁未",
   "startsAt": "立春 2027 (around February 4, 2027)",
   "stemRelation": "companion",
   "branchRelation": "eating_god"
  }
 },
 "snippets": [
  {
   "id": "tone.v1",
   "text": "Warm, specific, second person, US English. Curious rather than certain: 'your chart suggests', 'many people with this day master'. Encourage reflection, never fear. No predictions about death, illness, pregnancy, legal or investment outcomes. No curses, urgency or upsell."
  },
  {
   "id": "dm.ding.core",
   "text": "Yin Fire is the candle: focused, perceptive and warm up close. It brings clarity to one person or one idea at a time and often notices feelings others miss."
  },
  {
   "id": "dm.ding.love",
   "text": "In love, Yin Fire is devoted and intimate. It values depth over display and remembers the small things."
  },
  {
   "id": "dm.ding.work",
   "text": "At work, Yin Fire does well in craft, teaching, care and careful thinking, where sustained attention matters more than volume."
  },
  {
   "id": "dm.ding.shadow",
   "text": "The candle's shadow is worry: a small flame is sensitive to every draft and can spend energy guarding itself."
  },
  {
   "id": "el.fire.high",
   "text": "Plenty of Fire suggests warmth, visibility and enthusiasm. The practice is pacing: keep enough fuel for tomorrow."
  },
  {
   "id": "el.metal.low",
   "text": "No visible Metal can mean boundaries and endings are hard to set. Clear lists, simple rules and letting go of what is finished bring structure."
  },
  {
   "id": "tg.companion",
   "text": "Companion (比肩) stands for peers and self-reliance: the part of you that likes to do things your own way, side by side with equals."
  },
  {
   "id": "tg.indirect_resource",
   "text": "Indirect Resource (偏印) stands for unusual insight: intuition, niche knowledge and learning on your own terms."
  },
  {
   "id": "tg.direct_officer",
   "text": "Direct Officer (正官) stands for structure and reputation: respect for rules, duty and doing things properly."
  },
  {
   "id": "tg.seven_killings",
   "text": "Seven Killings (七殺) stands for pressure and courage: challenges that test you and the drive to rise to them."
  },
  {
   "id": "tg.rob_wealth",
   "text": "Rob Wealth (劫財) stands for competition and bold moves: energy that pushes you to keep up, take risks and share resources."
  },
  {
   "id": "tg.eating_god",
   "text": "Eating God (食神) stands for easy creativity and enjoyment: talents that come naturally and the pleasure of making things."
  },
  {
   "id": "y2027.general",
   "text": "2027 is a 丁未 year: Yin Fire (the candle) over the Goat, a summer Earth sign. It is often read as a warm, reflective year that favors craft, care and steady relationships over big leaps. In saju the year begins at 立春, around February 4, 2027."
  },
  {
   "id": "y2027.ding",
   "text": "For Yin Fire, the year mirrors you (Companion) and grounds your gifts (Eating God): a good year to trust your own way of doing things and to make what you enjoy."
  }
 ]
}
```
