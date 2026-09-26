# 디자인 레퍼런스 확장 · 2026-09-26

기존 01_DESIGN의 5개에 더해 아래 6개를 추가했다. 구매전환·매출 순위를 확인한 목록이 아니라 **브랜드/정보 구조 적합성으로 선정한 후보**다. 4개는 브라우저에서 실제 화면을 보았고, 2개는 작품 설명·팔레트를 확인한 후보로 구분한다. 저작물 이미지나 화면 자체를 제품 자산으로 복제하지 않는다.

| 레퍼런스 | 확인 범위 | Haeday에 가져올 원리 | 가져오지 않을 것 |
|---|---|---|---|
| [ArtMod · Calm Escape](https://dribbble.com/shots/26358802-Designing-a-Calm-Escape-A-Mobile-Reading-Experience) | 브라우저 시각 확인 | 책처럼 따뜻한 바탕, 명료한 읽기 화면, 본문 중심의 위계 | 책 표지·핑크 브랜드색·이미지 |
| [Ronas IT · Reading Mobile App](https://dribbble.com/shots/26041969-Reading-Mobile-App-UI-Design) | 브라우저 시각 확인 | 절제된 색, 선으로 나눈 정보, 명확한 목록 | 독서 streak·통계 기능을 사주 상품에 억지로 추가하지 않음 |
| [Nixtio · Astrology App](https://dribbble.com/shots/25814664-Astrology-App-Design) | 브라우저 시각 확인 | 중심 카드에 집중되는 깊이감, 신비로운 배경과 정보 카드 분리 | 상담사 얼굴·평점·경력처럼 Haeday에 없는 신뢰 신호 |
| [Diana Larussa · Moon Phase Widget](https://dribbble.com/shots/27369104-Moon-Phase-Widget-Dark-iOS-UI-Design-Lunar-Tracker-Astrology) | 브라우저 시각 확인 | 큰 달 하나, 넓은 어두운 여백, 짧은 serif 문장 | 달 위상 기능·원문의 해석 문장·달 이미지 |
| [tubik · Astrology Website](https://dribbble.com/shots/18431992-Case-Study-Astrology-Website-Design) | 작품 설명 확인; 전체 동작 시각 검증 미실행 | 텍스트가 중심이 되는 구성과 제목 위계 후보 | 읽기를 방해하는 과한 애니메이션, 서양 별자리 모델 |
| [DIGI.CO · Astrology & Horoscope](https://dribbble.com/shots/27105067-Astrology-Horoscope-Mobile-App-Design) | 작품 설명·팔레트 확인; 전체 화면 시각 검증 미실행 | 밤색 배경·절제된 빛·부드러운 gradient 후보 | 별자리/미래 예측 기능, 원본 그래픽 |

## 현재 추천: 화면 역할별로 톤을 나눈다

- 랜딩: **달빛 네이비**. 호기심을 만들되 장식보다 무료 CTA가 먼저 보인다.
- 무료 결과: **Day Master 중심 카드**. 정체성 → 명식 → 오행 → 입력 확인 → 유료 구성. 불확실성 질문은 가장 먼저 유지한다.
- 유료 풀이: **한지와 잉크**. 긴 텍스트·목차·글자 확대. 장식과 CTA를 본문 사이에 반복하지 않는다.
- 공유 카드: **한 장의 포스터**. 브랜드·Day Master 중심. 허용되지 않은 출생정보/원문은 넣지 않는다.

사용자에게 ① 고급 잡지 ② 몽환적인 달빛 ③ 트렌디한 소셜 앱 중 선호를 질문했다. 답변 전에는 이미 승인된 달/네이비/한지/폰트 토큰을 유지했다. 현재 구현은 이 세 방향을 모두 섞는 것이 아니라 기존 브랜드의 독서 경험을 개선한 것이다.

## 다음 시각 실험

한꺼번에 사이트 전체를 갈아엎지 않는다. 선택한 방향으로 Hero와 Day Master 카드만 각각 2안 비교한다. 동일한 문구·가격·CTA로 비교해서 분위기와 정보 구조의 차이를 평가한다. 실제 전환 우열은 트래픽 실험 전까지 가설이다.

완료 조건: 360–430px, 200% 확대, 키보드, reduced-motion, 색에 의존하지 않는 오행 표기, 서버에서 승인된 문구만 노출. 새 동영상/3D 효과는 화면 로딩을 늦추거나 입력을 막지 않아야 한다.
