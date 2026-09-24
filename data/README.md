# data/

| File | What | How it is made | In git |
|---|---|---|---|
| `jie_1900_2050.json` | Canonical solar-term (jie) instants, UTC | `pnpm oracle:update` (Skyfield + DE421), approved by Jason | yes |
| `cities.json` | 34,126 cities: id, name, region, country, lat, lon, IANA tz, population | `pnpm places:build` from `cities15000.txt` + `admin1_names.json` | yes |
| `admin1_names.json` | Region display names keyed `CC.admin1code` | `python tools/places/derive_admin1.py <rg_cities1000.csv>` (one-off, see DECISIONS D27) | yes |
| `cities15000.txt` | Raw GeoNames dump (download from https://download.geonames.org/export/dump/cities15000.zip) | manual download | no (.gitignore) |

Attribution (required, CC BY 4.0): "City data © GeoNames (geonames.org), licensed under CC BY 4.0." Shown on /method (M2).
