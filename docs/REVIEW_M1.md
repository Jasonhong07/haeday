# REVIEW_M1 · 다른 AI에게 M0+M1 교차검증 맡기기

## Jason이 할 일 (5분)
1. GitHub Desktop에서 **Fetch origin → Pull** (또는 이미 최신이면 생략).
2. 검증할 AI(예: Claude Code, Codex, Cursor)를 `Desktop\Fotel\haeday` 폴더에서 엽니다.
3. 아래 **Review prompt** 박스 안 내용을 통째로 복사해서 붙여넣습니다.
4. AI가 준 결과(발견사항 목록)를 그대로 이 채팅에 붙여넣으면, Claude가 하나씩 확인하고 고칩니다.

---

## Review prompt (그대로 붙여넣기)
```text
You are an independent reviewer for Haeday (Korean saju web app, Next.js + Postgres). Another agent built
milestones M0 (foundation) and M1 (chart engine + city search). Verify its work; do not trust its claims.

Read first: CLAUDE.md, docs/DECISIONS.md, docs/TASKS.md (M0, M1), docs/ENGINE_SPEC.md, docs/ARCHITECTURE.md §2,
docs/LAUNCH_EVIDENCE.md, docs/STATUS.md, docs/crosscheck.md.

Run (report exact output; if a tool is missing, say NOT RUN, do not guess):
  pnpm install --frozen-lockfile
  pnpm typecheck && pnpm lint
  pnpm test                      # DB integration tests need TEST_DATABASE_URL (a database whose name ends in _test)
  pip install -r tools/oracle/requirements.txt   # Python 3.14
  pnpm oracle:verify             # re-derives the jie table and golden fixtures with Skyfield, compares to committed files
  pnpm oracle:lunar              # regenerates fixtures/lunar_sample.json with lunar_python; must print 0 mismatches
  pnpm build && pnpm e2e

Then check, and for each finding give file:line, a concrete failing input, severity (P0 wrong money/data/pillars,
P1 wrong behaviour, P2 hygiene) and a minimal fix:
1. Engine vs ENGINE_SPEC §2–§4: DST gap/fold, jie boundary ownership (instant belongs to the new period),
   true solar time formula (std offset, wrap180 longitude correction, EoT), 야자시 (23:00–23:59 keeps the day,
   hour stem from the next day), 五虎遁/五鼠遁, ten gods, 6/8 denominators, warnings + alternatives, unknown-time
   minute enumeration and the D25 askCustomer rule. Pick 5 of your own births (include one 23:xx, one near a
   solar term, one pre-1970 Seoul) and compute them independently.
2. Independence of the checks: tools/oracle must not import engine code; golden.json must not be hand-edited;
   lunar_sample.json comparison setup (tools/oracle/crosscheck_lunar.py docstring) must be fair.
3. City search (src/server/places, src/app/api/places, scripts/build-cities.ts, D27): ranking, duplicate labels,
   placeId validation, the API never returns coordinates, the query is never logged, data/cities.json rebuilds
   byte-identically from data/cities15000.txt (download https://download.geonames.org/export/dump/cities15000.zip).
4. M0: env fail-closed rules (live payments impossible outside production+approval), encryption envelope + AAD,
   email lookup HMAC, Sentry scrubbing (no birth data, email, query strings), same-transaction enqueue proof,
   schema constraints in drizzle/0000_init.sql vs ARCHITECTURE §2, health endpoints leak nothing.
5. Docs vs code: every ticked box in TASKS M0/M1 has PASS evidence in LAUNCH_EVIDENCE; flag any claim not backed
   by a command you could reproduce.

Rules: do not change code or docs; this is review only. Do not change accepted decisions. Never read or print .env
files. Answer in Korean for summaries, English for code references. Finish with: P0 count, P1 count, P2 count,
and "M1 gate ready: yes/no" with the reason.
```

## 참고: 현재 상태 한 줄 요약 (검증 AI에게 추가 설명이 필요할 때)
M0 완료 + Railway staging 배포 + CI green + Sentry 수신 확인. M1: 엔진 33/33 오라클 일치, lunar_python 3,000/3,000 일치, 도시 검색 API 완료. 남은 것: Jason의 절기표 승인, 한국 앱 크로스체크(Part B).
