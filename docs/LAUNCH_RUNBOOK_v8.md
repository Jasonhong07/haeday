# Haeday Launch Runbook v8 · Jason용 실행 지시서

**2026-09-24 기준 · v7과 RECOMMENDATION_V3를 교차검증해 대체하는 최신 사람용 문서**
코딩 에이전트용 명세는 `repo_kit/`, 에이전트 첫 지시는 `HANDOFF_PROMPT.md`, 판정 근거는 `RECOMMENDATION_V4_Final.md`.

---

## 0. 확정 사항 (DECISIONS.md 요약)
| | 결정 |
|---|---|
| 제품 | Haeday: 영어 사주 웹앱. 무료 명식 → $3.99 단건 리딩 (타로·궁합·대운·앱은 출시 후) |
| 사업 형태 | **개인사업자 + EIN** (Stripe Individual/Sole proprietorship) |
| 불확실성 | **누구에게나 판매.** 시간 모름·경계 출생은 고객 선택(정확/대략/모름, 경계 전후) 또는 결제 전 고지된 기본값으로 처리 |
| 2027 | 기본 리딩 안에 짧은 섹션, 추가상품 없음 |
| 결제 테스트 | test mode에서만. live에서 본인 카드 자기결제 테스트 금지(Stripe 약관) |
| 일정 | 10/2(금) 첫 실제 주문(게이트 통과 시) · 10/5(월) 공개 · 10/9(금) 최종 기한 · 10/11–13 배포 동결 |

**아직 외부 확인이 필요한 것 (D05):** 일리노이 상호(DBA) 등록 · 한국 이주 후 Stripe 주소/자격 · 세무 거주자 판정과 신고(CPA) · OPT 자영업 보고. 개발은 이것과 무관하게 오늘 시작합니다. live 결제 전환만 이 확인에 묶입니다.

---

## 1. 날짜별 캘린더 (Jason 하루 5시간 기준)

에이전트는 Jason이 다른 일을 하는 동안 코딩합니다. Jason 시간은 **셋업·검수·콘텐츠·승인**에 씁니다.

| 날짜 | Jason (시간) | 에이전트 마일스톤 | 게이트 |
|---|---|---|---|
| 9/24 목 | 셋업 §2 전부 (5h) | M0 기반 → M1 엔진 시작 | |
| 9/25 금 | CPA·Stripe·DSO 메일 발송, 도메인 연결, M0 결과 확인 (2h) · 라이브러리 작성 시작 (3h) | M1 엔진 | |
| 9/26 토 | 엔진 교차확인 10건 (3h) · 라이브러리 (2h) | M1 마무리 | |
| 9/27 일 | 엔진 게이트 판단 (1h) · 라이브러리 완료 (2h) · 대본 15편 초안 (2h) | M2 입력·무료 명식 | **9/27 엔진 게이트** |
| 9/28 월 | 무료 화면 폰 테스트 (1h) · Stripe 설정 (1h) · SNS 셋업 (1h) · 영상 3편 녹화 (2h) | M3 결제(test) | |
| 9/29 화 | 샘플 리딩 5개 읽기 (1h) · 영상 3편 (2h) · 정책 문서 초안 읽기 (1h) · 버퍼 (1h) | M4 리딩 생성 | |
| 9/30 수 | **리딩 15개 채점** (3h) · 피드백 정리 (2h) | M5 품질 튜닝 | |
| 10/1 목 | 복구·환불 직접 테스트 (1h) · 정책 문서 수정 (1h) · 체크리스트 (2h) · 영상 편집 (1h) | M6 → M7 | **10/1 돈·권한·복구 게이트** |
| 10/2 금 | live 전환 판단 (1h) · 지인·한인 커뮤니티 소프트 오픈 (1h) · 모니터링 (1h) · 영상 (2h) | M7 마무리, 버그 | **10/2 제한 판매** |
| 10/3 토 | 영상 6편 + 롱폼 1편, 예약 (5h) | 버그 수정 | |
| 10/4 일 | 첫 게시, 댓글 대응 (2h) · 버퍼 (3h) | 버그 수정 | |
| 10/5 월 | **공개 출시**, 모니터링 (3h) | 지표·버그 | **10/5 공개 조건** |
| 10/6–10 | 운영 + 콘텐츠, 10/10까지 채널별 예약 채우기 | P1 착수는 안정화 후 | |
| 10/11–13 | 이사. 알림만 확인 | 배포 동결 | |

Jason 시간 합계(9/24–10/2): 45시간 / 가용 45시간으로 여유가 없습니다. 그래서 **밀리면 영상 제작을 10/3–10/4로 몰고, 엔진·결제·복구 시간은 줄이지 않습니다.**

**게이트 규칙**
- 9/27 엔진 게이트: fixture 전부 통과 + 한국 앱 교차확인 차이 설명 완료 → 계속. 미통과면 M2–M4는 계속 만들되 판매 오픈만 미룸(D10).
- 10/1 게이트: TASKS M3·M4·M6 테스트 전부 PASS.
- 10/2 제한 판매: 10/1 게이트 + Stripe 계정 승인 + D05 확인(최소한 Stripe 이주 문의 답변 + CPA 1차 답변) → Jason이 `LIVE_PAYMENTS_APPROVED=true`.
- 10/5 공개: 10/2 이후 실제 주문에서 미제공·오류 0건.
- 10/9까지 못 열면: 결제는 이사 후 10/19 주로 미루고, 그 사이 랜딩은 **무료 명식 + 대기자 이메일**로 운영(마케팅은 멈추지 않음).

---

## 2. Jason 셋업 (9/24, 약 5시간)

### 2.1 도메인·이메일 (30분)
1. USPTO 상표 검색(tmsearch.uspto.gov)에서 `HAEDAY`, `HEYDAY` + 점성·운세·앱 관련 서비스(class 9, 41, 45) 검색. 결과 캡처를 폴더에 저장.
2. Cloudflare 가입 → Registrar → `haeday.com` 구매. 없으면 `haeday.app` / `gethaeday.com`.
3. Cloudflare Email Routing: `hello@haeday.com` → 본인 Gmail. Gmail에서 `hello@` 명의로 **보내기**는 Resend 도메인 인증 후 따로 설정(수신과 발신은 별개).

### 2.2 EIN (15분)
1. irs.gov → "Apply for an EIN online" (유료 대행 사이트 주의).
2. **Sole proprietor** → Started a new business → Responsible party: 본인, SSN.
3. Trade name: **Haeday**. 주소·시작일·직원(0)·업종(Other: online entertainment content)은 사실대로.
4. 발급 화면의 확인서(CP 575) PDF를 즉시 저장. 분실 시 대안은 계정 자격에 따라 다르므로 저장이 유일하게 확실한 방법.

### 2.3 일리노이 상호 등록 (DBA, 30분 확인)
"Haeday"라는 이름으로 영업하면 일리노이 Assumed Business Name Act에 따라 거주 county(Evanston = Cook County) 등록과 신문 공고가 필요할 수 있습니다.
1. Cook County Clerk 웹사이트에서 "Assumed Business Name" 신청 방법·수수료 확인.
2. 10/13 이주 후에도 필요한지는 CPA 질문 목록에 포함(§2.6).
3. 확인 전까지 Terms의 판매자 표기는 "Jason Hong, doing business as Haeday".

### 2.4 Stripe (40분 + 심사 대기)
1. stripe.com 가입(`hello@haeday.com`) → Activate payments → **Individual / Sole proprietorship**.
2. 법적 이름 = 본인 이름(IRS와 동일), Tax ID = EIN, 주소 = 현재 실제 미국 주소, 웹사이트 = staging URL 또는 도메인(M0 후).
3. 상품 설명: "AI-assisted Korean astrology (saju) readings for entertainment and reflection. One-time digital purchase, USD 3.99."
4. Statement descriptor: **HAEDAY**. 정산 계좌: 본인 미국 계좌.
5. Settings: Apple Pay·Google Pay 켜기, Radar 기본 규칙, Stripe Tax는 **모니터링 + 상품 tax code 설정**까지(등록·신고는 임계치 도달 시 별도 판단).
6. Dashboard에서 Products → "Haeday Saju Reading" $3.99 생성 → Price ID를 에이전트에게 전달(test/live 각각).
7. **Stripe 지원팀 문의 발송 (아래 템플릿).** 10/13 이후 한국 거주 시 개인사업자 계정 유지·주소 변경·정산 가능 여부. private mailbox/PO Box는 주소로 쓰지 않음.

> **Stripe support template**
> Hello, I operate a US sole proprietorship (EIN issued) selling one-time digital readings (USD 3.99) via Stripe Checkout. On October 13, 2026 I will relocate from Illinois to South Korea and will continue to operate the business remotely, keeping my US bank account for payouts. Could you confirm what my account needs after the move: acceptable business address, representative address, and whether payouts can continue? If a US entity is required, which options do you support? Thank you.

### 2.5 OPT 자영업 보고 (20분)
1. SEVP Portal에 자영업(Haeday, 시작일, 전공 관련 업무 설명) 등록 여부 확인 및 입력.
2. DSO 이메일 발송 (아래 템플릿). 실제 하는 일만 적기: 고객 분석, 가격, 제품·운영 관리.

> **DSO template**
> Hello, I am on post-completion OPT (EAD valid 08/10/2026 to 08/09/2027). I have started a self-employed business (Haeday, an online digital product) related to my MBA: product strategy, pricing, customer analytics and operations. I will relocate to Korea on October 13, 2026. Could you confirm how I should report this self-employment in the SEVP Portal and what documentation I should keep? Thank you.

### 2.6 CPA 이메일 (10분)

> **CPA template**
> Hello, I started a sole proprietorship (EIN issued, trade name Haeday) selling USD 3.99 digital readings via Stripe from September 2026. I have been in the US on F-1/OPT since 2024 and will move to Korea on October 13, 2026 to start a full-time job. Could you advise on: (1) my 2026 US tax residency status and which returns apply (e.g. 1040-NR with Schedule C or other), (2) state filings for Illinois, (3) sales tax obligations for digital products and when to register, (4) Korean tax reporting of this income after the move, (5) whether I need an Illinois assumed-name filing and whether an LLC would be better going forward, and (6) your estimated fees. Thank you.

### 2.7 개발 계정 (40분)
| 서비스 | 할 일 |
|---|---|
| GitHub | private repo `haeday` 생성 |
| Railway | 가입, 프로젝트 생성, Usage alert $20 |
| LLM API | Anthropic 또는 OpenAI 키, 월 한도 $30 (모델은 M4에서 에이전트가 제안, Jason 승인) |
| Resend | 가입, 도메인 추가, Cloudflare DNS에 SPF/DKIM 입력 |
| PostHog | US Cloud 프로젝트 |
| Sentry | Next.js 프로젝트, 휴대폰 앱 설치(푸시 알림) |

### 2.8 Windows 개발 환경 (40분)
1. Git for Windows (Git Bash 포함) 설치.
2. Node.js **LTS** 설치 → Git Bash에서 `node -v` 확인 → `npm install -g pnpm` (corepack 사용 안 함).
3. Python 3.12 설치(설치 시 "Add to PATH" 체크) → `python --version`.
4. VS Code 설치.
5. Stripe CLI 설치(Stripe 문서의 Windows 방법) → `stripe login`.
6. Claude Code 설치(또는 사용할 AI 코딩 도구) → 터미널에서 실행 확인.

### 2.9 SNS 핸들 (20분)
TikTok·Instagram·YouTube `@haeday`(없으면 `@haeday.saju`, 세 곳 동일). Instagram은 Creator 계정. TikTok 웹사이트 링크는 팔로워 1,000명 또는 Registered Business Account가 필요하니 처음엔 "Search Haeday" CTA 사용.

---

## 3. 개발 진행법

### 3.1 시작
1. `git clone` 한 repo 폴더에 이 폴더의 `repo_kit/` **안의 내용물**(CLAUDE.md, AGENTS.md, docs/)을 그대로 복사 → commit.
2. 코딩 AI 실행 → `HANDOFF_PROMPT.md`의 **Kickoff prompt** 붙여넣기.
3. 에이전트가 계획과 필요한 키 목록을 주면, 돈·스키마 계약·인증을 **바꾸는지만** 확인하고 승인.

### 3.2 마일스톤 루프 (M0 → M7)
1. 새 세션(또는 `/clear`) → HANDOFF_PROMPT의 **Milestone prompt**에 번호만 바꿔 붙여넣기.
2. 끝나면 에이전트 보고를 읽고 아래 "Jason 확인"을 직접 해본다.
3. 이상 없으면 "commit and push" 지시 → 다음 마일스톤.

| M | Jason 확인 (직접 해볼 것) |
|---|---|
| M0 | staging URL이 폰에서 열림 · Sentry에 테스트 이벤트 · LAUNCH_EVIDENCE에 트랜잭션 테스트 PASS |
| M1 | 본인·가족 생일 3개를 포스텔러·8자어때(해외 출생 설정)와 비교 · crosscheck.md 10건 채우기 · `data/jie_1900_2100.json` 업데이트 diff 승인 |
| M2 | 폰에서 1분 안에 명식 · "Roughly"/"I don't know" 모두 판매 버튼이 보임 · 경계 질문 문구 자연스러운지 · 공유 이미지에 생일 없음 |
| M3 | 테스트 카드 4242로 결제 → /order 상태 → paid · 결제 창 두 번 눌러도 주문 1건 |
| M4 | 결제 후 1분 안에 리딩 · 샘플 5개 읽고 메모 |
| M5 | 15개 채점 (§4.2 기준) ≥ 12개 합격 |
| M6 | 다른 브라우저에서 이메일 로그인으로 리딩 복구 · /refund로 환불 → 상태 pending/succeeded 표시 · /admin에서 soft stop 켜고 끄기 |
| M7 | 정책 3페이지 직접 읽고 사실과 다른 문장 수정 · §5 체크리스트 전부 PASS |

---

## 4. Jason 콘텐츠 작업

### 4.1 해석 라이브러리 (9/25–9/27, 약 7시간)
`content/library/` 5개 파일, 합계 약 2,550 영어 단어(PRD §9). 한국어로 먼저 쓰고 AI로 영문화 → 본인 검수. 각 항목에 id·version·approvedBy.
1. day-masters (甲~癸 10개): 핵심 기질 3줄, 연애 2줄, 일 2줄, 그림자 1줄
2. elements: 오행 5개 × 많을 때/적을 때 (**빈도 기준 표현**, 신강·용신 판단 아님)
3. ten-gods: 10개 한 줄 정의 + 생활 속 모습
4. year-2027: 丁未년 일반 + 일간 10개별 한 문단
5. tone: 금지 표현 목록(예언·공포·건강·투자), 좋은 문장 예시 3개

### 4.2 리딩 채점표 (9/30)
각 샘플을 5개 항목 1–3점: 근거 일치(사실·snippet과 맞는가) · 개인화 · 영어 자연스러움 · 반복/모순 없음 · 불확실성 표현(시간 모름·고지 문구). **사실 오류나 위험한 단정이 하나라도 있으면 점수와 무관하게 불합격.** 15개 중 12개 합격이 기준.

---

## 5. 출시 체크리스트 (LAUNCH_EVIDENCE에 증거 기록)
- [ ] fixture F01–F30 PASS, crosscheck 10건 설명 완료
- [ ] fold/gap/경계 질문/시간 모름 기본값 고지 문구가 결제 전 화면에 보임
- [ ] test mode: 성공·거절·3DS·중복 이벤트·환불 후 늦은 completed·금액 불일치·success URL 직접 접근 모두 기대대로
- [ ] 결제 → 60초 내 리딩, LLM 실패 3회 → 자동 환불 + 사과 메일
- [ ] 메일 실패 시 리딩 재생성·환불 없음
- [ ] 다른 사람의 리딩 접근 불가, 체크아웃에 관리자 이메일 입력해도 권한 없음
- [ ] 동시 환불 요청 → Stripe 환불 1건
- [ ] PostHog·Sentry·로그에 생일·이메일·토큰 없음(테스트로 확인)
- [ ] 보관 cron(30일·12개월) 시계 이동 테스트
- [ ] staging 백업 복원 드릴 완료
- [ ] soft stop/hard stop 폰 브라우저에서 동작
- [ ] Privacy·Terms·Refunds 게시, 판매자 표기 D04와 일치
- [ ] Stripe live 승인 + Stripe 이주 문의 답변 확인 + CPA 1차 답변 → `LIVE_PAYMENTS_APPROVED=true`
- [ ] live 전환 후 **첫 실제 고객 주문**의 제공·메일·정산을 관찰 기록 (자기결제 테스트 아님)

---

## 6. 마케팅 실행 (v6 정정 반영)
- 링크 구조: `haeday.com/go?utm_source=ig|tt|yt&utm_medium=social&utm_campaign=launch&utm_content=<영상ID>`
- **Instagram(전환):** bio 링크 + "Comment CHART" → ManyChat 무료(월 활성 연락처 25명)로 자동 DM, 넘치면 수동 DM 후 월 결제 업그레이드 검토. 생일을 댓글로 받지 않음.
- **TikTok(인지도):** 링크 조건 충족 전까지 "Search Haeday on Google" 또는 "link in my Instagram". Business 계정은 Commercial Music Library만.
- **YouTube Shorts(검색 자산):** 채널 링크는 기능 인증 후. 영상 끝 음성 CTA.
- **마스터 영상은 음성만 있는 파일**, 음원은 각 플랫폼 앱에서 추가.
- **예약 용량:** Buffer 무료는 채널당 10개 → 하루 2편이면 5일, 1편이면 10일. 이사 기간(10/11–13 + 도착 후 적응)은 **하루 1편으로 줄여 10/10에 10개 예약** → 10/20까지 커버.
- 게시 시간은 America/New_York 기준으로 예약.
- 첫 주 목표: 게시 12–14편, 사이트 방문 300+, 무료 명식 120+, 유료 5–10건. 100건은 30일 목표(필요 방문 약 3,125–5,000회 추정).
- **Stripe 승인이 늦어도 마케팅은 예정대로.** 결제 전까지는 무료 명식 + 대기자 이메일(별도 동의)로 전환.

---

## 7. 운영
`repo_kit/docs/OPERATIONS.md` 참고. 한국 이주 후 매일 오전 8시(KST) 10분 점검: 미제공 주문, 환불 대기, 분쟁, Sentry, 고객 메일.

---

## 8. 예산 (첫 달 현금, 확인 전 값은 범위)
| 항목 | 비용 |
|---|---|
| 도메인 | 약 $10–20/년 |
| EIN | $0 |
| Cook County DBA (필요 시) | 수수료 + 신문 공고비, 확인 필요 |
| Railway | $10–20/월 |
| LLM API | $10–30/월 (한도) |
| Resend·PostHog·Sentry·Buffer·ManyChat·Cloudflare Email | $0 (무료 플랜) |
| Stripe | 거래당 2.9% + $0.30 (카드 기준) |
| CPA 상담·신고 | 견적 대기 (별도 예산) |
| **합계(CPA 제외)** | **약 $30–70 + DBA 비용** |

주문당 기여이익(가정: 카드 수수료, LLM+메일 $0.18, 환불 5%): 약 **$3.19**. 제휴 20% 적용 시 약 $2.44.

---

## 9. 리스크 레지스터
| 리스크 | 신호 | 대응 |
|---|---|---|
| 엔진 오류 | fixture 실패, 고객 문의 | 판매 soft stop, 수정 후 정책 버전 올림, 영향 고객 환불 제안 |
| 이주 후 Stripe 제한 | Stripe 답변/대시보드 요구 | LLC 또는 Atlas로 전환 계획(CPA와), 그동안 판매 중지 |
| 리딩 품질 불만 | 환불률 > 5% | 라이브러리·프롬프트 개선, 샘플 재채점 |
| 카드 테스트 공격 | 소액 결제 급증·거절 급증 | Radar 규칙 강화, rate limit 낮춤, hard stop |
| LLM 장애/비용 | 실패율·비용 알림 | soft stop, 모델 대체 |
| SNS 도달 부진 | 2주 평균 조회 < 300 | 훅 교체, 기둥 비중 조정, 크리에이터 제휴 앞당김 |
| 이사 중 장애 | 알림 무응답 | 자동 환불 cron이 고객 피해 차단, 10/10 soft stop 폰 테스트 |
| 시간 부족 | 게이트 미통과 | 10/9 최종 기한, 이후 10/19 주로 결제 이동, 무료 명식+대기자로 유지 |
