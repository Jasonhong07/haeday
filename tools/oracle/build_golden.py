"""Builds fixtures/golden.json from fixtures/manifest.json with the independent oracle.
Also re-verifies data/jie_1900_2050.json against Skyfield. Run via `pnpm oracle:update` only; CI uses oracle:verify."""
import json, sys
from astro import jie_instants, TS
from compute import JIE_TIMES, JIE_LONS, compute_case

def verify_jie_table():
    fresh = jie_instants((1899, 8, 1), (2051, 1, 1))
    if [(t.replace(tzinfo=None), lon) for t, lon in fresh] != [(t.replace(tzinfo=None), lon) for t, lon in zip(JIE_TIMES, JIE_LONS)]:
        sys.exit("jie table does not match Skyfield recomputation")

def main(out="fixtures/golden.json"):
    verify_jie_table()
    m = json.load(open("fixtures/manifest.json", encoding="utf-8"))
    import tzdata
    cases = []
    for c in m["cases"]:
        case = {**c, "place": m["places"][c["place"]]}
        cases.append({"id": c["id"], "input": case, "expected": compute_case(case)})
    data = {"policyVersion": m["policyVersion"], "tzdata": tzdata.IANA_VERSION, "cases": cases}
    json.dump(data, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"wrote {len(cases)} cases to {out}")

if __name__ == "__main__":
    main(*sys.argv[1:])
