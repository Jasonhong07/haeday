import Link from "next/link";
export default function Home() {
  return (
    <main>
      <header className="brand"><span aria-hidden="true" className="moon">☾</span> Haeday</header>
      <section aria-labelledby="welcome">
        <p className="eyebrow">KOREAN SAJU · A MOMENT FOR REFLECTION</p>
        <h1 id="welcome">Find your heyday,<br /><em>by moonlight.</em></h1>
        <p className="intro">A little perspective on your nature, your connections, and the year ahead.</p>
        <div className="notice" role="status">
          <span className="dot" aria-hidden="true" />
          <div><strong>Something thoughtful is taking shape.</strong><p>Haeday is in preparation. Readings will be available soon.</p></div>
        </div>
      </section>
      <footer>Rooted in Korean tradition. Made for reflection. <Link href="/method">How we calculate</Link></footer>
    </main>
  );
}
