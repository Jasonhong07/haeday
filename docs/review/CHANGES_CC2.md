# CC2 구현·검증 기록 · 2026-09-24 (출시 보호: L1–L6, L8, D40 퍼널)

작성: Claude(Cowork). 기준: CC1c 위. 커밋·배포·live·실제 메일 없음. 환경: 클라우드 작업공간(Node 22.22, pnpm 11.19, Postgres 16 `haeday_test`, Chromium 1194).

## 1. 내용
| ID | 구현 |
|---|---|
| L1 CSP | `src/proxy.ts`(Next 16 proxy)에서 요청마다 nonce 발급. `script-src 'self' 'nonce-…' 'strict-dynamic'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `connect-src 'self'`, `font-src 'self'`, `img-src 'self' data: blob:`(공유 이미지). style은 React style 속성 때문에 `'unsafe-inline'`(스크립트 주입이 막을 대상). `CSP_MODE` = report-only(기본) / enforce / off. 위반 보고 `/api/csp-report`는 지시어 + 차단된 **호스트**만 기록(경로·쿼리·페이지 URL 없음). 모든 페이지를 요청마다 렌더(nonce 필요) |
| L2 폰트 | Google Fonts `@import` 제거. npm `@fontsource/*`(SIL OFL 1.1, 버전 고정) 번들 → 자체 도메인에서 제공, 빌드에 네트워크 불필요. 빌드 산출물에 googleapis/gstatic 참조 0 |
| L3 SEO | `robots.ts`(운영만 색인, 개인 경로 disallow), `sitemap.ts`(공개 6개 페이지만), `opengraph-image`(브랜드 고정 이미지: 개인 풀이 조회 없음), `icon.svg`, `manifest`, 메타데이터(OG·Twitter). 개인 페이지는 `Cache-Control: private, no-store` + `X-Robots-Tag: noindex`(실제 보호는 소유권 검사) |
| L4 유입 채널 | `/go?c=<id>`: **우리가 정한 캠페인 목록**(`src/lib/campaigns.ts`)만 인정, 그 외는 "other". referrer는 **호스트만** → search/social/other/직접. 이메일 등 입력값이 저장될 수 없음 |
| L5 퍼널(D40) | 제3자 분석 도구 대신 **1차 이벤트**: `visit`, `form_started` 두 이름만, 무작위 방문자 ID, 채널 라벨(방문자·이벤트·UTC일당 1행). 나머지 단계(명식 생성·조회, 결제 시작·완료, 생성, 열람)는 서버 DB. 관리자 화면: 8단계 기간 활동량 + 같은 방문자 집단 전환율 + 채널별 방문자→구매자, 환불률·생성 실패율. "사람"이 아닌 "브라우저" 기준임을 명시. 이벤트 400일 보관 |
| L6 전체 흐름 E2E | `DEV_FAKE_PROVIDERS=true`일 때만 가짜 Stripe(`/dev/pay`)와 가짜 LLM. **APP_ENV=dev + test 모드 + 실제 키 없음**이 아니면 설정 자체가 거부됨(서버 시작 실패). Playwright(휴대폰 화면, **CSP enforce**): 입력 → 명식 → 결제 → 가짜 결제 → 실제 웹훅 처리·생성 검사 → 풀이 열람 → 퍼널 기록 확인, CSP 위반 0 |
| L8 | R9: 경계 경고에 "그렇다면 시주가 乙巳가 됩니다" 식으로 바뀌는 기둥 표시(표시만, 정책 불변). R10: 부팅 때 도시 색인 미리 로드. R13: 친절한 오류·404 페이지(오류 메시지·스택 비노출) |

마이그레이션 `drizzle/0004_funnel.sql`: `funnel_events`, `guests.visitor_id`, `chart_revisions.first_viewed_at`, `readings.first_viewed_at`.
PostHog: 사용하지 않음(가입 불필요). 브라우저에서 제3자 요청 0이라 CSP도 단순. 나중에 필요하면 같은 허용 목록으로 추가 가능.

## 2. 테스트
- `tests/launch-protection.test.ts`: CSP 지시어·보고 정제(이메일/생년월일이 든 URL → 호스트만), 채널(목록 외 = other, URL은 호스트가 아니므로 버림), dev 가짜 거부(staging·Stripe 키·LLM 키), robots/sitemap(비운영 전면 차단, 운영은 공개만).
- `tests/integration/funnel.test.ts`: 4개 여정으로 8단계 활동/집단/채널 수치, 무료 주문 제외, 같은 날 중복 방문 1회, 이벤트 테이블 열 5개(개인정보 없음).
- `tests/e2e/full-flow.spec.ts`: 위 L6 흐름 + 외부 출처의 dev 결제 호출 404.

## 3. 실행 결과
- `pnpm check`: typecheck·lint OK, **289 passed**, 3 skipped(Stripe 계약 테스트).
- `pnpm e2e`(CSP enforce, iPhone 13 화면): **13/13 passed**(기존 11 + 전체 흐름 2). 기존 차트·결제 후 페이지도 CSP 강제 상태에서 통과.
- `pnpm build`: 성공, 폰트 외부 참조 0.
- 독립 검토: CC3와 함께 1회 예정. ChatGPT: NOT RUN.

## 4. NOT RUN / Jason 필요
- staging에 `CSP_MODE=report-only`로 배포 후 이틀간 위반 로그 확인 → `enforce`로 변경(Railway 변수 1개).
- 운영 환경을 **테스트 키로** 만들어 스모크(명식·결제 4242·풀이·메일·환불·관리자): Railway 운영 서비스 생성 필요.
- DB 복구 훈련(백업 → 새 DB 복원 → 앱 연결, 암호화 키 복원 절차 포함): Railway 백업 기능 사용, staging에서.
- 캠페인 목록(`src/lib/campaigns.ts`)에 실제 쓸 채널 이름 확정(지금은 tiktok, instagram 등 기본값).
