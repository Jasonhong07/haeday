# CC3 구현·검증 기록 · 2026-09-24 (전환: C1–C4, C6)

작성: Claude(Cowork). 기준: CC2 위. 커밋·배포·live·실제 메일 없음. 환경: 클라우드 작업공간(Node 22.22, pnpm 11.19, Postgres 16 `haeday_test`/`haeday_dev`, Chromium 1194).

## 1. 내용
| ID | 구현 | Jason 승인 필요 |
|---|---|---|
| C1 랜딩 | `src/app/page.tsx` 재작성: 무엇을 받는지 → 진행 방식 3단계 → 샘플(승인 전엔 숨김) → FAQ(가격·환불·AI 사용·개인정보) → 하단 CTA. **지어낸 후기·이용자 수·별점 없음** | 영문 카피 전체 |
| C2 무료 미리보기 | 명식 화면에 일간(Day Master) 핵심 문구 1개. `freePreview()`는 **Jason 승인된 문구만** 반환(초안이면 표시 안 함) | 일간 10개 core 문구 승인(Q7) |
| D42 샘플 | `src/content/sample.ts`: 가상 인물 샘플, `approvedBy: null`이면 랜딩에서 숨김 | 샘플 본문 |
| C3 결제 전 조건 | 결제 화면에 4줄: 결제 수단(Apple/Google Pay는 Stripe 화면에서), 할인 코드 입력 위치, 환불(자동 + 7일 내 1회, **12개월마다 1회** = D50), 전달·세금 | 문구 |
| C4 이메일 받기 | 명식 화면 "Email me my chart". 명식 **요약만**(일간·기둥) 전송, 생년월일·시간·장소는 메일에 없음. 마케팅 수신 동의는 **별도 체크박스(기본 해제)**, 동의 문구 버전·시각·요청 브라우저 기록. 원클릭 수신거부(RFC 8058 POST + 확인 페이지, 로그인 불필요, GET은 아무것도 바꾸지 않음) | D48 우편 주소 전까지 **마케팅 발송 OFF** |
| C6 공유 | 풀이 화면 공유 버튼(`src/lib/share.ts`): 일간 이미지·이름만, 풀이 본문·생년월일 없음 | — |
| 개인정보 페이지 | 차트 메일 주소 30일 보관, 마케팅은 체크한 사람만 + 수신거부 시 주소 즉시 삭제, PostHog 문구 제거(CC2에서 1차 이벤트로 대체) | 문구(법적 고지) |

### 남용·개인정보 보호 (주소는 검증되지 않은 입력)
- 브라우저당 하루 3개 주소, **주소당 하루 2통**(누가 요청하든). 전체 양은 CC1c 메일 예산(차트 메일은 한도 − 40)으로 제한.
- 다른 브라우저는 남의 명식을 메일로 보낼 수 없음(소유권 검사, `not_found`).
- 수신거부는 **이 양식으로 되돌릴 수 없음**: 누구나 아무 주소나 입력할 수 있으므로, 다시 체크해도 거부 상태 유지(CAN-SPAM). 거부 즉시 암호화된 주소 삭제, 키 해시(lookup)만 "다시 보내지 않기" 기록으로 남김.
- 수신거부 토큰은 연락처별로 **고정**(키 HMAC) → 예전 메일의 링크도 계속 작동. DB에는 해시만.
- 수신거부 페이지: `no-referrer`, `no-store`, noindex.
- 보관(D16): 차트 메일의 주소·요약·lookup은 30일 뒤 삭제. 거부한 연락처의 주소는 안전망으로 한 번 더 삭제.

마이그레이션 `drizzle/0005_email_capture.sql`(추가형): `marketing_contacts`(email_enc nullable, consent_guest_id), `email_outbox.payload_enc / guest_id / to_lookup` + 인덱스 2개.

### 계획과 다른 점
- **C5 장바구니 복구 메일: 구현 안 함.** 마케팅 성격이라 D48(CAN-SPAM 우편 주소) 확정 전 발송 불가. CO06(복구 세션 중복 구매)도 함께 보류.
- D50 코드 반영: 선의 환불 "12개월마다 1회"가 문구에만 있고 코드는 영구 1회였음 → 최근 365일 선의 환불만 세도록 수정(테스트 추가).

## 2. 변경 파일
- 신규: `src/server/email/capture.ts`, `src/app/api/chart-email/route.ts`, `src/app/api/unsubscribe/route.ts`, `src/app/unsubscribe/page.tsx`, `src/app/chart/[id]/ChartEmailForm.tsx`, `src/content/sample.ts`, `src/lib/share.ts`, `drizzle/0005_*`, `tests/integration/email-capture.test.ts`, `tests/e2e/global-setup.ts`
- 수정: `src/app/{page,privacy/page,chart/[id]/page,checkout/[chartId]/page,r/[readingId]/page}.tsx`, `src/app/globals.css`, `src/server/{db/schema,retention}.ts`, `src/server/email/{outbox,templates}.ts`, `src/server/fulfillment/prompt.ts`(`freePreview`), `src/server/payments/refunds.ts`(D50), `next.config.ts`, `playwright.config.ts`, `tests/e2e/{chart,foundation,full-flow}.spec.ts`, `tests/integration/commerce.test.ts`

## 3. 테스트
| 시나리오 | 결과 |
|---|---|
| 차트 메일 내용 | 요약만, 생년월일·시간·장소 없음, 체크 안 하면 마케팅 기록 0 |
| 남의 명식 | `not_found` |
| 브라우저당 3개/일 | 4번째 `rate_limited` |
| 주소당 2통/일(서로 다른 브라우저 3개) | 3번째 `rate_limited` |
| 동의 → 거부 → 다시 체크 | 거부 유지, 주소 null, 행 1개 |
| 수신거부 토큰 | 모르는 토큰은 무반응, 같은 연락처 토큰은 항상 같음 |
| 마케팅 플래그 OFF | `marketingAllowed` 항상 false(D48) |
| C2/D42 | 미승인 문구·샘플 숨김, 승인 시 표시 |
| D50 | 365일 지난 선의 환불은 다음 선의 환불을 막지 않음 |
| 스키마 | 모든 `_enc` 열이 보관 정책으로 null 가능 |

변이 검증: D50 기간 조건 제거 → 새 테스트 실패.

## 4. 실행 결과
- `TEST_DATABASE_URL=…/haeday_test pnpm check`: typecheck·lint OK, **295 passed**, 3 skipped(Stripe 계약 테스트, 키 없음).
- `pnpm build`: 성공.
- `pnpm e2e`(CSP enforce, iPhone 13, 새 DB): **13/13 passed**.
  - E2E 수정: 랜딩 CTA가 2개가 되어 `.first()`. 설정 캐시(30초) 때문에 판매 on/off가 테스트 순서에 따라 달라지던 문제 → `global-setup`에서 시작 전에 판매 열기. 결제 화면 체크박스를 하이드레이션 전에 누르면 무시되는 경우가 있어 재시도(아래 위험 참고).
- 독립 검토: Claude 서브에이전트(읽기 전용) 1회, 주요 2 + 부수 6건 → 7건 수정(재구독 차단, 고정 토큰, 개인정보 문구, 수신거부 헤더, 주소당 상한, 느린 집계 쿼리, D50 코드), 동의 기록 보강(브라우저 ID). ChatGPT: **NOT RUN**.

## 5. 위험 / 남은 것
- 결제 화면 체크박스: 페이지가 완전히 뜨기 전(수백 ms) 누르면 체크가 풀릴 수 있음. 버튼이 비활성으로 남아 다시 누르면 되므로 결제 오류는 아님. 다음 UX 단계에서 서버 렌더 폼으로 개선 가능.
- 이중 확인(double opt-in) 없음: 마케팅 발송을 켤 때(D48 이후) 확인 메일 방식을 권장. 지금은 발송이 꺼져 있어 영향 없음.
- Resend 실제 발송, List-Unsubscribe 헤더 동작: 도메인·키 이후 staging에서 확인(NOT RUN).
- Jason 승인 대기: 랜딩 카피, 일간 문구 10개, 샘플 풀이, 결제 전 조건 문구, 개인정보 페이지 문구, D48 주소.

추천 커밋: `feat(conversion): landing, gated preview, pre-pay terms, chart email with opt-in + unsubscribe, share (CC3)`
