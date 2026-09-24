// GET /unsubscribe?t=… : confirm page (a GET never changes anything; mail scanners open links). C4.
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Unsubscribe · Haeday", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function Unsubscribe({ searchParams }: { searchParams: Promise<{ t?: string; done?: string }> }) {
  const { t, done } = await searchParams;
  return (
    <main className="app">
      <header className="brand"><Link href="/"><span aria-hidden="true" className="moon">☾</span> Haeday</Link></header>
      {done ? <h1>You&apos;re unsubscribed</h1> : <h1>Stop saju notes from Haeday?</h1>}
      {done ? <p className="lede">You won&apos;t get marketing email from us. Emails about readings you bought still arrive.</p> : (
        <form method="post" action="/api/unsubscribe"><input type="hidden" name="t" value={t ?? ""} /><button className="btn btn-primary" type="submit">Unsubscribe</button></form>
      )}
    </main>
  );
}
