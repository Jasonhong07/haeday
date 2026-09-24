// Sexagenary tables for haeday-chart (v1, v2) (D24: own implementation). Reviewed by Jason before launch.

export type Element = "wood" | "fire" | "earth" | "metal" | "water";
export type YinYang = "yin" | "yang";
export type TenGod =
  | "companion" | "rob_wealth" | "eating_god" | "hurting_officer" | "indirect_wealth"
  | "direct_wealth" | "seven_killings" | "direct_officer" | "indirect_resource" | "direct_resource";

export const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"] as const;
export const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;

const ELEMENT_ORDER: Element[] = ["wood", "fire", "earth", "metal", "water"];
export const STEM_ELEMENT: Element[] = ["wood", "wood", "fire", "fire", "earth", "earth", "metal", "metal", "water", "water"];
export const STEM_YINYANG: YinYang[] = STEMS.map((_, i) => (i % 2 === 0 ? "yang" : "yin"));
export const BRANCH_ELEMENT: Element[] = ["water", "earth", "wood", "wood", "earth", "fire", "fire", "earth", "metal", "metal", "earth", "water"];
/** Main hidden stem (本氣) of each branch, used for ten-god labels on branches. */
export const BRANCH_MAIN_STEM = [9, 5, 0, 1, 4, 2, 3, 5, 6, 7, 4, 8] as const;

export const STEM_EN = ["Yang Wood", "Yin Wood", "Yang Fire", "Yin Fire", "Yang Earth", "Yin Earth", "Yang Metal", "Yin Metal", "Yang Water", "Yin Water"];
export const BRANCH_EN = ["Rat", "Ox", "Tiger", "Rabbit", "Dragon", "Snake", "Horse", "Goat", "Monkey", "Rooster", "Dog", "Pig"];

/** Month branch that starts at each jie longitude (立春 315° → 寅). */
export const JIE_LON_TO_BRANCH: Record<number, number> = {
  315: 2, 345: 3, 15: 4, 45: 5, 75: 6, 105: 7, 135: 8, 165: 9, 195: 10, 225: 11, 255: 0, 285: 1,
};

export const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** 60-cycle index → [stemIndex, branchIndex]. */
export function split60(i: number): [number, number] {
  return [mod(i, 10), mod(i, 12)];
}
/** [stem, branch] → 60-cycle index (only valid parity pairs). */
export function join60(stem: number, branch: number): number {
  for (let i = 0; i < 60; i++) if (i % 10 === stem && i % 12 === branch) return i;
  throw new Error("invalid stem/branch pair");
}

/** 1984 is 甲子. */
export const yearIndex60 = (solarYear: number): number => mod(solarYear - 1984, 60);

/** 五虎遁: stem of the 寅 month is (2 × yearStem + 2) mod 10. */
export function monthStem(yearStem: number, monthBranch: number): number {
  return mod(2 * yearStem + 2 + mod(monthBranch - 2, 12), 10);
}

/** 五鼠遁: stem of the 子 hour is (2 × dayStem) mod 10. */
export function hourStem(dayStemForZi: number, hourBranch: number): number {
  return mod(2 * dayStemForZi + hourBranch, 10);
}

/** 子 23:00–00:59, 丑 01:00–02:59, … */
export const hourBranch = (minutesOfDay: number): number => mod(Math.floor((minutesOfDay + 60) / 120), 12);

/** Day anchor: 2000-01-01 is 戊午 (index 54), a published fact. Input: days since 1970-01-01 of the civil date. */
const ANCHOR_EPOCH_DAY = Date.UTC(2000, 0, 1) / 86_400_000;
export const dayIndex60 = (epochDay: number): number => mod(54 + (epochDay - ANCHOR_EPOCH_DAY), 60);

/** Ten-god relation of `other` stem to the day master stem. */
export function tenGod(dayMaster: number, other: number): TenGod {
  const me = ELEMENT_ORDER.indexOf(STEM_ELEMENT[dayMaster]!);
  const it = ELEMENT_ORDER.indexOf(STEM_ELEMENT[other]!);
  const samePolarity = dayMaster % 2 === other % 2;
  const rel = mod(it - me, 5); // 0 same, 1 I produce, 2 I control, 3 controls me, 4 produces me
  const table: [TenGod, TenGod][] = [
    ["companion", "rob_wealth"],
    ["eating_god", "hurting_officer"],
    ["indirect_wealth", "direct_wealth"],
    ["seven_killings", "direct_officer"],
    ["indirect_resource", "direct_resource"],
  ];
  const pair = table[rel]!;
  return samePolarity ? pair[0] : pair[1];
}
