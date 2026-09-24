# Sample 05 · exact-己

Facts given to the model:

```json
{
 "pillars": {
  "year": "丁卯",
  "month": "壬子",
  "day": "己未",
  "hour": "辛未"
 },
 "pillarsEnglish": {
  "year": "Yin Fire Rabbit",
  "month": "Yang Water Rat",
  "day": "Yin Earth Goat",
  "hour": "Yin Metal Goat"
 },
 "dayMaster": {
  "stem": "己",
  "element": "earth",
  "yinYang": "yin"
 },
 "visibleElements": {
  "wood": 1,
  "fire": 1,
  "earth": 3,
  "metal": 1,
  "water": 2
 },
 "denominator": 8,
 "tenGods": [
  {
   "position": "year_stem",
   "god": "indirect_resource"
  },
  {
   "position": "year_branch",
   "god": "seven_killings"
  },
  {
   "position": "month_stem",
   "god": "direct_wealth"
  },
  {
   "position": "month_branch",
   "god": "indirect_wealth"
  },
  {
   "position": "day_branch",
   "god": "companion"
  },
  {
   "position": "hour_stem",
   "god": "eating_god"
  },
  {
   "position": "hour_branch",
   "god": "companion"
  }
 ],
 "timeBasis": "exact",
 "disclosure": null,
 "year2027": {
  "pillar": "丁未",
  "startsAt": "立春 2027 (around February 4, 2027)",
  "stemRelation": "indirect_resource",
  "branchRelation": "companion"
 }
}
```

Snippets: tone.v1, dm.ji.core, dm.ji.love, dm.ji.work, dm.ji.shadow, el.earth.high, tg.indirect_resource, tg.seven_killings, tg.direct_wealth, tg.indirect_wealth, tg.companion, tg.eating_god, y2027.general, y2027.ji

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
   "day": "己未",
   "hour": "辛未"
  },
  "pillarsEnglish": {
   "year": "Yin Fire Rabbit",
   "month": "Yang Water Rat",
   "day": "Yin Earth Goat",
   "hour": "Yin Metal Goat"
  },
  "dayMaster": {
   "stem": "己",
   "element": "earth",
   "yinYang": "yin"
  },
  "visibleElements": {
   "wood": 1,
   "fire": 1,
   "earth": 3,
   "metal": 1,
   "water": 2
  },
  "denominator": 8,
  "tenGods": [
   {
    "position": "year_stem",
    "god": "indirect_resource"
   },
   {
    "position": "year_branch",
    "god": "seven_killings"
   },
   {
    "position": "month_stem",
    "god": "direct_wealth"
   },
   {
    "position": "month_branch",
    "god": "indirect_wealth"
   },
   {
    "position": "day_branch",
    "god": "companion"
   },
   {
    "position": "hour_stem",
    "god": "eating_god"
   },
   {
    "position": "hour_branch",
    "god": "companion"
   }
  ],
  "timeBasis": "exact",
  "disclosure": null,
  "year2027": {
   "pillar": "丁未",
   "startsAt": "立春 2027 (around February 4, 2027)",
   "stemRelation": "indirect_resource",
   "branchRelation": "companion"
  }
 },
 "snippets": [
  {
   "id": "tone.v1",
   "text": "Warm, specific, second person, US English. Curious rather than certain: 'your chart suggests', 'many people with this day master'. Encourage reflection, never fear. No predictions about death, illness, pregnancy, legal or investment outcomes. No curses, urgency or upsell."
  },
  {
   "id": "dm.ji.core",
   "text": "Yin Earth is the garden soil: nurturing, practical and resourceful. It helps things grow and is good at turning small beginnings into something that lasts."
  },
  {
   "id": "dm.ji.love",
   "text": "In love, Yin Earth is caring and accommodating, quietly making life easier for the people around it."
  },
  {
   "id": "dm.ji.work",
   "text": "At work, Yin Earth is a skilled organizer and supporter, strong in operations, service and anything that needs patient cultivation."
  },
  {
   "id": "dm.ji.shadow",
   "text": "The soil's shadow is overextending: it feeds everyone else and can forget to replenish itself."
  },
  {
   "id": "el.earth.high",
   "text": "Plenty of Earth suggests steadiness, patience and a strong sense of responsibility. The practice is flexibility: stable does not have to mean stuck."
  },
  {
   "id": "tg.indirect_resource",
   "text": "Indirect Resource (偏印) stands for unusual insight: intuition, niche knowledge and learning on your own terms."
  },
  {
   "id": "tg.seven_killings",
   "text": "Seven Killings (七殺) stands for pressure and courage: challenges that test you and the drive to rise to them."
  },
  {
   "id": "tg.direct_wealth",
   "text": "Direct Wealth (正財) stands for steady effort and care with resources: income earned patiently and managed well."
  },
  {
   "id": "tg.indirect_wealth",
   "text": "Indirect Wealth (偏財) stands for opportunity and generosity: money and connections that come through movement, deals and people."
  },
  {
   "id": "tg.companion",
   "text": "Companion (比肩) stands for peers and self-reliance: the part of you that likes to do things your own way, side by side with equals."
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
   "id": "y2027.ji",
   "text": "For Yin Earth, the year's Fire is unusual insight (Indirect Resource) and its Earth is your own kind (Companion): a reflective year for learning on your own terms and strengthening your base."
  }
 ]
}
```
