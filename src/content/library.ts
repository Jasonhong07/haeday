// Free-chart copy from the content library (PRD §9). DRAFT: written by Claude, not yet approved by Jason.
// Paid readings may only use approved entries; the free chart shows these drafts until approval replaces them.
export const LIBRARY_VERSION = "draft-1";
export const LIBRARY_APPROVED = false;

export interface DayMasterEntry { stem: string; name: string; image: string; line: string }

/** Keyed by heavenly stem (the day master). */
export const DAY_MASTERS: Record<string, DayMasterEntry> = {
  甲: { stem: "甲", name: "Yang Wood", image: "The tall tree", line: "You grow toward the light in a straight line: principled, steady, and quietly protective of the people who shelter under your branches." },
  乙: { stem: "乙", name: "Yin Wood", image: "The climbing vine", line: "You find a way through: adaptable, sociable, and far more resilient than you look, turning every obstacle into something to grow along." },
  丙: { stem: "丙", name: "Yang Fire", image: "The sun", line: "You warm a room simply by entering it: generous, open, and happiest when your energy lights up the people around you." },
  丁: { stem: "丁", name: "Yin Fire", image: "The candle", line: "You glow close up: perceptive, devoted, and able to bring warmth and clarity to one person or one idea at a time." },
  戊: { stem: "戊", name: "Yang Earth", image: "The mountain", line: "You are the solid ground others lean on: dependable, patient, and hard to move once you have decided what matters." },
  己: { stem: "己", name: "Yin Earth", image: "The garden soil", line: "You nurture what is planted near you: practical, caring, and skilled at turning small beginnings into something that lasts." },
  庚: { stem: "庚", name: "Yang Metal", image: "The sword", line: "You cut to what matters: decisive, loyal, and at your best when there is something worth defending." },
  辛: { stem: "辛", name: "Yin Metal", image: "The jewel", line: "You notice what others miss: refined, sensitive, and quietly exacting about beauty, fairness, and detail." },
  壬: { stem: "壬", name: "Yang Water", image: "The ocean", line: "You move with big currents: curious, far-seeing, and restless when life becomes too small or too still." },
  癸: { stem: "癸", name: "Yin Water", image: "The rain", line: "You reach everywhere quietly: intuitive, imaginative, and able to soften hard ground for the people you care about." },
};

export const ELEMENT_LABEL: Record<"wood" | "fire" | "earth" | "metal" | "water", { en: string; hanja: string }> = {
  wood: { en: "Wood", hanja: "木" }, fire: { en: "Fire", hanja: "火" }, earth: { en: "Earth", hanja: "土" },
  metal: { en: "Metal", hanja: "金" }, water: { en: "Water", hanja: "水" },
};

export const OFFER_ITEMS = [
  "Your Day Master in depth", "Your elements in balance", "Love and relationships",
  "Work and money mindset", "Your 2027 energy", "One question to reflect on",
];
