"""Generates data/jie_1900_2050.json (D21). Run via `pnpm oracle:update`; Jason approves the diff."""
import json, sys
from astro import EPH_NAME, ephemeris_sha256, jie_instants

START, END = 1900, 2050
rows = [{"utc": dt.strftime("%Y-%m-%dT%H:%M:%SZ"), "lon": lon} for dt, lon in jie_instants((1899, 8, 1), (END + 1, 1, 1))]
data = {"source": f"skyfield + {EPH_NAME}", "ephemerisSha256": ephemeris_sha256(), "range": [START, END],
        "note": "12 jie (節) per year, UTC, second precision. Boundary instant belongs to the new period.", "jie": rows}
out = sys.argv[1] if len(sys.argv) > 1 else "data/jie_1900_2050.json"
with open(out, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=0)
print(f"wrote {len(rows)} jie instants to {out}")
