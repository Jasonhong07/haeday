// CC4b: guide pages are public only after Jason approves the page AND every snippet it quotes.
import { describe, expect, it } from "vitest";
import { DAY_MASTER_GUIDES, GUIDES } from "../src/content/guides";
import { DAY_MASTERS } from "../src/content/library";
import { DAY_MASTER_SNIPPETS, YEAR_2027_BY_DM } from "../src/content/snippets";
import { isPublished, publishedGuides, resolveGuide } from "../src/lib/guides";
import sitemap from "../src/app/sitemap";

describe("guides (CC4b)", () => {
  it("every guide resolves (no missing snippet), slugs are unique, descriptions fit search snippets", () => {
    expect(new Set(GUIDES.map((g) => g.slug)).size).toBe(GUIDES.length);
    for (const g of GUIDES) {
      expect(resolveGuide(g), g.slug).not.toBeNull();
      expect(g.description.length, g.slug).toBeLessThanOrEqual(170);
      expect(g.slug).toMatch(/^[a-z0-9-]+(\/[a-z0-9-]+)?$/);
    }
    expect(DAY_MASTER_GUIDES.map((d) => d.stem).sort()).toEqual(Object.keys(DAY_MASTERS).sort());
  });

  it("nothing is published today (all drafts), so the sitemap lists no guide", () => {
    expect(publishedGuides()).toEqual([]);
    const prev = { env: process.env.APP_ENV, origin: process.env.APP_ORIGIN };
    process.env.APP_ENV = "production"; process.env.APP_ORIGIN = "https://haeday.net";
    try { expect(sitemap().map((e) => e.url).some((u) => u.includes("/learn"))).toBe(false); }
    finally { process.env.APP_ENV = prev.env; process.env.APP_ORIGIN = prev.origin; }
  });

  it("a page approval alone is not enough when it quotes unapproved snippets; both → published", () => {
    const g = GUIDES.find((x) => x.slug === "day-master/yin-wood")!;
    const snippets = [...DAY_MASTER_SNIPPETS["乙"]!, YEAR_2027_BY_DM["乙"]!];
    const saved = { page: g.approvedBy, sn: snippets.map((s) => s.approvedBy) };
    try {
      (g as { approvedBy: string | null }).approvedBy = "jason";
      expect(isPublished(g)).toBe(false);
      for (const s of snippets) (s as { approvedBy: string | null }).approvedBy = "jason";
      expect(isPublished(g)).toBe(true);
      const intro = GUIDES.find((x) => x.slug === "what-is-saju")!; // quotes no snippet: page approval is enough
      expect(isPublished(intro)).toBe(false);
    } finally {
      (g as { approvedBy: string | null }).approvedBy = saved.page;
      snippets.forEach((s, i) => { (s as { approvedBy: string | null }).approvedBy = saved.sn[i]!; });
    }
  });

  it("guide copy stays within the reading's tone rules (no predictions, health, money or luck promises)", () => {
    const banned = /\b(will (?:meet|marry|get rich|become)|guarantee|cure|diagnos|lottery|invest(?:ment)? advice|you will die|unlucky for you)\b/i;
    for (const g of GUIDES) {
      const text = [g.title, g.description, g.intro, ...g.sections.flatMap((s) => s.paragraphs ?? []), ...(g.faq ?? []).flatMap((f) => [f.q, f.a])].join(" ");
      expect(text, g.slug).not.toMatch(banned);
    }
  });
});
