import Link from "next/link";
export default function Home() {
  return (
    <main>
      <header className="brand"><span aria-hidden="true" className="moon">☾</span> Haeday</header>
      <section aria-labelledby="welcome">
        <p className="eyebrow">KOREAN SAJU · A MOMENT FOR REFLECTION</p>
        <h1 id="welcome">Find your heyday,<br /><em>by moonlight.</em></h1>
        <p className="intro">Your Korean birth chart (saju) shows your nature and your timing. Free chart in under a minute. Full reading $3.99, never a subscription.</p>
        <Link className="btn btn-primary" href="/saju" style={{ maxWidth: 420 }}>See my birth chart · Free</Link>
        <div className="notice" role="status" style={{ marginTop: 20 }}>
          <span className="dot" aria-hidden="true" />
          <div><strong>Full readings open soon.</strong><p>The free chart is ready now. Paid readings are not yet available.</p></div>
        </div>
      </section>
      <footer>AI-assisted · For entertainment and reflection · Not advice · <Link href="/method">How we calculate</Link></footer>
    </main>
  );
}
