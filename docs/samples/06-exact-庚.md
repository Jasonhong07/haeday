# Sample 06 · exact-庚

Facts given to the model:

```json
{
 "pillars": {
  "year": "丁卯",
  "month": "癸丑",
  "day": "庚申",
  "hour": "癸未"
 },
 "pillarsEnglish": {
  "year": "Yin Fire Rabbit",
  "month": "Yin Water Ox",
  "day": "Yang Metal Monkey",
  "hour": "Yin Water Goat"
 },
 "dayMaster": {
  "stem": "庚",
  "element": "metal",
  "yinYang": "yang"
 },
 "visibleElements": {
  "wood": 1,
  "fire": 1,
  "earth": 2,
  "metal": 2,
  "water": 2
 },
 "denominator": 8,
 "tenGods": [
  {
   "position": "year_stem",
   "god": "direct_officer"
  },
  {
   "position": "year_branch",
   "god": "direct_wealth"
  },
  {
   "position": "month_stem",
   "god": "hurting_officer"
  },
  {
   "position": "month_branch",
   "god": "direct_resource"
  },
  {
   "position": "day_branch",
   "god": "companion"
  },
  {
   "position": "hour_stem",
   "god": "hurting_officer"
  },
  {
   "position": "hour_branch",
   "god": "direct_resource"
  }
 ],
 "timeBasis": "exact",
 "disclosure": null,
 "year2027": {
  "pillar": "丁未",
  "startsAt": "立春 2027 (around February 4, 2027)",
  "stemRelation": "direct_officer",
  "branchRelation": "direct_resource"
 }
}
```

Snippets: tone.v1, dm.geng.core, dm.geng.love, dm.geng.work, dm.geng.shadow, tg.direct_officer, tg.direct_wealth, tg.hurting_officer, tg.direct_resource, tg.companion, y2027.general, y2027.geng

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
   "day": "庚申",
   "hour": "癸未"
  },
  "pillarsEnglish": {
   "year": "Yin Fire Rabbit",
   "month": "Yin Water Ox",
   "day": "Yang Metal Monkey",
   "hour": "Yin Water Goat"
  },
  "dayMaster": {
   "stem": "庚",
   "element": "metal",
   "yinYang": "yang"
  },
  "visibleElements": {
   "wood": 1,
   "fire": 1,
   "earth": 2,
   "metal": 2,
   "water": 2
  },
  "denominator": 8,
  "tenGods": [
   {
    "position": "year_stem",
    "god": "direct_officer"
   },
   {
    "position": "year_branch",
    "god": "direct_wealth"
   },
   {
    "position": "month_stem",
    "god": "hurting_officer"
   },
   {
    "position": "month_branch",
    "god": "direct_resource"
   },
   {
    "position": "day_branch",
    "god": "companion"
   },
   {
    "position": "hour_stem",
    "god": "hurting_officer"
   },
   {
    "position": "hour_branch",
    "god": "direct_resource"
   }
  ],
  "timeBasis": "exact",
  "disclosure": null,
  "year2027": {
   "pillar": "丁未",
   "startsAt": "立春 2027 (around February 4, 2027)",
   "stemRelation": "direct_officer",
   "branchRelation": "direct_resource"
  }
 },
 "snippets": [
  {
   "id": "tone.v1",
   "text": "Warm, specific, second person, US English. Curious rather than certain: 'your chart suggests', 'many people with this day master'. Encourage reflection, never fear. No predictions about death, illness, pregnancy, legal or investment outcomes. No curses, urgency or upsell."
  },
  {
   "id": "dm.geng.core",
   "text": "Yang Metal is the sword: decisive, direct and loyal. It cuts to what matters and is at its best when there is something worth defending."
  },
  {
   "id": "dm.geng.love",
   "text": "In love, Yang Metal is committed and protective, honest even when honesty is uncomfortable."
  },
  {
   "id": "dm.geng.work",
   "text": "At work, Yang Metal suits challenges, reforms and roles that need quick judgment and courage."
  },
  {
   "id": "dm.geng.shadow",
   "text": "The sword's shadow is harshness: in a hurry to fix things, it can cut more than it meant to."
  },
  {
   "id": "tg.direct_officer",
   "text": "Direct Officer (正官) stands for structure and reputation: respect for rules, duty and doing things properly."
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
   "id": "tg.direct_resource",
   "text": "Direct Resource (正印) stands for support and learning: mentors, study and the care you receive and pass on."
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
   "id": "y2027.geng",
   "text": "For Yang Metal, the year's Fire is structure and recognition (Direct Officer) and its Earth is support (Direct Resource): responsibilities grow, and so does the help available if you ask."
  }
 ]
}
```
