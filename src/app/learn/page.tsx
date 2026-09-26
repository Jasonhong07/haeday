// CC4b: guide hub. Lists published guides only; with none published it is a 404 (except the admin preview).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GUIDES } from "@/content/guides";
import { isPublished, publishedGuides } from "@/lib/guides";
import { viewerIsAdmin } from "@/server/guide-access";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return publishedGuides().length
    ? { title: "Saju guides: Korean Four Pillars explained · Haeday", description: "Plain-English guides to Korean saju: the Four Pillars, the five elements, the ten Day Masters and the year ahead.", alternates: { canonical: "/learn" } }
    : { title: "Haeday", robots: { index: false, follow: false } };
}

export default async function Learn() {
  let list = publishedGuides();
  let preview = false;
  if (!list.length) {
    if (!(await viewerIsAdmin())) notFound();
    list = GUIDES; preview = true;
  }
  const dm = list.filter((g) => g.slug.startsWith("day-master/"));
  const other = list.filter((g) => !g.slug.startsWith("day-master/"));
  return (
    <main className="reading">
      <header className="reading-head"><Link href="/" className="reading-brand"><span aria-hidden="true">☾</span> Haeday</Link></header>
      <article>
        {preview && <p className="notice" role="status" style={{ background: "#FFF3CD", padding: 12, borderRadius: 8 }}>Admin preview: no guide is approved yet, so visitors see a 404 here.</p>}
        <h1>Saju guides</h1>
        <p>Plain-English guides to Korean saju (사주), the Four Pillars.</p>
        <ul>{other.map((g) => <li key={g.slug}><Link href={`/learn/${g.slug}`}>{g.title}</Link>{preview && !isPublished(g) ? " (draft)" : ""}</li>)}</ul>
        {dm.length > 0 && <><h2>The ten Day Masters</h2><ul>{dm.map((g) => <li key={g.slug}><Link href={`/learn/${g.slug}`}>{g.title}</Link>{preview && !isPublished(g) ? " (draft)" : ""}</li>)}</ul></>}
        <Link className="btn btn-primary" href="/saju" style={{ maxWidth: 420 }}>See my birth chart · Free</Link>
      </article>
    </main>
  );
}
