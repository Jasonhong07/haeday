# Sample 02 · exact-丙

Facts given to the model:

```json
{
 "pillars": {
  "year": "丁卯",
  "month": "壬子",
  "day": "丙辰",
  "hour": "乙未"
 },
 "pillarsEnglish": {
  "year": "Yin Fire Rabbit",
  "month": "Yang Water Rat",
  "day": "Yang Fire Dragon",
  "hour": "Yin Wood Goat"
 },
 "dayMaster": {
  "stem": "丙",
  "element": "fire",
  "yinYang": "yang"
 },
 "visibleElements": {
  "wood": 2,
  "fire": 2,
  "earth": 2,
  "metal": 0,
  "water": 2
 },
 "denominator": 8,
 "tenGods": [
  {
   "position": "year_stem",
   "god": "rob_wealth"
  },
  {
   "position": "year_branch",
   "god": "direct_resource"
  },
  {
   "position": "month_stem",
   "god": "seven_killings"
  },
  {
   "position": "month_branch",
   "god": "direct_officer"
  },
  {
   "position": "day_branch",
   "god": "eating_god"
  },
  {
   "position": "hour_stem",
   "god": "direct_resource"
  },
  {
   "position": "hour_branch",
   "god": "hurting_officer"
  }
 ],
 "timeBasis": "exact",
 "disclosure": null,
 "year2027": {
  "pillar": "丁未",
  "startsAt": "立春 2027 (around February 4, 2027)",
  "stemRelation": "rob_wealth",
  "branchRelation": "hurting_officer"
 }
}
```

Snippets: tone.v1, dm.bing.core, dm.bing.love, dm.bing.work, dm.bing.shadow, el.metal.low, tg.rob_wealth, tg.direct_resource, tg.seven_killings, tg.direct_officer, tg.eating_god, tg.hurting_officer, y2027.general, y2027.bing

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
   "day": "丙辰",
   "hour": "乙未"
  },
  "pillarsEnglish": {
   "year": "Yin Fire Rabbit",
   "month": "Yang Water Rat",
   "day": "Yang Fire Dragon",
   "hour": "Yin Wood Goat"
  },
  "dayMaster": {
   "stem": "丙",
   "element": "fire",
   "yinYang": "yang"
  },
  "visibleElements": {
   "wood": 2,
   "fire": 2,
   "earth": 2,
   "metal": 0,
   "water": 2
  },
  "denominator": 8,
  "tenGods": [
   {
    "position": "year_stem",
    "god": "rob_wealth"
   },
   {
    "position": "year_branch",
    "god": "direct_resource"
   },
   {
    "position": "month_stem",
    "god": "seven_killings"
   },
   {
    "position": "month_branch",
    "god": "direct_officer"
   },
   {
    "position": "day_branch",
    "god": "eating_god"
   },
   {
    "position": "hour_stem",
    "god": "direct_resource"
   },
   {
    "position": "hour_branch",
    "god": "hurting_officer"
   }
  ],
  "timeBasis": "exact",
  "disclosure": null,
  "year2027": {
   "pillar": "丁未",
   "startsAt": "立春 2027 (around February 4, 2027)",
   "stemRelation": "rob_wealth",
   "branchRelation": "hurting_officer"
  }
 },
 "snippets": [
  {
   "id": "tone.v1",
   "text": "Warm, specific, second person, US English. Curious rather than certain: 'your chart suggests', 'many people with this day master'. Encourage reflection, never fear. No predictions about death, illness, pregnancy, legal or investment outcomes. No curses, urgency or upsell."
  },
  {
   "id": "dm.bing.core",
   "text": "Yang Fire is the sun: warm, visible and generous. People with this day master light up a room and tend to give energy freely, often before anyone asks."
  },
  {
   "id": "dm.bing.love",
   "text": "In love, Yang Fire is open-hearted and expressive. It needs a partner who can enjoy its brightness without trying to dim it."
  },
  {
   "id": "dm.bing.work",
   "text": "At work, Yang Fire is a natural motivator and communicator, strongest where enthusiasm is contagious and results are visible."
  },
  {
   "id": "dm.bing.shadow",
   "text": "The sun's shadow is burnout and bluntness: it can shine on everyone at once and forget to rest or to notice who needed shade."
  },
  {
   "id": "el.metal.low",
   "text": "No visible Metal can mean boundaries and endings are hard to set. Clear lists, simple rules and letting go of what is finished bring structure."
  },
  {
   "id": "tg.rob_wealth",
   "text": "Rob Wealth (劫財) stands for competition and bold moves: energy that pushes you to keep up, take risks and share resources."
  },
  {
   "id": "tg.direct_resource",
   "text": "Direct Resource (正印) stands for support and learning: mentors, study and the care you receive and pass on."
  },
  {
   "id": "tg.seven_killings",
   "text": "Seven Killings (七殺) stands for pressure and courage: challenges that test you and the drive to rise to them."
  },
  {
   "id": "tg.direct_officer",
   "text": "Direct Officer (正官) stands for structure and reputation: respect for rules, duty and doing things properly."
  },
  {
   "id": "tg.eating_god",
   "text": "Eating God (食神) stands for easy creativity and enjoyment: talents that come naturally and the pleasure of making things."
  },
  {
   "id": "tg.hurting_officer",
   "text": "Hurting Officer (傷官) stands for sharp expression and originality: the urge to question rules and say what others will not."
  },
  {
   "id": "y2027.general",
   "text": "2027 is a 丁未 year: Yin Fire (the candle) over the Goat, a summer Earth sign. It is often read as a warm, reflective year that favors craft, care and steady relationships over big leaps. In saju the year begins at 立春, around February 4, 2027."
  },
  {
   "id": "y2027.bing",
   "text": "For Yang Fire, the year brings a fellow flame (Rob Wealth) and Earth to express through (Hurting Officer): energy is high; choose one outlet and give it your full warmth."
  }
 ]
}
```
