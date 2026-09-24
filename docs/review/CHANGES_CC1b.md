# CC1b 구현·검증 기록 · 2026-09-24 (결제 접수: F4/F7/F12/F15, D51)

작성: Claude(Cowork). 기준: CC1a 커밋 위(`CHANGES_CC1a.md`). 커밋·배포·live·실제 메일 없음.
환경: 클라우드 작업공간(Node 22.22, pnpm 11.19, Postgres 16 일회용 `haeday_test`).

## 1. 설계 요약
| 항목 | 내용 |
|---|---|
| F4 결제창 멱등성 | 주문 생성과 **같은 트랜잭션**에서 `checkout_attempts`에 요청 전체를 고정 저장. 여기에는 Stripe로 보낼 **최종 본문 전체**(`providerParams`, 어댑터의 순수 함수 `buildCheckoutParams`로 생성)가 포함됨. 재시도는 같은 키로 이 본문을 그대로 재전송 → 재배포·설정 변경·어댑터 변경에도 매개변수가 같음. 판단 규칙: ① 응답 유실·DB 저장 실패 → 같은 키 재전송 = 같은 세션 ② 25분 지난 요청을 Stripe가 **거절**(검증 오류는 실행 전 거절이라 Stripe가 결과를 저장하지 않음) → 생성된 적 없음 → 주문 만료 후 새 주문 ③ 알 수 없는 오류 → 주문 유지, "다시 시도" ④ 같은 키에 다른 본문 → 이슈 + 새 주문(고객이 막히지 않음) ⑤ 재전송 결과가 이미 만료된 세션 → 새 주문 ⑥ 동시 요청 409(`idempotency_key_in_use`) → 일시 오류 ⑦ 그 사이 주문이 닫혔으면 받은 세션을 만료시키고 URL을 주지 않음 |
| F7 콘텐츠 | `requiredSnippets`(명식 풀이에 필요한 전체 목록), `contentReady`(운영: 전부 승인 + 일간 세트·2027 존재 + ID 중복 없음). 차트 화면 버튼, 결제 화면, `startCheckout` 세 곳에서 검사. 결제 시 스냅샷(암호화)에 **실제 문구·버전·승인자**를 고정 → 생성은 이 고정본만 사용, 운영에서는 고정본도 전부 승인이어야 생성(이중 방어). `readings.library_version` 저장 |
| F12 세션 대사 | ① 3분마다: 세션이 있는 open 주문을 Stripe에서 조회 → 완료면 웹훅과 **같은 함수**(`applyPaidSession`)로 처리, 만료면 만료. 매번 회전(실패한 주문이 묶음을 막지 않음) ② 30분마다: Stripe 완료 세션을 영구 커서부터 **6시간 창 단위, 오래된 순**으로 조회(2시간 겹침). 목록이 1만 건 이상이면 잘림으로 보고 커서를 움직이지 않음. 목록 실패는 이슈로 남김. 계속 실패하는 세션은 3회까지만 커서를 붙잡고 그 뒤 이슈로 넘김. 세션 ID를 못 받은 주문은 참조 2개 + 모드 + 고정 시도 + 생성 시각이 모두 맞을 때만 연결 |
| F15 할인 코드 | Checkout `allow_promotion_codes`. 검증: 소계 = 399, 배송비 0, 0 ≤ 할인 ≤ 소계, 총액 = 소계 − 할인 + 세금. 100% 코드: `no_payment_required` + 총액 0 + 할인 = 소계일 때만 무료 이용권(결제 ID 불필요). 무료 주문은 매출·유료 주문 수에서 제외(관리자 화면에 따로 표시), 환불 대상 아님, 생성 실패 시 환불을 약속하지 않는 사과 메일(`apology_free`). 할인액·프로모션 ID 저장 |
| D51 늦은 결제 | 우리 쪽 만료 + 연결된 세션 결제 완료 → 결제 인정(expired → paid). 이미 다른 주문으로 보유 중이면 중복: `duplicate_of_order_id` 표시 + 환불 + 절대 unlock 안 함. 열린 형제 주문은 닫고 그 Stripe 세션도 만료 |
| 인덱스 규칙 | "주문당 활성 1개" 인덱스에서 **풀이가 열리지 않은 결제**(fulfillment `none`: D34 검증 실패 환불, D51 중복)는 제외 → 환불 대기 중에도 고객이 다시 살 수 있음, 웹훅 트랜잭션이 유니크 충돌로 깨지지 않음 |

마이그레이션 `drizzle/0002_checkout_intake.sql`(추가형): `checkout_attempts`, `orders.discount_cents / promotion_code_id / duplicate_of_order_id`, `readings.library_version`, 활성 주문 인덱스 재생성.

## 2. 변경 파일
- 코드: `src/server/payments/{checkout,webhook,reconcile(신규),adapter,issues}.ts`, `src/server/adapters/{stripe,fake-payments}.ts`, `src/server/fulfillment/{prompt,generate}.ts`, `src/server/email/{outbox,templates}.ts`, `src/server/admin.ts`, `src/server/queue/boss.ts`(cron.reconcile-open, cron.reconcile-sessions), `src/worker/index.ts`, `src/app/api/checkout/route.ts`, `src/app/chart/[id]/page.tsx`, `src/app/checkout/[chartId]/page.tsx`, `src/app/admin/page.tsx`, `src/server/db/schema.ts`, `drizzle/0002_*`
- 문서: `docs/DECISIONS.md`(D51), `docs/ARCHITECTURE.md` §2 전이 규칙
- 테스트: `tests/integration/checkout-intake.test.ts`(신규 27건), `tests/stripe-idempotency.test.ts`(D 해제 + 오류 분류), `tests/integration/crosscheck-repro.test.ts`(E 해제), `tests/integration/schema.test.ts`(인덱스 규칙), `tests/contract/stripe-refunds.contract.test.ts`(Checkout 계약 추가)

## 3. 실패 시나리오 → 테스트 (실제 Postgres + pg-boss)
| ID | 시나리오 | 결과 |
|---|---|---|
| CO01 | 첫 시도 실패 후 재배포(가격·주소·세금·할인 설정 변경) | 원래 고정 요청 그대로 재전송 |
| CO01b | 재시도 사이 어댑터 본문 변경 | 고정 본문 재전송, 멱등 오류 없음 |
| CO01c | 같은 키에 다른 본문 | 이슈 + 주문 만료 + 새 주문 |
| CO02 | 세션 생성 후 응답 유실 | 다음 클릭에 같은 세션(세션 1개) |
| CO02b | 응답 유실 + 고객 결제 | 대사가 증거 확인 후 연결·unlock, 작업 1개 |
| CO02c | 31분 후, Stripe에 없음 | Stripe 거절 → 새 주문 |
| CO02d | 31분 후, Stripe엔 있음 | 같은 키로 재생, 새 주문 없음 |
| CO03 | 우리 쪽 만료 + 결제 완료 | paid·생성 대기(D51) |
| CO03b | + 새 open 주문 존재 | 새 주문 닫힘, paid 1건 |
| CO03c | + 새 주문이 이미 paid | 중복: 환불, unlock 안 함, 생성 작업 0 |
| CO03d | + 늦은 결제가 검증 실패 | 유니크 충돌 없이 중복 표시 + 환불 |
| CO04 | 100% 코드 | 무료 이용권, 매출 제외, 환불 거부, 실패 시 `apology_free` |
| CO04b | 50% 코드 | 할인 금액으로 정상 판매 |
| CO05 ×4 | 위조 할인·할인 초과·가짜 무료·배송비 | 거절, unlock 안 함 |
| CO05b | 과다 결제 검증 실패 | 실제 수납액 449 환불 + 재구매 가능 |
| E | 운영, 승인 문구 0개 | `content_not_ready`, 주문·세션 0 |
| F7 | 결제 후 라이브러리 변경 | 고정 문구로 생성, library_version 기록 |
| F7b | 필요한 문구 1개만 미승인 | 판매 불가 |
| F7c | 운영에서 고정본이 초안 | 생성 거부(LLM 호출 0) |
| RC01 | 웹훅 누락 | 3분 점검이 1회 unlock, 늦은 웹훅은 무효 |
| RC02 | 72시간 장애 + 120개 페이지 | 창 단위 조회로 발견, 무관 세션은 이슈만(재실행 시 중복 없음) |
| RC03 | 웹훅·대사 동시 | 전이 1회, 작업 1개 |
| RC04 | 조회 중 Stripe 오류 | 커서 유지, 다음 실행에 처리 |
| RC05 | 매번 실패하는 세션 | 3회만 막고 이슈로 넘김, 뒤 세션 진행 |
| RC06 | 조회 실패 주문 | 매번 회전(적체 없음) |
| D | 5초 뒤 같은 요청 | 본문 동일(expires_at 고정) |

**변이 검증**(수정을 되돌리면 테스트가 실패하는지): 본문 고정 제거 → CO01b 실패, 중복 표시 제거 → CO03d 실패, 결제 전 콘텐츠 검사 제거 → E 실패.

## 4. 실행 결과
- `TEST_DATABASE_URL=…/haeday_test pnpm check` → typecheck OK, lint OK, **263 passed**, 3 skipped(Stripe 계약 테스트, 키 없음). `it.fails` 재현 테스트는 **0건 남음**.
- `pnpm build` → 성공.
- 독립 검토: 별도 Claude 서브에이전트(읽기 전용) 2회. 1차 지적 9건(주요 3: 늦은 결제 + 검증 실패에서 유니크 충돌로 웹훅 트랜잭션 실패, Stripe 본문 일부 미고정, 커서 정지와 1만 건 잘림) → 전부 수정 + 테스트. 2차 지적 5건 중 4건 수정(409 동시 키, 닫힌 주문에 URL 반환, 목록 실패 무음, 환불 대기 주문이 재구매 차단). 나머지 1건(CC1b 이전 스냅샷에 승인자 없음)은 실운영 주문이 없어 해당 없음. **ChatGPT 독립 검증은 아직 실행 안 함.**

## 5. NOT RUN / 남은 것
- Stripe test-mode 계약(`tests/contract`): 환불 + Checkout(같은 본문 재생, 다른 본문 멱등 오류, 만료 임박 거절, 할인·배송 필드). `STRIPE_CONTRACT_KEY=sk_test_…`와 `STRIPE_CONTRACT_PRICE=price_…`가 있는 환경에서 실행 필요. 100% 코드 결제 완료는 API로 재현할 수 없어 staging 브라우저 테스트로 확인해야 함.
- CO06(장바구니 복구 세션의 중복 구매)은 C5(CC3) 구현 때 함께.
- D51 경합(형제 주문의 첫 세션 생성이 진행 중일 때 닫힘)은 코드로 막았으나 전용 테스트 없음.
- 부분 할인 후 금액이 $0.50 미만이면 Stripe가 결제창에서 거절: 운영 규칙(코드 만들 때 주의)으로 남김.

## 6. 다음
CC1c(F5 나머지 / F13 24시간 지연 전달 D35+D47 / F14 AI 비용 / L7 메일 발송량).

추천 커밋: `feat(checkout): frozen provider requests, content gate + frozen content, session reconciliation, promotion codes, D51 late payments (CC1b)`
