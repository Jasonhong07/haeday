// Share image data (C6): Day Master + the eight characters only. Never the birth date, time, place, or any
// reading text. Built on the server, drawn in the browser; nothing is uploaded or given a public URL.
import type { ShareData } from "@/app/chart/[id]/ChartClient";

export const EL_HEX = { wood: "#5FA97A", fire: "#E0685A", earth: "#D9B26A", metal: "#C9CCD6", water: "#6FA0D8" } as const;
export const POSITIONS = [["hour", "Hour"], ["day", "Day"], ["month", "Month"], ["year", "Year"]] as const;
type P = { stem: string; branch: string; stemElement: string; branchElement: string } | null | undefined;

export function shareData(dm: { stem: string; name: string; image: string }, pillars: Record<string, P>): ShareData {
  const hex = (e: string) => EL_HEX[e as keyof typeof EL_HEX] ?? "#A7A3BE";
  return {
    dayMasterHanja: dm.stem, dayMasterName: dm.name, image: dm.image,
    tiles: POSITIONS.map(([key, label]) => {
      const p = pillars[key];
      return p ? { pos: label, stem: p.stem, branch: p.branch, stemColor: hex(p.stemElement), branchColor: hex(p.branchElement) } : null;
    }),
  };
}
