import Link from "next/link";
import { LEGAL_APPROVED } from "@/lib/legal";
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="reading">
      <header className="reading-head"><Link href="/" className="reading-brand"><span aria-hidden="true">☾</span> Haeday</Link></header>
      <article>
        <h1>{title}</h1>
        <p className="reading-fine" style={{ marginTop: 0 }}>Last updated {updated}.{LEGAL_APPROVED ? "" : " Draft for review; not yet final."}</p>
        {children}
      </article>
    </main>
  );
}
