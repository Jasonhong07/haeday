import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in · Haeday", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function LoginPage() {
  return (
    <main className="app">
      <header className="brand"><Link href="/"><span aria-hidden="true" className="moon">☾</span> Haeday</Link></header>
      <h1>Open your readings</h1>
      <p className="lede">Enter the email you used at checkout. We&apos;ll send a one-time sign-in link. No password needed.</p>
      <LoginForm />
    </main>
  );
}
