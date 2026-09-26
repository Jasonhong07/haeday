# 디자인 상세안 · Moonlit editorial

## 1. Dribbble 리서치

2026-09-24 Dribbble `Popular → Web Design` 페이지에서 관찰. 로그인 없는 공개 피드라 순위/수치는 변경될 수 있다. 공개 수치는 좋아요/조회로 표시된 값이며 픽셀 간격은 측정값이 아닌 아래 Haeday 제안값이다.

| 참고작 | 관찰 지표 | 가져올 원리 | 가져오지 않을 것 |
|---|---|---|---|
| [Nixtio Skincare E-Commerce](https://dribbble.com/shots/27747564-Skincare-E-Commerce-Web-Design) | 284 / 27.4k, 인기 피드 | 큰 제품 이미지와 짧은 제목, 모서리·외곽 여백의 통일 | 인물 사진·문구·브랜드 자산 |
| [Phenomenon WayGo](https://dribbble.com/shots/27756413-Website-Design-for-Transportation-Booking-WayGo) | 279 / 28.2k, 인기 피드 | 큰 분위기 영역 바로 아래 행동 입력부, 명확한 시선 이동 | 신뢰 로고/고객 수/영상 자산 |
| [Korsa Payra](https://dribbble.com/shots/27755749-Payra-Fintech-Landing-Page-Design) | 220 / 20.1k, 인기 피드 | 추가 비교 후보. 이번에는 상세 시각 검토하지 않음 | 검토 전 레이아웃 분석·성과 주장 금지 |

추가 톤 참고(인기 상위라고 주장하지 않음): [Saurav Astrology](https://dribbble.com/shots/22011228-Astrology-Landing-Page)는 어두운 배경 위 중심 타이포그래피, [Fahema Jogi](https://dribbble.com/shots/27631289-Wellness-Website-UI-UX)는 차분한 세리프·따뜻한 색·나뉜 정보 위계가 보였다. 두 페이지와 위 Nixtio/WayGo는 브라우저에서 시각 확인했다.

선정은 미적 적합성 판단이다. 가장 좋아요가 많은 역대 작품이라고 주장하지 않는다. 참고작 원본을 추출·재배포하지 않고, 일반적인 구성 원리만 새 코드로 만든다.

## 2. 브랜드와 화면 리듬

방향: 별자리 앱처럼 복잡한 우주 배경 대신, 밤에 펼쳐 보는 개인 편지. 달은 하나의 주요 도형, 한자는 정보, 금색은 행동/강조에만 쓴다. 한국 사주를 서양 별자리나 MBTI 검사의 동의어로 부르지 않는다.

기존 PRD 토큰 유지: night #12132A, dusk #1C1E3A, hanji #F3EBDD, gold #D9B26A, ink #1E1B16. 본문 가독성을 위해 금색 작은 글자는 밝은 배경에서 #7E5F1C 사용. 장식 저대비는 허용하되 정보와 버튼은 WCAG AA 대비 검증.

| 항목 | 데스크톱 | 모바일 |
|---|---|---|
| 본문 컨테이너 | max 1120px / 좌우 40px | 좌우 20px |
| 큰 구간 간격 | 112px | 64px |
| 제목→설명→CTA | 24px / 32px | 20px / 28px |
| 카드 내부 | 28–36px | 20–24px |
| H1 | clamp 48–80px, 행간 1.04 | 42–48px |
| 본문 | 18px/1.65 | 16px/1.65 |
| 풀이 본문 | 최대 680px, 18px/1.8 | 17–18px/1.75 |
| 버튼 | 높이56px | 높이56px, 주요 CTA 전체 폭 |

폰트: 본 구현은 기존 Fraunces / Plus Jakarta Sans / Noto Serif KR. 독립 시안은 네트워크 없는 시스템 serif/sans fallback이라 글자 폭이 최종과 다르다. 8px 기본 그리드에 12/20/28 보조값. 카드가 모든 문장을 감싸지 않도록 여백·구분선으로 그룹화한다.

## 3. 화면별 명세

### 랜딩
1. 로고 + How it works + Sample. 메뉴는 최소화.
2. 왼쪽: 기존 브랜드 헤드라인 `Find your heyday, by moonlight.` 보존. 보조 `Your Korean birth chart, thoughtfully explained.` 무료 명식/$3.99 일회/AI-assisted를 짧게 명시.
3. 오른쪽: 실제 형식의 결과 카드 1장. `Illustrative sample` 표시. 가상 날짜를 실제 고객처럼 주장하지 않음.
4. CTA `See my chart · Free`. 옆 텍스트 `No account needed to start.` 실제 guest 흐름 검증 후 사용.
5. ‘날짜·시간·도시 → 무료 명식 → 원하면 개인 풀이’ 세 단계.
6. 무료/유료의 구체적 비교 + 가상 인물 풀이 발췌. 가짜 blur 본문 대신 실제 승인 발췌와 미제공 섹션 제목.
7. FAQ: 시간 모름, AI 사용, 계산 관례, 가격, 환불. 환불은 D50의 12개월당1회 조건 생략 금지.
8. 최종 CTA와 정책 링크. 리뷰/회원수/언론 로고는 실제 증거 없으면 넣지 않음.

### 입력
입력 첫 화면에는 결과 카드 장식보다 양식 우선. 날짜/시간 모드/도시 3개 그룹. 키보드가 열려도 오류와 CTA가 보이게. 생년월일을 댓글로 쓰게 유도하지 않는다. 제출 오류 시 기존 값 보존.

### 무료 결과
Day Master → 승인된 2–3문장 → 4기둥 → 오행(6/8 분모 표시) → 적용한 가정 → 입력 재확인 → 유료 제안 → 공유. 기존 PRD 순서 변경은 Claude가 정책/이해도 검토 후 반영.
스크롤 후 보조 sticky CTA는 입력 확인을 건너뛰지 않는다. `Unlock my reading · $3.99`와 no subscription 문구를 같은 영역에 유지.
무료 미리보기 D46은 승인됨. 승인된 snippet만 표시하며 전체 풀이가 이미 생성된 듯한 로딩/블러를 만들지 않는다.

### 유료 풀이
한지 배경 + 목차 앵커 + 읽기 진행. 7개 기존 섹션 유지. 글자 크기 조절과 인쇄 스타일은 클라이언트 표시 기능으로 구현 가능. 내용 재생성이나 새 예측을 만들지 않음.
‘왜 이렇게 해석했나요?’는 **새 기능 제안**: engine fact와 approved snippet ID를 연결한 설명. 원시 LLM 사고과정/chain-of-thought를 요청하거나 표시하지 않는다.

### 오류/지연
결제 확인 중 / 생성 중 / 지연 약속 / 환불 시작 / 환불 조치 필요를 각각 구분. 최신 D47은 지연 약속24h, 미전달24h환불. 검증되지 않은 약1분 카운트다운 금지. retry 중복 클릭 방지와 로그인 복구 링크 제공.

## 4. 바이럴을 위한 공유 카드

1080×1920, 중심영역에 day master와 승인 한 문장, 작은 브랜드·CTA. 상단180/하단320/오른쪽160px는 중요한 텍스트를 피하는 **제작 가이드값**이며 플랫폼별 실기기 미리보기로 조정.
1:1, 4:5 변형도 같은 데이터에서 렌더. 입력 날짜/시간/도시/이메일/주문ID/접근 토큰 없음. 고객이 내려받기 전 미리보기와 취소 가능.
질문은 `Which part feels like you?` 정도. 출생정보 댓글 수집·운명 단정·불안 유발은 하지 않는다. 궁합 계산/친구 개인정보 입력은 D01 범위 밖.

## 5. 개발 및 검수

컴포넌트 제안: BrandHeader, MoonHero, ExampleChartCard, FreePaidComparison, ReadingPreview, MethodNote, OfferPanel, SharePreview. 기능 플래그로 점진 적용. 서버 계산·권한 로직은 재작성하지 않음.
검수: 360/390/430/768/1440px, 200% 줌, 키보드/포커스, reduced-motion, 긴 도시명/에러/시간 모름, contrast, 이미지 없는 로딩, 지연 문구, 무료쿠폰. 모바일 sticky CTA가 본문/쿠키 배너를 가리지 않아야 함.
목표 성능: LCP ≤2.5s / CLS≤0.1 / INP≤200ms는 측정 목표이며 아직 달성 증거 없음. 히어로 비디오/3D/WebGL 미사용. 원본 CSS/SVG와 소수 폰트로 시작.
