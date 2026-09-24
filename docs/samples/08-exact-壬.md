# Sample 08 · exact-壬

Facts given to the model:

```json
{
 "pillars": {
  "year": "丁卯",
  "month": "癸丑",
  "day": "壬戌",
  "hour": "丁未"
 },
 "pillarsEnglish": {
  "year": "Yin Fire Rabbit",
  "month": "Yin Water Ox",
  "day": "Yang Water Dog",
  "hour": "Yin Fire Goat"
 },
 "dayMaster": {
  "stem": "壬",
  "element": "water",
  "yinYang": "yang"
 },
 "visibleElements": {
  "wood": 1,
  "fire": 2,
  "earth": 3,
  "metal": 0,
  "water": 2
 },
 "denominator": 8,
 "tenGods": [
  {
   "position": "year_stem",
   "god": "direct_wealth"
  },
  {
   "position": "year_branch",
   "god": "hurting_officer"
  },
  {
   "position": "month_stem",
   "god": "rob_wealth"
  },
  {
   "position": "month_branch",
   "god": "direct_officer"
  },
  {
   "position": "day_branch",
   "god": "seven_killings"
  },
  {
   "position": "hour_stem",
   "god": "direct_wealth"
  },
  {
   "position": "hour_branch",
   "god": "direct_officer"
  }
 ],
 "timeBasis": "exact",
 "disclosure": null,
 "year2027": {
  "pillar": "丁未",
  "startsAt": "立春 2027 (around February 4, 2027)",
  "stemRelation": "direct_wealth",
  "branchRelation": "direct_officer"
 }
}
```

Snippets: tone.v1, dm.ren.core, dm.ren.love, dm.ren.work, dm.ren.shadow, el.earth.high, el.metal.low, tg.direct_wealth, tg.hurting_officer, tg.rob_wealth, tg.direct_officer, tg.seven_killings, y2027.general, y2027.ren

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
   "day": "壬戌",
   "hour": "丁未"
  },
  "pillarsEnglish": {
   "year": "Yin Fire Rabbit",
   "month": "Yin Water Ox",
   "day": "Yang Water Dog",
   "hour": "Yin Fire Goat"
  },
  "dayMaster": {
   "stem": "壬",
   "element": "water",
   "yinYang": "yang"
  },
  "visibleElements": {
   "wood": 1,
   "fire": 2,
   "earth": 3,
   "metal": 0,
   "water": 2
  },
  "denominator": 8,
  "tenGods": [
   {
    "position": "year_stem",
    "god": "direct_wealth"
   },
   {
    "position": "year_branch",
    "god": "hurting_officer"
   },
   {
    "position": "month_stem",
    "god": "rob_wealth"
   },
   {
    "position": "month_branch",
    "god": "direct_officer"
   },
   {
    "position": "day_branch",
    "god": "seven_killings"
   },
   {
    "position": "hour_stem",
    "god": "direct_wealth"
   },
   {
    "position": "hour_branch",
    "god": "direct_officer"
   }
  ],
  "timeBasis": "exact",
  "disclosure": null,
  "year2027": {
   "pillar": "丁未",
   "startsAt": "立春 2027 (around February 4, 2027)",
   "stemRelation": "direct_wealth",
   "branchRelation": "direct_officer"
  }
 },
 "snippets": [
  {
   "id": "tone.v1",
   "text": "Warm, specific, second person, US English. Curious rather than certain: 'your chart suggests', 'many people with this day master'. Encourage reflection, never fear. No predictions about death, illness, pregnancy, legal or investment outcomes. No curses, urgency or upsell."
  },
  {
   "id": "dm.ren.core",
   "text": "Yang Water is the ocean: curious, expansive and far-seeing. It moves with big currents, connects distant ideas and gets restless when life is too small."
  },
  {
   "id": "dm.ren.love",
   "text": "In love, Yang Water is adventurous and generous with ideas. It needs freedom and a partner who enjoys the journey."
  },
  {
   "id": "dm.ren.work",
   "text": "At work, Yang Water thrives in strategy, travel, trade, research and anything that rewards seeing the bigger picture."
  },
  {
   "id": "dm.ren.shadow",
   "text": "The ocean's shadow is scattering: so many currents at once that none of them reaches shore."
  },
  {
   "id": "el.earth.high",
   "text": "Plenty of Earth suggests steadiness, patience and a strong sense of responsibility. The practice is flexibility: stable does not have to mean stuck."
  },
  {
   "id": "el.metal.low",
   "text": "No visible Metal can mean boundaries and endings are hard to set. Clear lists, simple rules and letting go of what is finished bring structure."
  },
  {
   "id": "tg.direct_wealth",
   "text": "Direct Wealth (正財) stands for steady effort and care with resources: income earned patiently and managed well."
  },
  {
   "id": "tg.hurting_officer",
   "text": "Hurting Officer (傷官) stands for sharp expression and originality: the urge to question rules and say what others will not."
  },
  {
   "id": "tg.rob_wealth",
   "text": "Rob Wealth (劫財) stands for competition and bold moves: energy that pushes you to keep up, take risks and share resources."
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
   "id": "y2027.general",
   "text": "2027 is a 丁未 year: Yin Fire (the candle) over the Goat, a summer Earth sign. It is often read as a warm, reflective year that favors craft, care and steady relationships over big leaps. In saju the year begins at 立春, around February 4, 2027."
  },
  {
   "id": "y2027.ren",
   "text": "For Yang Water, the year's Fire is steady wealth (Direct Wealth) and its Earth is structure (Direct Officer): a year for consistent work and commitments that build a reputation."
  }
 ]
}
```
