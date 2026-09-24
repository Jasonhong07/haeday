// L3: public pages only (never charts, orders or readings).
export const dynamic = "force-dynamic";
import type { MetadataRoute } from "next";

export const PUBLIC_PATHS = ["/", "/saju", "/method", "/refunds", "/terms", "/privacy"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  if (process.env.APP_ENV !== "production") return [];
  const origin = new URL(process.env.APP_ORIGIN ?? "http://localhost:3000").origin;
  return PUBLIC_PATHS.map((p) => ({ url: `${origin}${p}`, changeFrequency: "monthly", priority: p === "/" ? 1 : 0.5 }));
}
