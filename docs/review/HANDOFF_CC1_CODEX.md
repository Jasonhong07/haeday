# Claude/Codex 이어서 개발할 지시문

현재 저장소에서 AGENTS.md → CLAUDE.md → docs/DECISIONS.md → docs/TASKS.md → docs/review/PROPOSAL_V2_CODEX.md → docs/review/CHANGES_CODEX_CC0.md를 읽으세요.

사용자는 승인된 범위의 로컬 코드 수정·테스트를 직접 진행하도록 허용했습니다. 이미 적용된 수정은 덮어쓰지 말고 git diff부터 확인하세요. 별도 작업/대화에 있는 Claude가 작업했다고 가정하지 마세요.

1. PROPOSAL_V2_CODEX.md의 CC1a부터 구현합니다. F1/F2/F3/F6/F9를 같은 환불 상태 모델로 해결합니다. Stripe SDK/API 계약을 공식 문서와 test mode로 확인합니다.
2. DB lease token을 조회 전 취득하고 조회 후 적용 시 확인합니다. Stripe 호출을 DB 트랜잭션에 넣지 않습니다. 오래된 unknown 환불을 맹목적으로 재생성하지 않습니다.
3. it.fails 재현을 수정할 때 의도된 불변식을 보존합니다. 잘못된 중간 구현 기대값(C5 createRefund, A 부분 저장)은 최신 설계에 맞게 바꾸되 검증 강도를 낮추지 않습니다.
4. CC1b(F4/F7/F12/F15), CC1c(F5/F13/F14/L7)를 순차 진행하고 각 묶음의 실제 증거를 기록합니다.
5. 질문 답변은 DECISIONS의 최신 승인 상태를 확인합니다. D35/C2/D45 응답이 없으면 그 정책 변경만 보류하고 독립 작업을 계속합니다.
6. 사용자에게 단가 조사·diff 복사·테스트 명령 실행을 맡기지 않습니다. 에이전트가 할 수 있는 작업은 직접 수행합니다.
7. 각 묶음 후 docs/review/CHANGES_CC1a.md 등에 diff 요약·재현·테스트·미완료를 남겨 다음 AI가 파일을 직접 읽게 합니다. 독립 AI 검토를 실제 실행하지 않았다면 완료라 부르지 않습니다.

live 전환, 실제 고객 메일, 운영 배포, 유료 구매는 별도 승인 대상입니다. 암호화 키/.env를 읽거나 출력하지 않습니다.
