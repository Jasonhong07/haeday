// CC4b: public guide pages for search traffic (Jason 2026-09-26: "build now, hidden until approved").
// DRAFT v1 written by Claude. A page is public only when (1) the page has approvedBy: "jason" AND (2) every
// interpretation snippet it quotes is approved too (the same snippets the paid reading uses). Until then the page
// is a 404 for visitors and missing from the sitemap; admins can preview it. Tone rules match the reading: curious,
// never predictive, no health/money/legal claims, "for entertainment and reflection".
import { DAY_MASTERS } from "./library";

export interface GuideSection { heading: string; paragraphs?: string[]; snippetIds?: string[] }
export interface Guide {
  slug: string;                 // URL path under /learn
  title: string;                // <h1> and <title>
  description: string;          // meta description (≤ 160 chars)
  approvedBy: "jason" | null;
  version: number;
  updated: string;              // shown on the page, ISO date
  intro: string;
  sections: GuideSection[];
  faq?: Array<{ q: string; a: string }>;
}

const draft = (g: Omit<Guide, "approvedBy" | "version" | "updated">): Guide => ({ ...g, approvedBy: null, version: 1, updated: "2026-09-26" });

type Stem = keyof typeof DAY_MASTERS;
const DM: Array<{ stem: Stem; slug: string; key: string; element: "Wood" | "Fire" | "Earth" | "Metal" | "Water"; polarity: "Yang" | "Yin" }> = [
  { stem: "甲", slug: "yang-wood", key: "jia", element: "Wood", polarity: "Yang" },
  { stem: "乙", slug: "yin-wood", key: "yi", element: "Wood", polarity: "Yin" },
  { stem: "丙", slug: "yang-fire", key: "bing", element: "Fire", polarity: "Yang" },
  { stem: "丁", slug: "yin-fire", key: "ding", element: "Fire", polarity: "Yin" },
  { stem: "戊", slug: "yang-earth", key: "wu", element: "Earth", polarity: "Yang" },
  { stem: "己", slug: "yin-earth", key: "ji", element: "Earth", polarity: "Yin" },
  { stem: "庚", slug: "yang-metal", key: "geng", element: "Metal", polarity: "Yang" },
  { stem: "辛", slug: "yin-metal", key: "xin", element: "Metal", polarity: "Yin" },
  { stem: "壬", slug: "yang-water", key: "ren", element: "Water", polarity: "Yang" },
  { stem: "癸", slug: "yin-water", key: "gui", element: "Water", polarity: "Yin" },
];
export const DAY_MASTER_GUIDES = DM;

// The generating (相生) and controlling (相剋) cycles: fixed, textbook relations, not interpretations.
const FEEDS: Record<string, string> = { Wood: "Fire", Fire: "Earth", Earth: "Metal", Metal: "Water", Water: "Wood" };
const FED_BY: Record<string, string> = { Wood: "Water", Fire: "Wood", Earth: "Fire", Metal: "Earth", Water: "Metal" };
const CONTROLS: Record<string, string> = { Wood: "Earth", Fire: "Metal", Earth: "Water", Metal: "Wood", Water: "Fire" };
const CONTROLLED_BY: Record<string, string> = { Wood: "Metal", Fire: "Water", Earth: "Wood", Metal: "Fire", Water: "Earth" };

const FIND_DM = "Your Day Master is the heavenly stem of your day pillar: the top character of the pillar for the day you were born. Saju treats it as \"you\" in the chart, and every other character is read in relation to it. You need your birth date to find it; the birth time and city matter mainly for the hour pillar and for births near midnight.";

function dayMasterGuide(d: (typeof DM)[number]): Guide {
  const e = DAY_MASTERS[d.stem]!;
  const name = `${d.polarity} ${d.element}`;
  const sib = DM.find((x) => x.element === d.element && x.polarity !== d.polarity)!;
  const sibE = DAY_MASTERS[sib.stem]!;
  return draft({
    slug: `day-master/${d.slug}`,
    title: `${name} Day Master (${d.stem}): ${e.image}`,
    description: `What it means to have ${name} (${d.stem}) as your Day Master in Korean saju: the image of ${e.image.toLowerCase()}, strengths, love, work and blind spots.`,
    intro: `${name} (${d.stem}) is one of the ten Day Masters of Korean saju (사주, the Four Pillars), pictured as ${e.image.toLowerCase()}. If this is your Day Master, here is how the tradition describes you, and where the picture needs the rest of your chart.`,
    sections: [
      { heading: `The ${e.image.toLowerCase().replace(/^the /, "")} at the center of your chart`, snippetIds: [`dm.${d.key}.core`] },
      { heading: "In love and relationships", snippetIds: [`dm.${d.key}.love`] },
      { heading: "At work", snippetIds: [`dm.${d.key}.work`] },
      { heading: "The blind spot", snippetIds: [`dm.${d.key}.shadow`] },
      { heading: `${name} and its sibling, ${sib.polarity} ${d.element}`, paragraphs: [
        `Each element has a yang and a yin form. ${name} is ${e.image.toLowerCase()}; ${sib.polarity} ${d.element} (${sib.stem}) is ${sibE.image.toLowerCase()}. ${d.polarity === "Yang" ? "The yang form tends to act outward and directly, the yin form" : "The yin form tends to work inward and adaptively, the yang form"} ${d.polarity === "Yang" ? "works inward and adaptively" : "acts outward and directly"}. Same element, different way of using it.`,
      ] },
      { heading: `2027 for ${name}`, snippetIds: [`y2027.${d.key}`] },
      { heading: `${d.element} in the five-element cycle`, paragraphs: [
        `In the generating cycle, ${FED_BY[d.element]} nourishes ${d.element}, and ${d.element} feeds ${FEEDS[d.element]}. In the controlling cycle, ${d.element} checks ${CONTROLS[d.element]} and is checked by ${CONTROLLED_BY[d.element]}.`,
        `A ${name} Day Master is only the starting point. The other seven characters of a chart change how this energy shows up, which is why two people with the same Day Master can feel very different.`,
      ] },
      { heading: "How to find your Day Master", paragraphs: [FIND_DM] },
    ],
    faq: [
      { q: `Is ${name} the same as my Chinese zodiac animal?`, a: "No. Your zodiac animal comes from the branch of your year pillar. Your Day Master comes from the stem of your day pillar, which changes every day, so it says more about you personally." },
      { q: "Does my Day Master predict my future?", a: "No. Saju is a cultural tradition used for reflection. We describe tendencies to think about, not outcomes." },
    ],
  });
}

export const GUIDES: Guide[] = [
  draft({
    slug: "what-is-saju",
    title: "What is saju? Korean Four Pillars, explained simply",
    description: "Saju (사주) is the Korean way of reading the Four Pillars of Destiny: four pairs of characters from your birth year, month, day and hour. Here is how it works.",
    intro: "Saju (사주, literally \"four pillars\") is a Korean tradition that describes a person through eight characters taken from the moment of their birth. It shares its roots with Chinese BaZi, and in Korea it is still a popular way to think about temperament, relationships and timing: many people look at theirs around the new year.",
    sections: [
      { heading: "Four pillars, eight characters", paragraphs: [
        "Your birth year, month, day and hour each become a pillar. Every pillar has two characters: a heavenly stem on top and an earthly branch below. Ten stems and twelve branches combine into a cycle of sixty pairs, the same cycle used for traditional calendars in Korea, China and Japan.",
        "If you don't know your birth time, the hour pillar stays empty. Six characters still describe a lot, and a good calculator will tell you exactly which parts are uncertain.",
      ] },
      { heading: "Yin, yang and the five elements", paragraphs: [
        "Each character carries one of five elements (Wood, Fire, Earth, Metal, Water) and is either yang (outward, active) or yin (inward, receptive). Reading a chart means looking at how these elements balance, feed and check each other.",
      ] },
      { heading: "Your Day Master", paragraphs: [FIND_DM, "There are ten Day Masters, from Yang Wood (the tall tree) to Yin Water (the rain). Each has its own way of meeting the world."] },
      { heading: "How saju differs from Western astrology", paragraphs: [
        "Western astrology maps the sky: the positions of the Sun, Moon and planets. Saju maps time: it reads the calendar characters of your birth moment, using the solar year that starts around February 4 rather than January 1 or the lunar new year. Both are traditions for reflection, not sciences.",
      ] },
      { heading: "Why the time and place matter", paragraphs: [
        "The month changes at fixed points of the solar year, and the day and hour depend on local solar time. That is why an honest calculator asks for your birth city and handles daylight saving time and births near midnight carefully. Our method page explains exactly how we do it.",
      ] },
    ],
    faq: [
      { q: "Is saju the same as the Chinese zodiac?", a: "The zodiac animal is only one of the eight characters (the branch of your year pillar). Saju reads all eight." },
      { q: "Is saju a prediction?", a: "We treat it as a reflective tradition, like a conversation starter about yourself. It is not a prediction or professional advice." },
      { q: "Do I need my exact birth time?", a: "No. Without it we leave the hour pillar empty and tell you what could change." },
    ],
  }),
  draft({
    slug: "five-elements",
    title: "The five elements in saju: Wood, Fire, Earth, Metal, Water",
    description: "How the five elements (오행) work in Korean saju: what each element stands for, how they feed and check each other, and how to read their balance in your chart.",
    intro: "Every character in a saju chart belongs to one of five elements, called 오행 (ohaeng) in Korean. They are less like substances and more like five kinds of movement: growing, rising, settling, contracting and flowing.",
    sections: [
      { heading: "The five elements", paragraphs: [
        "Wood (木) is growth and direction: spring, beginnings, plans. Fire (火) is warmth and visibility: summer, expression, enthusiasm. Earth (土) is stability and care: the seasons' turning points, patience, responsibility. Metal (金) is clarity and form: autumn, standards, decisions. Water (水) is depth and flow: winter, reflection, adaptability.",
      ] },
      { heading: "The generating cycle", paragraphs: [
        "Water nourishes Wood, Wood feeds Fire, Fire leaves Earth (ash), Earth yields Metal, and Metal carries Water (condensation). Elements that follow each other in this cycle support one another.",
      ] },
      { heading: "The controlling cycle", paragraphs: [
        "Wood breaks up Earth, Earth dams Water, Water puts out Fire, Fire melts Metal, and Metal cuts Wood. Control is not bad: a river needs banks. A chart with healthy checks feels steady.",
      ] },
      { heading: "Reading balance in your chart", paragraphs: [
        "A quick first look counts how many of your visible characters carry each element. Three or more of one element suggests a strong theme; none suggests an area that needs deliberate attention. This count is a simple starting point, not a measure of strength: full readings also weigh the season of your birth and hidden stems inside the branches.",
      ] },
    ],
    faq: [{ q: "Is it bad to have no Fire (or no Water) in my chart?", a: "No. Missing elements are common. They point to areas you may find less natural or want to invite on purpose, not to problems." }],
  }),
  draft({
    slug: "2027-year-of-the-fire-goat",
    title: "2027 in saju: the 丁未 Fire Goat year",
    description: "2027 is a 丁未 year in saju: Yin Fire over the Goat. When the saju year begins, what the characters mean, and how to reflect on it with your own chart.",
    intro: "In the sixty-year cycle, 2027 is 丁未 (정미, jeong-mi): Yin Fire, the candle, over the Goat, a summer Earth branch. In saju the new year begins at 입춘 (立春, the start of spring), around February 4, 2027, not on January 1 or the lunar new year.",
    sections: [
      { heading: "The characters of the year", paragraphs: [
        "丁 (Yin Fire) is the candle or lamp: warmth that works close up, focus, craft and care. 未 (the Goat) is late-summer Earth, holding hidden Earth, Fire and Wood. Together they are often read as a warm, reflective year that favors steady relationships and making things well over big leaps.",
      ] },
      { heading: "How the year meets your chart", paragraphs: [
        "The year's characters mean something different for each Day Master. For Yin Fire it is a year of companions; for Metal Day Masters, Fire can feel like pressure and structure; for Earth Day Masters, it can feel like support. A personal reading looks at how 丁 and 未 relate to your own Day Master and to the characters already in your chart.",
      ] },
      { heading: "A reflective way to use it", paragraphs: [
        "Rather than asking what 2027 will bring, saju invites a different question: what kind of effort does this year's energy reward? For a candle year, that might be patience with one project, or care for a few close relationships.",
      ] },
    ],
    faq: [
      { q: "When does 2027 start in saju?", a: "At 立春 (the start of spring), around February 4, 2027. Someone born on January 20, 2027 still has a 2026 (丙午, Fire Horse) year pillar." },
      { q: "Is 2027 a lucky year?", a: "Saju doesn't label years lucky or unlucky for everyone. How a year feels depends on your own chart, and we treat it as a theme for reflection, not a forecast." },
    ],
  }),
  ...DM.map(dayMasterGuide),
];
