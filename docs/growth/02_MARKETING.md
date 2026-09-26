# 최소 비용 마케팅 운영 설계

## 1. 목표와 대상

초기 대상 가설: 영어를 사용하며 한국 문화·자기 이해·점성술 콘텐츠에 관심 있는 성인. 제품은 영어이므로 처음에는 영어 원본을 검증한다. 한국인이라는 민족 정체성을 모든 사용자에게 요구하지 않음.
수익은 쇼츠 광고 RPM이 아니라 $3.99 풀이 구매. 일본어/스페인어가 더 싼 시장이라는 보편적 근거는 없음. 광고를 사지 않으면 CPM보다 제작 시간·사이트 클릭·제품 언어 일치가 중요하다.

확장 기준: 영어 흐름에서 실제 결제와 낮은 오류/환불을 확인한 후 스페인어 또는 일본어 한 언어만 파일럿. 광고/랜딩/결제 안내/풀이/지원까지 일치시킬 비용을 계산한다. 번역 영상만 만들고 영어 구매로 보내는 테스트는 언어 이탈을 따로 측정한다.

## 2. 채널 포트폴리오

| 채널 | 역할과 첫 형식 | 링크 경로 | 초기 운영 |
|---|---|---|---|
| Instagram | Reels + 저장 가능한 carousel, 브랜드 기억 | 프로필의 무료 명식 링크, 지원되는 Story 링크 | 주5 Reels + 주2 carousel 목표 |
| YouTube | Shorts로 발견, 2–4분 설명 영상으로 이해 | 채널 프로필 링크 / 관련 설명 영상 | 주5 Shorts + 격주 설명 영상 |
| TikTok | hook/댓글 반응 실험, 화면 중심 튜토리얼 | 웹사이트 링크 자격 확인 후 프로필 | 주5 원본 변형, 링크 자격 없으면 브랜드 검색·연결 계정 기능 확인 |
| Pinterest | day-master 카드·방법 설명을 장기 발견 자산으로 | 각각 관련 공개 landing | 주3 정적 카드, 초기 가설 |
| Facebook Reels | 같은 원본의 추가 노출 실험 | Page 정보의 링크 | 주2, 실제 추가유입 없으면 중단 |
| Threads / X / Bluesky | 짧은 설명과 제작 과정, 질문 대응 | 관련 공개 문서 링크 | 하나만 주2 실험; 전부 매일 운영하지 않음 |
| Reddit / 관심 커뮤니티 | 사주 계산/시간 모름에 대한 실질 답변 | 커뮤니티가 허용할 때만 소속 공개 | 홍보 금지 게시판에 링크 투하/자동 DM 금지 |
| SEO | 사주/일간/출생시간 모름 등 질문 해결 | 공개 설명 → 무료 명식 | 초기5페이지, 중복60페이지 대량생성 금지 |
| 이메일 | 요청한 명식 복구·동의한 재방문 | 로그인/공개 설명 | D41/D48 조건 충족 후 마케팅, 전달메일은 별도 |

‘모든 채널’은 하나의 제작물을 배포할 수 있는 경로를 확보한다는 뜻. 계정 수를 늘리는 것보다 검수 가능한 운영량을 우선한다. 채널 생성·연결·예약 게시 실제 실행 전 현재 소유 계정/핸들/로그인 권한 확인 필요.

공식 제약: YouTube Shorts 설명/댓글 URL은 클릭되지 않는다. CTA를 “link in description”으로 만들지 않는다. [YouTube 링크 안내](https://support.google.com/youtube/answer/13748639?hl=en-GB)
TikTok 프로필 웹 링크는 팔로워1,000 또는 Registered Business Account 조건이 있으며 일반 Business 전환과 동일하지 않다. [TikTok 링크 안내](https://support.tiktok.com/en/getting-started/setting-up-your-profile/linking-another-social-media-account?lang=hi)

## 3. 도구 선택과 비용

| 작업 | 기본 추천 | 비용/제약 | 에이전트 담당 |
|---|---|---|---|
| 대본/팩트 | 기존 AI + 승인 snippet | 기존 이용량 내, 별도 생성 API 불필요 | 초안·금지표현 검사·snippet 매핑 |
| 카드/영상 화면 | 원본 HTML/SVG 템플릿, 필요 시 Canva Free | 원본 제작은 외부 asset비0. Canva Pro asset은 유료/라이선스 확인 | 9:16/4:5/1:1 리사이즈 |
| 편집 | CapCut 기본 또는 DaVinci Resolve 무료 | CapCut 일부 AI기능/asset는 유료일 수 있음. 기기별 실제 export 검증 | 컷/자막/무음 master |
| 반복 렌더 | 로컬 FFmpeg + 자체 화면 프레임 | 도구 사용료 없음, PC 시간/라이선스 확인 | 데이터 기반 배치 생성·QA |
| 예약 | 네이티브 Studio/플랫폼 우선, 필요 시 Buffer Free | Buffer 3채널·채널당 예약 대기10개 | 승인된 초안 배치, 연결 가능한 형식 확인 |
| 음성 | 초기 사용 안 함 | 0 | 큰 자막과 변화하는 도식으로 전달 |
| 음악 | 무음 master 기본 | 플랫폼 내 음원 권리가 다른 플랫폼으로 이전되지 않음 | 상업용/다중플랫폼 라이선스 확인 후 선택 |

[CapCut 편집 기능](https://www.capcut.com/tools/online-video-editor), [DaVinci Resolve](https://www.blackmagicdesign.com/products/davinciresolve), [Canva 라이선스](https://www.canva.com/licensing-explained/), [FFmpeg](https://ffmpeg.org/legal.html), [Buffer 무료 한도](https://buffer.com/pricing).

고가 AI 영상 생성/TTS 구독은 첫 단계에서 필요 없다. CapCut의 무료 소개는 모든 기능·음악의 영구 무료 상업권 보증이 아니다. 구매 전 워터마크/출력해상도/상업권을 실제 파일 단위로 검증한다.

## 4. 얼굴·목소리 없는 제작 시스템

콘텐츠 한 개 = 새로운 설명 또는 시각적 비교 한 개. 배경만 바꾸며 같은 문장을 대량 복제하지 않는다. YouTube는 반복·대량 생산 콘텐츠의 수익화를 제한하므로 광고 수익도 전제하지 않는다. [공식 정책](https://support.google.com/youtube/answer/1311392?hl=en-GB)

제작 데이터 예시:
```json
{"id":"en-time-01","language":"en","series":"explain","hook":"Don't know your birth time?","scenes":[{"seconds":3,"text":"You can still start."}],"approvedSnippetIds":[],"cta":"Free chart in our profile","licenseNotes":"Original vector artwork; silent","status":"draft"}
```

파이프라인: 주제10개 초안 → 5개 선택 → 정책/사실 검수 → 20–30초 장면 구성 → 원본 master → 플랫폼별 CTA/자막 safe area → 파일명과 source ID → 사용자 승인 → 예약 → 48시간/7일 기록.
자동화할 부분: 렌더, 자막 배치, 사이즈 변형, caption 초안, 링크ID, 지표 집계. 자동화하지 않을 부분: 근거 없는 개인 풀이 발행, 승인 없는 게시, 댓글 봇, 계정 대량 생성, 생년월일 댓글 수집.
초기 제작 3–5시간/주, 안정 후 2–3시간/주라는 **계획 추정치**. 에이전트가 준비하고 Jason 검수는 묶음당15–20분 목표. 실제 측정 후 조정.

## 5. 콘텐츠 시리즈와 바로 쓸 대본

해석 관련 문장은 공개 전 콘텐츠 승인 필요. 아래는 제품/방법 설명 초안이며 초자연적 효능을 주장하지 않는다.

| ID | 0–3초 hook | 3–18초 시각/설명 | 18–25초 CTA |
|---|---|---|---|
| S01 | Don't know your birth time? | 시주 카드 비우기: “We leave the hour pillar unknown. Any assumptions stay visible.” | “Try a free Korean birth chart.” |
| S02 | One birth chart. Four pillars. | Year / Month / Day / Hour 카드 하나씩 표시. “Saju is a Korean way of reading these four pillars.” | “See yours. Free chart in our profile.” |
| S03 | Before you pay for a reading… | Free chart / Preview / $3.99 one-time 세 화면 실제 시연 | “See exactly what you get.” |
| S04 | Why do two chart apps disagree? | Birthplace / daylight saving / day boundary를 차례로 보여주고 settings matter 설명 | “Our calculation method is public.” |
| S05 | A reading should explain itself. | 명식 사실 → 승인 문구 → 질문으로 이어지는 도식. 근거 보기 개발 전에는 기능 출시했다고 말하지 않음 | “Explore the free chart first.” |
| S06 | What does a Day Master mean? | day stem만 강조. 나머지 명식도 해석에 필요하다는 설명 | “Start with your own chart.” |
| S07 | Your chart is not a countdown. | 가짜위기/운명문구 지우기 → “A prompt for reflection, not a fixed future.” | “Meet Haeday.” |
| S08 | Same birthday. Different charts? | 가상 인물 표시 후 시간·도시 설정 차이 시각화. 실제 계산 검증된 예시만 | “Check your details before paying.” |
| S09 | What stays private when you share? | 공유 카드에는 날짜/시간/도시 없음. 개인이름도 없게 실제 export 확인 | “Preview your card before sharing.” |
| S10 | No subscription surprise. | Free / $3.99 once / No renewal. 환불 요약은 정책 링크와 함께 | “Read the sample. Decide after.” |

S01 상세 타임라인: 0–2s 질문 / 2–6s 네기둥과 빈 시간 / 6–12s 아는 정보로 계산 / 12–18s 가정 표시 확대 / 18–23s 무료 CTA. 무음으로 전부 이해 가능해야 함. 1화면 영문12단어 내외, 대비/속도 실기기 확인.

프로필 초안: “Korean saju, thoughtfully explained. Free birth chart. Personal reading $3.99 once. AI-assisted · For reflection.” 핸들 `haeday` 우선, 불가하면 `haeday.app` 계열 검토(가용성 미확인). 도메인은 확정된 실제 주소만 사용.

## 6. 14일 실험과 측정

| 기간 | 실행 | 비교 |
|---|---|---|
| 1–2일 | 프로필/링크/landing/지표 사전 점검, S01–S05 준비 | 링크 실제 동작, mobile 완료 가능 |
| 3–7일 | 원본5개를 주3채널에 각기 맞춰 게시 | 시간 모름 vs 방법 설명 vs 가격 투명성 |
| 8일 | 상위2주제 선정 | 조회수보다 qualified 방문/무료명식 완료 |
| 9–13일 | 선정 주제에 서로 다른 실제 설명5개 | hook만 바꾸는 복제 대신 새로운 정보 |
| 14일 | 퍼널/환불/제작시간 보고 | 다음2주 유지/중단/확대 |

수집: 플랫폼 도달/시청 유지(정의 다름), 프로필 방문, 웹 방문, 명식완료, offer노출, checkout, 서버 결제·환불·열람. cross-platform 조회수를 동일한 고유인으로 합산하지 않음.
프로필 링크가 하나면 영상별 직접 귀속을 알 수 없다. channel+week 코호트로 기록하거나 특정 campaign landing을 운영한다. 사용자가 영상별 링크를 눌렀다는 가짜 정밀 attribution 금지.

예시(예측 아님): 100,000조회 × 프로필방문1% × 사이트클릭20% × 구매3% = 6건, $23.94(환불 전). 조회수만으로 월$10K를 기대하지 않는 이유다.
사이트10,000방문 × 구매2%=200건 ×3.99=$798. 환불·할인 제외 전. 카드 수수료 약0.42 외 LLM/환불/호스팅도 있어서 유료광고 CAC 상한을3.99로 잡으면 안 됨.
유료광고는 초기0. 재구매가 검증되지 않았으므로 장기 LTV를 상상해 광고비를 쓰지 않는다.

## 7. 운영과 다음 질문

계정 셋업 때 필요한 확인은 한 번에: 실제 도메인, 보유 SNS 핸들, 연결 가능한 계정, 공개 승인 담당, 월 도구 상한. 비밀번호/OTP는 문서나 채팅에 수집하지 않는다.
예약 게시 실패는 알림으로 확인하고 미게시를 게시완료라 기록하지 않음. 매주 원본/사용자승인/라이선스/sourceID/실제게시URL을 묶어 보관. 생년월일 DM 응대 대신 제품 입력 화면으로 안내한다.
언어 확장/유료 TTS/유료광고/궁합 챌린지는 초기 지표 확인 후 별도 제안한다.
