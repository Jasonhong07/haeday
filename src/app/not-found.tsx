import Link from "next/link";

export default function NotFound() {
  return (
    <main className="app">
      <header className="brand"><Link href="/"><span aria-hidden="true" className="moon">☾</span> Haeday</Link></header>
      <h1>We couldn&apos;t find that page</h1>
      <p className="lede">Charts and readings open only in the browser that made them, or after signing in with the email you used at checkout.</p>
      <Link className="btn btn-primary" href="/saju">See my birth chart · Free</Link>
      <p className="fine"><Link href="/login">Open your readings on another device</Link></p>
    </main>
  );
}
