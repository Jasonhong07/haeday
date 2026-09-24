// Interpretation library for the paid reading (PRD §9). DRAFT v1 written by Claude for Jason's review.
// Production (APP_ENV=production) only uses entries with approvedBy: "jason"; staging/dev may use drafts.
// Each entry is self-contained so the LLM can quote or paraphrase it without inventing facts.

export type ElementKey = "wood" | "fire" | "earth" | "metal" | "water";
export type TenGodKey =
  | "companion" | "rob_wealth" | "eating_god" | "hurting_officer" | "indirect_wealth"
  | "direct_wealth" | "seven_killings" | "direct_officer" | "indirect_resource" | "direct_resource";

export interface Snippet {
  id: string;
  version: number;
  approvedBy: "jason" | null;
  appliesWhen: string;
  text: string;
}

const draft = (id: string, appliesWhen: string, text: string): Snippet => ({ id, version: 1, approvedBy: null, appliesWhen, text });

// ---------- Day masters (core · love · work · shadow) ----------
export const DAY_MASTER_SNIPPETS: Record<string, Snippet[]> = {
  甲: [
    draft("dm.jia.core", "day master 甲", "Yang Wood is the tall tree: it grows upward in one clear direction. People with this day master tend to be principled, steady and protective, and they feel most like themselves when they are building something that will still stand in ten years."),
    draft("dm.jia.love", "day master 甲", "In love, Yang Wood offers shelter and loyalty. It can forget that the people under its branches also want to be asked, not only protected."),
    draft("dm.jia.work", "day master 甲", "At work, Yang Wood does well with long projects, clear standards and room to lead. Constant small compromises wear it down."),
    draft("dm.jia.shadow", "day master 甲", "The shadow side of the tall tree is stubbornness: bending feels like breaking, so it may hold a position longer than it helps."),
  ],
  乙: [
    draft("dm.yi.core", "day master 乙", "Yin Wood is the climbing vine: flexible, social and quietly persistent. It finds the gap in the fence and grows through it, turning people and circumstances into supports."),
    draft("dm.yi.love", "day master 乙", "In love, Yin Wood is attentive and adaptable, reading what a partner needs. It thrives when that care is returned rather than assumed."),
    draft("dm.yi.work", "day master 乙", "At work, Yin Wood shines in networks, collaboration and diplomacy, often achieving more through relationships than through force."),
    draft("dm.yi.shadow", "day master 乙", "The vine's shadow is over-adapting: taking the shape of whatever it leans on until its own direction becomes unclear."),
  ],
  丙: [
    draft("dm.bing.core", "day master 丙", "Yang Fire is the sun: warm, visible and generous. People with this day master light up a room and tend to give energy freely, often before anyone asks."),
    draft("dm.bing.love", "day master 丙", "In love, Yang Fire is open-hearted and expressive. It needs a partner who can enjoy its brightness without trying to dim it."),
    draft("dm.bing.work", "day master 丙", "At work, Yang Fire is a natural motivator and communicator, strongest where enthusiasm is contagious and results are visible."),
    draft("dm.bing.shadow", "day master 丙", "The sun's shadow is burnout and bluntness: it can shine on everyone at once and forget to rest or to notice who needed shade."),
  ],
  丁: [
    draft("dm.ding.core", "day master 丁", "Yin Fire is the candle: focused, perceptive and warm up close. It brings clarity to one person or one idea at a time and often notices feelings others miss."),
    draft("dm.ding.love", "day master 丁", "In love, Yin Fire is devoted and intimate. It values depth over display and remembers the small things."),
    draft("dm.ding.work", "day master 丁", "At work, Yin Fire does well in craft, teaching, care and careful thinking, where sustained attention matters more than volume."),
    draft("dm.ding.shadow", "day master 丁", "The candle's shadow is worry: a small flame is sensitive to every draft and can spend energy guarding itself."),
  ],
  戊: [
    draft("dm.wu.core", "day master 戊", "Yang Earth is the mountain: stable, patient and dependable. Others lean on it, and it tends to become the calm center of groups and families."),
    draft("dm.wu.love", "day master 戊", "In love, Yang Earth offers reliability and presence. It shows care through consistency more than words."),
    draft("dm.wu.work", "day master 戊", "At work, Yang Earth suits roles that need trust, structure and follow-through, where others can count on it to hold steady."),
    draft("dm.wu.shadow", "day master 戊", "The mountain's shadow is inertia: once settled, it can resist change even when change would help."),
  ],
  己: [
    draft("dm.ji.core", "day master 己", "Yin Earth is the garden soil: nurturing, practical and resourceful. It helps things grow and is good at turning small beginnings into something that lasts."),
    draft("dm.ji.love", "day master 己", "In love, Yin Earth is caring and accommodating, quietly making life easier for the people around it."),
    draft("dm.ji.work", "day master 己", "At work, Yin Earth is a skilled organizer and supporter, strong in operations, service and anything that needs patient cultivation."),
    draft("dm.ji.shadow", "day master 己", "The soil's shadow is overextending: it feeds everyone else and can forget to replenish itself."),
  ],
  庚: [
    draft("dm.geng.core", "day master 庚", "Yang Metal is the sword: decisive, direct and loyal. It cuts to what matters and is at its best when there is something worth defending."),
    draft("dm.geng.love", "day master 庚", "In love, Yang Metal is committed and protective, honest even when honesty is uncomfortable."),
    draft("dm.geng.work", "day master 庚", "At work, Yang Metal suits challenges, reforms and roles that need quick judgment and courage."),
    draft("dm.geng.shadow", "day master 庚", "The sword's shadow is harshness: in a hurry to fix things, it can cut more than it meant to."),
  ],
  辛: [
    draft("dm.xin.core", "day master 辛", "Yin Metal is the jewel: refined, sensitive and exacting. It notices quality, fairness and detail, and it tends to hold itself to a high standard."),
    draft("dm.xin.love", "day master 辛", "In love, Yin Metal values respect and thoughtfulness. It shines when it feels appreciated and chosen."),
    draft("dm.xin.work", "day master 辛", "At work, Yin Metal excels in design, analysis, finance and anywhere precision and taste are rewarded."),
    draft("dm.xin.shadow", "day master 辛", "The jewel's shadow is perfectionism and pride: small flaws can feel larger than they are."),
  ],
  壬: [
    draft("dm.ren.core", "day master 壬", "Yang Water is the ocean: curious, expansive and far-seeing. It moves with big currents, connects distant ideas and gets restless when life is too small."),
    draft("dm.ren.love", "day master 壬", "In love, Yang Water is adventurous and generous with ideas. It needs freedom and a partner who enjoys the journey."),
    draft("dm.ren.work", "day master 壬", "At work, Yang Water thrives in strategy, travel, trade, research and anything that rewards seeing the bigger picture."),
    draft("dm.ren.shadow", "day master 壬", "The ocean's shadow is scattering: so many currents at once that none of them reaches shore."),
  ],
  癸: [
    draft("dm.gui.core", "day master 癸", "Yin Water is the rain: intuitive, imaginative and quietly influential. It reaches everywhere without force and softens hard ground for the people it cares about."),
    draft("dm.gui.love", "day master 癸", "In love, Yin Water is empathetic and romantic, sensing moods before they are spoken."),
    draft("dm.gui.work", "day master 癸", "At work, Yin Water does well in research, writing, counseling and creative fields that value insight over volume."),
    draft("dm.gui.shadow", "day master 癸", "The rain's shadow is withdrawal: when overwhelmed it may disappear into its own thoughts."),
  ],
};

// ---------- Elements (high = 3+ of the visible characters, low = 0) ----------
export const ELEMENT_SNIPPETS: Record<ElementKey, { high: Snippet; low: Snippet }> = {
  wood: {
    high: draft("el.wood.high", "wood count ≥ 3", "Plenty of Wood in a chart suggests growth energy: plans, ideals and a wish to keep expanding. The practice is to finish what has already sprouted before planting more."),
    low: draft("el.wood.low", "wood count = 0", "No visible Wood can mean growth feels effortful or that new beginnings come from outside. Small daily routines, learning and time among living things are gentle ways to invite it."),
  },
  fire: {
    high: draft("el.fire.high", "fire count ≥ 3", "Plenty of Fire suggests warmth, visibility and enthusiasm. The practice is pacing: keep enough fuel for tomorrow."),
    low: draft("el.fire.low", "fire count = 0", "No visible Fire can mean joy and self-expression need a deliberate outlet. Shared meals, sunlight and saying appreciation out loud are simple ways to add warmth."),
  },
  earth: {
    high: draft("el.earth.high", "earth count ≥ 3", "Plenty of Earth suggests steadiness, patience and a strong sense of responsibility. The practice is flexibility: stable does not have to mean stuck."),
    low: draft("el.earth.low", "earth count = 0", "No visible Earth can mean grounding takes effort. Routines, a tidy home base and people who keep you steady help."),
  },
  metal: {
    high: draft("el.metal.high", "metal count ≥ 3", "Plenty of Metal suggests clarity, standards and decisiveness. The practice is softness: not every edge needs to be sharp."),
    low: draft("el.metal.low", "metal count = 0", "No visible Metal can mean boundaries and endings are hard to set. Clear lists, simple rules and letting go of what is finished bring structure."),
  },
  water: {
    high: draft("el.water.high", "water count ≥ 3", "Plenty of Water suggests depth, intuition and adaptability. The practice is direction: a river needs banks."),
    low: draft("el.water.low", "water count = 0", "No visible Water can mean rest and reflection get squeezed out. Quiet time, sleep and journaling help thoughts settle."),
  },
};

// ---------- Ten gods (roles of the other characters relative to the day master) ----------
export const TEN_GOD_SNIPPETS: Record<TenGodKey, Snippet> = {
  companion: draft("tg.companion", "companion present", "Companion (比肩) stands for peers and self-reliance: the part of you that likes to do things your own way, side by side with equals."),
  rob_wealth: draft("tg.rob_wealth", "rob wealth present", "Rob Wealth (劫財) stands for competition and bold moves: energy that pushes you to keep up, take risks and share resources."),
  eating_god: draft("tg.eating_god", "eating god present", "Eating God (食神) stands for easy creativity and enjoyment: talents that come naturally and the pleasure of making things."),
  hurting_officer: draft("tg.hurting_officer", "hurting officer present", "Hurting Officer (傷官) stands for sharp expression and originality: the urge to question rules and say what others will not."),
  indirect_wealth: draft("tg.indirect_wealth", "indirect wealth present", "Indirect Wealth (偏財) stands for opportunity and generosity: money and connections that come through movement, deals and people."),
  direct_wealth: draft("tg.direct_wealth", "direct wealth present", "Direct Wealth (正財) stands for steady effort and care with resources: income earned patiently and managed well."),
  seven_killings: draft("tg.seven_killings", "seven killings present", "Seven Killings (七殺) stands for pressure and courage: challenges that test you and the drive to rise to them."),
  direct_officer: draft("tg.direct_officer", "direct officer present", "Direct Officer (正官) stands for structure and reputation: respect for rules, duty and doing things properly."),
  indirect_resource: draft("tg.indirect_resource", "indirect resource present", "Indirect Resource (偏印) stands for unusual insight: intuition, niche knowledge and learning on your own terms."),
  direct_resource: draft("tg.direct_resource", "direct resource present", "Direct Resource (正印) stands for support and learning: mentors, study and the care you receive and pass on."),
};

// ---------- 2027 (丁未 year: Yin Fire over the Goat, from 立春 around Feb 4, 2027) ----------
export const YEAR_2027_GENERAL = draft("y2027.general", "all readings", "2027 is a 丁未 year: Yin Fire (the candle) over the Goat, a summer Earth sign. It is often read as a warm, reflective year that favors craft, care and steady relationships over big leaps. In saju the year begins at 立春, around February 4, 2027.");

/** Keyed by day master. Text is framed by the relation of 丁 (stem) and 未 (main hidden stem 己) to the day master. */
export const YEAR_2027_BY_DM: Record<string, Snippet> = {
  甲: draft("y2027.jia", "day master 甲", "For Yang Wood, the year's Fire is your own creativity at work (Hurting Officer) and its Earth is wealth you tend (Direct Wealth): a year to turn ideas into something tangible, and to watch that speaking plainly stays kind."),
  乙: draft("y2027.yi", "day master 乙", "For Yin Wood, the year's Fire is easy expression (Eating God) and its Earth is opportunity (Indirect Wealth): a year that rewards sharing your skills and saying yes to the right invitations."),
  丙: draft("y2027.bing", "day master 丙", "For Yang Fire, the year brings a fellow flame (Rob Wealth) and Earth to express through (Hurting Officer): energy is high; choose one outlet and give it your full warmth."),
  丁: draft("y2027.ding", "day master 丁", "For Yin Fire, the year mirrors you (Companion) and grounds your gifts (Eating God): a good year to trust your own way of doing things and to make what you enjoy."),
  戊: draft("y2027.wu", "day master 戊", "For Yang Earth, the year's Fire is support and learning (Direct Resource) and its Earth is a peer (Rob Wealth): lean on mentors and study, and share the load with others."),
  己: draft("y2027.ji", "day master 己", "For Yin Earth, the year's Fire is unusual insight (Indirect Resource) and its Earth is your own kind (Companion): a reflective year for learning on your own terms and strengthening your base."),
  庚: draft("y2027.geng", "day master 庚", "For Yang Metal, the year's Fire is structure and recognition (Direct Officer) and its Earth is support (Direct Resource): responsibilities grow, and so does the help available if you ask."),
  辛: draft("y2027.xin", "day master 辛", "For Yin Metal, the year's Fire is pressure that polishes (Seven Killings) and its Earth is insight (Indirect Resource): challenges arrive with the tools to meet them; pace yourself."),
  壬: draft("y2027.ren", "day master 壬", "For Yang Water, the year's Fire is steady wealth (Direct Wealth) and its Earth is structure (Direct Officer): a year for consistent work and commitments that build a reputation."),
  癸: draft("y2027.gui", "day master 癸", "For Yin Water, the year's Fire is opportunity (Indirect Wealth) and its Earth is challenge (Seven Killings): chances come with some pressure; choose the ones that fit your values."),
};

export const TONE = draft("tone.v1", "all readings", "Warm, specific, second person, US English. Curious rather than certain: 'your chart suggests', 'many people with this day master'. Encourage reflection, never fear. No predictions about death, illness, pregnancy, legal or investment outcomes. No curses, urgency or upsell.");

/** Stable version string for the whole library; changes whenever any entry changes. */
export const SNIPPETS_VERSION = "snippets-draft-1";
