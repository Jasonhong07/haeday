import type { Metadata } from "next";
import "./globals.css";

/** Only production is indexable; staging and dev stay out of search engines. Private pages set noindex themselves. */
export function generateMetadata(): Metadata {
  const indexable = process.env.APP_ENV === "production";
  return {
    title: "Haeday · Korean birth chart (saju) reading",
    description: "Your Korean birth chart (saju) in English: a free chart in under a minute, and a personal reading for $3.99, never a subscription.",
    robots: { index: indexable, follow: indexable },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
