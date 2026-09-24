# CC1a 구현·검증 기록 · 2026-09-24 (환불 복구: F1/F2/F3/F6/F9)

작성: Claude(Cowork). 기준: device HEAD `09a7efd` + Codex CC0 미커밋 변경(그대로 보존, 덮어쓰지 않음).
범위: `PROPOSAL_V2_CODEX.md` §6의 CC1a. 커밋·배포·live·실제 메일 없음. 환경: 클라우드 작업공간(Node 22.22, pnpm 11.19, Postgres 16 일회용 `haeday_test`).

## 1. CC0(Codex) 변경을 실제 DB로 검증
Codex가 NOT RUN으로 남긴 부분을 실행: `pnpm check`(typecheck + lint + 전체 테스트, 실제 Postgres + pg-boss) → **27 files, 208 passed + 11 expected fail**. F(관리자 재시도 롤백)와 3a(관리자 첫 로그인)가 실제 DB 통합 테스트로 통과. Codex 로컬의 `stripe` 패키지 누락 typecheck 문제는 lockfile대로 설치된 환경에서는 재현되지 않음.

## 2. 설계 (한 가지 환불 상태 모델)
| 부분 | 내용 |
|---|---|
| `claimRefundInTx(tx, …)` | **호출자 트랜잭션 안에서**: 주문 잠금 → 자격 확인(기존 청구, 열린 분쟁, goodwill 창·1회) → 남은 금액만(모든 출처의 pending/requires_action/succeeded 합계 차감) → 청구 행(attempt_no, 키 `refund:{order}:{n}`) → 주문 refund_pending(+ queued/generating이면 fulfillment failed) → `refund.execute` 작업 등록. 동시 청구는 savepoint + 부분 유니크 인덱스로 `in_progress` |
| `executeRefund(id)` | 짧은 트랜잭션으로 행 lease(2분) 취득 + `first_sent_at` 기록 → **트랜잭션 밖**에서 Stripe 호출(같은 키, metadata `orderId`, `refundRowId`) → lease 토큰이 같을 때만 저장. 첫 전송 후 23시간이 지난 requested/unknown은 **다시 보내지 않고 조회**, 목록에 없으면 failed(`never_created`) + 이슈 |
| `syncOrderRefunds(order)` | 주문별 lease → 트랜잭션 밖에서 결제의 **전체 환불 목록 + charge 합계** 조회 → 주문 잠금 → lease 확인 후 저장. 다른 실행자가 중간에 오면 `dirty` → 저장 후 다시 조회. lease를 뺏긴 오래된 조회는 폐기(`stale`). 실패 시 lease 해제 + `dirty` 복원 |
| 웹훅 환불 이벤트 | 본문은 신호일 뿐: `refund_syncs.dirty` + `refund.sync` 작업(주문당 1개)만 같은 트랜잭션에 기록. 상태는 Stripe 현재값으로만 바뀜 |
| 실패 처리(F1) | `failAndRefund`: fulfillment failed + 청구 + 작업 + 사과 메일을 **한 트랜잭션**. fencing token·마감 조건부. 커밋 전 종료 → 아무것도 안 바뀜(마감 sweep이 재시도) |
| 검증 실패(F6, D34) | 저장된 세션 ID·client_reference_id·metadata.orderId·livemode가 모두 맞고 결제 완료일 때만: 결제 사실 기록 + 실제 수납액 환불 청구 + 이슈. fulfillment는 `none`(절대 열지 않음). 신원 불일치·미확인은 이슈만 |
| goodwill(F9) | 이메일 HMAC 기준 `pg_advisory_xact_lock` → 주문 잠금(항상 이 순서) |
| 이슈 | `payment_issues`(종류+객체+모드 dedupe, 발생 횟수, open/acknowledged/resolved). refund_failed는 **전이 시점에 한 번만** 열림. 관리자 화면 "Needs action" |
| 잠금 순서 | 주문 → refund_syncs(sync). 웹훅 환불 분기는 주문을 잠그지 않음. goodwill은 advisory → 주문 |

스키마(`drizzle/0001_refund_recovery.sql`, additive): `refunds` + attempt_no, lease_token, lease_expires_at, failure_reason, first_sent_at, last_checked_at; 신규 `refund_syncs`, `payment_issues`; enum `refund_reason` + validation_failure, 신규 `issue_status`. 기존 requested/unknown 행은 first_sent_at=created_at으로 백필.
결제 연결부: `createRefund`에 `refundRowId`, 신규 `getRefundSummary`(PaymentIntent + latest_charge + refunds 전체 페이지), `livemode`(키 접두어).

## 3. 변경 파일
- 코드: `src/server/payments/{refunds,webhook,adapter,issues(신규)}.ts`, `src/server/fulfillment/generate.ts`, `src/server/adapters/{stripe,fake-payments}.ts`, `src/server/queue/boss.ts`(refund.execute, refund.sync), `src/worker/index.ts`, `src/server/admin.ts` + `src/app/admin/page.tsx`(Needs action), `src/app/api/refunds/[orderId]/route.ts`, `src/app/api/admin/orders/[id]/refund/route.ts`, `src/server/db/schema.ts`, `drizzle/0001_refund_recovery.sql` + meta
- 테스트: `tests/integration/refund-recovery.test.ts`(신규), `tests/integration/crosscheck-repro.test.ts`(A·B·C1–C5·G·3b 해제, G2 추가), `tests/integration/commerce.test.ts`(D34·provider 기준 반영), `tests/contract/stripe-refunds.contract.test.ts`(신규, test 키 있을 때만)

## 4. 실패 시나리오 → 테스트 (전부 실제 Postgres + pg-boss)
| ID | 시나리오 | 테스트 | 결과 |
|---|---|---|---|
| RF01 | 실패 저장 트랜잭션 커밋 직전 종료 | repro A | 주문 그대로(paid/queued), 이후 sweep → 환불 1건 |
| RF02 | Stripe 성공 직후 응답 유실 | RF02 | 같은 키로 재호출 → 같은 환불, provider 환불 1건 |
| RF02b | Stripe 호출 후 저장 전 종료(lease 잔존) | RF02b | lease 유효 중엔 아무도 안 건드림, 만료 후 대사가 완료 |
| RF03 | 실행자 3개 동시(느린 Stripe) | RF03 | provider 호출 1회 |
| RF04 | 웹훅이 API 응답보다 먼저 | repro B | 행 1개(service), 예외 없음 |
| RF05 | 조회 A(pending)가 B(succeeded)보다 늦게 저장 | RF05, RF05b | dirty 재조회로 succeeded / lease 뺏긴 A는 stale 폐기 |
| RF06 | 25시간 unknown, Stripe에 없음 | RF06 | 재생성 0, failed(never_created) + 이슈, 새 시도는 키 :2 |
| RF06b | 25시간 unknown, Stripe엔 있음 | RF06b | metadata로 매칭, 재생성 0 |
| RF07 | 대시보드 부분 환불 후 우리 환불(잔액만) 실패 | RF07 | 299만 청구, partially_refunded, refund_failed 이슈 |
| RF07b | succeeded 후 은행 반환(failed) | RF07b | 결제 사실 paid + 이슈, fulfillment는 청구 때 멈춤 → sweep이 새 청구 안 함 |
| RF08 | 열린 분쟁 | RF08 | 청구 전/청구 후 모두 Stripe 호출 0, 이슈 |
| — | 23시간 넘은 requested(전송 후 사망) | RF09 | 조회만, 재생성 0 |
| — | 웹훅 동기화 작업이 Stripe 장애로 모두 실패 | RF10 | dirty 유지 → 대사가 발견, refund_failed 이슈 |
| — | 해결된 이슈가 이후 동기화로 재오픈 | RF11 | 재오픈 안 됨(발생 1회) |
| — | 확정 실패 후 재시도 | C2 | 키 `:1`, `:2` |
| — | 늦은 pending 이벤트 | C3 | succeeded 유지(이벤트 본문 무시; 순서 역전은 RF05가 검증) |
| — | 부분 환불 누적 | C4 | 200 → partially, +199 → refunded |
| — | 장기 pending | C5 | 조회만(생성 0), refunded |
| — | 검증 실패(D34) | G, G2, commerce tamper 6종 | 연결된 금액 불일치만 실제 수납액 환불, 신원 불일치는 이슈만, 절대 unlock 안 함 |
| — | goodwill 동시(barrier로 강제 경합) | 3b | 1건만 성공, 다른 쪽 goodwill_used |

**변이 검증(수정을 되돌리면 테스트가 실패하는지):** advisory lock 제거 → 3b 실패, 실행 lease 제거 → RF03 실패, dirty 복원 제거 → RF10 실패. 세 테스트가 실제 결함을 잡음을 확인.

## 5. 실행 결과
- `TEST_DATABASE_URL=…/haeday_test pnpm check` → **typecheck OK, lint OK, 28 files passed + 1 skipped, 232 passed + 2 expected fail + 2 skipped**.
  - expected fail 2건 = CC1b 대상 E(F7 콘텐츠 검사), D(F4 멱등 매개변수).
  - skipped 2건 = Stripe test-mode 계약 테스트(키 없음).
- `pnpm build` → 성공.
- 독립 검토: 별도 Claude 서브에이전트(읽기 전용, 코드 미수정)가 2회 검토. 1차 지적 7건(잠금 순서 교착, 동기화 실패 시 dirty 소실, 23h 후 unknown 고착, requested의 23h 미적용, 실패 환불 후 자동 경로 재진입, 이슈 재오픈, 유니크 충돌 삼킴) → 전부 수정 + 테스트(RF09–RF11, RF07b 강화). 2차 지적(동기화 실패 시 dirty 소실 잔존, RF10이 해당 경로 미검증, 백필, 대시보드 환불 반환 알림) → 수정. **ChatGPT 독립 검증은 아직 실행 안 함**(CC1 완료 조건).

## 6. NOT RUN / 남은 것
- **Stripe test-mode 계약**(`tests/contract/stripe-refunds.contract.test.ts`): 부분 환불, metadata 왕복, 전체 목록, amount_refunded 의미, 초과 환불 거부, 같은 키·다른 매개변수 오류. `STRIPE_CONTRACT_KEY=sk_test_…`가 있는 환경에서 실행 필요. 공식 문서로 확인한 사항: 환불은 succeeded 후 failed가 될 수 있음(최대 30일, `refund.failed`, "다른 방법으로 환불 필요"), 결제당 여러 부분 환불 가능, `failure_reason` 값.
- 교착 상태 자체를 재현하는 테스트 없음(잠금 순서 통일로 해결, 코드 검토로 확인).
- 사과 메일 문구는 "started a full refund"로 청구 시점에 맞음. $0 주문 실패 안내는 CC1b(F15).
- 고객 환불 화면: 이제 청구 후 즉시 실행을 한 번 시도하고 결과를 표시. 실패하면 작업이 재시도(화면은 "pending").
- 통화 불일치 환불(예: EUR 결제)은 반영하지 않고 이슈로만 남김(사람 확인).
- 정책 답변 반영(Jason 2026-09-24): D49 환불 실패 → 관리자 알림 후 Jason이 고객에게 연락(구현과 일치, 자동 재시도 없음). D50 goodwill은 12개월마다 1회(보존 삭제와 자연히 일치, 환불 화면·정책 문구 수정). D47 24시간 미전달 시 환불(CC1c F13에서 구현). D46 무료 미리보기 채택(CC3, 콘텐츠 승인 후 공개). D48(마케팅 주소)은 아직 proposed.

## 7. 다음
CC1b(F4/F7/F12/F15) → CC1c(F5 나머지/F13/F14/L7). E·D 재현 테스트가 CC1b에서 풀려야 함.

추천 커밋: `fix(refunds): atomic failure+claim, provider-truth refund sync with leases, D34 validation refunds, goodwill lock (CC1a)`
