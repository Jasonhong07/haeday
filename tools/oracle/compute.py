"""Independent oracle for ENGINE_SPEC haeday-chart-v1. Shares only data/jie_1900_2050.json with the engine
(after re-verifying it against Skyfield). Everything else (tz conversion, EoT, sexagenary math) is separate code."""
from __future__ import annotations
import bisect, json
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, reset_tzpath

# Use the pinned tzdata wheel on Linux as well as Windows, not the host OS database.
reset_tzpath(())
from sexagenary import BRANCHES, JIE_LON_TO_BRANCH, STEMS, day_index, ganzhi, hour_ganzhi, month_ganzhi, year_index
from astro import eot_minutes

UTC = timezone.utc
_jie = json.load(open("data/jie_1900_2050.json", encoding="utf-8"))["jie"]
JIE_TIMES = [datetime.strptime(r["utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC) for r in _jie]
JIE_LONS = [r["lon"] for r in _jie]
LICHUN_TIMES = [t for t, lon in zip(JIE_TIMES, JIE_LONS) if lon == 315]


def iso(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def wall_to_utc(d: str, hhmm: str, tz: str):
    """Returns ("valid", [utc]) | ("fold", [earlier, later]) | ("gap", [])."""
    y, m, dd = map(int, d.split("-")); h, mi = map(int, hhmm.split(":"))
    z = ZoneInfo(tz)
    cands = []
    for fold in (0, 1):
        local = datetime(y, m, dd, h, mi, fold=fold, tzinfo=z)
        u = local.astimezone(UTC)
        back = u.astimezone(z)
        if (back.year, back.month, back.day, back.hour, back.minute) == (y, m, dd, h, mi) and u not in cands:
            cands.append(u)
    cands.sort()
    if not cands:
        return "gap", []
    return ("fold" if len(cands) == 2 else "valid"), cands


def std_offset_minutes(u: datetime, tz: str) -> int:
    local = u.astimezone(ZoneInfo(tz))
    return (local.utcoffset() - (local.dst() or timedelta(0))).total_seconds() / 60  # exact (LMT offsets have seconds)


def wrap180(x: float) -> float:
    r = (x + 180) % 360 - 180
    return 180.0 if r == -180 else r


def true_solar(u: datetime, lon: float, tz: str):
    std = std_offset_minutes(u, tz)
    meridian = std / 4.0  # degrees (60 min per 15 degrees)
    lon_corr = wrap180(lon - meridian) * 4.0
    eot = eot_minutes(u.replace(tzinfo=None))
    ts = u.astimezone(UTC).replace(tzinfo=None) + timedelta(minutes=std + lon_corr + eot)
    return ts, std, lon_corr, eot


def year_month(u: datetime):
    i = bisect.bisect_right(JIE_TIMES, u) - 1  # boundary instant belongs to the new period
    lon = JIE_LONS[i]
    # Bounded search: the preceding lichun is absent at the table's start.
    j = bisect.bisect_right(LICHUN_TIMES, u) - 1
    solar_year = LICHUN_TIMES[j].year if j >= 0 else LICHUN_TIMES[0].year - 1
    yi = year_index(solar_year)
    return ganzhi(yi), month_ganzhi(yi % 10, JIE_LON_TO_BRANCH[lon]), JIE_TIMES[i], JIE_TIMES[i + 1]


def day_hour(ts: datetime, day_boundary: str = "midnight", with_hour: bool = True):
    d = ts.date()
    mins = ts.hour * 60 + ts.minute
    if day_boundary == "zi_23" and mins >= 23 * 60:
        d = d + timedelta(days=1)
    di = day_index(d.year, d.month, d.day)
    day = ganzhi(di)
    hour = None
    if with_hour:
        stem_for_zi = di % 10
        if day_boundary == "midnight" and mins >= 23 * 60:
            stem_for_zi = (di + 1) % 10  # 23:00-23:59 uses the next day's stem
        hour = hour_ganzhi(stem_for_zi, mins)
    return day, hour


def warnings_for(u: datetime, ts: datetime, jb: datetime, ja: datetime, birth_year: int, approximate: bool, with_hour: bool):
    w = []
    mins = ts.hour * 60 + ts.minute + ts.second / 60
    hour_window = 60 if approximate else 5
    if with_hour:
        # hour-branch edges are at odd hours (23:00, 01:00, ...)
        dist = min(abs(((mins - (60 * e)) + 720) % 1440 - 720) for e in range(1, 24, 2))
        if dist <= hour_window:
            w.append("hourBoundary")
        if min(mins, 1440 - mins) <= (hour_window if approximate else 5):
            w.append("dayBoundary")
    if min(abs((u - jb).total_seconds()), abs((ja - u).total_seconds())) <= 30 * 60:
        w.append("termBoundary")
    if birth_year < 1970:
        w.append("pre1970Tz")
    if approximate:
        w.append("approximateTime")
    return w


def chart_at(u: datetime, place: dict, with_hour=True, day_boundary="midnight", birth_year=2000, approximate=False):
    ts, std, lon_corr, eot = true_solar(u, place["lon"], place["tz"])
    y, m, jb, ja = year_month(u)
    d, h = day_hour(ts, day_boundary, with_hour)
    return {"utc": iso(u), "stdOffsetMinutes": round(std, 3), "lonCorrectionMin": round(lon_corr, 3), "eotMin": round(eot, 3),
            "trueSolar": ts.strftime("%Y-%m-%dT%H:%M:%S"), "jieBefore": iso(jb), "jieAfter": iso(ja),
            "pillars": {"year": y, "month": m, "day": d, "hour": h},
            "warnings": warnings_for(u, ts, jb, ja, birth_year, approximate, with_hour)}


def unknown_groups(birth_date: str, place: dict):
    """Exhaustive minute enumeration (ENGINE_SPEC §4)."""
    groups = []
    for minute in range(1440):
        hhmm = f"{minute // 60:02d}:{minute % 60:02d}"
        status, cands = wall_to_utc(birth_date, hhmm, place["tz"])
        for u in cands:
            c = chart_at(u, place, with_hour=False)
            key = (c["pillars"]["year"], c["pillars"]["month"], c["pillars"]["day"])
            if groups and groups[-1]["key"] == key:
                groups[-1]["to"] = hhmm; groups[-1]["minutes"] += 1
            else:
                groups.append({"key": key, "from": hhmm, "to": hhmm, "minutes": 1})
    return [{"from": g["from"], "to": g["to"], "minutes": g["minutes"],
             "pillars": {"year": g["key"][0], "month": g["key"][1], "day": g["key"][2]}} for g in groups]


def compute_case(case: dict) -> dict:
    place, t = case["place"], case["time"]
    if t["kind"] == "unknown":
        groups = unknown_groups(case["birthDate"], place)
        if not groups:  # the whole civil date was skipped (e.g. Samoa 2011-12-30)
            return {"kind": "invalid_input", "reason": "nonexistent_local_time"}
        return {"kind": "unknown", "groups": groups}
    status, cands = wall_to_utc(case["birthDate"], t["hhmm"], place["tz"])
    if status == "gap":
        return {"kind": "invalid_input", "reason": "nonexistent_local_time"}
    if status == "fold" and not case.get("foldChoice"):
        return {"kind": "needs_fold_choice", "utcCandidates": [iso(c) for c in cands]}
    u = cands[-1] if case.get("foldChoice") == "later" else cands[0]
    out = {"kind": "computed", **chart_at(u, place, True, case.get("dayBoundary", "midnight"),
                                          int(case["birthDate"][:4]), t["kind"] == "approximate")}
    if status == "fold":
        out["utcCandidates"] = [iso(c) for c in cands]
    return out
