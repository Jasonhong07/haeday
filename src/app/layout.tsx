import type { Metadata } from "next";
import { headers } from "next/headers";
// L2: fonts are bundled from npm (SIL OFL 1.1) and served from our own origin; visitors never contact Google.
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/400-italic.css";
import "@fontsource/noto-serif-kr/500.css";
import "./globals.css";

/** Only production is indexable; staging and dev stay out of search engines. Private pages set noindex themselves. */
export function generateMetadata(): Metadata {
  const indexable = process.env.APP_ENV === "production";
  const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
  return {
    metadataBase: new URL(origin),
    title: "Haeday · Korean birth chart (saju) reading",
    openGraph: { type: "website", siteName: "Haeday", title: "Haeday · Korean birth chart (saju) reading", description: "A free Korean birth chart in under a minute, and a personal reading for $3.99. Never a subscription." },
    twitter: { card: "summary_large_image" },
    description: "Your Korean birth chart (saju) in English: a free chart in under a minute, and a personal reading for $3.99, never a subscription.",
    robots: { index: indexable, follow: indexable },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await headers(); // L1: every page renders per request so Next can stamp the CSP nonce on its scripts
  return <html lang="en"><body>{children}</body></html>;
}
