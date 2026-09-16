# Progress

Milestones are defined in `docs/SPEC.md` §10. Update at every checkpoint.

## In progress

**M11 — Fixes from first use.** Two bugs reported from the running app, a sweep of every
planner for more of the same, and three changes of scope from the product owner. Done so
far, each test-first:

- **Removing the top of a tree** (ADR 026, QUESTIONS Q44). `deletionImpact` always offers
  `remove`; children whose last parent goes become roots and are named in the dialog first.
- **A spouse added to a parent is a parent** (ADR 027). Adding a partner joins the anchor's
  one-parent family instead of starting a second one, so the children gain a second parent
  rather than a step-parent. `connectionSteps` asks when it is ambiguous; the summary says
  what happened.
- **Sweep** (`packages/shared/src/relatives/graphSweep.test.ts`). Every planner over the
  whole 60-person fixture: 1,620 add-relative plans, every delete mode for every person,
  every link-kind change, every re-parent, and merges — each checked for a valid graph and
  an exact undo. It found two more defects, now fixed (ADR 030): merging a parent with
  their own child dropped the link between them instead of refusing, and the "move to
  different parents" menu listed families that could never accept the child. A third came
  out of the web tests: two `RadioGroup`s sharing a `name` fought over the selection.
- **Planning removed** (ADR 028, QUESTIONS Q45): schema, form section, API redaction level,
  reviewer block, and the `Person.planning` column.
- **Layout ordered by the family, not by entry order** (ADR 029, QUESTIONS Q46). The same
  60-person tree entered in any order now draws identically — it previously moved every row
  and swung 6% in width.
- **Dates**: quick add takes a whole date of birth, and dates read and are entered
  month/day/year (ADR 031).

Then, from the product owner and from ATS:
- **ATS livery** (ADR 033): two logo assets built from the supplied artwork and painted through a
  CSS mask, a navy palette that is dark by default, the wordmark in the header, the lockup at the
  foot of the screens outsiders see, and exports carrying the tree behind the family with the
  date, CONFIDENTIAL, and the lockup along the bottom.
- **Public records** (ADR 034): a PDF per person, PDF-checked by its bytes, stored under the tree,
  opened in a new tab, attached through an ordinary undoable change.
- **The client household** (ADR 035): the focus person and their current partner marked together
  on the canvas, in the accessible name as well as the badge.

M11 is done bar the §12 journey re-run end to end.

## Up next

**M10 is finished.** Production serving landed last: `webRoutes` serves `apps/web/dist` from
the API process, hashed assets immutable for a year, index.html never cached, and any screen
URL someone pastes or refreshes returns the app while `/api/*` keeps answering JSON
(`webServing.test.ts`, plus `scripts/serveCheck.mts` against the real build). The bundle was
re-measured (initial route 158.4 KB gzip, heaviest route 191.4 KB, budget 200 KB) and
`docs/DEFECTS-VERIFIED.md` is complete: 24 of 25 verified, the 25th unprovable here.

Two things a future session should know about that path:
- `tsc --outDir` emitted extensionless ESM imports, so `node dist/server.js` never booted —
  it had never been run. `pnpm start` now runs the source through tsx, which is honest and
  works; bundling with esbuild is the move if start-up time ever matters.
- A real `NODE_ENV=production` boot needs Google OAuth and S3 credentials, which this machine
  doesn't have, so production serving is proven through the app rather than a live process.

## Done

- **M9 — Review workflow** (2026-09-15). Owner sends a tree to a reviewer by email with a
  note; the tree locks (`in_review`) for everyone and the banner says who has it, since when,
  and that editing is paused, with Withdraw beside it. The reviewer opens `/review/:token`,
  signs in (their decision needs an author), and sees the whole tree — canvas or list, planning
  answers included, placeholders counted — then approves or writes a change request. Notes come
  back as a banner and on the owner's dashboard, with Mark resolved and Resubmit. Approved trees
  return to draft on the next edit, and the banner says so first. The first person to open a
  review link claims it; anyone else is told to ask for their own.
  Tests: 3 API (full cycle with audit trail, claim and withdrawal, refusals), 8 web RTL + axe,
  and the §12 Playwright journey across two browsers. Gate: lint clean, 529 tests, 15/15 e2e.
- **M8 — Collaboration** (2026-09-15).
  - Access: owner invites by name, email, and role; members accept or decline from the
    dashboard; roles change inline; access is revoked with confirmation. Everyone sees who
    has access, but email addresses go only to the owner and to the person themselves.
  - Share links: signed, optionally expiring, revocable. The public view at `/s/:token`
    reuses the canvas and list over the redacted allow-list, with no account needed.
  - Relative invitations: sent from a person's card, tracked through the four real stages,
    resent and withdrawn; the public `/invite/:token` page explains the invitation before
    sign-up and returns to it afterwards.
  - Linked trees: the invitee asks to link a tree of their own, the owner approves on the
    Link requests screen, and the person's card then opens the linked tree with a
    breadcrumb back. When it isn't shared with you, the card says so instead.
  - Dashboard "Waiting for you": access invitations, link requests, and your own
    invitations, shown only when something is waiting.
  - Tests: 8 API (roles, redaction, stages, tokens, rate limit, email privacy), 20 web RTL
    + axe, and 2 Playwright journeys covering dialogs at 768 px, a signed-out share link,
    and invite → build → link → approve. Gate: lint clean, 518 tests, 14/14 e2e.
- **M7 — Dashboard, tree management, list view** (2026-09-14).
  - Dashboard: owned and shared trees as cards (people count, status, "Edited 2 hours ago",
    role and owner for shared trees). Skeleton loading, error with retry, an empty state
    that explains trees, and a New family tree dialog.
  - Tree header: rename in place (opens on the first click, Enter/Escape, undo toast) and a
    settings menu with type-to-confirm tree deletion that lists what is destroyed.
  - List/outline view: generations → families → people, with the canvas's actions.
    Tree/List switch held in the URL and remembered; narrow screens default to List.
  - Page titles now follow renames through the query cache. Edits invalidate the dashboard
    summary.
  - Planned `lastEditedAt` dropped: `updatedAt` already moves on every change set (new API
    test).
  - Tests: 16 new web (dashboard, header, list, outline, relative time), 1 API. Playwright
    `dashboard.spec.ts`: create → first person → list → reload → rename → delete by typed
    name, with axe. Gate: lint clean, 487 unit/integration tests, 12/12 e2e.
- **M6 — People & relationships** (2026-09-14). Pure planners in `packages/shared/src/relatives/`:
  add relative (every §4.2 relation, placeholders with a summary sentence, `NEW_PERSON`),
  delete impact and modes, merge, relationship edits, direct relatives. The editing core
  applies changes optimistically through a sequential save queue with retry, offline
  waiting, rollback on 4xx, and rebasing unsaved edits over a refetch; undo/redo come from
  server inverses. Panel routes: relation picker, add relative (pre-answered connection
  questions, placeholder preview, add another), add person, full edit form (photo upload,
  free-text address with lazy Places, unsaved-changes guard), relationships editor, merge,
  compare (path highlighted), needs detail. Also: card menu (right-click, Menu key,
  Shift+F10), delete dialog with an Undo toast, save indicator, and Undo/Redo in the header.
  Tests: 111 shared planner/schema, 9 queue, 37 web RTL + axe, and API photo, CSP, and journey-replay tests; Playwright
  `relatives.spec.ts` adds all 12 §12 relatives from the canvas, corrects a marriage,
  undoes and redoes, and refreshes. Gate: lint clean, 471 unit/integration tests.
  Unexplained: one e2e run saw a save stuck on "Couldn’t save — retrying" while other test
  jobs were hogging the CPU; it passed on each of the 3 later runs, and the API replay of the same
  change sets passes.
- **M5 — Canvas** (2026-09-13). Tree route and docked person panel, both URL-addressable.
  Canvas: HTML cards over an SVG edge layer in one transformed layer; drag and wheel pan,
  ctrl/⌘ zoom anchored to the cursor; fit on load (down to 5%, Q34); roving-tabindex
  keyboard navigation along relationships; search combobox; collapse with hidden counts;
  minimap above 25 people; virtualisation above 200; married-in branch brackets; legend;
  navigation progress bar. 36 RTL + math tests, 5 Playwright tests (fit at 768/1280/2560,
  refresh restore, keyboard-only, cursor zoom, 500-person pan: median 16.7 ms, p95 33.4 ms).
- **M4 — Kinship calculator** (2026-09-13). Pure `createKinshipResolver`: union-aware blood
  search (degree, removal, half, side), adoptive/foster/guardian/step edges, partners,
  derived step, in-laws with precise possessive chains, distance fallback, Compare path.
  24 tests: every §4.2 label both ways, a hand-written Ravi → all-60 table, all 3,600 pairs,
  connected paths, 500-person performance.
- **M3 — Layout engine** (2026-09-13). Pure `computeLayout`: anchored generation rows,
  partner-group ordering, layout forest with in-law side packing, contour-packed blocks,
  laned orthogonal routing, collapse, multiple-birth marks. 27 tests: all 19 §4.5 cases, the
  seed tree, odd data (cycles, cousin marriage, dual parentage). All assert no overlap, no
  edge through a card, and determinism under shuffle. 500 people lays out in ~35 ms.
- **M2 — Data layer** (2026-09-13). Full Prisma schema and migration, shared Zod schemas,
  pure `applyChangeSet` (invariants with plain-language errors, exact inverses), partial
  dates, 60-person §4.5 seed and 500-person generator, tree CRUD, graph + changes endpoints
  with per-request roles, planning redaction, audit per op, server-managed link/photo fields,
  `pnpm db:seed` verified on real Postgres.
- **M1 — Foundation** (2026-09-13). Monorepo scaffolding, strict TS/ESLint/Vitest/Playwright,
  design tokens with a contrast test, component primitives, cookie-session auth (email +
  password, Google with a dev provider, OTP reset), account page (profile, password, avatar,
  export, type-to-confirm delete), guarded lazy routes with per-route titles. Tests: 20 auth +
  8 account API integration tests on embedded Postgres, web RTL + axe, 5 Playwright journeys.

## Blocked / needs a human decision

_nothing yet — open questions live in `docs/QUESTIONS.md` and none are blocking._

---

# Implementation plan

Written 2026-09-12, before any code. Ambiguities and the calls made on them are in
`docs/QUESTIONS.md`; the architecture choices are ADRs in `docs/DECISIONS.md`.

## A. System shape

```
apps/web      React 18 + Vite + React Router 6 data router (lazy routes) + TanStack Query
              + Zustand + Tailwind 4 + Radix. Dev server proxies /api → api, so the browser
              sees one origin and cookies stay SameSite=Lax.
apps/api      Fastify 5 + Prisma 6 + Postgres. Zod-validated env at boot. Modules: auth,
              account, trees, graph (changesets), access, invitations, links, sharing,
              review, events, files. Adapters behind interfaces: ObjectStorage (S3 | fs),
              Mailer (SMTP | file outbox), OAuthProvider (Google | dev).
packages/shared
              schemas/   Zod — one schema per entity + ChangeSet ops, used by form and API
              graph/     pure: applyChangeSet, invertChangeSet, validateGraph, indexes
              layout/    pure: computeLayout (no React, DOM, network — lint-enforced)
              kinship/   pure: resolveKinship
              relatives/ pure: planAddRelative (placeholder resolution), planMerge,
                         planDeletePerson
              dates/     pure: partial dates, derived age/lifespan, key events
              fixtures/  the §4.5 seed tree + deterministic 500-person generator
              gedcom/, csv/  pure parse/serialize
```

**Every graph edit is a ChangeSet** (list of create/update/delete ops on person, union,
parentChild, focus). The client applies it optimistically with the same pure
`applyChangeSet` the server uses for validation; the server returns the authoritative
inverse ChangeSet, which is what undo sends. IDs are client-generated UUIDs so redo can
recreate the same rows and later history entries stay valid. (ADR 004.)

**Tests without Docker:** vitest `api` project and Playwright start `embedded-postgres`
(real Postgres 17 binaries) on a free port, run `prisma migrate deploy`, and tear down.
docker-compose.yml remains the documented dev database. (ADR 003.)

## B. Prisma schema (target for M2; auth tables land in M1)

```prisma
enum Gender            { male female other unknown }
enum LifeStatus        { living deceased unknown }
enum TreeStatus        { draft in_review approved changes_requested }
enum UnionType         { marriage partnership unknown }
enum UnionStatus       { current divorced separated widowed ended }
enum ParentChildKind   { biological adopted step foster guardian }
enum AccessRole        { editor viewer }
enum AccessStatus      { invited active revoked }
enum InvitationStage   { sent joined tree_created linked }
enum LinkRequestStatus { pending approved rejected }
enum ChangeRequestStatus { open resolved }

model User {
  id String @id @default(uuid()) @db.Uuid
  email String @unique              // lower-cased on write
  firstName String
  lastName String
  passwordHash String?              // null for Google-only accounts
  avatarUrl String?
  createdAt DateTime @default(now())
}
model Session {                     // one row per refresh-token family
  id String @id @db.Uuid; userId String @db.Uuid
  refreshTokenHash String @unique   // sha256; rotated on every refresh
  expiresAt DateTime; revokedAt DateTime?; createdAt DateTime @default(now()); lastUsedAt DateTime
}
model OAuthAccount  { id; provider String; providerUserId String; userId; @@unique([provider, providerUserId]) }
model PasswordReset { id; userId; codeHash String; attempts Int @default(0); expiresAt; verifiedAt?; consumedAt?; createdAt }

model Tree {
  id; name String; description String?; ownerId; thumbnailUrl String?
  focusPersonId String? @db.Uuid     // no FK: validated in graph layer, nulled on person delete
  status TreeStatus @default(draft)
  createdAt; updatedAt @updatedAt
}
model Person {
  id String @id @db.Uuid             // client-generated
  treeId
  firstName String                   // "" only when isPlaceholder
  lastName String?; maidenName String?; nickname String?; suffix String?
  gender Gender; lifeStatus LifeStatus
  birthYear Int?; birthMonth Int?; birthDay Int?; birthApproximate Boolean @default(false)
  deathYear Int?; deathMonth Int?; deathDay Int?; deathApproximate Boolean @default(false)
  birthPlace String?; maritalStatus String?; email String?; phone String?
  address Json?                      // { formatted, street, city, state, postalCode, country, lat, lng }
  photoUrl String?; profession String?; notes String?
  isPlaceholder Boolean @default(false)
  details Json?; socials Json?; planning Json?      // Zod-validated shapes
  linkedTreeId String? @db.Uuid
  createdAt; updatedAt
  @@index([treeId])
}
model Union {
  id @db.Uuid; treeId; partnerAId; partnerBId String?
  type UnionType; status UnionStatus
  startYear Int?; startMonth Int?; startDay Int?; startApproximate Boolean @default(false)
  endYear Int?;   endMonth Int?;   endDay Int?;   endApproximate Boolean @default(false)
  createdAt; updatedAt
}
model ParentChild {
  id @db.Uuid; treeId; childId; unionId; kind ParentChildKind; createdAt
  @@unique([childId, unionId])
  @@unique([childId, kind])          // §3: a second parental row only when kinds differ
}
model Access       { id; treeId; userId?; email; name String?; role AccessRole; status AccessStatus;
                     invitedById; invitedAt; acceptedAt?; @@unique([treeId, email]) }
model Invitation   { id; treeId; personId; email; tokenHash @unique; stage InvitationStage;
                     invitedById; inviteeUserId?; inviteeTreeId?;
                     sentAt; joinedAt?; treeCreatedAt?; linkedAt?; expiresAt; revokedAt? }
model LinkRequest  { id; fromTreeId; toTreeId; personId; requestedById; status; createdAt;
                     resolvedAt?; resolvedById? }
model ChangeRequest{ id; treeId; authorId; body; status; createdAt; resolvedAt?; resolvedById? }
model ShareLink    { id; treeId; tokenHash @unique; expiresAt?; revokedAt?; createdById; createdAt }
model ReviewAssignment {             // not in SPEC §3 — see QUESTIONS Q1
  id; treeId; tokenHash @unique; reviewerEmail; reviewerUserId?; createdById;
  createdAt; revokedAt?; decision String?; decidedAt? }
model ReminderSubscription { userId; treeId; createdAt; @@id([userId, treeId]) }
model AuditEvent   { id; treeId? (FK, cascade); actorId?; action; targetType; targetId;
                     before Json?; after Json?; createdAt; @@index([treeId, createdAt]) }
```

Dates are flat columns (ADR 005) so key events can query by month/day; the API and Zod
schemas expose the nested `{ year, month?, day?, approximate }` shape from SPEC §3.

## C. Layout engine — `packages/shared/src/layout/computeLayout.ts`

```
input:  graph { people, unions, parentChildren }, options { cardW, cardH, gaps, collapsed }
output: { nodes[{personId,x,y,w,h,generation,multipleBirth?}],
          unions[{unionId, anchor, path[], style: solid|dashed}],
          edges[{parentChildId, childId, unionId, kind, path[]}],
          branches[{id, personIds, bounds, componentId}], bounds }

0. CANONICALISE — sort every input array by (createdAt, id). Nothing downstream may depend
   on input order. If options.collapsed: drop descendants of collapsed people, then drop
   any component that became detached from the collapsed person's component.

1. GENERATIONS
   classes = union-find over union partners           // partners share a generation
   classDag = edges class(parentPartner) → class(child); ignore self-loops; break cycles by
              ignoring back-edges in a DFS over classes sorted by key
   gen(c)   = longest path from any class with no parents (roots = 0)
   for c in reverse topological order:                // "a union anchors them"
       if c has child classes: gen(c) = min(gen(child)) - 1
   per connected component: shift so min gen = 0      // disconnected roots start at 0

2. GROUPS — each class is one row unit; order its members:
   hub = the member that is the primary child-link (step 3) else most unions, then key
   deque = [hub]; hub's unions by (startDate, createdAt): with one union the partner goes
   right; with several the first goes left, the rest right. Each placed partner's own
   further partners are inserted adjacent on the outer side. Non-adjacent partners get a
   below-row connector lane.

3. LAYOUT FOREST — DFS from root groups in first-appearance order; for group G, for each
   union U in anchor order, for each child c (birth date asc, unknown last, then key):
   the first visit of group(c) makes (G,U,c) its PRIMARY slot; later visits are
   SECONDARY links (in-law parents, adoptive + biological, cousin marriage).

4. BLOCKS (bottom-up; "shift whole subtrees, never individual nodes")
   block = { x offset per person, contour: gen → [minX, maxX] }
   layoutGroup(G):
     kidBlocks = [layoutGroup(C) for each primary slot, in order]
     pack kidBlocks left→right: shift each so on every shared generation
          prev.max + gap ≤ next.min   (gap = SIBLING within a union, FAMILY between unions)
     place G's member row: offset = mean over unions U with kids of
          (midpoint(first kid centre, last kid centre) − anchorX(U))
     return merge(G row, kidBlocks)
   top level: order forest roots by first appearance, but when a placed block has a group
   with a SECONDARY parent whose forest root is unplaced, that root is packed immediately
   after (in-law branch lands beside the family it married into). Blocks from different
   connected components are separated by COMPONENT_GAP. Pack with the same contour rule.

5. Y COORDINATES — count lanes per inter-row gap (below-row union connectors + one bus per
   union with children, interval-coloured so overlapping buses get different lanes);
   rowY(g+1) = rowY(g) + cardH + baseGap + lanes(g) × laneSpacing.

6. ROUTING (orthogonal, rounded corners drawn by the renderer)
   union adjacent partners: horizontal at card mid-height across the gap between cards
   union non-adjacent:      down from each partner's bottom to its lane, across
   single-partner union:    anchor = partner's bottom centre
   child edge: anchor → down to the union's bus lane → across to child centre → down to
     child top. If a row lies between (long edge) or the child is not below (cycle-broken
     data), jog to the nearest x that is free in that row and pass through the gap.
   Divorced / separated / ended unions → style dashed; non-biological kinds carry `kind`.

7. NORMALISE — translate so bounds start at (0,0); round to integers.

invariants tested: no two cards intersect; no segment passes through a card interior;
output deep-equals itself for shuffled input; couple's kids centred under the anchor.
```

## D. Kinship calculator — `packages/shared/src/kinship/resolveKinship.ts`

```
resolveKinship(index, egoId, alterId) → { label, category, path[], steps }
   label answers "alter is ego's ___"

index: parentsOf(p) = [{parentId, unionId, kind}], partnersOf(p) = [{personId, union}],
       childrenOf(p)

1. ego = alter → "Self"
2. BLOOD (lineal edges = biological | adopted)
   upA = BFS ancestors of ego: map person → {depth, firstStepParent, viaUnion}
        and union → depth (a union reached through a child-of edge at depth d)
   upB = same for alter
   candidates:
     common UNION u at (a,b)  → full relationship        cost a+b
     common PERSON p at (a,b) not explained by a common union at the same depths
                             → half relationship         cost a+b
     alter ∈ upA at depth a  → lineal ancestor (b=0);  ego ∈ upB → descendant (a=0)
   pick min cost; ties: full over half, then lower max(a,b)
   name(a,b):
     b=0: 1 parent · 2 grandparent · 3 great-grandparent · 4 great-great- · n≥5 "(n-2)th great-"
     a=0: same ladder with child / grandchild
     a=1,b=1: sibling          a=1,b≥2: niece/nephew → great-niece → great-great-…
     a≥2,b=1: aunt/uncle → great-aunt → great-great-…
     a≥2,b≥2: ordinal(min(a,b)−1) cousin + removal |a−b| ("once", "twice", "3 times")
   gender: male/female pick the gendered word; other/unknown → neutral
           ("Parent", "Sibling", "Parent's sibling", "Sibling's child")
   half prefix when relationship came from a common person (siblings, niece, aunt, cousin)
   side: a ≥ 2 with b ∈ {0,1} (grandparents, great-aunts…) → "Maternal"/"Paternal" from
         gender of ego's first-step parent; omitted if unknown or both sides tie
   direct-edge qualifier (a+b = 1 only): adopted → "Adoptive mother"/"Adopted son";
         foster/guardian/step kinds are NOT lineal: handled in 3
3. DIRECT NON-LINEAL EDGES: foster → "Foster mother"/"Foster son"; guardian → "Guardian"/"Ward";
   step kind → "Step-mother"/"Step-son"
4. PARTNER: alter partners ego → marriage current "Wife/Husband/Spouse", separated
   "Wife (separated)", divorced/ended "Former wife", widowed "Late husband" (if alter deceased);
   partnership/unknown → "Partner"/"Former partner"
5. STEP (derived): alter partners one of ego's parents and is not ego's parent → "Step-mother"
   (prefix "Former" if that union divorced/ended); alter is child of ego's partner and not
   ego's child → "Step-son"; alter is a child of a step-parent and shares no parent with ego →
   "Step-brother"; step-parent's parent / parent's step-parent → "Step-grandmother" (+ inverse)
6. IN-LAW (via one union hop, marriage → "-in-law", partnership → "Partner's …")
   alter is blood relative R of ego's spouse:  parent → "Mother-in-law", sibling →
     "Brother-in-law", grandparent → "Grandmother-in-law"; other R → "Wife's first cousin"
   alter is spouse of ego's blood relative R:  child → "Son-in-law", sibling →
     "Sister-in-law", grandchild → "Grandson-in-law", aunt/uncle → "Aunt by marriage",
     niece/nephew → "Nephew-in-law", other → "First cousin's husband"
7. FALLBACK: BFS over undirected person graph (parent, child, partner edges) →
   "Related — N steps away"; unreachable → "No known relationship"
priority: self > blood > direct non-lineal > partner > step > in-law > fallback
path: person ids along the chosen route (for Compare drawing)
```

## E. Milestones and acceptance checks

| # | Milestone | Acceptance check (all must be demonstrated, not asserted) |
|---|---|---|
| 1 | Foundation | `pnpm lint && pnpm test` green. API boot test fails with named missing vars. Integration tests on real Postgres: signup → me → refresh rotation → logout; bad password 401; forgot → OTP from file outbox → verify → reset → login; dev-Google path creates a session through the same `issueSession` code. Web: RTL tests for login/signup form validation (empty submit focuses + announces), route guard redirects before render, every route has a title. No `localStorage` outside the prefs module (lint rule). |
| 2 | Data layer | Migration applies to embedded Postgres. `pnpm db:seed` against it produces ~60 people; a pure fixture test asserts every §4.5 structure is present. `applyChangeSet`/`invertChangeSet`/`validateGraph` unit tests incl. cycle rejection with human message. Graph + changes endpoints: owner/editor/viewer/stranger authorization tests, audit event per mutation, planning redacted for editor/viewer. |
| 3 | Layout engine | One unit test per §4.5 case (1–19) asserting no card overlap, no edge through a card, determinism under input shuffle, plus case-specific geometry (centring, adjacency, dashed divorce, side-by-side components). 500-person layout < 300 ms in test. |
| 4 | Kinship | Unit test per §4.2 label in both directions incl. removal, degree, half/step, maternal/paternal, in-law; the seed tree's focus person vs every other person matches a curated table; every ordered pair in the seed resolves without throwing and never returns an empty label. |
| 5 | Canvas | Pure viewport math tests (zoom anchors to cursor, clamps 25–200 %, fit-to-content at 768–2560 px). Keyboard-nav pure tests (arrows follow relationships). Culling test for >200 nodes. RTL + axe on canvas with seed tree: zero violations, every control named; minimap appears > 25 people; search zooms to match; collapse hides a branch. |
| 6 | People & relationships | `planAddRelative` unit test for every §4.2 relation from a topmost node, a married-in node and a placeholder, asserting edges, placeholders and the summary sentence. Merge and delete planners tested. Undo/redo store ≥ 20 steps; autosave queue retries on network error and rolls back on 4xx. Person form RTL: empty submit focuses first invalid field + live-region message; edit mode copy says "Edit". |
| 7 | Dashboard, tree mgmt, list view | Dashboard lists owned + shared trees with role badge; true empty state; rename opens on first click (test); delete requires typing the name. Outline view grouped by generation with the same actions; axe clean. |
| 8 | Collaboration | Access CRUD with server-side role checks; share link API returns only redacted fields (test asserts absence of phone/email/address/notes/planning); invitations advance through all four stages from real backend events; link request approve sets linkedTreeId. Dialogs fit at 768 px (no horizontal overflow — RTL/Playwright check). |
| 9 | Review | submit → in_review locks edits (API 409 + banner); reviewer approve / request changes (min length validated both sides); change request on dashboard + banner; resolve + resubmit. |
| 10 | Events, import, export | Key events derived from seed data (non-empty, correct days-until). GEDCOM round-trip test; CSV mapping + preview diff test; PNG/PDF/GEDCOM export produce files. Playwright §12 journey green against embedded Postgres. |

---

# Milestone plans

## M10 — Key events, GEDCOM/CSV import, exports (mostly done 2026-09-16)

Pure modules first, each with tests, then the screens.

- **Key events (§5.8, QUESTIONS Q28).** `packages/shared/src/events/keyEvents.ts`:
  birthdays for living people with a known month and day, anniversaries from `current`
  unions with a known month and day, days until, and the next occurrence across a year
  boundary. API `GET /api/events` aggregates the caller's trees. Screen `/events`:
  sortable, searchable, filterable by month, with a true empty state that explains why a
  year-only date can't make an event and links to "Needs detail".
- **GEDCOM import and export (§5.3).** `packages/shared/src/gedcom/`: a 5.5.1 reader
  (INDI, FAM, NAME, SEX, BIRT/DEAT with partial dates, HUSB/WIFE/CHIL, ADOP) producing
  change-set ops, and a writer producing the same records back. Round-trip test over the
  seed tree.
- **CSV import with mapping and preview (§5.3).** `packages/shared/src/import/csv.ts`:
  parse, guess column mapping, then a preview diff — people added, people matched to
  existing ones, and rows that can't be used, each with the reason. Nothing is written
  until the person confirms; the whole import lands as one undoable change set.
- **PNG and PDF export.** Render the layout to SVG in a pure module
  (`packages/shared/src/export/treeSvg.ts`, reusing `computeLayout`), then rasterise to PNG
  in the browser via canvas, and lay the same SVG into a PDF. Both download the file
  directly from the client, with no server round trip.
- **Import/export screens.** `/trees/:treeId/import` (file picker, mapping table, preview
  diff, confirm) and an Export menu on the tree header (PNG, PDF, GEDCOM, CSV).
- **Production serving.** The API serves the built web app in production, with the SPA
  fallback and long-cache headers for hashed assets, so `pnpm build && pnpm start` runs the
  whole product from one process.
- **Final pass.** Re-measure the production bundle (§9: initial route under 200 KB gzip),
  re-run the §12 checklist end to end, and finish `docs/DEFECTS-VERIFIED.md`.

Tests:
- Pure: key events (day boundaries, leap days, missing months), GEDCOM round trip, CSV
  mapping and diff, SVG geometry.
- API: `/api/events` across several trees with roles; import endpoint authorisation.
- RTL + axe: events table (sort, search, month filter, empty state), import mapping and
  preview, export menu.
- Playwright: the full §12 journey, plus GEDCOM export → re-import → same people.

Done when: the M10 row in table E is demonstrated, and every §6 defect is verified or
explained.

## M9 — Review workflow (done 2026-09-15)

Model and decisions already in place: `ReviewAssignment` (QUESTIONS Q1), `ChangeRequest`,
tree statuses, and the rule that `in_review` locks editing for everyone (Q21, already
enforced by `commitChangeSet` and `canEditTree`).

API (module `review/`):
- `POST /api/trees/:id/review` (owner): reviewer email, optional note. Creates a
  `ReviewAssignment` with a signed token, sets status `in_review`, emails the reviewer a
  `/review/:token` link. Refuses when a review is already open.
- `DELETE /api/trees/:id/review` (owner): withdraw, back to `draft`.
- `GET /api/review/:token`: the tree for the reviewer — full graph including planning
  answers (Q9) — plus who sent it and when. The first signed-in user to open it claims the
  assignment (Q1); afterwards it is theirs alone.
- `POST /api/review/:token/approve` and `/changes` (body required, minimum length
  validated by the shared schema): sets `approved` or `changes_requested` and records a
  `ChangeRequest` with its author.
- `POST /api/trees/:id/change-requests/:id/resolve` (owner): marks one resolved.
- `POST /api/trees/:id/review/resubmit` (owner): back to `in_review` for the same
  reviewer.

Web:
- Tree header: "Submit for review" (owner, draft or changes_requested) opens a dialog
  (reviewer email + note). While `in_review`: a banner saying who has it, when it was
  sent, that editing is paused, and a Withdraw button.
- `changes_requested`: a banner with the note, author, and time, plus "Mark resolved" and
  "Resubmit"; open change requests also appear on the dashboard's "Waiting for you" list.
- `/review/:token`: the reviewer's screen — read-only canvas and list, planning answers
  visible, a placeholder count, and Approve / Request changes (free text, minimum length,
  errors focused and announced).
- Status badge everywhere: Draft · In review · Changes requested · Approved (already
  built).
- Editing an approved tree returns it to draft, with a warning before the first edit (Q21).

Tests:
- API: full cycle (submit → reviewer opens → requests changes → owner resolves and
  resubmits → reviewer approves); editing refused with 409 while `in_review`; a second
  reviewer can't claim a claimed token; expired and revoked tokens explained; only the
  owner submits.
- RTL + axe: submit dialog validation, the three banners, the reviewer screen's approve and
  request-changes paths, and the "returns to draft" warning.
- Playwright: the §12 journey end to end — submit for review, reviewer requests changes,
  owner resolves and resubmits, reviewer approves — across two browser contexts.

Done when: the M9 row in table E is demonstrated.

## M8 — Collaboration (done 2026-09-15)

Models already exist: `Access`, `Invitation`, `LinkRequest`, `ShareLink`. The API adds
modules `access/`, `invitations/`, `sharing/`, and `links/`. Each route checks the role
server-side and writes audit events.

- **Access (§5.6, Q22).**
  - Owner lists, adds (name, email, role), changes role inline, and revokes (with
    confirmation).
  - Adding a registered email creates an `invited` Access and emails the invitee, who
    accepts from the dashboard's actionable list.
  - Editors and viewers see who else has access but can't change it.
  - Rate limit on adding.
- **Share links (§5.6, Q24).**
  - Create with optional expiry, copy, and revoke.
  - Signed tokens; only the hash is stored.
  - `GET /api/share/:token/graph` returns the redacted graph via `graphForVisibility(…,
    'redacted')`. Names, relationships, and birth years only.
  - A public read-only route `/s/:token` shows the canvas and list without the app shell.
    Invalid, expired, and revoked links each get a plain explanation.
- **Invitations (§5.5).**
  - Invite a relative by email from their card.
  - Stages: `sent → joined` (invitee signs up or in through `/invite/:token`) →
    `tree_created` (already hooked in `POST /api/trees`) → `linked` (link request
    approved), each with a real timestamp. Resend (new token and email) and revoke.
  - A four-stage indicator in the person panel.
- **Linked trees (§5.5, Q23).**
  - The invitee requests to link their tree to their node in the inviting tree.
  - The owner approves or rejects on a Link requests screen. Approval sets
    `Person.linkedTreeId` through the server-managed path (ADR 012), advances the
    invitation, and grants the approver viewer access.
  - Linked people show "Open linked tree", with a breadcrumb back. When the link isn't
    available, explain why (§6.15).
- **Dashboard actionable list.** Pending access invites (accept or decline), link requests
  (review), and invitations waiting on others. Shown only when non-empty.

Tests:
- API: role checks for every endpoint. The share graph test asserts phone, email,
  address, notes, planning, full dates, and photos are absent. Invitation stages advance
  from real events (signup, tree creation, approval). A link request approval sets
  `linkedTreeId`. Expired and revoked tokens are refused.
- RTL + axe: access dialog (search, sort, inline role change, revoke confirm); share
  dialog (copy, expiry, revoke); invitation tracker; link requests screen.
- Playwright: dialogs at 768 px have no horizontal overflow and no clipped selects (§6.5);
  a share link in a signed-out browser shows only redacted fields; owner invites a member
  who accepts.

Done when: the M8 row in table E is demonstrated.

## M7 — Dashboard, tree management, list view (done 2026-09-14)

API (`GET /api/trees` already returns owned and shared trees with role and `peopleCount`):
- Add `lastEditedAt` (the latest audit event) to `TreeSummaryDto` so "last edited" means an
  edit, not a rename.
- Tree PATCH (rename, description) and type-to-confirm DELETE exist. Add tests for
  editor/viewer refusal where missing.

Web:
- `DashboardRoute`: tree cards (monogram, name, people count, status badge, "Edited
  2 hours ago", role badge when not owner, open link); skeleton while loading; error with
  retry; offline message; true empty state explaining what a tree is, with one "New family
  tree" action.
- The actionable list (invitations, link requests, change requests) appears only when
  those features land (M8, M9). No placeholder section.
- `NewTreeDialog`: name (required) and description, the shared Zod schema, then go to the
  new tree, where "Add the first person" waits.
- Tree header: the name is an edit button that opens an inline rename form on the first
  click (§6.3) with Enter/Escape, plus a "Tree settings" menu. Delete tree (owner only)
  uses a type-to-confirm dialog that states what is destroyed, then returns to the
  dashboard.
- List/outline view `/trees/:treeId/list`:
  - People grouped by generation (from `computeLayout` rows), then family unit ("Vikram
    Sharma & Nisha Sharma — children: …").
  - Each person row has the same actions as the canvas: open details (the same panel
    routes), add relative, edit, delete.
  - Canvas/List toggle in the header. Keyboard and screen-reader parity; the small-screen
    path.
- Pure `outlineTree(graph, layout)` in `features/tree/list/` with unit tests.

Tests:
- RTL + axe: dashboard lists owned and shared trees with role badges; empty state;
  create-tree flow; load error with retry; rename opens on the first click and saves
  undoably; delete requires the typed name; the list view groups the seed tree by
  generation and its actions navigate.
- Playwright: dashboard → create tree → add first person → list view → rename → delete
  tree with typed name; axe with contrast on dashboard and list view.

Done when: the M7 row in table E is demonstrated.

## M6 — People & relationships (done 2026-09-14)

Pure planners first (`packages/shared/src/relatives/`), each validated by running its ops
through `applyChangeSet` in tests:

- `planAddRelative.ts`: every §4.2 relation from any anchor. Resolution rules:
  - Reuse existing intermediates where the caller picks them (`via` options).
  - Otherwise create placeholders, following QUESTIONS Q12–Q14.
  - Return `{ ops, placeholders, summary }`, where `summary` is the one-sentence explanation,
    e.g. "Added Maya as Ravi’s cousin. To connect her we also added an unnamed parent for
    Ravi and an unnamed sibling for that parent — you can name them anytime."
  - `relativeChoices()` lists the existing intermediates the UI can offer ("Whose child is
    Maya?").
- `planDeletePerson.ts`:
  - The impact report names every affected relationship and descendant.
  - Three modes: remove (only when nothing is orphaned), replace with a placeholder, and
    delete with all descendants.
- `planMerge.ts`: field-by-field resolution; re-points unions, edges, and focus; drops
  duplicate links.
- `planRelationshipEdits.ts`: detach parent link, end or remove a partnership, re-parent to
  another union, change kind, update union type/status/dates.

Web:
- **Editing core.**
  - `editing/useGraphEditor.ts`: optimistic apply with the shared `applyChangeSet`, a
    sequential save queue, retry with backoff on network/5xx/offline, and rollback with a
    toast on 4xx.
  - `editing/saveStatusStore.ts` + `SaveIndicator`: "Saving…" / "Saved 2s ago" /
    "Couldn't save — retrying" / "Offline — changes will save when you reconnect", in a
    polite live region.
  - `editing/undoStore.ts`: per-tree undo/redo (≥ 100 steps) with ⌘Z / ⌘⇧Z and named toolbar
    buttons ("Undo: Added Maya").
- **Routes.**
  - `/trees/:t/add`: quick add of a detached or first person.
  - `/trees/:t/people/:p/add`: relation picker.
  - `/trees/:t/people/:p/add/:relation`: quick-add form with "add another" and "more
    details".
  - `/trees/:t/people/:p/edit`: full form (Identity, Contact with address free-text fallback
    and lazy Places, Relationships, Personal, Planning for owners only), with an
    unsaved-changes guard.
  - `/trees/:t/people/:p/relationships`: readable list with type/status/date/kind edits,
    re-parent, detach.
  - `/trees/:t/people/:p/merge/:other`: field conflict resolution.
  - `/trees/:t/compare?a=&b=`: both directions plus the path highlighted on the canvas.
- **Panel actions:** the four primitives as always-visible buttons, More relatives, Edit,
  Relationships, Set as focus, Compare, Merge, Hide/Show descendants, Delete.
- **Card context menu:** right-click, or the Menu key / Shift+F10.
- **Person delete:** dialog listing the impact, then an undo toast.
- **Person photo upload:** tree-scoped upload endpoints, applied as an undoable
  `person.update`.
- **Viewers:** no edit affordances rendered.

Tests:
- Planners: every relation from a topmost node, a married-in node, and a placeholder.
- UI: undo/redo store, save queue (retry, rollback, offline), quick add (Enter, add another),
  person form (empty submit focuses first invalid; edit copy says "Edit"), add-relative flow
  with placeholder summary and Undo, delete dialog, relationship editor, merge, compare; axe.
- Playwright: from the canvas alone, add a grandparent, great-grandparent, aunt, uncle,
  first and second cousin, niece, nephew, half-sibling, step-child, parent-in-law, and
  sibling-in-law. Then correct a wrong relationship, undo/redo, and refresh to confirm it
  persisted.

Done when: the M6 row in table E is demonstrated.

## M5 — Canvas (done 2026-09-13)

Routes (every state addressable):
- `/trees/:treeId`: canvas, nothing selected.
- `/trees/:treeId/people/:personId`: canvas with the docked person panel.
- Titles: "Ravi Sharma · Sharma family · Kinfolk".

Pure modules first, in `apps/web/src/canvas/`, each with tests:
- `viewport.ts`: zoom at a point (the cursor stays fixed), clamp to 25–200%, fit to content
  with padding (QUESTIONS Q34 fallback: 25% centred on focus), reveal a rect, visible world
  rect.
- `keyboardNav.ts`: ↑ parent, ↓ child, ←/→ neighbour in the same row; nearest by x; no-op at
  edges.
- `culling.ts`: cards intersecting the visible rect plus a margin, applied above 200 people.
- `roundedPath.ts`: an orthogonal polyline becomes an SVG path with rounded corners.

UI (`canvas/` and `features/tree/`):
- `treeQueries.ts`: the graph query.
- `TreeRoute`: loader, header with name, status badge, and role badge, and the canvas.
- `TreeCanvas`: pointer-drag pan, wheel pan, ctrl/⌘-wheel zoom at the cursor, fit on load,
  roving tabindex, keyboard shortcuts.
- `EdgeLayer`: SVG, dashed ended unions, styled non-biological edges.
- `PersonCard`: monogram or photo, name or placeholder label, lifespan, place,
  relationship-to-focus, focus marker, deceased styling, twin and gender marks, "+N hidden"
  expand chip.
- `CanvasToolbar`: zoom −/%/+, reset 100%, fit, branch-bracket toggle, legend.
- `Minimap`: above 25 people.
- `SearchBox`: `/` opens it; a combobox that selects and reveals.
- `BranchBrackets`: in-law branches, relative to focus.
- `PersonPanel`: read-only summary, set as focus, collapse/expand, close.
  Editing is M6.
- `Legend`.

Tests:
- RTL + axe: canvas with the seed tree; every card and control named; keyboard nav changes
  the URL; search selects; collapse hides; minimap appears; zoom % updates; Esc deselects.
- Playwright: seed tree opens fitted at 768, 1280, and 2560 px; hard refresh restores the
  selected person; no horizontal page scroll; axe clean.

Done when: the M5 row in table E is demonstrated.

## M4 — Kinship calculator (done 2026-09-13)

Pure module in `packages/shared/src/kinship/` (lint-enforced purity). Algorithm as in
section D above.

Files:
- `kinshipIndex.ts`: lineal ancestor maps with depth, the first-step parent, and the union
  each person was reached through.
- `labels.ts`: gendered and neutral word builders (ordinals, removal, great- prefixes,
  maternal/paternal).
- `resolveKinship.ts`: blood, then direct non-lineal edges, then partner, then step, then
  in-law, then fallback. Returns `{ label, category, path, steps }`.
- `resolveKinship.test.ts`: a small purpose-built family per §4.2 label, asserted in both
  directions. Includes removal and degree (second cousin twice removed), half, step,
  maternal/paternal, adoptive/foster/guardian, all in-laws, placeholder handling, the
  fallback, and "No known relationship".
- `seedKinship.test.ts`:
  - a curated table of Ravi → every person in the seed tree;
  - every ordered pair (60 × 59) resolves without throwing, to a non-empty label;
  - determinism;
  - performance (Ravi → all under 50 ms);
  - Compare paths are connected person-to-person and start and end at the right people.

Done when: the M4 row in table E is demonstrated.

## M3 — Layout engine (done 2026-09-13)

Pure module in `packages/shared/src/layout/`: no React, DOM, or network (lint-enforced).
Algorithm as in section C above.

Files:
- `types.ts`: options and output.
- `canonical.ts`: sorted input and collapse filtering.
- `generations.ts`: partner classes, longest path, anchoring pull-down, per-component
  normalisation.
- `groups.ts`: member order within a partner group.
- `forest.ts`: primary and secondary child slots, in-law root attachment.
- `blocks.ts`: contour packing; whole subtrees shift.
- `routing.ts`: lanes, orthogonal paths, and gap-jogging for long edges.
- `computeLayout.ts`: orchestration.
- `geometry.ts`: overlap and segment-through-card predicates. Shared by tests and by canvas
  culling.

Tests (`computeLayout.test.ts`): one `describe` per §4.5 case (1–19). Every case asserts:
- no card intersects another;
- no edge segment enters a card interior;
- identical output when the input arrays are shuffled.

Plus case-specific geometry:
- children centred under the union anchor;
- half-siblings adjacent;
- divorced union dashed;
- in-law root beside its union;
- components not overlapping;
- twins adjacent and marked;
- placeholders routed like anyone else;
- the 500-person case completes in under 300 ms and passes the same invariants.

The seed tree also passes all invariants.

Done when: the M3 row in table E is demonstrated.

## M2 — Data layer (done 2026-09-13)

Files:
- `apps/api/prisma/schema.prisma`: the models in section B above, plus `Tree.version`.
- `packages/shared/src/schemas/`: `dates.ts` (partial date), `person.ts` (input, full DTO,
  redacted DTO), `union.ts`, `parentChild.ts`, `tree.ts`, `changeSet.ts` (ops).
- `packages/shared/src/graph/`:
  - `types.ts`: `TreeGraph`.
  - `graphIndex.ts`: parents, children, partners lookups.
  - `applyChangeSet.ts`: pure apply plus invariants, with human-language errors. Invariants:
    cycles, union shape, one row per (child, kind), person delete requires its
    relationships removed first.
  - `invertChangeSet.ts`.
  - `displayName.ts`: names, and placeholder labels such as "Ravi's parent — unnamed".
- `packages/shared/src/fixtures/`:
  - `seedTree.ts`: ~60 people covering all 19 §4.5 structures. Case 19, the 500-person tree,
    comes from `largeTree.ts`.
  - `largeTree.ts`: deterministic 500-person, six-generation generator.
  - `fixtureBuilder.ts`: a small DSL so fixtures read like a family.
- `apps/api/src/lib/treeAccess.ts`: `resolveTreeRole` checks membership on every request;
  role → field visibility (full / no planning / redacted).
- `apps/api/src/modules/trees/`: list/create/get/rename/delete, and graph load with
  per-role redaction.
- `apps/api/src/modules/graph/`: `POST /api/trees/:id/changes`. Loads the graph → pure
  apply → one transaction → an AuditEvent per op → returns the inverse and new version.
  Hidden fields (planning) are restored on undo through an audit-event restore token, so
  they never reach an editor.
- `apps/api/prisma/seed.ts`: seed user plus the fixture tree.
- Account export and deletion summary now include trees.

Order: shared schemas → graph pure module + tests → fixtures + structure tests → migration →
API services + integration tests → seed script run against embedded Postgres.

Done when: the M2 row in table E is demonstrated.

## M1 — Foundation (done 2026-09-13)

Files: root scaffolding per SPEC §7.1 (`pnpm-workspace.yaml`, `.nvmrc`, `.editorconfig`,
`.env.example`, `docker-compose.yml`, `tsconfig.base.json`, `tsconfig.json` references,
`eslint.config.js`, `vitest.config.ts`, `playwright.config.ts`).
`packages/shared`: `schemas/auth.ts`, `schemas/account.ts`.
`apps/api`: `lib/env.ts` (+ test), `lib/crypto.ts` (scrypt, HMAC tokens), `lib/errors.ts`,
`lib/mailer/*`, `lib/storage/*`, `modules/auth/*` (service, routes, oauth providers),
`modules/account/*`, `app.ts` (build), `server.ts`, prisma auth tables, test harness with
embedded Postgres.
`apps/web`: tokens (`styles.css`), icon sprite, primitives (Button, IconButton, TextField,
FormErrorSummary, Dialog, ConfirmDialog, Toast, Skeleton, EmptyState, ErrorState,
StatusBadge), `lib/api.ts` (fetch with CSRF + one refresh-and-retry), router with auth
loader, routes: login, signup, forgot-password (3 steps), account, not-found, app shell.
Order: env + crypto units → auth service + integration tests → web primitives → routes.
Done when: the M1 acceptance row in table E is demonstrated.
