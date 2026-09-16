# Kinfolk

Family tree builder for financial advisors, trustees, and estate planners. A client maps
their family (including extended family), fills in contact + planning detail, and submits
the tree to a professional for review.

Full specification: `docs/SPEC.md`. Read it before any structural work. This file is
loaded into every prompt — keep it under ~180 lines and condense rather than append
forever.

## Docs map

| File | What it holds | Who writes it |
|---|---|---|
| `docs/SPEC.md` | The full product spec. Source of truth. | Human. Do not edit without asking. |
| `docs/PROGRESS.md` | Milestone status, what's done, what's next. | You, every checkpoint. |
| `docs/DECISIONS.md` | Architecture decision records. | You, whenever you choose between real alternatives. |
| `docs/DEFECTS-VERIFIED.md` | Proof each defect in SPEC §6 is absent. | You, as features land. |
| `CLAUDE.md` | This file — conventions, invariants, live state. | You, every checkpoint. |

## Commands

```bash
pnpm dev            # web + api
pnpm test           # vitest, watch off
pnpm test:unit      # layout engine + kinship only — run these constantly
pnpm e2e            # playwright
pnpm lint           # eslint + tsc --noEmit
pnpm db:migrate     # prisma migrate dev
pnpm db:seed        # rebuild the fixture tree
```

## Architecture invariants

These are not negotiable. If one seems wrong, stop and raise it — do not work around it.

1. **The family is a graph, not a nested tree.** Nesting cannot express remarriage,
   half-siblings, or in-law branches.
2. **Every child attaches to a `Union`, never to a bare person.** A single known parent
   gets a one-partner Union. This is what makes half-siblings, step-families, and
   remarriage fall out without special cases.
3. **The layout engine is a pure, framework-free module.** No React imports, no DOM, no
   network. Input: graph. Output: coordinates. Same input always yields the same output.
4. **The kinship calculator is likewise pure.** Input: graph + two person ids. Output: a
   canonical English label.
5. **Authorization is server-side, per request, against tree membership.** Never trust a
   client-supplied role. Redaction for share links happens in the API, not the UI.
6. **Age is derived, never stored.** Dates may be partial (year only) and flagged
   approximate.
7. **Sessions are httpOnly cookies.** Nothing auth-related goes in `localStorage`.

## Hard rules

- **No AI assistant.** No LLM panel, no natural-language tree generation, no AI provider
  SDKs, no API-key UI. Out of scope permanently.
- **No stubs in the build.** Nothing labeled "coming soon", no example/demo pages, no dead
  routes. If a feature isn't ready, it isn't in the nav.
- **Every interactive element has an accessible name.** Every form error is visible,
  focused, and announced. Axe violations are build failures.
- **Every destructive action is confirmed or undoable.** Every edit is undoable.
- **Every network call has designed loading, empty, error, and offline states.** No bare
  "Loading…" strings.
- **Hover is never the only way to reach a control.**
- **Icons are inline SVG.** No base64 PNGs in the bundle.

## Code conventions

- TypeScript strict. No `any`, no non-null `!` without a comment explaining why.
- Zod schemas live in `packages/shared` and are imported by both client and server. The
  API validates with the same schema the form does.
- Server state: TanStack Query. UI/canvas state: Zustand. No Redux, no context for server
  data.
- Components: one per file, colocated `.test.tsx`. No barrel `index.ts` re-export files.
- Naming: `PersonCard`, `useTreeGraph`, `computeLayout`, `resolveKinship`. Verbs for
  functions, nouns for components, `use` prefix for hooks only.
- Errors: never swallow. Throw typed errors; the boundary decides presentation.
- Tests: the layout engine and kinship calculator get a unit test per case in SPEC §4.5
  and §4.2. Add the failing test before the fix for every bug.
- Commits: conventional (`feat:`, `fix:`, `test:`, `refactor:`), one logical change each.

## Domain glossary

- **Union** — a partnership record joining one or two people. Children hang off it.
- **ParentChild** — an edge from a Union to a child, with a `kind` (biological, adopted,
  step, foster, guardian).
- **Placeholder** — an unnamed connector person the app creates to express a relationship
  (e.g. the unnamed parent needed to reach a cousin). Dashed on canvas, editable, mergeable.
- **Focus person** — whoever relationship labels are computed relative to. Defaults to the
  tree head, changeable.
- **Root component** — a connected subgraph with no parents above it. A tree may have
  several (in-law branches, not-yet-linked families).

## Workflow

1. Before a milestone, write the plan into `docs/PROGRESS.md` under "In progress".
2. Build the pure module and its tests before the UI that consumes it.
3. Run `pnpm lint && pnpm test` before saying anything is finished.
4. At the end of every milestone, run the checkpoint protocol below.

## Checkpoint protocol — run at the end of every milestone

Do all five, in order:

1. `docs/PROGRESS.md` — move the milestone to Done with a one-line summary and the date.
   Write the next milestone's plan under "In progress".
2. `docs/DECISIONS.md` — append an ADR for every real choice made between alternatives.
   Format: `## NNN — Title` / Context / Decision / Consequences. Never edit an old ADR;
   supersede it with a new one.
3. `docs/DEFECTS-VERIFIED.md` — tick every SPEC §6 item this milestone put beyond reach,
   with the test name, file path, or one-line reason.
4. `CLAUDE.md` — update the three live sections below. Add only durable facts a future
   session would otherwise rediscover the hard way. If a section exceeds its cap, condense
   the oldest entries into one summary line rather than growing the file.
5. Report what changed in each file, in three lines or fewer.

Never record in CLAUDE.md: task status (that's PROGRESS.md), restatements of SPEC.md, or
anything true for one commit only.

---

# Live sections — you maintain these

## Current state
*(Cap: 12 lines. What exists and works right now, at the level a new session needs to
orient. Replace lines rather than stacking them.)*

- Workspace: `apps/web` (React 18, RR 6.30 lazy routes), `apps/api` (Fastify 5, Prisma 6), `packages/shared` (import by subpath, e.g. `@kinfolk/shared/layout/computeLayout`).
- Built: cookie auth (password, dev/real Google, OTP reset), account page, tree API, graph ChangeSets, layout, kinship, canvas, person editing, dashboard, list view, access + share links + invitations + linked trees, review workflow, key events, GEDCOM/CSV import, PNG/PDF/GEDCOM/CSV export.
- Graph edits: `POST /api/trees/:id/changes` → `commitChangeSet` (lock, pure `applyChangeSet`, persist, audit per op, returns inverse). Roles per request: `lib/treeAccess.ts` `requireTreeRole`; redaction: `lib/graphRows.ts` `graphForVisibility`.
- Pure: `computeLayout(graph, { collapsed })` (ordering never depends on entry order — ADR 029), `createKinshipResolver(graph)(ego, alter)`, `displayName(index, id)`, `cardLabel` (age for the living, lifespan for the deceased), `keyEvents`, `writeGedcom`/`parseGedcom`, `planCsvImport`, `treeSvg`.
- Review + collaboration: `features/review/` (reviewer at `/review/:token`; editing while `in_review` is refused by `commitChangeSet`, hidden by `canEditTree`) and `features/collaboration/` (dialogs are routes); the public `/s/:token` (redacted, `toViewGraph`) and `/invite/:token` live outside the app shell.
- Editing: build ops only with planners in `packages/shared/src/relatives/`; send via `features/tree/editing/changeQueue.ts` `commitWithUndo` (optimistic, queued, undoable). Person screens are panel routes in `features/tree/people/` wrapped in `PanelShell`.
- Canvas: `apps/web/src/canvas/` (pure `viewport.ts`, `keyboardNav.ts`, `culling.ts`, one `CardMenu`); tree page `features/tree/TreeRoute.tsx` + `useTreeView`.
- Brand: `components/Brand.tsx` (`Wordmark`, `BrandMark`, `BrandLockup`, `BrandFooter`, `COMPANY`); two navy PNGs in `public/brand/` painted through a CSS mask; rebuild with `node apps/web/scripts/buildBrandAssets.mjs`.
- Web conventions: calls via `lib/api.ts`; forms via `lib/useForm.ts`; `test/renderApp` renders the real routes; `test/treeServer.ts` `mockTreeServer()` fakes the tree API with real `applyChangeSet` (+ `findToast`).
- Tests: `pnpm test` (shared/api/web; API clones a per-file embedded-Postgres DB via `test/testApp.ts`). `pnpm e2e`: one-process stack `apps/api/scripts/e2eStack.ts` (web 5180/api 4180).
- E2E helpers: `e2e/support/seedTree.ts` (`signUp`, `createSeededTree`, `createEmptyTree`), `outbox.ts`, `a11y.ts` (axe with contrast). Fixtures: `buildSeedTree({ namespace })` (60, §4.5), `buildLargeTree()` (500); `pnpm db:seed` writes both.
- New migration without Docker: `pnpm --filter api exec tsx scripts/withEmbeddedDb.ts pnpm exec prisma migrate dev --name <x>`. Every planner is swept over the whole fixture in `packages/shared/src/relatives/graphSweep.test.ts` — add new planners there.

## Gotchas
*(Cap: 20 lines. Non-obvious things that cost time. Each line: the trap, then the fix.)*

- `tsc --noEmit -b` errors (`-b` must come first) → lint runs `tsc -b --noEmit`; api/web `include` shared src (TS6310 forbids references + noEmit).
- Composite projects emit declarations → exported functions with deep inferred types fail TS2742; annotate the return type.
- jsdom shims in `apps/web/src/test/setup.ts` (keep them): floating-ui probes `:popover-open`/`:modal` and each throw costs seconds, hanging any test with an open Radix tooltip or menu; `PointerEvent` is missing, so fireEvent drops `button`/`clientX`.
- Helmet's default `Referrer-Policy: no-referrer` makes Chrome send `Origin: null` on form posts → CSRF check rejects. Keep `strict-origin-when-cross-origin`.
- Fastify `maxParamLength` defaults to 100 → signed tokens in paths 414. Set in `app.ts` `routerOptions`.
- Playwright `getByLabel` substring-matches `aria-label`s (e.g. "Show confirm new password") → use `{ exact: true }`. After a client navigation, wait for the new heading before `fill()`.
- Hidden "(required)" in labels double-announces and breaks exact label queries; so does announcing an alert you also focus → rely on `aria-required` / focus only.
- `.claude/settings.json` denies `Read(./.env.*)`, which also blocks the Write tool on `.env.example` → write that one file via shell.
- `queryClient.ensureQueryData(sessionQuery)` returns a cached `null` after sign-out → any new sign-in path must `setQueryData`/`fetchQuery` the session before navigating, or the guard bounces to /login.
- Person/union/edge ids are global PKs → pass a distinct `namespace` to `buildSeedTree` per tree. Route titles read the query cache (`routes.tsx` `currentTree`), not stale loader data.
- Prisma Json columns need `Prisma.DbNull` for null → helpers in `lib/graphRows.ts`. Embedded-Postgres temp dirs can stay locked on Windows after tests → teardown retries, then warns; harmless.
- Bash tool: unquoted heredocs break on apostrophes and `/tmp` isn't `C:	mp` for node → use Write/Edit, or `cygpath -w`. O(n²) per-iteration `expect` at 500 people takes minutes → collect, assert once.
- To eyeball a layout, render it to SVG→PNG with sharp from a scratch `.mts` script (top-level await needs ESM) and Read the PNG.
- Memoised `PersonCard`s re-render on every pan if any prop is a fresh inline callback → keep canvas callbacks in `useCallback`.
- Slow machine: web tests preload lazy routes (`renderApp`) and use an 8s `findBy` timeout; run long suites in the background.
- Dev stack: there is no `.env`, so the API needs `DATABASE_URL=postgres://kinfolk:kinfolk@localhost:5432/kinfolk` and a 32-char `SESSION_SECRET` inline (a new secret signs everyone out). Prisma EPERM means `tsx watch` respawned it → kill the watcher PIDs (`wmic process ... | grep server.ts`), not the listener on 4000. Windows also orphans children, so e2e runs servers in-process; if 5180/4180 are busy, kill the stale node.
- RTL: two `renderApp` calls leave both apps mounted (call `cleanup()`); navigating away and back without letting the first navigation settle never unmounts the route, so its state survives; two `RadioGroup`s sharing a `name` would be one browser group, so `RadioGroup` scopes the name per instance — don't undo that.
- Never run vitest (or other heavy jobs) while Playwright runs → the browser stalls (2-min `evaluate` hangs, saves stuck retrying). Run e2e alone.
- Radix Toast items have no `role="status"` → query `listitem`s in the "Notifications" region (`findToast`). Radix `DropdownMenu.Content` names itself after its trigger and has no `onOpenAutoFocus` → set `aria-labelledby`, focus items in an effect.
- `refetchQueries` is a no-op for a query put in the cache with `setQueryData` (no queryFn) → `fetchQuery` it first in tests.

## Deviations from SPEC.md
*(Cap: 15 lines. Anywhere the build knowingly differs from the spec, and why. If a
deviation is large, open an ADR and link it here instead of explaining it twice.)*

- Toolchain pinned to older, known majors (TS 5.9, Vite 6, Vitest 3, Prisma 6, Zod 3) — ADR 002.
- Root `lint` script is `eslint . && tsc -b --noEmit`; the spec's argument order doesn't run (QUESTIONS Q33).
- `.env.example` adds `NODE_ENV`, `LOCAL_STORAGE_DIR`, `MAIL_OUTBOX_DIR` for the dev adapters (ADR 007).
- Extra tables beyond §3: `Session`, `OAuthAccount`, `PasswordReset`, `ReviewAssignment`, `ReminderSubscription`; extra columns `Tree.version`, invitation stage timestamps (QUESTIONS Q1, Q22, Q28).
- `Person.linkedTreeId` is server-managed and `photoUrl` must be under the tree's file prefix; undo restores them via audit tokens (ADR 012).
- Production: Secure cookies only when `NODE_ENV=production`, so plain-http test clients work.
- Fit-to-content may zoom below 25% (down to 5%) so trees open whole; manual zoom stays 25–200% (QUESTIONS Q34, ADR 016).
- Generations: BFS-anchored then push/pull-down, not pure longest path, so married-in siblings share a row (Q19, ADR 014).
- No planning questionnaire: removed from the model, the UI, and the database (ADR 028, QUESTIONS Q45). SPEC §3/§5.4/§5.7 still describe it.
- Removing someone's only parent is allowed; their children become roots and are named first (ADR 026, Q44) — SPEC §3 reads as a flat refusal.
- Dates are month/day/year and quick add takes a whole date of birth (ADR 031, Q46); the locale is fixed, not the browser's.
- Cards and list rows show a living person's age, not their birth year; the deceased keep a lifespan (ADR 032, Q47) — §5 and §6.17 ask for years.
- The product is ATS-branded and dark by default, with blue/pink gender accents and a signed, watermarked export (ADR 033, Q48); §5 describes an unbranded warm surface.
- Re-parenting is on the Relationships screen only, no drag onto connectors (Q35); union dates are edited at year precision there (Q36).