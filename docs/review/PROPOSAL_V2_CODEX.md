# Haeday 수정제안서 v2 · Codex 교차검증 / 구현 인계

기준: 2026-09-24, HEAD `09a7efd`. v1, 분류표, D34–D45 및 실제 코드 검토.
작성자: 현재 작업의 Codex. 별도 ChatGPT/Claude 세션에서 독립 검증을 실행한 것은 아니다.
v1은 이력으로 보존한다. 이 문서는 승인된 결정을 대체하지 않는다.

## 1. 핵심 결론과 현재 구현 범위

실패·환불 의도를 한 트랜잭션에 저장하는 방향은 맞다. 그러나 다음 주장은 수정해야 한다.

1. Stripe 재조회만으로 이벤트 순서 문제가 모두 없어지지 않는다. 조회 결과의 저장 순서도 제어해야 한다.
2. 같은 멱등 키가 영구적으로 중복 실행을 막는 것은 아니다. 불확실한 환불을 24시간 이후 무조건 재생성하면 안 된다.
3. 세션 ID가 없다는 사실은 Stripe 세션이 없다는 뜻이 아니다. 25분 경과만으로 새 주문을 만들지 않는다.
4. 24시간 약속과 36시간 환불은 서로 다른 시각이다. 법적 충분성을 단정하지 않고 제품 약속을 일치시키는 안을 Jason에게 질문했다.
5. 무료 할인 주문은 서비스 이용 권한은 생기지만 현금 매출/유료 구매자 수에는 포함하지 않는다.
6. 복구 링크로 생성되는 새 세션을 처리하려면 원래 주문의 세션 연결과 중복 구매 정책을 함께 설계해야 한다.

이번에 실제 수정:
- F8: ADMIN_EMAILS의 주소는 구매 이력이 없어도 인증 링크 요청 가능. 인증 전 관리자 권한 없음.
- F10 일부: 유효한 로그인 요청은 sent/not_sent/throttled/unavailable 모두 동일 HTTP 200. IP 429, 입력 400, 출처 403 유지. 비동기 outbox/시간 차이/분산 제한은 미구현.
- F5 일부: 관리자 retry의 큐 등록에 enqueueInTx 사용. 등록 실패 시 주문 변경과 함께 롤백. 추가 시도권·failed 복구·중복 클릭 UX는 미구현.
- 테스트: 실제 로그인 HTTP 경계 테스트 6건, 관리자 초기 인증 단위 테스트 1건 추가. 기존 3c의 하드코딩된 HTTP 변환은 제거하고 실제 route 테스트로 대체.
- 기존 재현 F/3a의 it.fails를 일반 it로 변경. DB 통합 실행은 아직 검증하지 않았으므로 완료 주장 금지.

결제·환불의 큰 구조 변경은 아래 설계를 기준으로 다음 구현 묶음에서 진행한다. 이 문서 자체가 해당 코드의 구현 증거는 아니다.

## 2. Jason에게 질문한 것 / 임의 변경 금지

| 항목 | 추천 | 응답 전 처리 |
|---|---|---|
| C2 무료 미리보기 | 승인된 일간 2–3문장 + 유료 구성 안내 | 새 UI 공개 보류 |
| D35 전달 약속 | 24시간 미전달 시 환불 개시 및 생성 중단으로 통일 | accepted 24h/36h를 임의 변경하지 않음 |
| D45 주소 | 유효한 사업용 우편 주소 확인 전 마케팅만 OFF | 지인 동의만으로 적법하다고 단정하지 않음 |

현재 일반 OPT이며 STEM 연장 기간이 아니다. 자영업 금지 전제로 출시를 막지 않는다. D05의 전공 관련성·보고·이주 후 Stripe 확인은 남는다.
이메일 발송·배포·구독 결제·live 전환은 이번 로컬 구현 권한에 포함되지 않는다.

## 3. F1–F15 교차검증

### F1 — 동의, 빠진 것 있음: 환불 실행자와 오래된 생성 작업

실패 시나리오: 이전 생성 작업 A가 느리게 끝나 실패 처리하는 동안, 관리자 재시도 B가 이미 풀이를 완성한다. A가 fencing token 없이 failed를 쓰면 정상 주문을 환불할 수 있다.

수정:
- claimRefundInTx(tx)는 주문을 잠그고 현재 payment/fulfillment/fencing token, 기존 환불, 열린 분쟁을 확인한다.
- failed + 환불 의도 + 작업 + 안내 outbox를 한 트랜잭션으로 쓴다. 예외 시 전부 롤백.
- worker 실패는 token 조건부 전이, deadline 실패는 DB 시각과 현재 마감 조건부 전이. delivered는 변경 불가.
- 웹 요청의 즉시 실행과 큐 실행에 같은 executeRefund를 사용하더라도 DB 실행 lease/token을 함께 쓴다. 초기 출시는 큐 실행 한 경로를 추천한다.
- API 성공 직후 DB 저장 전 종료도 재조회로 복구한다. requested 행만 있고 큐 작업이 없는 경우 재등록한다.
- 사과 메일에 환불 완료라고 미리 쓰지 않는다. requested/pending/succeeded 상태에 맞는 문구를 분리한다.
- $0 주문 실패는 환불 생성 없이 실패 기록·안내만 한다.

완료 기준: 모든 중단 지점에서 paid-but-unrecoverable 0, delivered 취소 0, provider 환불 최대 1회/작업.

### F2 — 동의, 연결 검증 추가

metadata.refundRowId만 믿고 다른 주문의 행에 붙이지 않는다. refund row ↔ order ↔ PaymentIntent/charge ↔ currency/amount ↔ livemode/account를 확인한다.
서비스 행 갱신과 provider 행 생성은 주문 잠금 아래 처리. 환불 ID 고유 제약 충돌은 재조회·병합 대상으로 처리하고 성공 이벤트를 잃지 않는다.
테스트: 웹훅 선행, API 응답 선행, 같은 이벤트 반복, 다른 주문 metadata, 부분 환불 여러 개.

### F3 — 수정 필요: Stripe 현재값 + 저장 순서 + 환불 부채

조회 A(pending) → 조회 B(succeeded) → B 저장 → A 저장이면 재조회했어도 상태가 후퇴한다.
- 주문별 동기화 lease를 DB에서 짧게 획득 → 트랜잭션 밖 Stripe 조회 → lease token을 확인하는 짧은 트랜잭션에서 저장.
- lease가 만료되거나 다른 실행자에게 넘어갔으면 옛 결과를 버린다. 작업 중 새 이벤트가 오면 dirty 표시 후 다시 조회한다. DB 락을 잡은 채 Stripe를 호출하지 않는다.
- 환불 단일 객체뿐 아니라 결제의 전체 환불 목록(페이지네이션)과 charge 현재값을 검증한다. 누적 금액 불일치는 조치 필요로 남긴다.
- 실제 은행 반환으로 환불이 나중에 실패할 수 있다. 일률적인 상태 숫자 순서로 failed 전이를 막지 않는다. failure_reason / failure_balance_transaction을 기록한다.
- 환불 실패로 돈이 돌아와도 고객에게 돌려줘야 할 의무가 없어지지 않는다. 무조건 paid로 되돌려 풀이 생성/매출 확정을 재개하지 않는다. payment facts와 fulfillment entitlement, refund obligation을 분리한다.
- unknown 오래된 요청은 같은 키 재호출 전 기존 환불을 metadata/charge로 조사한다. 키 보존 기간 이후 모호하면 새 요청 대신 조치 필요. 확인 없이 attempt 번호를 올리지 않는다.
- 이미 부분 환불됐다면 남은 금액만 환불한다. 열린 분쟁이 있으면 자동 환불 경로를 중지하고 조치 필요로 이관한다.

테스트: 조회 저장 역순, lease 만료, 25시간 API 응답 유실, 성공 후 실제 실패, 다른 부분 환불 잔존, 분쟁과 환불 경쟁.

### F4 — 수정 필요: 만료 시각 외 요청 전체 고정

expires_at 외 Price ID, URL, automatic_tax, 할인 허용, consent, metadata도 재배포/설정 변경으로 달라질 수 있다.
- 주문별 checkout attempt에 최초 요청 전체 또는 재구성 가능한 불변 필드를 저장한다. 비밀키는 저장하지 않는다.
- 25분 뒤 연결 ID가 없으면 unknown 상태로 조사한다. 기존 Stripe 세션을 찾거나 만료/미생성을 확인하기 전 대체 세션을 열지 않는다.
- 알려진 open 세션은 만료 결과 확인 후 대체한다. 만료 호출과 결제가 경쟁하면 Stripe의 최종 상태를 대사한다.
- 계정/모드, created window, metadata와 client reference 모두 확인 후 연결한다. metadata만으로 소유권을 부여하지 않는다.

테스트: 설정 변경 후 재시도, 생성 성공 DB 실패, 26분 후 재시도, expire와 complete 경쟁.

### F5 — 일부 구현, 추가 필요

enqueueInTx 수정 완료. D36의 +1 시도권은 generation_attempts에 가짜 LLM 시도 행으로 넣지 않는다. 실제 호출 횟수와 관리자 승인 권리를 별도 저장한다.
관리자 동작 request ID를 고유하게 저장해 더블클릭으로 +2가 되지 않게 한다. queued active 작업 중복 시 조용히 성공 표시하지 않는다.
refund 의도/분쟁/fulfilled 확인 + token 무효화 + 시도권 + 작업 + audit를 같은 트랜잭션으로 처리.

### F6 — 동의, 실제 환불액과 영구 거부 분리

검증 실패 주문의 기대 가격 399를 환불액으로 쓰면 안 된다. 잘못 받은 실제 통화·수납액·이미 환불된 금액을 provider에서 확인한다.
연결 확인 실패는 환불하지 않되, transient 미연결과 영구 거부를 구분해 나중 대사가 복구할 수 있도록 한다. 이벤트를 handled로 저장했다고 사건을 resolved로 만들지 않는다.
payment_issues는 (종류, provider object, mode) dedupe, opened/acknowledged/resolved, 다음 조치, 재시도 횟수/다음 시각, audit를 갖는다. 원문 이메일/출생정보/Stripe payload를 넣지 않는다.

### F7 — 수정 필요: 승인 커버리지와 내용 보존

필요 문구 전부 승인 검사는 동의. worker도 같은 검사를 수행한다.
결제 때 고정된 snippet ID/version/text와 prompt version을 암호화 스냅샷에 보존하거나 immutable version registry를 사용한다. 배포 뒤 현재 버전으로 조용히 바꾸고 경고만 남기는 방식은 피한다.
approvedBy를 자동으로 jason으로 바꾸지 않는다. 콘텐츠 승인은 Jason 몫이다.
테스트: 1개 미승인, 배포 중 버전 변경, 중복/누락 ID, staging draft와 production 승인 분리.

### F8 — 구현, DB 통합 확인 남음

새 관리자 이메일로 링크 요청 가능. 인증 전 권한 없음. ADMIN_EMAILS 변경/제거 즉시 권한 판정에 반영. 비밀 링크를 로그에 남기지 않는다.

### F9 — 동의, 잠금 순서·보존 추가

HMAC 이메일 식별값의 동일한 advisory lock을 모든 goodwill 경로에서 먼저 획득한 뒤 주문을 잠근다. 여러 주문을 잠그면 ID 정렬 순서를 고정한다.
거래 보존 중 deliveryEmailLookup 삭제 후에도 고객당 1회 정책을 어떻게 집행할지 정의한다. 최소 HMAC 권리 사용 기록의 목적·보존 기간을 privacy에 명시한다. 단순 해시는 익명화라고 부르지 않는다.
재현은 5회 운에 기대지 말고 barrier로 동시 자격 검사를 강제한다.

### F10 — HTTP 수정 완료, 비동기화 남음

실제 route 응답 테스트 추가. 내부 함수의 sent/not_sent 구분은 유지해도 된다. 기존 3c처럼 내부 결과를 옛 HTTP 코드로 직접 변환하는 테스트는 수정된 API를 검증하지 않는다.
outbox에 원문 토큰을 평문으로 저장하지 않는다. 암호화 payload + 짧은 보존, 발송 지연 시 만료된 링크 폐기/재발급 정책 필요.
다중 웹 인스턴스에서 DB 기반 IP/주소 제한 및 주소별 발송 예약을 원자적으로 수행. 응답 시간 차이는 outbox 후 측정한다. 단순 sleep은 남용 자원 소모를 늘린다.

### F11 — 동의, 집계 기준 보완

상품 순매출 = 할인 후 세전 상품 판매액 − 상품분 환불액. 세금 반환은 별도 원장. 부분 환불의 상품/세금 배분 및 반올림 잔여 센트는 최종 환불에서 정산한다.
Stripe fee 조회가 아직 안 됐으면 0이 아니라 미확인. balance transaction currency와 주문 통화가 다르면 섞어 합산하지 않는다.
대시보드 기간 활동은 돈의 발생 시각 기준, cohort는 최초 유입 집단 기준. 무료 주문과 유료 구매자를 구분한다. 은행 정산액/순매출/순이익은 서로 다르다.

### F12 — 수정 필요: 30분/48시간만으로는 부족

30분 간격은 약 1분 전달 약속의 장애 복구로 늦다. 짧은 주기(제안 2–5분) 미완료 주문 점검 + 30분 광역 대사 + 장기 미해결 backlog로 나눈다.
48시간보다 긴 장애 후에도 복구하도록 persistent cursor, overlap, pagination, 미해결 주문 무기한 backlog(보존 정책 범위 내)를 둔다.
provider 확인은 트랜잭션 밖, applyPaidSession은 order lock 아래 원자적 전이/작업 등록. 웹훅 ID와 합성 대사 ID가 달라도 주문 수준 중복 방지한다.
서명 웹훅 없이 대사로 제공하는 경우의 증거는 provider retrieve의 출처·조회 시각·검증 결과다. 가짜 webhook 서명을 만들지 않는다.
테스트: 100건 이상 페이지, 72시간 중단, 웹훅/대사 동시, 연결 ID 유실, 오래된 expired 주문 실제 결제, 다른 계정 세션.

### F13 — 결정 재검토 필요 / 용량 예약 추가

24h/36h 질문 응답 전 accepted 변경 금지. 이 디지털 서비스에 어떤 FTC 세부 규칙이 직접 적용되는지 확정하지 않는다. 일반적인 상품 배송 규칙을 그대로 법적 보증으로 인용하지 않는다.
고객 고지 동의는 화면에 실제 표시한 promise/version을 서버 발급 quote로 묶는다. 화면 확인 후 한도 상승 시 startCheckout이 몰래 24h로 바꾸면 안 된다. 새 고지 후 재동의를 받아야 한다.
paidAt(늦은 webhook 수신 시각 아님) 기준 due_at, scheduled_at, quote_version을 저장한다. 실제 결제 완료 시각의 신뢰 가능한 근거를 adapter에서 정의한다.
count 후 호출은 경쟁에 취약하다. UTC 날짜별 attempt budget을 DB에서 원자적으로 예약한다. 예약은 소비/해제/unknown을 구분한다. 대기 작업은 실패 시도 횟수에 넣지 않는다.
오늘 판매가 내일 용량을 계속 초과하면 자정 대기만으로 약속을 못 지킨다. 지연 주문 예약량과 다음날 용량을 측정한다. 예약 범위 초과 시 판매 중단/더 긴 고지 정책은 별도 결정 필요이며 몰래 구현하지 않는다.
UTC 자정의 미국 현지 시각은 DST에 따라 달라진다. 고정 동부20시/서부17시라고 쓰지 않는다.

### F14 — 수정 필요: Jason에게 가격 수작업을 맡기지 않기

에이전트가 선택된 모델의 공식 단가를 확인해 model ID + pricing version + effective date + source URL의 버전 파일로 관리한다. env override는 선택 기능으로만 둔다.
각 시도의 provider usage(입력/출력/cache read/cache write 등)를 저장하고 실패 시도의 확인 가능한 비용도 포함한다. timeout으로 usage를 모르면 0이 아니라 unknown/estimated.
가격 변경 후 과거 비용을 재계산하지 않도록 사용한 단가/version을 고정한다. 관리 화면에는 성공 주문당 총 시도 비용과 누락 비율을 표시한다.
모델 미선정 상태에서는 가격을 추측하지 않는다. API 키만 비밀 입력이 필요하다.

### F15 — 동의, $0 모델과 남용 방지 추가

complete + no_payment_required + total 0 + 정상 price/currency/qty/discount/tax 검증으로 무료 권한 허용. PaymentIntent 필수 규칙은 해당 경우만 예외.
현금 수납과 권한을 분리한다. 무료 주문은 매출/유료 전환에서 제외, 생성 실패해도 Stripe refund 요청 없음.
금액은 정수 센트, 할인 0..subtotal, shipping=0, total=subtotal-discount+tax를 확인한다. provider 현재값만 신뢰. promotion ID/쿠폰 ID와 코드 표시값을 구분한다.
사용 횟수 제한뿐 아니라 재시도/여러 기기/동시 적용을 테스트한다. $0 주문도 LLM 예산을 소비한다. Stripe가 거절하는 소액 부분 할인은 친절한 복구 UX를 제공한다.

## 4. L1–L8 교차검증

| ID | 판단 | 수정 방법 / 완료 기준 |
|---|---|---|
| L1 | 수정 필요 | CSP 보고 0건만으로 안전 판단 금지(수집 자체 실패 가능). 의도적 위반을 넣어 수집 확인 후 정상 auth/Checkout/Sentry/PostHog 경로를 테스트. nonce와 캐시 정합성, object-src none, base-uri, form-action 검토. CSP 보고의 URL/query도 PII 정제. |
| L2 | 동의 | next/font 빌드 네트워크 의존과 라이선스 확인. 재현 가능한 빌드가 필요하면 허용된 로컬 font 파일을 고정. 사용자 브라우저 Google 요청 0건 확인. |
| L3 | 빠진 것 있음 | robots는 접근 제어가 아니다. chart/order/reading/auth/admin은 권한 검사, no-store, noindex. sitemap에는 공개 페이지뿐. 개인 풀이를 OG에서 조회하지 않는다. |
| L4 | 수정 필요 | 길이/문자 제한만으로 PII 제거 안 됨(이메일 이름도 들어갈 수 있음). 운영자가 정한 campaign ID 사전 매핑 우선. referrer는 host만, 토큰/전체 URL/원문 query 저장 금지. |
| L5 | 수정 필요 | PostHog 기본 자동 pageview/pageleave/autocapture/replay는 전역 OFF에서 allowlist 이벤트만 켠다. SDK 기본 $current_url/$referrer도 검증. 해시 이메일을 distinct_id로 쓰지 않는다. 고유 사람 대신 관찰 가능한 브라우저/인증고객이라는 라벨 사용. 차단된 analytics는 DB 매출에 영향 없음. |
| L6 | 동의 | 테스트 결제 경로는 production/staging에서 환경변수 하나로 켜지지 않아야 함. 서버 env 다중 조건·응답 404 테스트. 별도로 진짜 Stripe test mode 계약 테스트 필요. fake만으로 adapter 검증 완료 금지. |
| L7 | 수정 필요 | 일100 외 월3000, 동시 발송, provider 수락 후 응답 유실까지 고려. DB 원자적 예약 + 실제 성공/unknown, provider 멱등 기간 이후 조사. 20통 예약만으로 월한도 부족 해결 안 됨. 대기 중 magic link 만료 처리. 관리자 알림 자체가 마지막 quota를 소비하지 않도록 대시보드 알림 병행. |
| L8 | 동의 | R9/R13/R10 각각 별도 테스트. 503에 비밀값/stack 금지. 경계 대안 UI는 현재 승인 정책을 바꾸지 않음. |

Resend 무료 플랜은 월 3,000/일 100통. 목표 2,507건의 전달 메일만으로 월 잔여 493통이다. 로그인·재발송·문의 메일을 포함하면 목표 매출 전에 유료 전환 가능성이 크다. 업그레이드 자동 구매는 하지 않고 예상 소진일을 관리자에 표시한다.

## 5. C1–C6 교차검증

| ID | 판단 | 수정 방법 / 완료 기준 |
|---|---|---|
| C1 | 동의 | 가상 샘플 표기와 Jason 문구 승인 유지. 샘플은 실제 생성 contract 검사 통과. 로딩/실패/시간 모름 상태까지 모바일 검토. |
| C2 | 승인 대기 | 미승인 문구 공개 금지. 미리보기는 현재 일간 문구이고 전체 개인 풀이인 것처럼 표시하지 않음. 잠금 UI가 실제 생성된 본문을 DOM에 숨겨두는 방식 금지. |
| C3 | 수정 필요 | wallets는 기기/브라우저에 따라 제공 여부가 다름을 반영. 환불 고객당1회 조건과 약속 시점을 정확히 표시. 결제 전 동의 quote 변경 시 재확인. |
| C4 | 수정 필요 | chart email 링크는 다른 기기에서도 mailbox 확인을 거쳐 해당 차트만 연결되어야 한다. guest ID를 공개 URL에 넣지 않음. unsubscribe는 로그인 불필요, GET 확인/POST 처리 및 RFC8058 POST 지원, 발송 직전 suppression 확인. 마케팅 철회가 transactional delivery를 막지 않음. |
| C5 | 수정 필요 | recovery 설정이 자동으로 모든 메일 발송을 완료한다고 가정 금지. provider event→동의/주소/suppression→dedupe outbox→발송 구조. recovered_from 새 세션과 original order 연결, 이미 구매/환불/삭제/미승인 콘텐츠/구버전 약속이면 복구 차단. 약속이 달라지면 새 고지 동의 없이 예전 링크로 결제시키지 않음. |
| C6 | 수정 필요 | 출생정보 없는 공개 share artifact와 private reading 분리. 공개 ID로 원문 풀이를 얻지 못하게 한다. 공유 URL에 guest/auth token 금지. 원본 삭제 뒤 share artifact 삭제/보존 정책 명시. |

CAN-SPAM 주소는 유효한 사업용 우편 주소가 핵심이다. 미국 지인의 동의만으로 충분하다고 확정하지 않는다. FTC는 실제 주소, 등록된 PO Box/상업 우편함 등을 안내한다. 국내법 외 실제 수신자 지역의 규정 적용은 별도 확인한다. 이 확인 전 마케팅만 OFF로 둘 수 있다.

## 6. 구현 순서와 테스트 계약

일정은 소요일수 확정 대신 완료 조건으로 관리한다. 기존 날짜는 목표이며 7일 완료를 보장하지 않는다.

1. **CC1a 환불 복구:** refunds/checkout_attempts/payment_issues 최소 스키마 → F1/F2/F3/F6/F9 → crash/경합 테스트. 개인정보 raw payload 금지.
2. **CC1b 결제 접수:** F4/F7/F12/F15 → Stripe test 계약검증. 무료 권한과 수납 분리.
3. **CC1c 전달:** F5 나머지/F13/F14/L7 → 고객 약속·자정·동시 예산·발송 장애 검증.
4. **CC2 출시 보호:** L1–L6 및 관리자 퍼널, 실제 키 test-mode smoke, 복구 훈련, 샘플 품질.
5. **CC3 전환:** C1 + 승인 시 C2/C3. C4/C5/C6는 구현 준비하되 주소/동의/복구 연결 검증 전 발송/공개하지 않는다.

마이그레이션 하나에 marketing_contacts와 결제 스키마를 모두 묶지 않는다. 각 묶음별 additive migration + backfill + 제약 적용 순서를 둔다. 마이그레이션 번호는 실제 마지막 migration 확인 후 정한다.
롤백은 데이터 삭제로 해결하지 않는다. 이전 worker/new web 동시 실행 여부와 feature flags를 명시한다.
복구 훈련 시 cron/메일/환불 네트워크를 비활성화한 새 test DB로 복원한다. 이전 lease/outbox 재생을 대사하고 보존 삭제 후에만 재개한다. 암호화 키 없이는 백업 복구가 안 되므로 별도 키 복원 절차도 검증한다.

필수 테스트 추가:
- RF01 실패 저장 직후 종료 / RF02 provider 성공 직후 종료 / RF03 동시 execute lease
- RF04 웹훅 선행 / RF05 오래된 조회 저장 / RF06 25시간 unknown / RF07 부분 환불 후 실패 / RF08 분쟁 경쟁
- CO01 고정 요청 재배포 / CO02 연결 없는 살아있는 세션 / CO03 expire-complete 경쟁
- CO04 100% 할인 / CO05 invalid amount 실제 환불액 / CO06 recovered session 중복 구매
- RC01 >100개 페이지 / RC02 72시간 장애 / RC03 webhook/reconcile 동시 전이
- DL01 고지와 서버 quote 변경 / DL02 UTC 자정 / DL03 cap 동시 예약 / DL04 backlog / DL05 token 잃은 실패
- AU01 최초 관리자 / AU02 인증 전 거부 / AU03 HTTP 응답 통일 / AU04 동시 링크 발송 한도
- EM01 월·일 동시한도 / EM02 수신거부 후 대기메일 / EM03 만료 로그인 링크 / EM04 accepted-response-lost
- PR01 analytics URL/query/SDK 자동속성 canary / PR02 private OG·sitemap / PR03 백업+키 복원

기존 it.fails는 실제 버그 재현 목록이지 출시 통과 증거가 아니다. C5 재현 테스트는 createRefund 호출 증가를 기대하지만 새 설계는 getRefund 조회가 맞으므로 테스트도 올바른 외부 동작으로 수정한다. 실패 재현 A의 중간 failed 상태 요구 역시 원자적 구현 후 바뀌어야 한다. 최종 불변식은 약화하지 않는다.

## 7. 사용자 공수 최소화와 AI 교차검증 방식

- Jason에게 diff/문서 전체 복붙을 반복 요청하지 않는다. 같은 폴더의 이 문서와 HANDOFF_CC1_CODEX.md를 다음 AI가 직접 읽는다.
- 에이전트가 단가 조회, 테스트 데이터 생성, migration, 실패 재현, 소스/테스트 diff 요약, 계정 설정 안내 초안을 준비한다.
- Jason에게 남는 일은 비밀키 직접 입력·가입 인증·도메인/유료 승인·콘텐츠 최종 승인·외부기관 답변이다. 가능한 계정 설정은 인증된 도구 접근이 있을 때 준비하되, 없으면 완료라고 주장하지 않는다.
- 다른 AI는 코드 수정 전 counterexample을 먼저 검토하고, 승인된 범위는 재현 후 수정한다. 새 정책 문제만 사용자에게 한 번에 묻는다.
- 단계별 CHANGES 문서에는 base/head, changed files, 실제 명령/결과, skipped, unresolved IDs를 기록한다. 테스트용 가짜 성공과 실제 제공자 검증을 분리한다.

## 8. 공식 근거와 미확인 범위

2026-09-24 확인:
- Stripe 환불/반환/분쟁: https://docs.stripe.com/refunds
- Stripe 멱등 키 동일 매개변수/보존: https://docs.stripe.com/api/idempotent_requests
- Checkout 객체(금액/payment_status/recovered_from): https://docs.stripe.com/api/checkout/sessions/object
- 무료 주문 가이드: https://docs.stripe.com/payments/checkout/no-cost-orders
- recovery 가이드: https://docs.stripe.com/payments/checkout/abandoned-carts
- FTC 주소/수신거부: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- Resend 요금: https://resend.com/pricing

무료 주문/recovery 가이드의 세부 variant 본문은 이번 웹 도구에서 접근 실패. 구현 때 고정된 SDK/API 버전의 필드와 Stripe test-mode 동작을 추가 검증한다. 링크 존재만으로 계약 검증 통과라고 쓰지 않는다.
24h/36h의 법적 충분성, 제3자 주소 적합성, 이주 후 Stripe 계정 유지, 개별 세금 분류는 확정하지 않았다.
