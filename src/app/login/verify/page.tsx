// Magic link landing: GET only shows a button; the POST consumes the token (mail scanners can't sign anyone in).
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Confirm sign in · Haeday", robots: { index: false, follow: false }, referrer: "no-referrer" };

const ERRORS: Record<string, string> = {
  used: "This link was already used. Request a new one below.",
  expired: "This link has expired (links last 15 minutes). Request a new one below.",
  invalid: "This link isn't valid. Request a new one below.",
};

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string; next?: string; error?: string }> }) {
  const { token, next, error } = await searchParams;
  return (
    <main className="app">
      <header className="brand"><Link href="/"><span aria-hidden="true" className="moon">☾</span> Haeday</Link></header>
      <h1>{error ? "Sign-in link problem" : "Confirm sign in"}</h1>
      {error ? (
        <>
          <p className="error" role="alert">{ERRORS[error] ?? ERRORS.invalid}</p>
          <Link className="btn btn-primary" href="/login">Get a new link</Link>
        </>
      ) : (
        <form method="post" action="/api/auth/verify" className="card">
          <input type="hidden" name="token" value={token ?? ""} />
          <input type="hidden" name="next" value={next ?? "/my"} />
          <p style={{ marginTop: 0 }}>Tap to finish signing in on this device.</p>
          <button className="btn btn-primary" type="submit">Sign in</button>
        </form>
      )}
    </main>
  );
}
