# Sample 04 · exact-戊

Facts given to the model:

```json
{
 "pillars": {
  "year": "丁卯",
  "month": "壬子",
  "day": "戊午",
  "hour": "己未"
 },
 "pillarsEnglish": {
  "year": "Yin Fire Rabbit",
  "month": "Yang Water Rat",
  "day": "Yang Earth Horse",
  "hour": "Yin Earth Goat"
 },
 "dayMaster": {
  "stem": "戊",
  "element": "earth",
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
   "god": "direct_resource"
  },
  {
   "position": "year_branch",
   "god": "direct_officer"
  },
  {
   "position": "month_stem",
   "god": "indirect_wealth"
  },
  {
   "position": "month_branch",
   "god": "direct_wealth"
  },
  {
   "position": "day_branch",
   "god": "direct_resource"
  },
  {
   "position": "hour_stem",
   "god": "rob_wealth"
  },
  {
   "position": "hour_branch",
   "god": "rob_wealth"
  }
 ],
 "timeBasis": "exact",
 "disclosure": null,
 "year2027": {
  "pillar": "丁未",
  "startsAt": "立春 2027 (around February 4, 2027)",
  "stemRelation": "direct_resource",
  "branchRelation": "rob_wealth"
 }
}
```

Snippets: tone.v1, dm.wu.core, dm.wu.love, dm.wu.work, dm.wu.shadow, el.earth.high, el.metal.low, tg.direct_resource, tg.direct_officer, tg.indirect_wealth, tg.direct_wealth, tg.rob_wealth, y2027.general, y2027.wu

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
   "day": "戊午",
   "hour": "己未"
  },
  "pillarsEnglish": {
   "year": "Yin Fire Rabbit",
   "month": "Yang Water Rat",
   "day": "Yang Earth Horse",
   "hour": "Yin Earth Goat"
  },
  "dayMaster": {
   "stem": "戊",
   "element": "earth",
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
    "god": "direct_resource"
   },
   {
    "position": "year_branch",
    "god": "direct_officer"
   },
   {
    "position": "month_stem",
    "god": "indirect_wealth"
   },
   {
    "position": "month_branch",
    "god": "direct_wealth"
   },
   {
    "position": "day_branch",
    "god": "direct_resource"
   },
   {
    "position": "hour_stem",
    "god": "rob_wealth"
   },
   {
    "position": "hour_branch",
    "god": "rob_wealth"
   }
  ],
  "timeBasis": "exact",
  "disclosure": null,
  "year2027": {
   "pillar": "丁未",
   "startsAt": "立春 2027 (around February 4, 2027)",
   "stemRelation": "direct_resource",
   "branchRelation": "rob_wealth"
  }
 },
 "snippets": [
  {
   "id": "tone.v1",
   "text": "Warm, specific, second person, US English. Curious rather than certain: 'your chart suggests', 'many people with this day master'. Encourage reflection, never fear. No predictions about death, illness, pregnancy, legal or investment outcomes. No curses, urgency or upsell."
  },
  {
   "id": "dm.wu.core",
   "text": "Yang Earth is the mountain: stable, patient and dependable. Others lean on it, and it tends to become the calm center of groups and families."
  },
  {
   "id": "dm.wu.love",
   "text": "In love, Yang Earth offers reliability and presence. It shows care through consistency more than words."
  },
  {
   "id": "dm.wu.work",
   "text": "At work, Yang Earth suits roles that need trust, structure and follow-through, where others can count on it to hold steady."
  },
  {
   "id": "dm.wu.shadow",
   "text": "The mountain's shadow is inertia: once settled, it can resist change even when change would help."
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
   "id": "tg.direct_resource",
   "text": "Direct Resource (正印) stands for support and learning: mentors, study and the care you receive and pass on."
  },
  {
   "id": "tg.direct_officer",
   "text": "Direct Officer (正官) stands for structure and reputation: respect for rules, duty and doing things properly."
  },
  {
   "id": "tg.indirect_wealth",
   "text": "Indirect Wealth (偏財) stands for opportunity and generosity: money and connections that come through movement, deals and people."
  },
  {
   "id": "tg.direct_wealth",
   "text": "Direct Wealth (正財) stands for steady effort and care with resources: income earned patiently and managed well."
  },
  {
   "id": "tg.rob_wealth",
   "text": "Rob Wealth (劫財) stands for competition and bold moves: energy that pushes you to keep up, take risks and share resources."
  },
  {
   "id": "y2027.general",
   "text": "2027 is a 丁未 year: Yin Fire (the candle) over the Goat, a summer Earth sign. It is often read as a warm, reflective year that favors craft, care and steady relationships over big leaps. In saju the year begins at 立春, around February 4, 2027."
  },
  {
   "id": "y2027.wu",
   "text": "For Yang Earth, the year's Fire is support and learning (Direct Resource) and its Earth is a peer (Rob Wealth): lean on mentors and study, and share the load with others."
  }
 ]
}
```
