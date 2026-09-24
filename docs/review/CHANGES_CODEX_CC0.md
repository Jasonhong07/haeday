# CC0 구현·검증 기록 · 2026-09-24

Base HEAD: `09a7efd`. 로컬 변경만; 커밋/배포/live/외부 메일 없음.

## 실제 변경

- `src/server/auth.ts`: 선택적 adminEmails 의존성 추가. 구매 이력이 없는 허용 목록 주소의 미인증 고객 생성 허용. 관리자 권한은 verifiedAt + allowlist 그대로.
- `src/app/api/auth/request/route.ts`: env ADMIN_EMAILS 전달. 내부 sent/not_sent/throttled/unavailable을 모두 동일 200으로 반환. 400/403/IP429 유지.
- `src/server/admin.ts`: 일반 boss.send를 enqueueInTx로 교체. 큐 거부는 예외로 올려 트랜잭션 롤백.
- 새 단위/HTTP 테스트 9개. 기존 DB 재현 F/3a는 일반 테스트로 전환. 기존 3c의 옛 HTTP 상태 하드코딩 제거하고 실제 route 테스트로 대체.
- `PROPOSAL_V2_CODEX.md`: F1–F15/L1–L8/C1–C6 전항목 판단·실패 시나리오·구현 및 추가 테스트. `HANDOFF_CC1_CODEX.md`: 다음 에이전트 실행 지시.
- DECISIONS D46–D48은 질문 중인 proposed. 아직 승인으로 기록하지 않음.

## 실행 결과

Node는 `C:\Program Files\nodejs\node.exe` v24.18.0을 직접 사용했다.

1. `node node_modules/vitest/vitest.mjs run tests/auth-request-route.test.ts tests/auth-bootstrap.test.ts tests/admin-retry-queue.test.ts`: **3 files / 9 passed**.
   - 기본 sandbox에서는 Windows spawn EPERM. 자동 승인된 require_escalated 실행에서 통과. 외부 DB/provider 호출 없음.
2. 변경 코드/테스트 7개 파일 ESLint 및 `git diff --check`: **통과**. 새 admin queue test 포함.
3. `node node_modules/typescript/bin/tsc --noEmit`: **통과 못 함**. 기존 로컬 node_modules에 `stripe` 패키지 없음: stripe.ts/tests/adapters.test.ts TS2307, 연쇄 TS7006. package.json과 lockfile에는 stripe 22.6.2가 있음. 패키지 버전 변경으로 해결하지 않음.
4. `pnpm ...` 최초 시도는 번들 runtime Node24.19.0 및 의존성 자동 설치의 no-TTY 모듈 제거 확인 오류로 실행 전 실패. 기존 node_modules를 지우지 않고 승인된 Node24.18.0 직접 실행으로 전환.
5. DB 통합 테스트, 전체 check/build/E2E, Stripe test-mode 계약 테스트: **NOT RUN**. 기존 cloud 증거를 이번 실행 결과로 간주하지 않음.

## 다음 에이전트가 먼저 할 일

락파일 고정으로 로컬 의존성을 정상 설치한 환경에서 typecheck/lint와 disposable *_test DB의 통합 테스트를 실행한다. 운영/사용자 DB로 freshDb를 실행하지 않는다.

F8의 DB 경로와 F5 트랜잭션 롤백은 실제 Postgres 통합 증거가 아직 필요하다. 단위 mock은 DB 롤백을 증명하지 않는다.
F10 outbox/응답 시간/분산 rate limit, F5 관리자 추가 시도권은 미구현. 결제·환불 전체는 여전히 출시 차단 버그가 남아 있다.

추천 커밋 제목(아직 커밋하지 않음): `fix: bootstrap admin login and bind retry jobs to transactions`
