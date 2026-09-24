import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Haeday — Find your heyday, by moonlight.",
  description: "A thoughtful introduction to Korean saju.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
