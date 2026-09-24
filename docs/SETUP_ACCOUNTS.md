# 계정 셋업 가이드 (Jason용, 터미널 없이)

Git Bash는 쓰지 않습니다. GitHub는 **GitHub Desktop** 앱으로, 비밀키는 윈도우 기본 **PowerShell**로 만듭니다.
전체 소요: 약 50분. 막히면 그 화면을 캡처해서 Claude에게 보내세요.

## 1단계. GitHub에 코드 올리기 (15분)
1. https://desktop.github.com 에서 **GitHub Desktop** 설치 → 실행 → **Sign in to GitHub.com** → 브라우저에서 로그인·승인.
2. 이름/이메일 확인 화면이 나오면 그대로 **Finish**.
3. 상단 메뉴 **File → Add local repository…** → **Choose…** → `바탕화면\Fotel\haeday` 폴더 선택 → **Add repository**.
   - "unsafe repository" 경고가 나오면 경고 안의 **add an exception** 링크를 누르고 다시 Add.
4. 왼쪽 위 Current repository가 `haeday`, 가운데에 "No local changes"가 보이면 정상.
5. 상단의 파란 버튼 **Publish repository** 클릭 → Name `haeday` → **Keep this code private 체크 유지** → **Publish repository**.
6. 확인: **Repository → View on GitHub** → 브라우저에 파일 목록이 보이면 성공. 위쪽 **Actions** 탭에서 `ci`가 3~5분 뒤 초록 체크가 되는지 봅니다(빨간 X면 캡처해서 Claude에게).

## 2단계. 비밀키 3개 만들기 (5분)
1. 윈도우 시작 버튼 → `PowerShell` 입력 → **Windows PowerShell** 실행.
2. 아래 전체를 복사해 붙여넣고 Enter:
   ```powershell
   function k { $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b) }
   "SESSION_SECRET=$(k)"; "ENCRYPTION_KEYS={""k1"":""$(k)""}"; "EMAIL_LOOKUP_KEY=$(k)"
   ```
3. 출력된 3줄을 **비밀번호 관리자(또는 안전한 메모)** 에 저장. 채팅·이메일로 보내지 마세요.
   - ENCRYPTION_KEYS를 잃어버리면 저장된 고객 정보를 영영 못 읽습니다.

## 3단계. Railway 스테이징 (20분)
1. https://railway.com 로그인 → **New Project** → **Deploy from GitHub repo** → (처음이면 **Configure GitHub App** → Only select repositories → `haeday` → Save) → `haeday` 선택.
   - 바로 빌드가 시작되고 실패할 수 있습니다. 설정 전이라 정상입니다.
2. 생긴 서비스 카드를 클릭 → **Settings** 탭:
   - 맨 위 서비스 이름을 `web`으로 변경.
   - **Config-as-code**(또는 "Railway Config File") 항목에 `railway/web.json` 입력.
     - 이 항목이 없으면 대신: **Custom Build Command** `pnpm build` / **Pre-deploy Command** `pnpm db:migrate` / **Custom Start Command** `pnpm start` / **Healthcheck Path** `/api/health/live`
   - **Networking → Generate Domain** 클릭 → 생긴 주소(예: `haeday-web-production-xxxx.up.railway.app`) 복사.
3. 프로젝트 화면 빈 곳에서 **+ Create**(또는 우상단 **+ New**) → **Database** → **Add PostgreSQL**.
4. 다시 **+ Create** → **GitHub Repo** → `haeday` → 새 서비스 카드 → Settings → 이름 `worker` → Config file `railway/worker.json` (없으면 Custom Start Command `pnpm worker`). worker는 도메인 만들지 않음.
5. **web** 카드 → **Variables** 탭 → **Raw Editor** → 아래를 붙여넣고 `<...>` 부분만 바꾸기 → **Update Variables**:
   ```
   APP_ENV=staging
   APP_ORIGIN=https://<2번에서 복사한 도메인>
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   SESSION_SECRET=<2단계 값>
   PAYMENTS_MODE=test
   LIVE_PAYMENTS_APPROVED=false
   ENCRYPTION_KEYS=<2단계 값, 중괄호 포함 그대로>
   ENCRYPTION_ACTIVE_KEY_ID=k1
   EMAIL_LOOKUP_KEY=<2단계 값>
   ```
6. **worker** 카드 → Variables → Raw Editor → 같은 내용 붙여넣기.
7. 화면 상단 **Deploy**(보라색 버튼, 변경사항 적용) 클릭 → 두 서비스가 초록 **Active**가 될 때까지 대기(3~5분).
8. 확인:
   - 브라우저로 `https://<도메인>/api/health/ready` → `{"status":"ready"}` 보이면 성공.
   - `https://<도메인>` → Haeday 준비 중 화면.
   - worker 카드 → **Deployments → View logs** → 1분마다 `[worker] heartbeat` 줄.
9. 프로젝트 **Settings → Usage**(또는 계정 Usage)에서 사용량 알림 $20 설정.

## 4단계. Sentry (10분)
1. https://sentry.io → Sign up(무료 Developer 플랜) → 프로젝트 만들기 → 플랫폼 **Next.js** → 이름 `haeday`.
2. 설정 안내 화면은 건너뛰고 **Settings → Projects → haeday → Client Keys (DSN)** → DSN 주소 복사.
3. Railway web·worker 두 서비스 Variables에 `SENTRY_DSN=<DSN>` 추가 → Deploy.
4. 휴대폰에 Sentry 앱 설치 → 로그인 → 알림 허용.
5. DSN을 Claude에게 보내면 테스트 이벤트를 보내 연결을 확인합니다. (DSN은 원래 웹페이지에도 노출되는 값이라 채팅으로 보내도 괜찮습니다. 2단계 비밀키와는 다릅니다.)

## 끝나면 Claude에게 보낼 것
- GitHub Actions 결과(초록/빨강)
- `/api/health/ready` 결과 화면 캡처
- Sentry DSN
