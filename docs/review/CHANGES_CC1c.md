# CC1c 구현·검증 기록 · 2026-09-24 (전달: F5 나머지 / F13 / F14 / L7)

작성: Claude(Cowork). 기준: CC1b 커밋 위. 커밋·배포·live·실제 메일 없음. 환경: 클라우드 작업공간(Node 22.22, pnpm 11.19, Postgres 16 일회용 `haeday_test`).
정책: D35·D47(24시간 약속, 24시간 미전달 시 환불), **D52(신규, Jason): 밀린 주문은 한도를 최대 2배까지 자동 상향, 2배를 넘으면 새 결제 자동 일시중지 + 알림**, D36·D49(관리자 재시도), D45(메일 발송량).

## 1. 설계 요약
| 항목 | 내용 |
|---|---|
| 결제 전 약속(F13) | 서버가 상태를 결정: `minutes`(오늘 사용 + 24h 대기 < 한도 90%) / `24h`(대기 < 2× 한도) / `paused`. 결제 화면은 24h면 안내문과 별도 동의 문구를 보여주고 그 약속을 요청에 실어 보냄. 서버 판단이 화면보다 나빠졌으면 **아무것도 만들지 않고** `promise_changed` → 화면 새로고침·재동의. 다른 약속으로 열린 기존 결제창은 Stripe에서 만료시키고 새로 엶. 약속·동의 버전은 주문과 스냅샷에 고정 |
| 생성 입장(F13) | 주문 행 잠금 → **UTC 날짜별 advisory lock** 안에서 오늘 사용량 계산 → 결정 → 시도 행 삽입. minutes 주문: 한도 1.2배까지. 24h 주문: 한도 안이면 즉시, 마감 6시간 이내면 2배까지(D52), 아니면 다음 UTC 자정(30분 분산) 또는 급해지는 시점 중 이른 때까지 대기(시도·LLM 호출 0). 2배 초과 시 15분 뒤 재확인, 못 지키면 24시간 마감 환불(D47). LLM 호출 전 실패(스냅샷·콘텐츠 등)는 사용량에서 제외 |
| 24시간 마감(D47) | Stripe charge 생성 시각(실제 결제 시각) + 24h. 웹훅이 늦게 와도 연장되지 않음. 마감 점검이 환불·생성 중단 |
| 대기 해제 | 매분 `releaseDeferred`: 시각이 된 주문에 작업 등록. 작업이 실제로 만들어졌을 때만 표시 해제(이전 작업이 아직 돌면 다음 분에 다시) |
| 관리자 재시도(F5, D36) | 환불 완료·진행 중·분쟁·중복 주문은 거부, **실패한 환불 뒤에는 허용**(D49 무료 풀이 대안). 시도 3회를 다 쓴 주문은 요청 ID당 +1회(`attempt_grants`, 같은 요청 재전송 = `duplicate_request`). 진행 중이던 시도의 토큰 무효화, 같은 트랜잭션에서 작업 등록, 이미 작업이 있으면 `already_queued`로 보고하고 해제 표시를 남겨 그 작업이 끝나면 자동 재등록 |
| AI 비용(F14) | 시도마다 모델·입출력·캐시 토큰·비용(마이크로달러)·가격 버전 저장. 가격표 `src/server/fulfillment/pricing.ts`: Anthropic 공식 가격(2026-09-24 확인, 출처 URL 포함) — claude-sonnet-5 $2/$10, claude-haiku-4-5 $1/$5, claude-opus-5-5 $4/$20 (MTok당 입력/출력). 목록에 없는 모델·타임아웃은 null(추측·0 금지). 실패한 호출도 제공자가 보고한 사용량은 비용에 포함. 관리자 화면: 총 비용, 전달 1건당 비용, 비용 미상 호출 수 |
| 메일 발송량(L7, D45) | 모든 발송(주문 메일 + 로그인 링크)이 보내기 전에 오늘 행을 잠그고 1통 예약. 우선순위 예비분: 로그인 0 / 전달·사과 20 / 명식 40 / 마케팅 60(일·월 모두). 70통째에 Sentry 경고 1회. 초과 시 주문 메일은 다음 UTC 날짜로 미룸(시도 횟수 미차감, 5분마다 재등록 cron), 로그인 링크는 내부 `unavailable`(HTTP 응답은 동일 200). 워커가 죽어 `sending`에 남은 메일도 10분 후 재등록. 환경변수 `EMAIL_DAILY_LIMIT/MONTHLY_LIMIT/ALERT_AT`(기본 100/3000/70) |

마이그레이션 `drizzle/0003_delivery_capacity.sql`(추가형): `orders.delivery_promise / fulfillment_not_before / provider_paid_at`, `generation_attempts`의 모델·토큰·비용 열(`tokens_*`), `attempt_grants`, `email_budget`.

## 2. 변경 파일
- 코드: `src/server/fulfillment/{capacity(신규),pricing(신규),generate,prompt}.ts`, `src/server/adapters/{llm,stripe,fake-payments}.ts`, `src/server/payments/{checkout,webhook,adapter,sku,issues}.ts`, `src/server/email/{budget(신규),outbox}.ts`, `src/server/{admin,auth,orders,env}.ts`, `src/server/queue/boss.ts`(cron.deferred-generation, cron.email-due), `src/worker/index.ts`, `src/app/checkout/[chartId]/{page,CheckoutForm}.tsx`, `src/app/order/[orderId]/page.tsx`, `src/app/admin/page.tsx`, `src/app/api/{checkout,auth/request,admin/orders/[id]/retry}/route.ts`, `src/server/db/schema.ts`, `drizzle/0003_*`
- 문서: `docs/DECISIONS.md`(D52), `docs/SETUP_PROVIDERS.md`(메일 한도 변수)
- 테스트: `tests/integration/delivery-capacity.test.ts`(신규 15건), `tests/admin-retry-queue.test.ts`(Codex의 목(mock) 테스트를 실제 DB 테스트 5건으로 교체), `tests/integration/admin.test.ts`, `tests/adapters.test.ts`, `tests/integration/commerce.test.ts`

## 3. 실패 시나리오 → 테스트 (실제 Postgres + pg-boss)
| ID | 시나리오 | 결과 |
|---|---|---|
| DL01 | 화면은 "1분", 서버는 이제 24h | 주문·결제창 0, `promise_changed`. 24h 수락 시 24h 주문 + 지연 동의 버전 |
| DL01b | 대기 ≥ 2× 한도 | 새 결제 `busy`(D52) |
| D47 | 24h 주문 마감 | Stripe 결제 시각 + 24h, 넘기면 환불·중단 |
| DL02 | 한도 소진 | 24h 주문 다음 UTC 날 00:00–00:30으로 대기(시도·호출 0) → 해제 → 생성 |
| DL03 | 워커 10개 동시, 남은 자리 6 | 정확히 LLM 호출 6, 나머지 4는 시도 행 없이 재시도(장벽으로 경합 강제) |
| DL04 | 급한 24h 주문 | 한도 초과해도 2배까지 생성, 2배 이상이면 15분 뒤 재확인 |
| DL05 | 토큰 잃은 워커 | 실패·환불 불가 |
| DL06 | 다른 약속으로 열린 결제창 | Stripe 만료 + 새 주문(새 약속) |
| DL07 | 호출 전 실패 | 사용량 미포함(타임아웃은 포함) |
| F14 | 비용 | sonnet-5 1000/1500토큰 = 17,000µ$($0.017), 미등록 모델 null, 타임아웃 null, 실패 호출도 과금분 기록 |
| AR1–5 | 관리자 재시도 | 트랜잭션·토큰 무효화, 소진 주문 +1(더블클릭 1회), 환불·분쟁 거부 / 실패 환불 후 허용, 큐 실패 시 롤백, 활성 작업 중 재시도 → 끝난 뒤 자동 재등록 |
| EM01 | 로그인 40통 동시 | 정확히 30통, 경고 1회. 전달 메일은 20통 먼저 멈추고 로그인은 계속 |
| EM01b | 월 한도 | 이달 누적 기준 |
| EM03 | 초과 | 다음 날로 대기(시도 미차감) → 재등록 |
| EM04 | 제공자 수락 후 응답 유실 | 같은 멱등 키로 1통만 |
| EM05 | `sending`에 멈춤 | 10분 후 재등록·발송 |

**변이 검증**(수정을 되돌리면 테스트가 실패하는지): 날짜별 lock 제거 → DL03 실패, 메일 행 잠금 제거 → EM01 실패, 재시도 해제 표시 제거 → AR5 실패.

## 4. 실행 결과
- `TEST_DATABASE_URL=…/haeday_test pnpm check` → typecheck OK, lint OK, **281 passed**, 3 skipped(Stripe 계약 테스트, 키 없음). `pnpm build` 성공.
- 독립 검토: 별도 Claude 서브에이전트(읽기 전용) 1회 → 주요 1(활성 작업 중 재시도 시 작업 없이 남아 환불됨) + 사소 5 중 5건 수정(재시도 해제 표시, 해제 표시는 작업 생성 시에만 해제, 다른 약속의 기존 결제창, 호출 전 실패 사용량 제외, `sending` 고착 재등록, 일시중지 문구). 1건(테스트가 실제 시계를 씀: UTC 자정 직전 실행 시 불안정 가능)은 기록만. **ChatGPT 독립 검증은 아직 실행 안 함.**

## 5. NOT RUN / 남은 것
- 실제 Anthropic 호출로 사용량 필드(캐시 토큰 포함) 확인: LLM 키 입력 후 `pnpm samples` 때.
- 실제 Resend 한도 동작: 도메인·Resend 연결 후.
- 모델이 확정되면 가격표에 있는지 확인(없으면 비용이 null로 보임). 가격이 바뀌면 새 버전 항목을 추가(과거 비용은 그대로).
- 테스트 시계 주입(자정 경계) 개선.
- F10 나머지(로그인 링크 outbox 비동기화·분산 제한)는 CC2에서.

## 6. 다음
CC2(출시 보호: CSP, 폰트, SEO, UTM, PostHog·퍼널, 전체 흐름 E2E, 운영 환경 test 키 스모크, 복구 훈련).

추천 커밋: `feat(delivery): pre-payment delivery promise, atomic AI capacity with 24h deferral (D35/D47/D52), admin retry grants (D36), AI cost ledger, email budget (CC1c)`
