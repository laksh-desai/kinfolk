# Architecture decisions

Append only. To change a past decision, write a new ADR that says "Supersedes NNN".

Template:

```
## NNN — Short title
Date: YYYY-MM-DD
Status: accepted | superseded by NNN

**Context.** What forced a choice. What the alternatives were.
**Decision.** What was chosen.
**Consequences.** What this makes easy, what it makes hard, what it rules out.
```

## 001 — Children attach to Unions, not to persons
Date: (fill in)
Status: accepted

**Context.** A family graph must represent remarriage, half-siblings, step-families, single
parents, and adoption. Attaching children directly to one or two parent ids forces special
cases for each.

**Decision.** Every `ParentChild` edge points at a `Union`. A single known parent gets a
Union with one partner. Half-siblings are children of two different Unions sharing one
partner.

**Consequences.** The layout engine can center children under a union connector uniformly.
Half-sibling detection is a graph query, not a flag. Cost: creating a child always implies
selecting or creating a Union, so the UI must handle that invisibly for the common case.

## 002 — Pin the toolchain to majors we know, not the newest
Date: 2026-09-12
Status: accepted

**Context.** At build time the newest releases were TypeScript 7 (native port), Vite 8,
Vitest 5, ESLint 10, Prisma 7/8 (driver-adapter-only client), and Zod 4. SPEC §7 asks for
React 18 and React Router v6. The build is autonomous, with nobody available to untangle a
regression in a brand-new major.

**Decision.** Pin exact versions of the last majors with stable, well-understood APIs:
TypeScript 5.9, Vite 6.4, Vitest 3.2, ESLint 9 + typescript-eslint 8, Prisma 6.19, Zod 3.25,
Fastify 5, React 18.3, React Router 6.30, TanStack Query 5, Zustand 5, Tailwind 4.1.

**Consequences.** All of these are supported today. Upgrading is a deliberate later task;
Prisma 7 in particular changes client generation. Exact pins (no carets) keep installs
reproducible.

## 003 — Real Postgres in tests via embedded-postgres; docker-compose for dev
Date: 2026-09-12
Status: accepted

**Context.** Tests need a database and the build machine has no Docker. The options were
mocking Prisma, pg-mem (Prisma can't use it), PGlite through a preview Prisma driver
adapter, or `embedded-postgres`, which runs the real Postgres 17 binaries from npm.

**Decision.** The vitest `api` project's globalSetup starts embedded Postgres on a free port
and migrates a template database. Each test file clones its own database from it. The
Playwright stack does the same. `docker-compose.yml` is the documented dev database;
`pnpm --filter api db:embedded` is the no-Docker fallback, and
`scripts/withEmbeddedDb.ts` is used to author migrations.

**Consequences.** Integration tests run real SQL, constraints, and migrations, and files are
isolated so they can run in parallel. The first run downloads about 30 MB of binaries.

## 004 — Every graph edit is a ChangeSet with client-generated ids
Date: 2026-09-12
Status: accepted (implemented from M2)

**Context.** SPEC requires undo/redo of every edit (≥ 20 steps), optimistic UI with
rollback, autosave, and an AuditEvent per mutation. Resource-style endpoints make multi-row
operations such as "add cousin" (up to 3 people and 4 edges) non-atomic, and make exact
inverses hard. Server-generated ids also break redo: recreated rows get new ids and later
history entries go stale.

**Decision.** One endpoint takes an ordered list of create/update/delete ops on person,
union, and parentChild, plus setFocus. A pure `applyChangeSet` in `packages/shared` enforces
the graph invariants. The client runs it for optimistic rendering; the server runs it on the
loaded graph before persisting everything in one transaction. The server returns the
authoritative inverse, and undo sends that. Ids are UUIDs minted by the client and checked
by the server.

**Consequences.** Undo/redo, merge, cascade delete, placeholder resolution, and imports all
share one path. The server loads the tree graph on every edit, which is fine at 500 people
but not at 50,000. A person delete must list the removal of each relationship as its own op,
which is exactly what makes the inverse exact.

## 005 — Partial dates stored as flat columns
Date: 2026-09-12
Status: accepted (implemented from M2)

**Context.** SPEC §3 shows `{ year, month?, day?, approximate }`. The options were a JSON
column or four columns per date.

**Decision.** Four columns per date (`birthYear`, `birthMonth`, `birthDay`,
`birthApproximate`, and the same for death, union start, and union end). The API and Zod
expose the nested shape.

**Consequences.** Key Events can filter by month and day in SQL, and range rules live in the
schema. One mapping module converts between the flat and nested shapes.

## 006 — Sessions: stateless access token, rotating refresh token, double-submit CSRF
Date: 2026-09-12
Status: accepted

**Context.** SPEC §5.1 and §6.19 require httpOnly SameSite cookies, short-lived access plus
refresh tokens, consistent 401s, and one refresh-and-retry.

**Decision.**
- Access token (`kf_at`, path `/api`, 15 min): HMAC-signed and naming a session row. The row
  is checked on each request, so sign-out and account deletion take effect immediately.
- Refresh token (`kf_rt`, path `/api/auth`, SameSite=Strict, 30 days): `sessionId.secret`,
  stored as sha256 and rotated on every use. A rotated-out token is tolerated for 30 s (two
  tabs refreshing at once); after that it revokes the session.
- CSRF: a readable `kf_csrf` cookie echoed in `X-CSRF-Token` (or `_csrf` in a form body),
  plus an Origin allow-list.
- Helmet's Referrer-Policy is set to `strict-origin-when-cross-origin`. The default
  `no-referrer` makes Chrome send `Origin: null` on form posts, which the Origin check then
  rejects; e2e found this.
- The web client refreshes single-flight.

**Consequences.** Each request costs one primary-key read for the session. Every token type
derives its key from `SESSION_SECRET` with a purpose label, so rotating the secret signs
everyone out and invalidates links (QUESTIONS Q25).

## 007 — Development adapters behind seams are not "stubs"
Date: 2026-09-12
Status: accepted

**Context.** CLAUDE.md forbids stubs in the build. The machine has no SMTP, S3, or Google
credentials, yet invites, OTPs, uploads, and Google sign-in must work and be testable.

**Decision.** Each external service sits behind an interface with two real
implementations:
- `Mailer`: `SmtpMailer` (nodemailer) or `FileMailer` (JSON files in `MAIL_OUTBOX_DIR`;
  e2e reads OTP codes from there).
- `ObjectStorage`: `S3Storage` (presigned PUT) or `FsStorage` (a signed, expiring upload
  grant to an API route). The client makes the same call either way.
- `OAuthProvider`: `GoogleOAuthProvider` (real code exchange and userinfo) or
  `DevOAuthProvider` (an API-served consent form that mints a signed code and redirects to
  the *same* callback route, which runs the same `completeOAuthSignIn` → `issueSession`).

The env selects the adapter at boot. Production refuses to boot without Google, S3, and
SMTP settings, so a dev adapter can never ship silently.

**Consequences.** The "no stubs" rule is about dead UI: "coming soon" items, demo pages,
disabled features. A dev adapter is a complete, tested implementation of a seam, and nothing
user-facing is faked. The dev consent page is rendered by the API, not the web bundle, and
does not exist when Google is configured.

## 008 — Fastify rather than NestJS
Date: 2026-09-12
Status: accepted

**Context.** SPEC §7 allows either.

**Decision.** Fastify 5 with plain functions. Each module is a plugin that receives an
explicit `AppDeps`, and services are functions of `(deps, input)`.

**Consequences.** There is no DI container or decorators. Tests build the app with their own
deps (per-file database, file mailer, fs storage, controllable clock) and use
`app.inject`. Authorization is an explicit call in each handler, so a missing check is
visible in review rather than hidden in a decorator list.

## 009 — Design tokens as CSS custom properties, contrast enforced by a test
Date: 2026-09-12
Status: accepted

**Context.** SPEC §8 needs one design system, dark mode including the canvas, and 4.5:1
contrast on all text. axe running in jsdom cannot compute contrast.

**Decision.** All colours are `--kf-*` custom properties for light and dark, mapped into
Tailwind 4 with `@theme inline` so every utility reads the variable.
`components/tokens.test.ts` parses `styles.css` and asserts, in both themes:
- 4.5:1 for every text/background pair in use;
- 3:1 for control borders, focus rings, and canvas edges.

Playwright runs full axe, including contrast, in Chromium. Inter is the UI face; Source
Serif 4 appears only in `.page-title`. Both are self-hosted, so the CSP needs no font CDN.

**Consequences.** A token change that breaks contrast fails `pnpm test`. The theme
preference is the only thing kept in `localStorage`, via `lib/preferences.ts`, the one module
the lint rule lets touch storage.

## 010 — Forms: a small `useForm` over the shared Zod schemas
Date: 2026-09-12
Status: accepted

**Context.** Every form must validate on blur and on submit with the API's own schema. A
failed submit must focus and scroll to the first invalid field, show the message beside it,
and announce it. React Hook Form with a Zod resolver was the obvious alternative.

**Decision.** `lib/useForm.ts` takes the shared schema, human field labels, and `onSubmit`.
It owns:
- focusing the first invalid field in DOM order;
- the assertive live-region summary;
- mapping server `fields` errors back onto their fields;
- focusing a form-level alert. That alert is deliberately not also announced, since focusing
  it reads it and announcing would say it twice.

**Consequences.** The SPEC §5.4 accessibility behaviour exists once, and no form can opt out
of it. Each keystroke re-renders the whole form. That's acceptable at current sizes; profile
the person detail form in M6.

## 011 — The e2e stack runs API and Vite in one process
Date: 2026-09-13
Status: accepted

**Context.** Playwright's `webServer` first spawned the API and Vite as child processes. On
Windows, stopping the parent left both children holding ports 4180 and 5180, so the next run
timed out or tested stale servers.

**Decision.** `apps/api/scripts/e2eStack.ts` imports `buildApp` and Vite's `createServer`
and runs both in its own process, next to embedded Postgres. It refuses to start if either
port is busy.

**Consequences.** There's one process to stop, and a busy port gives a clear error instead of
a stale run. The e2e API runs with `NODE_ENV=development` and every dev adapter, which is
exactly the no-credentials path.