# Progress

Milestones are defined in `docs/SPEC.md` §10. Update at every checkpoint.

## In progress

**M4 — Kinship calculator.** Plan below under "Milestone plans → M4".

## Up next

M5 Canvas ·
M6 People & relationships · M7 Dashboard & list view · M8 Collaboration ·
M9 Review workflow · M10 Events, import, export

## Done

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

## M4 — Kinship calculator (in progress)

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
