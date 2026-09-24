"use client";
// R13: last-resort page when even the layout fails. No error details are shown.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en"><body style={{ background: "#12132A", color: "#F2ECE0", fontFamily: "sans-serif", padding: 24 }}>
      <h1>Something went wrong on our side</h1>
      <p>Please try again in a minute.</p>
      <button type="button" onClick={reset}>Try again</button>
    </body></html>
  );
}
