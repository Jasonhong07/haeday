"""Third-party cross-check: our oracle vs lunar_python (6tail "lunar", a widely used Chinese 八字 library with its
own solar-term algorithm). Writes fixtures/lunar_sample.json, which tests/engine/lunar.test.ts runs through the
TypeScript engine.

How the comparison is fair: lunar_python has no time zones or solar-time correction and its solar terms are in
Beijing time. So
  * year and month pillars: feed lunar the UTC instant shifted to UTC+8 (Beijing wall clock);
  * day and hour pillars: feed lunar our local-mean-solar wall clock, with sect=2 (晚子時 keeps the current day = 야자시).
Samples within 5 minutes of a solar term or within 1 minute of an hour/day edge are skipped (the libraries' term
instants differ by about a second).

Usage: pnpm oracle:lunar   (python tools/oracle/crosscheck_lunar.py [N=3000])
"""
from __future__ import annotations
import json, random, sys
from datetime import timedelta
from lunar_python import Solar
from compute import JIE_TIMES, solar_time, wall_to_utc, year_month, day_hour
import bisect

places = json.load(open("fixtures/manifest.json", encoding="utf-8"))["places"]
# Plus 400 cities drawn from the bundled dataset (every continent, historical tz rules, date-line zones).
_rows = json.load(open("data/cities.json", encoding="utf-8"))["rows"]
for _r in random.Random(7).sample(_rows, 400):
    places[f"gn{_r[0]}"] = {"label": f"{_r[1]}, {_r[3]}", "lat": _r[4], "lon": _r[5], "tz": _r[6]}


def lunar_bazi(dt, sect=2):
    ec = Solar.fromYmdHms(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second).getLunar().getEightChar()
    ec.setSect(sect)
    return ec


def main(n: int = 3000, seed: int = 20260924):
    rnd = random.Random(seed)
    out, skipped, mismatches = [], 0, []
    keys = sorted(places)
    while len(out) < n:
        key = rnd.choice(keys); place = places[key]
        y = rnd.randint(1901, 2025)  # birth dates only: the engine rejects future dates
        mo = rnd.randint(1, 12); d = rnd.randint(1, 28)
        hh, mm = rnd.randint(0, 23), rnd.randint(0, 59)
        date, hhmm = f"{y:04d}-{mo:02d}-{d:02d}", f"{hh:02d}:{mm:02d}"
        status, cands = wall_to_utc(date, hhmm, place["tz"])
        if status == "gap":
            continue
        u = cands[0]
        i = bisect.bisect_right(JIE_TIMES, u) - 1
        near_term = min(abs((u - JIE_TIMES[i]).total_seconds()), abs((JIE_TIMES[i + 1] - u).total_seconds())) < 300
        ts, *_ = solar_time(u, place["lon"], place["tz"])
        mins = ts.hour * 60 + ts.minute + ts.second / 60
        near_edge = min(abs(((mins - 60 * e) + 720) % 1440 - 720) for e in range(1, 24, 2)) < 1 or min(mins, 1440 - mins) < 1
        if near_term or near_edge:
            skipped += 1
            continue
        ym = lunar_bazi(u.replace(tzinfo=None) + timedelta(hours=8))
        dh = lunar_bazi(ts)
        lunar = {"year": ym.getYear(), "month": ym.getMonth(), "day": dh.getDay(), "hour": dh.getTime()}
        oy, om, *_ = year_month(u)
        od, oh = day_hour(ts)
        ours = {"year": oy, "month": om, "day": od, "hour": oh}
        if ours != lunar:
            mismatches.append({"date": date, "hhmm": hhmm, "place": key, "ours": ours, "lunar": lunar})
        case = {"birthDate": date, "time": {"kind": "exact", "hhmm": hhmm}, "place": place}
        if status == "fold":
            case["foldChoice"] = "earlier"
        out.append({"input": case, "lunar": lunar})
    json.dump({"source": "lunar_python (6tail) via tools/oracle/crosscheck_lunar.py", "seed": seed, "skippedNearEdges": skipped,
               "cases": out}, open("fixtures/lunar_sample.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(f"{len(out)} samples, {skipped} skipped near edges, oracle vs lunar mismatches: {len(mismatches)}")
    for m in mismatches[:10]:
        print(m)
    if mismatches:
        sys.exit(1)


if __name__ == "__main__":
    main(*(int(a) for a in sys.argv[1:]))
