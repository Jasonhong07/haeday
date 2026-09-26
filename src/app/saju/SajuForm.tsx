"use client";
// Input screen (PRD §3): date, time mode, city autocomplete. Posts to /api/charts and opens the chart.
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { sendEvent } from "../Beacon";

type Mode = "exact" | "approximate" | "unknown";
interface Suggestion { placeId: string; label: string }
export interface SajuInitial { birthDate: string; mode: Mode; hhmm: string; placeId: string; placeLabel: string; chartGroupId?: string }

const ERRORS: Record<string, string> = {
  nonexistent_local_time: "That time didn't exist on this date because clocks sprang forward. Please check your birth time.",
  date_out_of_range: "Please choose a date between January 1, 1900 and today.",
  unknown_place: "Please pick your birth city from the list.",
  bad_format: "Please check the date and time.",
  rate_limited: "You've made a lot of charts in the last hour. Please try again a little later.",
};

export function SajuForm({ initial, today }: { initial?: SajuInitial; today: string }) {
  const router = useRouter();
  const ids = { date: useId(), time: useId(), city: useId(), list: useId(), cityHelp: useId(), timeHelp: useId() };
  const started = useRef(false); // D40 step 2, once per page view
  const [birthDate, setBirthDate] = useState(initial?.birthDate ?? "");
  const [mode, setMode] = useState<Mode>(initial?.mode ?? "exact");
  const [hhmm, setHhmm] = useState(initial?.hhmm ?? "");
  const [query, setQuery] = useState(initial?.placeLabel ?? "");
  const [place, setPlace] = useState<Suggestion | null>(initial ? { placeId: initial.placeId, label: initial.placeLabel } : null);
  const [options, setOptions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "empty" | "error" | "ready">("idle");
  const [active, setActive] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { clearTimeout(timer.current); seq.current++; }, []);

  function search(text: string) {
    clearTimeout(timer.current);
    const q = text.trim();
    const mine = ++seq.current;
    setOptions([]); setOpen(false); setActive(-1);
    if (q.length < 2) { setSearchStatus("idle"); return; }
    setSearchStatus("loading");
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`).catch(() => null);
      if (mine !== seq.current) return;
      const body = res?.ok ? await res.json().catch(() => null) as { results?: Suggestion[] } | null : null;
      if (mine !== seq.current) return;
      if (!body?.results) { setSearchStatus("error"); return; }
      setOptions(body.results); setOpen(true); setActive(body.results.length ? 0 : -1);
      setSearchStatus(body.results.length ? "ready" : "empty");
    }, 150);
  }

  function choose(s: Suggestion) { seq.current++; setPlace(s); setSearchStatus("idle"); setQuery(s.label); setOpen(false); setOptions([]); }

  function onCityKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || options.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(options[active]!); }
    else if (e.key === "Escape") setOpen(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!birthDate) return setError("Please enter your birth date.");
    if (mode !== "unknown" && !hhmm) return setError("Please enter your birth time, or choose \"I don't know\".");
    if (!place) return setError(ERRORS.unknown_place!);
    setBusy(true);
    const res = await fetch("/api/charts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ birthDate, time: mode === "unknown" ? { kind: "unknown" } : { kind: mode, hhmm }, placeId: place.placeId, ...(initial?.chartGroupId ? { chartGroupId: initial.chartGroupId } : {}) }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { id?: string; error?: string; reason?: string } | null;
    if (res?.status === 201 && body?.id) { router.push(`/chart/${body.id}`); return; }
    setBusy(false);
    setError(ERRORS[body?.reason ?? body?.error ?? ""] ?? "Something went wrong. Please try again.");
  }

  const helper = mode === "approximate" ? "Your best guess is fine. We'll note it's approximate."
    : mode === "unknown" ? "We'll read your chart from your birth date. No hour pillar." : "Local time on your birth certificate, if you have it.";

  return (
    <form onSubmit={submit} noValidate onFocus={() => { if (!started.current) { started.current = true; sendEvent("form_started"); } }}>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="field">
        <label htmlFor={ids.date}>Birth date</label>
        <input id={ids.date} className="input" type="date" min="1900-01-01" max={today} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required />
      </div>
      <div className="field">
        <span className="label" id={`${ids.time}-l`}>Birth time</span>
        <div className="seg" role="radiogroup" aria-labelledby={`${ids.time}-l`}>
          {([["exact", "I know it"], ["approximate", "Roughly"], ["unknown", "I don't know"]] as const).map(([m, label]) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} tabIndex={mode === m ? 0 : -1} onClick={() => setMode(m)}
              onKeyDown={(e) => {
                const modes: Mode[] = ["exact", "approximate", "unknown"];
                const direction = ["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : ["ArrowLeft", "ArrowUp"].includes(e.key) ? -1 : 0;
                if (!direction && e.key !== "Home" && e.key !== "End") return;
                e.preventDefault();
                const next = e.key === "Home" ? 0 : e.key === "End" ? 2 : (modes.indexOf(m) + direction + 3) % 3;
                setMode(modes[next]!);
                e.currentTarget.parentElement?.querySelectorAll("button")[next]?.focus();
              }}>{label}</button>
          ))}
        </div>
        {mode !== "unknown" && (
          <input id={ids.time} aria-label={mode === "approximate" ? "Approximate birth time" : "Birth time"} aria-describedby={ids.timeHelp}
            className="input" type="time" value={hhmm} onChange={(e) => setHhmm(e.target.value)} />
        )}
        <p className="help" id={ids.timeHelp}>{helper}</p>
      </div>
      <div className="field">
        <label htmlFor={ids.city}>Birth city</label>
        <input id={ids.city} className="input" type="text" autoComplete="off" spellCheck={false} placeholder="Start typing, e.g. Chicago"
          role="combobox" aria-autocomplete="list" aria-expanded={open && options.length > 0} aria-controls={ids.list}
          aria-activedescendant={open && active >= 0 ? `${ids.list}-${active}` : undefined} aria-describedby={ids.cityHelp}
          value={query} onKeyDown={onCityKey} onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => { setQuery(e.target.value); setPlace(null); search(e.target.value); }} />
        {open && options.length > 0 && (
          <ul className="listbox" role="listbox" id={ids.list}>
            {options.map((o, i) => (
              <li key={o.placeId} id={`${ids.list}-${i}`} role="option" aria-selected={i === active} className="option"
                onMouseDown={(e) => { e.preventDefault(); choose(o); }}>{o.label}</li>
            ))}
          </ul>
        )}
        <p className="help" role="status" aria-live="polite">{searchStatus === "loading" ? "Looking for your city…" : searchStatus === "empty" ? "No matching city. Try another spelling or a nearby larger city; location can affect charts near a time boundary." : searchStatus === "error" ? "City search is unavailable. Please try typing again in a moment." : ""}</p>
        <p className="help" id={ids.cityHelp}>Used only to adjust for your birthplace&apos;s solar time.</p>
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Reading the stars…" : "See my birth chart · Free"}</button>
    </form>
  );
}
