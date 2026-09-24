# HANDOFF_PROMPT · 다른 AI(코딩 에이전트)에게 넘기기

## 준비 (Jason, 10분)
1. GitHub에 private repo `haeday` 생성 → PC에 clone.
2. 이 폴더 `repo_kit/`의 **내용물**(CLAUDE.md, AGENTS.md, docs/)을 repo 루트에 복사 → `git add . && git commit -m "docs: haeday v8 spec" && git push`.
3. repo 폴더에서 코딩 AI 실행 (Claude Code: `claude`, 다른 도구도 동일하게 repo 폴더를 열기).
4. 아래 **Kickoff prompt**를 그대로 붙여넣기.

과거 문서(v3–v7, RECOMMENDATION_V3 등)는 repo에 넣지 마세요. 에이전트가 옛 결정을 섞을 수 있습니다.

---

## Kickoff prompt (첫 세션에 그대로 붙여넣기)
```text
You are the lead engineer for Haeday, a Korean saju (Four Pillars) web app for English speakers.
The founder, Jason, is a non-engineer on Windows (Git Bash). Launch target: first real order
Oct 2, public launch Oct 5, 2026 (Central Time), both conditional on the gates in docs/TASKS.md.

1. Read, in this order: CLAUDE.md, docs/DECISIONS.md, docs/TASKS.md, docs/ENGINE_SPEC.md,
   docs/ARCHITECTURE.md, docs/PRD.md, docs/OPERATIONS.md, docs/LAUNCH_EVIDENCE.md.
2. Reply with: (a) a 10-line summary of the product and accepted decisions, (b) any contradiction
   or ambiguity you find between the docs (file + section), (c) your plan for M0 and M1 with the
   order of work, (d) the exact list of accounts/credentials/values you need from Jason for M0,
   each with click-by-click instructions to obtain it. Do not ask for anything M0 doesn't need.
3. Then start M0 immediately. Work in small commits. Record evidence in docs/LAUNCH_EVIDENCE.md.
4. When M0 acceptance checks pass, stop and report per the Definition of done in CLAUDE.md.

Constraints: never change an accepted decision; never switch payments to live, email real people,
buy services or deploy to production without Jason's explicit OK; never edit expected fixture values
to make tests pass; never read or print .env files.
```

## Milestone prompt (M1–M7, 새 세션마다 번호만 바꿔서)
```text
Continue Haeday. Read CLAUDE.md, docs/DECISIONS.md and docs/LAUNCH_EVIDENCE.md, then do M{n} in
docs/TASKS.md only. Start with a short plan (which files, which tests first). Proceed without asking
unless the plan changes an accepted decision or a spec contract, needs a paid service, or touches live
payments/production. When every M{n} box has PASS evidence, stop and report: files changed, commands
and results, anything I must do by hand (click-by-click), risks/TODOs, suggested commit message.
```

## M1 (완료)
M1은 완료되었습니다. 교차검증은 `docs/REVIEW_M1.md`의 Review prompt를 쓰세요.

## M5 추가 지시 (품질)
```text
Generate 15 sample readings (all 10 day masters, 3 unknown-time charts, 2 with a disclosure) into
docs/samples/ as markdown with the facts shown above each reading. I will score them with the rubric
in the Runbook and send you notes. Then update the prompt/library usage, regenerate the same 15, and
summarize what changed.
```

## 리뷰 요청 (다른 AI에게 코드 검토를 맡길 때)
```text
Review the Haeday repo against CLAUDE.md and docs/. Focus on money flows (ARCHITECTURE §4.2–4.8),
access control (§4.6–4.7), engine correctness vs ENGINE_SPEC and fixtures, and privacy (PRD §13).
For each finding give file:line, a failing scenario, severity (P0/P1), and a minimal fix. Distinguish
"spec says X but code does Y" from "spec is missing Z". Do not rewrite working code for style.
```

## 막혔을 때 (Jason이 붙여넣기)
```text
Stop. Explain in plain Korean what is blocked, why, and the two or three options with
trade-offs. Do not change any decision until I choose.
```
