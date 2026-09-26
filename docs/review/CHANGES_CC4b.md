# CC4b 구현·검증 기록 · 2026-09-26 (검색 유입용 가이드 페이지)

Jason 결정(2026-09-26): **지금 만들고, 승인 전에는 숨김.**

## 1. 내용
| 항목 | 구현 |
|---|---|
| 페이지 | `/learn`(목록) · `/learn/what-is-saju` · `/learn/five-elements` · `/learn/2027-year-of-the-fire-goat` · `/learn/day-master/<yang-wood…yin-water>` 10개 = 본문 13개 |
| 공개 조건 | 페이지 승인(`approvedBy: "jason"`) **그리고** 페이지가 인용하는 해석 문구(일간 문구, 2027 일간별 문구 = 유료 풀이와 같은 문구)도 모두 승인. 하나라도 초안이면 방문자에게 404, sitemap 제외, `noindex`. 관리자로 로그인하면 실제 화면에서 "Admin preview" 표시와 함께 미리 보기 |
| 일간 페이지 구성 | 이미지·핵심·연애·일·약점(기존 일간 문구 인용) + 같은 오행의 음양 형제 비교 + 2027 일간별 문구 + 상생·상극(고정 관계) + 일간 찾는 법 + FAQ. 새로 쓴 해석은 최소화하고 이미 검토 대상인 문구를 재사용해 승인 부담과 사실 오류를 줄임 |
| 검색엔진 | 페이지별 title·description·canonical, Article·FAQPage 구조화 데이터(JSON-LD, CSP nonce 적용), 승인된 페이지만 sitemap. 랜딩 하단 "Saju guides" 링크는 공개 페이지가 1개 이상일 때만 표시 |
| 검토 문서 | `pnpm guides:review` → `docs/CONTENT_REVIEW_GUIDES.md`(방문자가 볼 전체 문장, 페이지별 한국어 요약). 문구 수정 후 다시 생성 |

사실 확인(코드 작성 시 점검): 2027 = 丁未(입춘 2027-02-04 전후 시작), 2026 = 丙午, 未의 지장간 己·丁·乙, 상생·상극 순서, 2027 일간별 십신 10개(丁·己 기준) 모두 확인.

## 2. 테스트
- `tests/guides.test.ts`: 모든 페이지가 문구를 찾음, slug 고유, 설명 길이, 일간 10개 전부 존재, **현재 공개 0개 + sitemap에 /learn 없음**, 페이지만 승인하면 비공개·문구까지 승인하면 공개, 금지 표현(예언·건강·투자·행운 약속) 없음.
- E2E(`foundation.spec.ts`): 방문자에게 `/learn`, `/learn/what-is-saju`, `/learn/day-master/yin-wood`가 404.

## 3. 승인 방법
`docs/CONTENT_REVIEW_GUIDES.md`를 읽고 "가이드 전체 승인" 또는 수정 지시. 일간 문구는 Q7(CONTENT_REVIEW_KO.md) 승인과 함께 적용됨.
