"use client";
// Interactive parts of the free chart: question answers (new revision) and the share image (PRD §4, §8).
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { SITE } from "@/lib/site";

interface Choice { label: string; body: { foldChoice: "earlier" | "later" } | { boundaryChoice: number } }

export function QuestionCard({ chartId, title, choices, allowUnknown }: { chartId: string; title: string; choices: Choice[]; allowUnknown: boolean }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (hidden) return null;
  async function answer(body: Choice["body"]) {
    setBusy(true); setError(false);
    const res = await fetch(`/api/charts/${chartId}/answer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { id?: string } | null;
    if (res?.status === 201 && json?.id) { router.push(`/chart/${json.id}`); return; }
    setBusy(false); setError(true);
  }
  return (
    <section className="card" aria-labelledby="q-title">
      <h2 id="q-title">{title}</h2>
      {error && <p className="error" role="alert">That didn&apos;t work. Please try again.</p>}
      <div className="btn-row">
        {choices.map((c) => <button key={c.label} type="button" className="btn btn-ghost" disabled={busy} onClick={() => answer(c.body)}>{c.label}</button>)}
        {allowUnknown && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setHidden(true)}>I don&apos;t know</button>}
      </div>
    </section>
  );
}

export interface ShareData { dayMasterHanja: string; dayMasterName: string; image: string; tiles: Array<{ pos: string; stem: string; branch: string; stemColor: string; branchColor: string } | null> }

const W = 1080, H = 1920;

async function drawShare(d: ShareData): Promise<string> {
  await document.fonts?.ready;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#12132A"); bg.addColorStop(1, "#1C1E3A");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const m = document.createElement("canvas"); m.width = 300; m.height = 300;
  const mg = m.getContext("2d")!;
  mg.fillStyle = "#D9B26A"; mg.beginPath(); mg.arc(150, 150, 120, 0, Math.PI * 2); mg.fill();
  mg.globalCompositeOperation = "destination-out"; mg.beginPath(); mg.arc(205, 120, 110, 0, Math.PI * 2); mg.fill();
  g.drawImage(m, W / 2 - 150, 180);
  g.textAlign = "center"; g.fillStyle = "#A7A3BE"; g.font = "600 34px 'Plus Jakarta Sans', sans-serif";
  g.fillText("MY DAY MASTER", W / 2, 580);
  g.fillStyle = "#D9B26A"; g.font = "500 230px 'Noto Serif KR', serif"; g.fillText(d.dayMasterHanja, W / 2, 830);
  g.fillStyle = "#F2ECE0"; g.font = "400 76px Fraunces, Georgia, serif"; g.fillText(d.dayMasterName, W / 2, 960);
  g.fillStyle = "#A7A3BE"; g.font = "italic 400 46px Fraunces, Georgia, serif"; g.fillText(d.image, W / 2, 1030);
  const tw = 200, gap = 26, x0 = (W - (tw * 4 + gap * 3)) / 2, y0 = 1150;
  d.tiles.forEach((t, i) => {
    const x = x0 + i * (tw + gap);
    g.fillStyle = "#A7A3BE"; g.font = "600 26px 'Plus Jakarta Sans', sans-serif"; g.fillText((t?.pos ?? "Hour").toUpperCase(), x + tw / 2, y0 - 20);
    if (!t) { g.strokeStyle = "#2E3160"; g.lineWidth = 3; g.setLineDash([12, 10]); g.strokeRect(x, y0, tw, 400); g.setLineDash([]); g.fillText("UNKNOWN", x + tw / 2, y0 + 210); return; }
    for (const [j, ch, col] of [[0, t.stem, t.stemColor], [1, t.branch, t.branchColor]] as const) {
      g.fillStyle = col; g.beginPath(); g.roundRect(x, y0 + j * 205, tw, 195, 22); g.fill();
      g.fillStyle = "#12132A"; g.font = "500 120px 'Noto Serif KR', serif"; g.fillText(ch, x + tw / 2, y0 + j * 205 + 140);
    }
  });
  g.fillStyle = "#D9B26A"; g.font = "400 54px Fraunces, Georgia, serif"; g.fillText(SITE.domain, W / 2, 1760);
  g.fillStyle = "#A7A3BE"; g.font = "400 30px 'Plus Jakarta Sans', sans-serif"; g.fillText("Korean saju · for reflection", W / 2, 1820);
  return c.toDataURL("image/png");
}

export function ShareButton({ data }: { data: ShareData }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  async function preview() { setSrc(await drawShare(data)); dialog.current?.showModal(); }
  async function share() {
    if (!src) return;
    const blob = await (await fetch(src)).blob();
    const file = new File([blob], "haeday-day-master.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] }).catch(() => undefined);
  }
  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={preview}>Share my Day Master</button>
      <dialog ref={dialog} className="sheet" aria-label="Share image preview">
        {/* eslint-disable-next-line @next/next/no-img-element -- local data: URL preview, nothing to optimize */}
        {src && <img src={src} alt={`Share image: Day Master ${data.dayMasterHanja} ${data.dayMasterName} and four pillars. No birth date, time or place.`} />}
        <p className="note">Shows your Day Master and pillars only. No birth date, time or place.</p>
        <div className="btn-row">
          <a className="btn btn-primary" href={src ?? "#"} download="haeday-day-master.png">Save image</a>
          <button type="button" className="btn btn-ghost" onClick={share}>Share…</button>
          <button type="button" className="btn btn-ghost" onClick={() => dialog.current?.close()}>Close</button>
        </div>
      </dialog>
    </>
  );
}
