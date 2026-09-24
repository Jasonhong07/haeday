"""One-off: derive admin1 (state/region) display names for GeoNames cities15000.

GeoNames' own admin1CodesASCII.txt is the ideal source but download.geonames.org is blocked from our build
network. reverse_geocoder 1.5.1 (PyPI, MIT) ships rg_cities1000.csv, a GeoNames-derived table that carries
admin1 *names*. We join each cities15000 row to it (same country, same name, coordinates within 0.01°) and take
the majority name per (country, admin1 code). Output: data/admin1_names.json {"US.IL": "Illinois", ...}.

Usage: python tools/places/derive_admin1.py <path to rg_cities1000.csv>
"""
import csv, json, sys
from collections import Counter, defaultdict

rg = defaultdict(list)
with open(sys.argv[1], encoding="utf-8") as f:
    for r in csv.DictReader(f):
        rg[(r["cc"], r["name"])].append((float(r["lat"]), float(r["lon"]), r["admin1"]))

rows = [line.rstrip("\n").split("\t") for line in open("data/cities15000.txt", encoding="utf-8")]


def vote(tolerance: float, only: set[str] | None) -> dict[str, Counter]:
    votes: dict[str, Counter] = defaultdict(Counter)
    for c in rows:
        cc, code, lat, lon = c[8], c[10], float(c[4]), float(c[5])
        key = f"{cc}.{code}"
        if not code or code == "00" or (only is not None and key not in only):
            continue
        for name in {c[1], c[2]}:
            for rlat, rlon, admin1 in rg.get((cc, name), []):
                if admin1 and abs(rlat - lat) < tolerance and abs(rlon - lon) < tolerance:
                    votes[key][admin1] += 1
    return votes


# Pass 1: tight match. Pass 2 (codes still unnamed, e.g. renumbered regions): looser coordinates.
out = {k: v.most_common(1)[0][0] for k, v in vote(0.01, None).items()}
all_codes = {f"{c[8]}.{c[10]}" for c in rows if c[10] and c[10] != "00"}
out |= {k: v.most_common(1)[0][0] for k, v in vote(0.2, all_codes - out.keys()).items()}
out = dict(sorted(out.items()))
print("unnamed codes (label falls back to City, Country):", len(all_codes - out.keys()))
json.dump(out, open("data/admin1_names.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0, sort_keys=True)
print(len(out), "admin1 names")
