// L3: only production is indexable, and only public pages. robots.txt is advice, not access control: private
export const dynamic = "force-dynamic";
// pages are also protected by ownership checks, noindex and no-store.
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
  if (process.env.APP_ENV !== "production") return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/chart/", "/order/", "/r/", "/refund/", "/checkout/", "/admin", "/login", "/my", "/api/", "/go"] },
    sitemap: `${new URL(origin).origin}/sitemap.xml`,
  };
}
