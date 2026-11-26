# Putting Kinfolk on a preview URL

For showing work in progress to ATS without a laptop. It is a **preview**, not production:
no Google sign-in, no outbound email, and sample data only. Never put a real client's details
in it.

The whole product is one Node process — the API also serves the built web app — plus Postgres.

---

## 1. Push the repository

The repository has no remote yet. Create an **empty private** repo on GitHub (no README, no
.gitignore — this repo has both), then:

```bash
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

## 2. Storage for uploads (10 minutes, free)

> The live service uses a Render persistent disk instead (ADR 044; `docs/LAUNCH.md` step 3):
> `LOCAL_STORAGE_DIR=/var/data/storage` and `LOCAL_STORAGE_PERSISTENT=true`. What follows is the
> R2 alternative, which still works and takes precedence when `S3_*` is set.

Photos and public-record PDFs are written to the host's disk by default, and most hosts wipe
that on every deploy. Cloudflare R2 is S3-compatible and the S3 adapter already exists, so
this is configuration, not code.

1. Cloudflare dashboard → R2 → *Create bucket*, name it `kinfolk-preview`.
2. *Manage R2 API tokens* → create a token with **Object Read & Write** on that bucket.
3. Keep the account ID, access key ID and secret. They become `S3_*` below.

Skipping this is fine for a first look: uploads then vanish on each deploy, and every push to
`main` is a deploy. A commit whose message contains `[skip render]` does not deploy.

## 3. Create the service

Render, using the blueprint in `render.yaml`. The live service, `kinfolk`, was made by hand to
the same settings and is not linked to a blueprint.

> **One or the other.** A Blueprint creates its *own* web service and database. If a service
> already exists from doing this by hand, delete it and its database first, or the blueprint
> makes a second of each.

1. Render → **Blueprints → New Blueprint Instance** → pick the repository, branch `main`. It
   reads `render.yaml` and creates the web service and a Postgres database, then asks for the
   values marked `sync: false`: `WEB_URL`, `API_URL`, `SIGNUP_ALLOWLIST` and
   `RECORDS_PASSPHRASE`.
2. First deploy will fail the health check until `WEB_URL` and `API_URL` are set — Render only
   assigns the hostname once the service exists. Take the hostname it gives you
   (the live one is `https://kinfolk-rc34.onrender.com`) and set, in *Environment*:

   | Variable | Value |
   |---|---|
   | `WEB_URL` | `https://kinfolk-rc34.onrender.com` |
   | `API_URL` | the same URL |
   | `SIGNUP_ALLOWLIST` | `@atsfinancial.com` (and any individual addresses, comma separated) |
   | `SEED_EMAIL` | the demo login for ATS, e.g. `demo@atsfinancial.com` |
   | `SEED_PASSWORD` | a passphrase you choose — set it here, never in the repository |
   | `RECORDS_PASSPHRASE` | the shared passphrase for opening public records (ADR 037) — never the same as `SEED_PASSWORD`, or the demo login opens records too |
   | `S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
   | `S3_REGION` | `auto` |
   | `S3_BUCKET` | `kinfolk-preview` |
   | `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | from step 2 |

   `WEB_URL` and `API_URL` are the same because one process serves both. They are not cosmetic:
   the CSRF check compares the browser's `Origin` against them, so sign-in fails if they are
   wrong.
3. Redeploy. The health check at `/api/health` should go green.

> **`--prod=false` is not optional.** The service sets `NODE_ENV=production`, and pnpm reads
> that as "install no devDependencies". `prisma`, `vite` and `typescript` are dev dependencies
> that the build needs. Without the flag the install fails with a bare ` ELIFECYCLE  Command
> failed.` and no explanation — the real error, `Command "prisma" not found`, is swallowed
> because it happened inside `apps/api`'s `postinstall` script.
>
> **pnpm is installed with `npm install -g pnpm@9.15.9`, not corepack.** Corepack asks before
> downloading pnpm and a build box has nobody to answer, so it exits with `ELIFECYCLE` after
> printing `! Corepack is about to download …pnpm…`. A service created by hand needs the same
> build command; `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` also silences it, but not needing corepack
> at all is one less thing to go wrong.

## 3a. Let CI gate the deploy

`.github/workflows/ci.yml` runs lint, every test suite, the production build with its bundle
budget, and Playwright on every push to `main` and every pull request. `render.yaml` sets
`autoDeployTrigger: checksPass`, so a blueprint-made service waits for it. The live service was
made by hand, so set the same thing once in the dashboard: the service → **Settings → Build &
Deploy → Auto-Deploy → "After CI Checks Pass"**. Render needs its GitHub app to see the checks;
if the setting is missing, reinstall the Render GitHub app on the repository.

A commit that fails CI never reaches the site. To ship a documentation-only change without a
deploy, put `[skip render]` in the commit message.

## 4. Put the sample family in it

Seed it **from your laptop against the hosted database**. Render
→ the database → copy the *External Database URL*, then:

```bash
DATABASE_URL="<external database url>" SEED_EMAIL="demo@atsfinancial.com" SEED_PASSWORD="<the passphrase you set>" pnpm --filter api exec tsx prisma/seed.ts
```

That creates the account and gives it the 60-person sample family and the 500-person
performance tree. Running it again resets that account's password to whatever `SEED_PASSWORD`
is, which is how to rotate the demo login. The schema itself is created by the build, which
runs `prisma migrate deploy` on every deploy.

## 5. Hand it over

Send ATS the URL, the demo email, and the password. What they can do:

- **Sign in** with that account and use the whole product.
- **Share a tree** — from a tree, *Share* creates a read-only link that needs no account. Copy
  it out of the dialog and send it; it is shown once.
- **Open a person's public records** only after typing `RECORDS_PASSPHRASE`. The server checks
  it and then trusts that browser for thirty minutes; the PDF cannot be fetched by URL without
  it, even by a signed-in member of the tree.
- **Not** receive any email. Invitations, password resets and review links are written to a
  folder on the server instead of being delivered. Anything that depends on a link arriving by
  email has to be copied out of the UI instead.

---

## What "preview" changes

`ALLOW_DEV_ADAPTERS=true` is what lets the app boot without Google, S3 and SMTP. Without it,
`NODE_ENV=production` refuses to start, deliberately, so a development stand-in can never ship
by accident (ADR 007). The flag does not weaken anything else — cookies are still `Secure`,
CSRF is still enforced, and the API prints exactly what it is standing in for at boot:

```
  ⚠  Kinfolk is running as a PREVIEW deployment (ALLOW_DEV_ADAPTERS=true).
     · object storage (uploads are on this host's disk and go when it restarts)
     · email (messages are written to a folder, never delivered)
     Do not put real client data in it.
```

Google sign-in is **off**, not stood in for: the development consent page signs you in as
whatever address you type, which is right on a laptop and an open door on a public URL. The
button disappears from the sign-in screen and the routes are not registered (ADR 036).

## Backups and restore

Everything a client has entered is in the one Postgres instance; the uploads (photos, record
PDFs) are in R2, which Render does not back up.

- **What Render keeps.** On the paid plan the database has point-in-time recovery and daily
  logical backups; the retention window is shown on the database's **Recovery** page in the
  dashboard (seven days at the time of writing — check the page, not this sentence). A restore
  never overwrites: Render creates a *new* database at the chosen moment, which you check and then
  point the service at by changing `DATABASE_URL` and redeploying.
- **Before every migration**, take a copy you own: Render → the database → *External Database
  URL*, then `pg_dump "$URL" -Fc -f kinfolk-$(date +%F).dump` from a laptop. Restore with
  `pg_restore --clean --no-owner -d "$URL" kinfolk-….dump`. The Recovery page's **Create export**
  does the same from the dashboard.
- **Uploads.** R2 has no versioning unless it is turned on for the bucket; a deleted photo is
  gone. Turn on object versioning in the bucket's settings once real client files are in it.
- **Drill it once.** Restore a dump into a fresh local database (`pnpm --filter api exec tsx
  scripts/withEmbeddedDb.ts …`) and open it with the app before you need to do it at 2 a.m.

## Going to real production later

Remove `ALLOW_DEV_ADAPTERS` and set, all of them: the five `S3_*`, `SMTP_URL`, and a `MAIL_FROM` that is not `@localhost`. The app will tell you
at boot if any are missing. The service and database are already on paid plans (since
2026-09-21), so neither sleeps nor expires. Google sign-in stays off by decision: it is only on
when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both set (ADR 038), and they are not.
