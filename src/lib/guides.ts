// CC4b: which guide pages are public. A page is published only when the page AND every snippet it quotes are
// approved by Jason (the snippet gate is the same one the paid reading uses in production).
import { GUIDES, type Guide } from "@/content/guides";
import { DAY_MASTER_SNIPPETS, YEAR_2027_BY_DM, type Snippet } from "@/content/snippets";

const SNIPPETS: Map<string, Snippet> = new Map([...Object.values(DAY_MASTER_SNIPPETS).flat(), ...Object.values(YEAR_2027_BY_DM)].map((s) => [s.id, s]));

export type ResolvedSection = { heading: string; paragraphs: string[] };

/** Section text with snippet ids replaced by their text; null if a referenced snippet does not exist. */
export function resolveGuide(g: Guide): ResolvedSection[] | null {
  const out: ResolvedSection[] = [];
  for (const s of g.sections) {
    const quoted: string[] = [];
    for (const id of s.snippetIds ?? []) {
      const sn = SNIPPETS.get(id);
      if (!sn) return null;
      quoted.push(sn.text);
    }
    out.push({ heading: s.heading, paragraphs: [...quoted, ...(s.paragraphs ?? [])] });
  }
  return out;
}

export function isPublished(g: Guide): boolean {
  if (g.approvedBy !== "jason" || !resolveGuide(g)) return false;
  return g.sections.every((s) => (s.snippetIds ?? []).every((id) => SNIPPETS.get(id)?.approvedBy === "jason"));
}

export const publishedGuides = (): Guide[] => GUIDES.filter(isPublished);
export const guideBySlug = (slug: string): Guide | undefined => GUIDES.find((g) => g.slug === slug);
