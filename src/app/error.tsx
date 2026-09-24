"use client";
// R13: friendly failure page. Never shows the error message, stack or any configuration detail (D18).
import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="app">
      <header className="brand"><Link href="/"><span aria-hidden="true" className="moon">☾</span> Haeday</Link></header>
      <h1>Something went wrong on our side</h1>
      <p className="lede" role="status">Nothing you did caused this, and nothing was charged by this page. Please try again in a minute.</p>
      <button className="btn btn-primary" type="button" onClick={reset}>Try again</button>
      <p className="fine"><Link href="/">Back to the start</Link></p>
    </main>
  );
}
