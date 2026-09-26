// L3: public pages only (never charts, orders or readings).
export const dynamic = "force-dynamic";
import type { MetadataRoute } from "next";
import { publishedGuides } from "@/lib/guides";

export const PUBLIC_PATHS = ["/", "/saju", "/method", "/refunds", "/terms", "/privacy"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  if (process.env.APP_ENV !== "production") return [];
  const origin = new URL(process.env.APP_ORIGIN ?? "http://localhost:3000").origin;
  const guides = publishedGuides();
  // CC4b: only approved guides (drafts are 404 and must never be advertised to search engines).
  const learn = guides.length ? ["/learn", ...guides.map((g) => `/learn/${g.slug}`)] : [];
  return [...PUBLIC_PATHS, ...learn].map((p) => ({ url: `${origin}${p}`, changeFrequency: "monthly", priority: p === "/" ? 1 : p.startsWith("/learn") ? 0.7 : 0.5 }));
}
