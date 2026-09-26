"use client";
import { useState, type ReactNode } from "react";

/** Presentation only: the server authorizes access before it supplies children. No reading data is stored. */
export function ReadingTools({ children }: { children: ReactNode }) {
  const [large, setLarge] = useState(false);
  return <div className={`reading-body${large ? " reading-large" : ""}`}>
    <div className="reading-toolbar" role="group" aria-label="Reading preferences">
      <span>Make yourself comfortable.</span>
      <button type="button" aria-pressed={large} onClick={() => setLarge(v => !v)}>
        <span aria-hidden="true">Aa</span> Larger text
      </button>
    </div>
    {children}
  </div>;
}
