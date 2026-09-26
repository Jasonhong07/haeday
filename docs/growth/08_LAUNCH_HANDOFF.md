# Claude 인계: 다음 작업을 바로 이어가기

2026-09-26. 사용자: 가능한 개발은 직접 진행, 지속 기록, 본인 필요 작업만 구체적으로 안내. 이 문서는 실제 Claude 교차검증을 받았다는 뜻이 아니다. 현재 연결된 Claude 대화/실행 도구가 확인되지 않아 로컬 인계 파일로 준비했다.

검토할 개발 커밋: **0ce10be**. 최종376테스트 통과/5공급자계약skip, 전체lint와build 통과. 로컬 커밋만 했으며 원격배포는 하지 않았다.

## 최소 읽기

`CLAUDE.md` → accepted DECISIONS → `../LAUNCH_PROGRESS_2026-09-26.md` → 실제 git diff. 과거 제안서를 전부 다시 읽지 않아도 된다. 07의 ‘다음 A 주문 상태’는 이번에 구현됐다. 07의 NOT RUN 중 로컬 DB 전체 테스트와 build는 새 증거로 갱신된다. 최신 외부 sandbox는 여전히 미실행이다.

## 검토할 diff와 실패 시나리오

| 우선 | 검토 대상 | 반드시 확인 |
|---|---|---|
| P0 | lib/order-status, server/orders | delivered 뒤 refund_pending/실패/부분환불 표시. 활성 claim보다 나중의 외부 failed 기록이 화면을 덮지 않는지. paid 복귀해도 환불 실패를 숨기지 않는지 |
| P0 | lib/refund-feedback, api/refunds, RefundButton | provider failed/canceled/requires_action을 처리 중/완료로 오인하지 않는지. 할인/세금 포함 주문에 고정3.99를 약속하지 않는지. $0을 환불완료로 오인하지 않는지 |
| P0 | checkout page | owner-only 조회 그대로, 입력 수정은 새 revision, unknown disclosure 그대로, 클라이언트가 가격/권한을 정하지 않는지 |
| P0 | public-sales / preflight | 랜딩이 keyring 불필요. 오류 시판매 OFF, 비밀/원문예외 미노출. 잘못된 active key가정상표시되지않는지 |
| P0 | 기존 PayPal capture | capture 호출과 형제결제/soft·hard stop 사이 경합. 실제 sandbox 응답 유실·capture replay·중복웹훅·refund failed·CSP차단을 재현하고 증거 남기기 |
| P1 | reading/input/share | 승인되지 않은 dm.line/snippet/sample/learn 노출 없음. 키보드·390px·목차·큰글씨·공유캔버스PII금지 |
| P1 | local-demo launcher | 고정loopbackDB, demo/test분리, 실제provider/계약키차단, production에DEV_FAKE사용불가, .haeday-local Git미포함 |

## 바로 실행할 개발·검증

1. 로컬: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/local-demo.ps1 -Mode test`. 테스트 DB는 새 `haeday_test` 전용이다. 운영 URL을 넣지 말라. build와 테스트를 동시에 돌리지 말라(Windows unknown-time 계산 테스트 시간 초과 경험).
2. `-Mode build`는 dev 서버를 먼저 종료하고 실행한다. `.next` 공유를 피한다. 테스트 성공 후 바뀐 영향 범위만 재검증한다.
3. `START_LOCAL_DEMO.cmd`는 본인 체험용. 가짜 문장 품질을 실제 모델 평가로 쓰지 말라.
4. 새 E2E assertion을 포함해 정식 Playwright 전체 실행. 이번 Codex는 브라우저 도구로 실제 흐름을 확인했지만 이 테스트 러너 결과를 주장하지 않았다.
5. URL/인증 연결이 확보되면 staging provider 검증→복원→샘플 평가 순으로. Jason에게 로그 해독/코드 복사/명령 실행을 시키지 말라.

## 남은 확인/금지

- D49 수정 제안 답변 전 accepted 정책을 새로 쓰지 말라. 다른 카드 환불 API를 가정하지 말라.
- D48 주소 확인 전 마케팅 이메일 켜지 말라. PostHog 가입은 필수 아님: first-party8단계 이미구현.
- 콘텐츠/법적문구/실제샘플 승인값을 Jason 대신true로바꾸지말라.
- live/배포/실제 고객 메일은 별도 명시 승인. 최신생산환경이확인되지않았다고계정을새로만들게하지말라.
- TASKS38/46=83%는 항목수 기준. 실제 출시 차단 항목이 남아 있다. 법적 승인·성공 확률로 해석하지 말라.
- 남은질문: stagingURL, D49, 디자인선호, SNS핸들. 사용자가이미답한질문은반복하지말라.

완료물: 코드 diff·재현테스트·실제 결과·미실행항목·다음소유자를 LAUNCH_EVIDENCE에 추가. 새 위험이 없다면 불필요한 기능 확장 대신 출시 증거를 끝내라.
