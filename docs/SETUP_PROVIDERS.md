# 결제·AI·이메일 연결 가이드 (Jason용, staging = 테스트 모드)

코드는 다 들어가 있습니다. 아래 값만 Railway에 넣으면 staging에서 실제 흐름(차트 → 결제 → 풀이)이 돕니다.
**키 값은 절대 채팅에 붙여넣지 마세요.** Railway에만 넣으면 됩니다.

## 1. Stripe 테스트 모드 (약 10분)
1. dashboard.stripe.com 로그인 → 오른쪽 위 **Test mode**(또는 Sandbox) 스위치를 켭니다. 화면 위에 주황색 "Test" 표시가 보이면 됩니다.
2. **API 키**: 왼쪽 아래 **Developers** → **API keys** → **Secret key** 옆 Reveal → `sk_test_...` 복사.
3. **상품·가격**: 왼쪽 **Product catalog** → **+ Add product**
   - Name: `Haeday personal saju reading`
   - Pricing: **One-off**, `3.99` USD → Save
   - 저장된 상품을 열어 Pricing 줄의 **Price ID** `price_...` 복사.
4. **웹훅**: **Developers** → **Webhooks** → **+ Add endpoint**
   - Endpoint URL: `https://<staging 주소>/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `refund.created`, `refund.updated`, `refund.failed`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`
   - 저장 후 **Signing secret** → Reveal → `whsec_...` 복사.

## 2. AI (Anthropic) (약 5분, Q1 확정 후)
1. console.anthropic.com 가입/로그인 → **Billing**에서 소액 충전(예: $10) → **API Keys** → Create key → `sk-ant-...` 복사.
2. 모델 이름은 Anthropic 문서의 모델 목록에서 고른 정확한 모델 ID를 그대로 씁니다(Q1).

## 3. Railway 변수 입력 (web, worker **둘 다**)
railway.app → haeday 프로젝트 → **web** 서비스 → **Variables** → **+ New Variable** (worker 서비스에도 똑같이):

| 이름 | 값 |
|---|---|
| `PAYMENTS_MODE` | `test` |
| `STRIPE_SECRET_KEY` | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` |
| `STRIPE_PRICE_SAJU` | `price_...` |
| `LLM_API_KEY` | `sk-ant-...` |
| `LLM_MODEL` | 모델 ID (Q1) |
| `LLM_DAILY_CAP` | `100` (출시 때 `1000`) |
| `EMAIL_DAILY_LIMIT` · `EMAIL_MONTHLY_LIMIT` · `EMAIL_ALERT_AT` | 넣지 않으면 Resend 무료 플랜 기준 100 · 3000 · 70. 유료로 바꾸면 그 플랜 숫자로 변경 |

저장하면 자동 재배포됩니다.

## 4. 판매 켜기 (staging)
관리자 화면(/admin)은 이메일 로그인이 필요해서 도메인·Resend 연결 전에는 못 씁니다. 그 전에는:
1. Railway → **Postgres** 서비스 → **Data**(또는 Query) 탭
2. 아래 한 줄 실행:
   `insert into settings (key, value, updated_by) values ('sales_enabled', 'true', 'jason') on conflict (key) do update set value = 'true';`
3. 끄려면 `'true'` 두 곳을 `'false'`로 바꿔 실행.

## 5. 테스트 결제
- staging에서 차트 → **Unlock my reading** → 동의 체크 → Stripe 화면에서 카드 `4242 4242 4242 4242`, 만료일 아무 미래 날짜, CVC `123`, ZIP `10001`.
- 1분 안에 주문 화면이 "Your reading is ready"로 바뀌면 성공. 이메일은 5번(Resend) 연결 후부터 발송됩니다.
- **실제 카드로 결제하지 마세요** (D08, Stripe 정책).

## 6. 도메인 반영 (Q3 구매 후)
web 서비스 Variables: `NEXT_PUBLIC_SITE_DOMAIN` = `haeday.net`(산 도메인), `NEXT_PUBLIC_SUPPORT_EMAIL` = `hello@haeday.net`. 공유 이미지·약관·안내 문구가 모두 이 값으로 바뀝니다.

## 7. 이메일 (Resend) — 도메인(Q3) 정한 뒤
resend.com 가입 → Domains → Add domain → 알려주는 DNS 레코드(SPF/DKIM)를 도메인 회사에 입력 → Verified 확인 → API Keys → `re_...` 복사.
Railway 변수(web, worker): `RESEND_API_KEY`, `EMAIL_FROM` = `Haeday <hello@도메인>`, `SUPPORT_EMAIL` = `hello@도메인`, `ADMIN_EMAILS` = 관리자 이메일(Q10).


## 8. PayPal + Venmo (CC4c, 선택 · 약 20분)
카드 결제(Stripe)만으로도 판매됩니다. PayPal/Venmo는 이 설정을 넣어야 결제 화면에 나타납니다. **판매세(Stripe Tax)를 켜면 PayPal은 자동으로 숨겨집니다.**
1. https://www.paypal.com/business 에서 **Business 계정** 만들기(개인사업자 정보, EIN 또는 SSN, 미국 은행 계좌 연결).
2. https://developer.paypal.com → 로그인 → 위쪽 **Sandbox** 선택 → **Apps & Credentials** → **Create App**(이름: Haeday) → 만들어진 앱에서 **Client ID**와 **Secret** 확인(채팅에 붙이지 말 것).
3. 같은 앱 화면 아래 **Webhooks → Add Webhook**: URL `https://<staging 도메인>/api/webhooks/paypal`, 이벤트 선택: `Checkout order approved`, `Payment capture completed`, `Payment capture denied`, `Payment capture declined`, `Payment capture refunded`, `Payment capture reversed`, `Customer dispute created`, `Customer dispute updated`, `Customer dispute resolved` → 저장 후 표시되는 **Webhook ID** 확인.
4. Railway(web, worker 둘 다) 변수: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`. `PAYMENTS_MODE=test`인 동안은 자동으로 **Sandbox**에 연결됩니다.
5. 확인: /admin의 Launch checklist에서 "PayPal/Venmo configured (sandbox)". 결제 화면에 PayPal 버튼이 보이면 developer.paypal.com → **Sandbox accounts**의 가상 구매자(Personal) 계정으로 결제 테스트.
6. (선택) 계약 테스트: 로컬에서 `PAYPAL_CONTRACT_CLIENT_ID=… PAYPAL_CONTRACT_SECRET=… pnpm vitest run tests/contract/paypal.contract.test.ts` (sandbox 키만).
7. 실결제(live) 전환은 Stripe와 같은 규칙: Jason의 명시적 OK 후 **Live** 앱의 Client ID/Secret/Webhook ID로 교체.
Venmo는 미국, 휴대폰, Venmo 앱이 설치된 구매자에게만 보입니다(PayPal 규칙).
