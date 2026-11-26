# Launch runbook — from "works on Render's URL" to "ATS's domain, for real"

Written 2026-11-25 as a hand-off. Each step says who can do it (a browser agent, or only a
person with the account password), what to do, and how to know it worked. Do them in order;
the dependencies are real (email needs the domain, production mode needs email and storage).

The service: Render web service **kinfolk** (`srv-dalid265vjqs73fh15ag`, `https://kinfolk-rc34.onrender.com`),
Oregon, paid plan, database `kinfolk-preview-db` (paid). Repository `laksh-desai/kinfolk` on GitHub,
branch `main`. `docs/DEPLOY.md` explains how the deployment is put together; this file is only the
list of what remains.

State on 2026-11-25:
- `main` is pushed and Render is serving commit `e15b50d` (M12–M14: the photo-upload fix, CI, the
  bundle budget, search, the printable PDF, …). The first push failed to build because
  `@fastify/compress` was locked but missing from `apps/api/package.json`; `1751777` fixed it.
- Render environment has `WEB_URL`, `API_URL` (both the onrender URL), `RECORDS_PASSPHRASE`
  (equal to the demo password — must change), `SEED_EMAIL`, `SEED_PASSWORD`, `ALLOW_DEV_ADAPTERS=true`,
  no `S3_*`, no `SMTP_URL`/`MAIL_FROM`, no `SIGNUP_ALLOWLIST` (anyone may sign up — intended).
- Auto-deploy is "on commit"; the CI gate is not switched on yet. Nobody has looked at the first
  GitHub Actions run — step 1 starts there.
- A stale, never-verified custom domain `ats.myloving.family` (added 2026-09-21; that domain is not
  in ATS's Spaceship account) is still listed on the service. Delete it in step 4 before adding the
  real one: Settings → Custom Domains → ⋯ → Delete.

---

## 1. Push, and watch CI

**Who:** anyone with push rights (the laptop's git credentials work; `gh` is not installed).

1. Done on 2026-11-25: `main` is pushed and deployed. For any later push, `git status` must be
   clean, then `git push origin main`.
2. Open https://github.com/laksh-desai/kinfolk/actions. The workflow **CI** runs two jobs,
   *check* (lint, unit/API/web tests, web build, bundle budget) and *Playwright*. Both have passed on
   Windows locally; this is their first run on Linux. If one fails, read the log before changing
   anything:
   - API tests start an embedded Postgres from `node_modules`; the Linux binary is in the lockfile.
     A failure to start usually means the runner image; retry once before digging.
   - Playwright: `pnpm exec playwright install --with-deps chromium` is in the job. A timeout on
     the 500-person test is load, not code — re-run the job.
3. Render deploys each push on its own (trigger is still "commit"). `e15b50d` is **Live** at
   https://dashboard.render.com/web/srv-dalid265vjqs73fh15ag and `/api/health` answers.
4. Verified on 2026-11-25 (a photo uploaded on the live site, then removed). To repeat: sign in as the demo account, open a person, upload a
   photo *without* having opened any public record first. It must succeed. (Before this deploy it
   failed with "Enter the passphrase for public records first.")
5. Only once CI is green: Render → the service → **Settings → Build & Deploy → Auto-Deploy** →
   **After CI Checks Pass**. From now on a failing commit never reaches the site.

Done when: Actions shows both jobs green, Render shows the new commit live, a photo uploads.

## 2. `.env.example`

**Done on 2026-11-25** (`e15b50d`). The file lists every variable the API reads, and
`apps/api/src/lib/env.test.ts` fails if a variable is added to `env.ts` without being added here.

## 3. File storage — Cloudflare R2

**Who:** whoever holds (or creates) the Cloudflare account. Should be an ATS-owned login.
Until this is done every deploy wipes uploaded photos and record PDFs.

1. https://dash.cloudflare.com → **R2 Object Storage** → activate (needs a card; the free
   allowance covers this app) → **Create bucket**: name `kinfolk`, location Automatic.
2. R2 overview → **Manage R2 API Tokens** → **Create API token**: permissions *Object Read & Write*,
   scope *Apply to specific buckets only* → `kinfolk`, TTL forever. Copy the **Access Key ID** and
   **Secret Access Key** (shown once) and the **Account ID** (on the R2 overview page).
3. Bucket → **Settings** → turn on **object versioning** if offered (a deleted photo is otherwise gone).
4. Render → service → **Environment** → add, then *Save, rebuild, and deploy*:

   | Key | Value |
   |---|---|
   | `S3_ENDPOINT` | `https://<account id>.r2.cloudflarestorage.com` |
   | `S3_REGION` | `auto` |
   | `S3_BUCKET` | `kinfolk` |
   | `S3_ACCESS_KEY_ID` | from step 2 |
   | `S3_SECRET_ACCESS_KEY` | from step 2 |

5. Verify: the deploy's boot log no longer lists "object storage" among the stand-ins; upload a
   photo; trigger another deploy (Manual Deploy → Deploy latest commit); the photo is still there.
6. Record the Cloudflare login and the token in ATS's secure folder.

## 4. The domain

**Who:** ATS buys; anyone can do the DNS once it exists.

1. Decide the hostname before buying. A subdomain of a domain ATS already owns (for example
   `tree.<their-domain>`) needs no purchase and keeps email sending on a domain that already has
   reputation. If buying new on Spaceship, buy it in ATS's own Spaceship account.
2. Render → service → **Settings → Custom Domains → Add Custom Domain** → the hostname. Render shows
   the record it wants.
3. Spaceship → Domain List → the domain → **Advanced DNS** → add it:
   - subdomain (`tree`): `CNAME`, host `tree`, value `kinfolk-rc34.onrender.com`.
   - root domain: `ALIAS` to `kinfolk-rc34.onrender.com` if offered, else the `A` record Render shows;
     and `www` as a `CNAME`. Delete Spaceship's parking records on the same host first.
   - If DNS is on Cloudflare instead: the record must be *DNS only* (grey cloud) until Render has
     issued the certificate.
4. Render → **Verify**. Both columns go green (Verified, then Certificate) within the hour.
5. `https://<hostname>/api/health` returns `{"status":"ok"}`.

Do **not** change `WEB_URL` yet — step 6.

## 5. Email

**Who:** whoever administers the domain's DNS (step 4) and can create the provider account.
Without this, password reset, access invitations and review links are written to a folder on the
server and never delivered.

1. Pick **Postmark** (recommended) or **Resend**. Create the account under ATS.
2. Add a **sending domain** = the domain from step 4. The provider shows DKIM and Return-Path
   records; add them at Spaceship (or Cloudflare) exactly as given. Wait for the provider to show
   the domain verified.
3. Get SMTP credentials (Postmark: server → *Message Streams* → *Transactional* → SMTP settings;
   Resend: *SMTP* page). The app takes one URL:
   `SMTP_URL=smtp://<username>:<password>@smtp.postmarkapp.com:587` (Resend:
   `smtp://resend:<api key>@smtp.resend.com:587`). If the password has `@`, `:` or `/`, URL-encode it.
4. Render → Environment: `SMTP_URL` as above; `MAIL_FROM=Kinfolk <no-reply@<domain>>` (the address
   must be on the verified domain, and must not be `@localhost`). Save and deploy.
5. Verify: *Forgot password* on the sign-in screen with the demo address; the code arrives in the
   inbox. Then send yourself a tree invitation from a person's card.

## 6. Switch the app to the domain

**Who:** anyone with the Render dashboard.

1. Render → Environment: `WEB_URL=https://<hostname>` (no trailing slash). Leave
   `API_URL=https://kinfolk-rc34.onrender.com` for now: the CSRF check accepts both origins, so
   the old URL keeps working while people move over (`apps/api/src/lib/csrf.ts`).
2. Deploy. Sign in at the new hostname (sessions are per hostname; everyone signs in once more).
   Create a share link; it must start with the new hostname.
3. Later, when nobody uses the onrender URL: set `API_URL` to the same `https://<hostname>` and,
   in Settings → Custom Domains, turn off **Render Subdomain** if ATS wants only one address.
   Any share or review links sent while `WEB_URL` was the onrender URL still work until then.

## 7. Production mode

**Who:** anyone with the Render dashboard. Only after 3 and 5 are verified.

1. Render → Environment → delete `ALLOW_DEV_ADAPTERS`. Deploy.
2. The boot log must **not** print the "running as a PREVIEW deployment" block. If the service fails
   to boot, the log names the missing variable (`env.ts` refuses to start without S3 and SMTP in
   production — that is the point).
3. Set a new `RECORDS_PASSPHRASE` that is **not** the demo password (today they are the same, which
   makes the passphrase useless). Deploy. Tell ATS the new passphrase; existing unlocked sessions
   last at most 30 minutes.
4. Google sign-in stays off by decision (ADR 038); nothing to do.
5. Decide the demo account: either rotate its password (`pnpm db:seed` against the hosted database
   with a new `SEED_PASSWORD`, see DEPLOY.md §4) or delete it from the account page once ATS has
   their own accounts. Sample data must not live beside real client trees.

## 8. Hand-over

1. `docs/DEPLOY.md`: replace "preview" language where it is no longer true, name the hostname, the
   R2 bucket and the email provider, and remove the "sample data only" warning once step 7 is done.
   Commit as `docs(deploy): production on <hostname>`.
2. Give ATS: the URL, the demo or their own login, the records passphrase, and where the Cloudflare,
   email-provider and Spaceship logins are kept.
3. Check the Render database's **Recovery** page once so the retention window is known (DEPLOY.md
   "Backups and restore").

## Verification checklist (all of it, at the end)

- [ ] GitHub Actions green on `main`; Render set to deploy after checks pass
- [ ] `https://<hostname>/api/health` → `{"status":"ok"}`; sign-in works there
- [ ] Photo upload survives a redeploy (R2)
- [ ] Forgot-password email arrives; an invitation email arrives
- [ ] Boot log shows no PREVIEW block; `ALLOW_DEV_ADAPTERS` absent
- [ ] `RECORDS_PASSPHRASE` differs from every login password
- [ ] Share link and review link open on the new hostname
- [x] `.env.example` guard test committed
