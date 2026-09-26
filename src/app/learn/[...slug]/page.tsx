// CC4b: public saju guides (search traffic). Drafts are 404 except for an admin preview (see guide-access).
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { GUIDES } from "@/content/guides";
import { isPublished, resolveGuide } from "@/lib/guides";
import { viewableGuide } from "@/server/guide-access";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const slug = (await params).slug.join("/");
  const g = GUIDES.find((x) => x.slug === slug);
  if (!g || !isPublished(g)) return { title: "Haeday", robots: { index: false, follow: false } };
  return { title: `${g.title} · Haeday`, description: g.description, alternates: { canonical: `/learn/${g.slug}` }, openGraph: { title: g.title, description: g.description, type: "article" } };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string[] }> }) {
  const slug = (await params).slug.join("/");
  const v = await viewableGuide(slug);
  if (!v) notFound();
  const { guide, preview } = v;
  const sections = resolveGuide(guide);
  if (!sections) notFound();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const ld = {
    "@context": "https://schema.org", "@type": "Article", headline: guide.title, description: guide.description, dateModified: guide.updated,
    publisher: { "@type": "Organization", name: "Haeday" },
  };
  const faqLd = guide.faq?.length ? { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: guide.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) } : null;
  const json = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c");
  return (
    <main className="reading">
      <header className="reading-head"><Link href="/" className="reading-brand"><span aria-hidden="true">☾</span> Haeday</Link></header>
      <article>
        {preview && <p className="notice" role="status" style={{ background: "#FFF3CD", padding: 12, borderRadius: 8 }}>Admin preview: this page is a draft and is hidden from visitors and search engines until you approve it (and every snippet it quotes).</p>}
        <p className="reading-fine" style={{ marginTop: 0 }}><Link href="/learn">Saju guides</Link></p>
        <h1>{guide.title}</h1>
        <p style={{ fontSize: 19 }}>{guide.intro}</p>
        {sections.map((s) => (
          <section key={s.heading}>
            <h2>{s.heading}</h2>
            {s.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          </section>
        ))}
        {guide.faq && guide.faq.length > 0 && (
          <section>
            <h2>Questions</h2>
            {guide.faq.map((f) => <div key={f.q}><h3 style={{ fontSize: 18, marginBottom: 4 }}>{f.q}</h3><p style={{ marginTop: 0 }}>{f.a}</p></div>)}
          </section>
        )}
        <section style={{ marginTop: 32 }}>
          <Link className="btn btn-primary" href="/saju" style={{ maxWidth: 420 }}>See my birth chart · Free</Link>
          <p className="reading-fine">For entertainment and reflection. Not a prediction or professional advice. <Link href="/method">How we calculate charts</Link>.</p>
        </section>
      </article>
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: json(ld) }} />
      {faqLd && <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: json(faqLd) }} />}
    </main>
  );
}
