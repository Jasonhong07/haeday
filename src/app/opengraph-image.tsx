// L3: the site-wide share preview. Static brand art only; no personal chart or reading is ever rendered here.
import { ImageResponse } from "next/og";

export const alt = "Haeday: your Korean birth chart (saju), by moonlight";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "linear-gradient(180deg,#12132A,#1C1E3A)", color: "#F2ECE0" }}>
        <div style={{ fontSize: 40, color: "#D9B26A", display: "flex" }}>☾ Haeday</div>
        <div style={{ fontSize: 76, lineHeight: 1.1, marginTop: 24, display: "flex" }}>Find your heyday, by moonlight.</div>
        <div style={{ fontSize: 32, color: "#A7A3BE", marginTop: 28, display: "flex" }}>Free Korean birth chart · personal reading $3.99 · no subscription</div>
      </div>
    ),
    size,
  );
}
