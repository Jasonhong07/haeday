# Sample 09 · exact-癸

Facts given to the model:

```json
{
 "pillars": {
  "year": "丁卯",
  "month": "癸丑",
  "day": "癸亥",
  "hour": "己未"
 },
 "pillarsEnglish": {
  "year": "Yin Fire Rabbit",
  "month": "Yin Water Ox",
  "day": "Yin Water Pig",
  "hour": "Yin Earth Goat"
 },
 "dayMaster": {
  "stem": "癸",
  "element": "water",
  "yinYang": "yin"
 },
 "visibleElements": {
  "wood": 1,
  "fire": 1,
  "earth": 3,
  "metal": 0,
  "water": 3
 },
 "denominator": 8,
 "tenGods": [
  {
   "position": "year_stem",
   "god": "indirect_wealth"
  },
  {
   "position": "year_branch",
   "god": "eating_god"
  },
  {
   "position": "month_stem",
   "god": "companion"
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
   "god": "seven_killings"
  },
  {
   "position": "hour_branch",
   "god": "seven_killings"
  }
 ],
 "timeBasis": "exact",
 "disclosure": null,
 "year2027": {
  "pillar": "丁未",
  "startsAt": "立春 2027 (around February 4, 2027)",
  "stemRelation": "indirect_wealth",
  "branchRelation": "seven_killings"
 }
}
```

Snippets: tone.v1, dm.gui.core, dm.gui.love, dm.gui.work, dm.gui.shadow, el.earth.high, el.metal.low, el.water.high, tg.indirect_wealth, tg.eating_god, tg.companion, tg.seven_killings, tg.rob_wealth, y2027.general, y2027.gui

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
   "day": "癸亥",
   "hour": "己未"
  },
  "pillarsEnglish": {
   "year": "Yin Fire Rabbit",
   "month": "Yin Water Ox",
   "day": "Yin Water Pig",
   "hour": "Yin Earth Goat"
  },
  "dayMaster": {
   "stem": "癸",
   "element": "water",
   "yinYang": "yin"
  },
  "visibleElements": {
   "wood": 1,
   "fire": 1,
   "earth": 3,
   "metal": 0,
   "water": 3
  },
  "denominator": 8,
  "tenGods": [
   {
    "position": "year_stem",
    "god": "indirect_wealth"
   },
   {
    "position": "year_branch",
    "god": "eating_god"
   },
   {
    "position": "month_stem",
    "god": "companion"
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
    "god": "seven_killings"
   },
   {
    "position": "hour_branch",
    "god": "seven_killings"
   }
  ],
  "timeBasis": "exact",
  "disclosure": null,
  "year2027": {
   "pillar": "丁未",
   "startsAt": "立春 2027 (around February 4, 2027)",
   "stemRelation": "indirect_wealth",
   "branchRelation": "seven_killings"
  }
 },
 "snippets": [
  {
   "id": "tone.v1",
   "text": "Warm, specific, second person, US English. Curious rather than certain: 'your chart suggests', 'many people with this day master'. Encourage reflection, never fear. No predictions about death, illness, pregnancy, legal or investment outcomes. No curses, urgency or upsell."
  },
  {
   "id": "dm.gui.core",
   "text": "Yin Water is the rain: intuitive, imaginative and quietly influential. It reaches everywhere without force and softens hard ground for the people it cares about."
  },
  {
   "id": "dm.gui.love",
   "text": "In love, Yin Water is empathetic and romantic, sensing moods before they are spoken."
  },
  {
   "id": "dm.gui.work",
   "text": "At work, Yin Water does well in research, writing, counseling and creative fields that value insight over volume."
  },
  {
   "id": "dm.gui.shadow",
   "text": "The rain's shadow is withdrawal: when overwhelmed it may disappear into its own thoughts."
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
   "id": "el.water.high",
   "text": "Plenty of Water suggests depth, intuition and adaptability. The practice is direction: a river needs banks."
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
   "id": "tg.companion",
   "text": "Companion (比肩) stands for peers and self-reliance: the part of you that likes to do things your own way, side by side with equals."
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
   "id": "y2027.general",
   "text": "2027 is a 丁未 year: Yin Fire (the candle) over the Goat, a summer Earth sign. It is often read as a warm, reflective year that favors craft, care and steady relationships over big leaps. In saju the year begins at 立春, around February 4, 2027."
  },
  {
   "id": "y2027.gui",
   "text": "For Yin Water, the year's Fire is opportunity (Indirect Wealth) and its Earth is challenge (Seven Killings): chances come with some pressure; choose the ones that fit your values."
  }
 ]
}
```
