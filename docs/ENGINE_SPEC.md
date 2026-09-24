# ENGINE_SPEC · policy `haeday-chart-v1`

Source of truth for chart math. Any rule change = new policyVersion + fixture review. Decisions: D06, D09, D10.

## 0. Conventions
- Longitude east positive, west negative. Minutes are exact integers unless stated. Birth minute `HH:mm` means `HH:mm:00`.
- A boundary instant belongs to the NEW period (at exactly 立春 the new year starts).
- Displayed times are rounded only after computation.
- "Coverage" (what we have verified) and "age" (buyer must be 18+) are separate. The chart subject can be anyone; the buyer attests 18+.

## 1. Input
```ts
type ChartInput = {
  birthDate: string;              // "YYYY-MM-DD", Gregorian, 1900-01-01 .. today
  time:
    | { kind: "exact"; hhmm: string }          // "HH:mm" 24h local wall clock
    | { kind: "approximate"; hhmm: string }    // customer's best guess, treated like exact, flagged
    | { kind: "unknown" };
  placeId: string;                // server resolves lat, lon, IANA tz from the bundled city dataset. Client never sends lat/lon/tz.
  foldChoice?: "earlier" | "later";          // only when the wall time occurs twice
  boundaryChoice?: number;                   // index of the time window picked from questions[0].windows (§4, D25)
};
```

## 2. Pipeline
1. **Resolve place** → `{lat, lon, tz, meridian}` where `meridian` = the tz standard offset in hours × 15 at that date (e.g. America/New_York standard UTC-5 → -75°).
2. **Wall clock → UTC** using the pinned tz data (D12). Detect:
   - `gap` (wall time does not exist, e.g. 2024-03-10 02:30 New York) → `invalid_input: nonexistent_local_time`. Never auto-shift.
   - `fold` (occurs twice, e.g. 2024-11-03 01:30 New York) → if no `foldChoice`, return `needs_fold_choice` with both UTC candidates.
   - Round-trip check: converting the UTC back must give the same wall time and offset.
   - The historical offset already contains DST. Never subtract DST again.
3. **Year and month pillars** from the UTC birth instant compared with the canonical jie (節) table (§5). Month stem via 五虎遁 from the year stem of the same solar year.
4. **True solar time, anchored to the civil date:**
   - `standardClock = UTC + standardOffset` (standard offset at that date, DST excluded).
   - `lonCorrectionMin = wrap180(lon − meridian) × 4` where wrap180 maps to (−180°, 180°]. This keeps date-line places anchored to their civil date.
   - `trueSolar = standardClock + lonCorrectionMin + EoT(UTC)` as a full datetime (date may roll forward/back).
   - EoT: NOAA solar calculator (Meeus) formulation, minutes. Record `eotMethod: "noaa-meeus"` (D26).
5. **Day pillar** from the trueSolar date via the 60-day cycle. Anchor: 1900-01-31 is 甲辰 (verify against at least two independent published 만세력 references and record them in DECISIONS before M1 is done). Boundary policy `dayBoundary: "midnight"`: 23:00–23:59 trueSolar keeps the current day pillar.
6. **Hour pillar**: branch from trueSolar (子 23:00–00:59, 丑 01:00–02:59, ...). Stem via 五鼠遁 from the day stem; for 23:00–23:59 use the NEXT day's stem.
7. **Derived facts**, always recomputed from the final pillars of that candidate:
   - `dayMaster` {stem, element, yinYang}
   - `visibleElements`: counts over visible characters, denominator 8 (or 6 when hour is null). Label in UI: "visible element count", not a strength analysis.
   - `tenGods`: for each position except the day stem: stems use the stem relation table; branches use their main hidden stem (본기) table. Both tables live in `server/engine/tables.ts` and are reviewed by Jason.
   - Pillar carries `stemElement` and `branchElement` separately.
8. **Warnings** (never block sales, D06): `hourBoundary` (trueSolar within ±5 min of an hour-branch edge), `dayBoundary` (±5 min of 00:00 trueSolar), `termBoundary` (UTC within ±30 min of a jie instant), `pre1970Tz`, `approximateTime`. For each warning, compute the alternative candidate and include it.

## 3. Output (discriminated union)
```ts
type ChartResponse =
  | { kind: "computed"; chart: Chart; alternatives: Candidate[]; warnings: Warning[]; questions: [] }
  | { kind: "needs_fold_choice"; utcCandidates: [string, string] }
  | { kind: "invalid_input"; reason: "nonexistent_local_time" | "date_out_of_range" | "unknown_place" | "bad_format" }
  | { kind: "engine_error"; referenceId: string };

type Chart = {
  pillars: { year: Pillar; month: Pillar; day: Pillar; hour: Pillar | null };
  dayMaster: { stem: string; element: Element; yinYang: "yin" | "yang" };
  visibleElements: Record<Element, number>; denominator: 6 | 8;
  tenGods: Array<{ position: Position; god: TenGod }>;
  timeBasis: "exact" | "approximate" | "unknown";
  disclosure: string | null;      // exact customer-facing sentence when a default was applied
  policyVersion: "haeday-chart-v1"; coverageVersion: string;
  audit: Audit;                    // input wall time, tz, tzdataVersion, utc (or interval list), offset, lonCorrectionMin, eotMin, trueSolar, jieBefore, jieAfter
};
```
Checkout never trusts client flags. It re-reads the stored chart revision (ARCHITECTURE §orders snapshot).

## 4. Unknown time (D06: always sellable)
1. Enumerate every local minute 00:00–23:59 of the birth date (fold minutes twice, gap minutes skipped) and compute year/month/day pillars for each. With minute-precision input this enumeration is exhaustive, so no boundary can be missed.
2. Group minutes into contiguous windows by (year, month, day) pillars.
3. If only one group: chart with hour = null, no question.
4. If several groups (D25): return `computed` with the default chart plus `questions[0] = { type: "timeWindow", windows, defaultIndex }`.
   - `askCustomer` is true only when windows differ in year or month pillar. Then the UI asks "Were you born between …?" with an "I don't know" option; re-computing with `boundaryChoice = windowIndex` uses that group. Day-only splits are disclosed without a question (D25).
   - Without a choice → the group that contains the most local minutes is the **default**, and `disclosure` states every other window exactly, e.g. "If you were born between 11:40 PM and 11:59 PM, your day pillar would be 癸酉 (Yin Water Rooster) instead of 壬申." Never call it "most likely".
   - Observation from fixtures: because the solar correction is almost never zero, nearly every unknown-time date has a small day-split window at one end of the day.
5. Hour pillar = null, denominator 6, and the reading contract excludes hour-pillar topics.
6. Approximate time is computed like exact time, `timeBasis: "approximate"`, and `hourBoundary` warnings use ±60 min instead of ±5 min.

## 5. Canonical jie table and oracle
- `data/jie_1900_2050.json` (D21): UTC instants (second precision) of the 12 jie (Sun apparent ecliptic longitude 315°, 345°, 15°, …, step 30°), generated ONCE by the Python oracle with Skyfield + DE421 (`skyfield-data`), file name and hash recorded, time scale converted TT→UTC. Both engine and oracle read this file for year/month boundaries, so boundaries never disagree.
- Engine and oracle compute EoT independently (NOAA vs Skyfield). Tolerance: |ΔEoT| ≤ 30 s. If a trueSolar value is within tolerance of an hour or day boundary, the fixture must assert the warning, not a single answer.
- `pnpm oracle:verify` (CI, read-only) and `pnpm oracle:update` (manual, produces a diff for Jason to approve). CI never rewrites expected values.
- The day-cycle anchor is a published fact, not something copied from our own code.

## 6. Fixtures (`fixtures/manifest.json`, each case has id, input, expected per step, source, tolerance)
Minimum 30 cases:
- F01–F04 ordinary: Seoul, New York, Los Angeles, Chicago (known times, 1985–2000)
- F05–F06 DST fold/gap at the timezone layer (2024 dates allowed here; this is a low-level test)
- F07–F08 DST fold/gap in the supported product range (e.g. New York 1995-10-29 01:30 fold, 1995-04-02 02:30 gap)
- F09–F10 date rollover by solar correction (Anchorage summer after midnight, a far-west-in-zone city early morning)
- F11–F14 trueSolar at 22:58, 23:02, 23:58, 00:02 (hour and day boundaries)
- F15–F20 立春 and one mid-year jie: 1 min before, exact minute, 1 min after (from the canonical table)
- F21–F23 unknown time: day split by solar correction, DST date, jie date (month and year split)
- F24–F25 historical: Seoul 1955-06 (UTC+8:30), Seoul 1987-07 (Korean DST)
- F26–F27 no-DST zones: Phoenix, Honolulu
- F28 Indianapolis 1990 vs 2010 same wall time: assert different UTC offsets
- F29 Sydney summer (southern hemisphere, no season flip)
- F30 date-line: Kiritimati (UTC+14), civil-date anchoring via wrap180
- F12z zi_23 day boundary variant, F28a/F28b Indianapolis pair, F31 approximate time
Founder cross-check (`docs/crosscheck.md`): 10 cases in two Korean apps with overseas-birth settings. Differences must be explained by policy (EoT, 자시, solar correction) or investigated.

## 7. Coverage
`coverageVersion: "cov-1"`: birth years 1900–present (jie table to 2050), all cities in the bundled dataset. `pre1970Tz` warning only. City dataset: GeoNames cities15000 (CC BY 4.0, attribute on /method). Same-name cities show "City, State/Region, Country" in autocomplete.
