# SETUP_ACCOUNTS · Jason, click by click

The code is already in `C:\Users\홍성우\Desktop\Fotel\haeday` with a local git history. Do these in order.

## 1. GitHub (10 min)
1. github.com → top right **+** → **New repository** → name `haeday` → **Private** → do NOT add README/.gitignore/license → **Create repository**.
2. Open **Git Bash** → run:
   ```bash
   cd ~/Desktop/Fotel/haeday
   git remote add origin https://github.com/<your-username>/haeday.git
   git push -u origin main
   ```
   A browser window asks you to sign in to GitHub the first time. Approve it.
3. On GitHub, open the **Actions** tab. The "ci" run should turn green in about 3 minutes. Send Claude a screenshot if it is red.

## 2. Railway staging (20 min)
1. railway.com → **New Project** → **Deploy from GitHub repo** → pick `haeday`. (If asked, install the Railway GitHub app for this repo only.)
2. This first service is the **web** service. Open it → **Settings**:
   - Service name: `web`
   - Config-as-code / "Railway Config File": `railway/web.json` (if this field is not shown, set instead: Pre-deploy command `pnpm db:migrate`, Start command `pnpm start`, Healthcheck path `/api/health/live`)
3. In the project canvas → **+ Create** → **Database** → **PostgreSQL**.
4. **+ Create** → **GitHub Repo** → `haeday` again → name it `worker` → Settings → config file `railway/worker.json` (or Start command `pnpm worker`). In Settings → Networking, do not generate a domain for the worker.
5. Rename the environment to `staging` (top left environment menu → Settings).
6. Variables. Open **web** → **Variables** → **Raw Editor** and paste (Claude will give you the generated secret values in chat; never paste them anywhere else):
   ```
   APP_ENV=staging
   APP_ORIGIN=https://<web domain from step 7>
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   SESSION_SECRET=<from Claude>
   PAYMENTS_MODE=test
   LIVE_PAYMENTS_APPROVED=false
   ENCRYPTION_KEYS=<from Claude>
   ENCRYPTION_ACTIVE_KEY_ID=k1
   EMAIL_LOOKUP_KEY=<from Claude>
   ```
   Do the same for **worker** (same values).
7. **web** → Settings → Networking → **Generate Domain**. Put that https address into `APP_ORIGIN` for both services.
8. Deploy both. Check: `https://<domain>/api/health/ready` shows `{"status":"ready"}`; worker Logs show `[worker] heartbeat` every minute.
9. Project Settings → Usage → set an alert at $20.

## 3. Sentry (10 min)
1. sentry.io → sign up (free Developer plan) → Create project → platform **Next.js** → name `haeday`.
2. Copy the **DSN** (Settings → Client Keys). Add `SENTRY_DSN=<dsn>` to both Railway services.
3. Install the Sentry phone app and turn on push alerts.
4. Tell Claude "Sentry done"; Claude will send a test event and confirm.

## 4. Later (not needed for M1)
Stripe (test mode) before M3 (9/28), Resend + domain before M6, LLM API key before M4.
