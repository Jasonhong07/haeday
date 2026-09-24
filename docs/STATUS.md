# Status (2026-09-24)

## M0 foundation: code done, deploy waiting on accounts
Everything verified in the cloud workspace (LAUNCH_EVIDENCE.md). Remaining: GitHub push, Railway staging, Sentry (docs/SETUP_ACCOUNTS.md).

## M1 chart engine: engine done, 2 items waiting on Jason
- Done: canonical jie table 1900–2050, independent Python oracle, TypeScript engine (own implementation), 33 golden fixtures all matching, unit tests, unknown-time enumeration with exact disclosures.
- Waiting on Jason:
  1. **City data:** open https://download.geonames.org/export/dump/cities15000.zip in your normal browser, save it into `Desktop\Fotel\haeday\data\` (our build network cannot reach GeoNames).
  2. **Cross-check:** fill `docs/crosscheck.md` using two Korean 만세력 apps.
- Engine release gate (D10): 9/27 23:59 CT.

## Next
M1 finish (places API) → M2 input + free chart screens (9/27).
