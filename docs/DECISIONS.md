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

## 012 — Server-managed person fields, restored on undo through audit-event tokens
Date: 2026-09-13
Status: accepted

**Context.** ADR 004 lets clients send person records. The M2 audit found two problems:
- Any editor could set `linkedTreeId` to an arbitrary tree, or `photoUrl` to any URL.
- The exact inverse of deleting a person must bring back fields the caller can't see (planning,
  for editors) or can't set (the tree link).

The alternatives were keeping undo state server-side (an undo stack table), or making the
inverse carry those fields. Carrying them leaks planning to editors and lets anyone forge
links.

**Decision.**
- `linkedTreeId` is server-managed. A client op may not set it; only link approval (M8) and
  restoration can.
- `photoUrl` must be null or a file under `/api/files/trees/<this tree>/people/<id>/`.
- Every inverse `person.create` produced by a delete carries `restoreToken`: the id of the
  `person.delete` AuditEvent. On replay, the server verifies the event belongs to this tree
  and person, then restores planning and `linkedTreeId` from its `before` snapshot.
- Editors receive the inverse without planning.

**Consequences.** Undo stays stateless on the server and uses the audit log it already writes.
Tokens are not secrets: they only restore what was deleted from the same tree, for someone
already allowed to edit it. If audit retention is ever shortened, undo of old deletes loses
those fields, which is acceptable for a 20-step undo history.

## 013 — Non-members get 404, not 403; one ordered list of roles per tree
Date: 2026-09-13
Status: accepted

**Context.** Tree ids appear in URLs. Answering 403 to a stranger confirms the tree exists.

**Decision.** `resolveTreeRole` checks, in order: owner, then active Access row, then
unrevoked ReviewAssignment. Anyone else gets 404 `tree_not_found` with the same wording as a
deleted tree. A member without the needed permission gets 403 with a plain explanation (e.g.
"Only the tree owner can rename it."). Rename and delete are owner-only; graph changes are
owner or editor; planning writes are owner-only.

**Consequences.** Every tree endpoint calls `requireTreeRole` first, and tests cover
stranger, viewer, editor, and owner on each.

## 014 — Layout: anchored generations, contour-packed family blocks, lane routing
Date: 2026-09-13
Status: accepted

**Context.** SPEC §5.3 prescribes a Sugiyama-style layered layout, but a textbook Sugiyama
(barycentre ordering plus Brandes–Köpf coordinates) doesn't guarantee families' actual
needs: children centred under a union, half-siblings adjacent, whole subtrees moving
together. A pure tidy-tree (Reingold–Tilford) can't express multiple parents per group. A
first render of the seed tree also showed that pure longest-path layering puts sisters on
different rows when one married into a deeper family.

**Decision.**
- **Rows.** Partner classes (union-find) share a row. Rows come from a BFS anchor per
  component, then push-down (child below every parent), then pull-down (parents directly
  above their highest child), then per-component normalisation. Cycle-forming class edges
  are dropped in a deterministic DFS.
- **Order within a group.** Hub first: the member with a parental link in the layout
  forest, otherwise the one with most unions. With one union the partner goes right; with
  several, the first union goes left and later ones right; further partners go adjacent on
  the outer side.
- **Forest.** DFS from root groups in canonical order. A child group's first parent slot
  is primary; any others are secondary links (in-law parents, adoptive + biological, cousin
  marriage).
- **Blocks.** Each group's primary subtree is packed bottom-up with per-row contours
  (sibling gap within a union, family gap between unions), and the parent row is centred
  on the union anchors. Roots are packed as they're placed. An in-law root goes on the side
  minimising its connector length. Different components are separated by bounding box
  plus a component gap.
- **Routing.** Axis-aligned polylines only. Union connectors run at card mid-height between
  adjacent partners, or through a lane below the row for non-adjacent ones. Child edges drop
  to a per-union bus lane, and long edges jog to the nearest card-free column in each row
  they cross. Lanes are interval-coloured per gap, and the gap height grows with lane count.

**Consequences.**
- Card overlap and edge-through-card are impossible by construction, and the tests check
  both on all 19 cases, the seed tree, the 500-person tree, and odd data.
- Secondary links (in-law parents) can produce long horizontal buses. They're on their own
  lanes, so they never cross cards, but can cross other families' lines.
- Very large trees are wide (QUESTIONS Q34).
- The layout never depends on the focus person, so changing focus doesn't move cards.

## 015 — Kinship: union-aware blood search, plain descriptions where English has no term
Date: 2026-09-13
Status: accepted

**Context.** SPEC §4.4 wants canonical labels with half/step/removal/side and in-laws, and a
"Related — N steps away" fallback "rather than guessing". Some pairs have a precise
description but no single word: a wife's sister's husband, a father's ex-wife from before
you were born. The alternatives were to force a canonical term (wrong, e.g. calling that
ex-wife a "step-mother"), to fall back to a step count (true but unhelpful), or to describe
the relationship.

**Decision.**
- **Blood.** Breadth-first search over lineal edges (biological, adopted) records both the
  people and the *unions* reached.
  - A common union at (a, b) is a full relationship.
  - A common person not explained by a common union at the same depths is half.
  - The lowest a + b wins; ties prefer full, then the smaller max(a, b).
  - The side comes from which of ego's parents the route runs through; it's omitted when
    both parents lead to the apex at equal depth.
- **Priority:** blood, then direct care edge (foster, guardian, explicit step), then partner,
  then derived step, then in-law, then distance.
- **Derived step.** Only through current or widowed unions. A parent's former partner is
  "Father’s former wife"; a former partner's child is "Former wife’s son".
- **In-laws.** Canonical terms for parent-, grandparent-, sibling-, child-, grandchild-,
  niece/nephew-in-law and "aunt/uncle by marriage". Otherwise one precise possessive chain
  for near relatives: "Wife’s niece", "First cousin’s husband", "Wife’s sister’s husband",
  "Wife’s former husband". Anything further is "Related — N steps away".
- The Compare path is the person chain along the chosen route.

**Consequences.** Labels never assert a relationship that isn't true. The seed test pins
Ravi → all 60 people by hand, and every ordered pair yields a non-empty label and a connected
path. The chain wording is English-only; localisation would need a grammar, not string
templates.

## 016 — Canvas: one transformed layer, roving tabindex, URL-held selection
Date: 2026-09-13
Status: accepted

**Context.** SPEC §5.3 needs pan/zoom anchored to the cursor, fit on load, keyboard operation,
virtualisation above ~200 people, and a docked panel that never loses canvas position.
- Rendering options: SVG-only (poor text and accessibility), canvas 2D (no DOM semantics),
  or HTML cards over an SVG edge layer (the spec's suggestion).
- Keyboard options: every card tabbable (500 tab stops), or a composite widget.

**Decision.**
- **Rendering.** Cards are real `<button>`s positioned inside one CSS-transformed layer; all
  connectors are one SVG beneath them.
- **Viewport.** Pure functions (`viewport.ts`) own zoom-at-point, fit, reveal, and clamping.
- **Keyboard.** Roving tabindex: the selected card, else the focus person, is the single tab
  stop. Arrows follow relationships (`keyboardNav.ts`).
- **Selection.** The selected person lives in the URL (`/trees/:treeId/people/:personId`);
  the panel is that child route, beside the canvas at md+ and full-screen below.
- **Virtualisation.** Above 200 people, only cards near the visible rect render. The rect is
  snapped to a 300 px grid so panning re-renders only at boundaries. The selected and focus
  cards always stay mounted.
- **Fit.** May go below 25% (to 5%), per QUESTIONS Q34.
- **View state.** Collapse state and the branch toggle live in Zustand (view state, not
  saved).
- **Married-in brackets.** Only branches in the focus person's own component; a separate,
  unlinked family is not "married in".

**Consequences.**
- Screen readers get a named button per person, with dates, place, and relationship as the
  description.
- Panning updates one `transform`; memoised cards must receive stable props. A per-render
  inline callback re-rendered every card and pushed p95 frame time from 33 to 50 ms at 500
  people.
- Measured in headless Chromium without a GPU: median frame 16.7 ms, p95 33.4 ms. 60 fps is
  met at the median, not at p95. A person with both editor access and a review
assignment is treated as an editor, since Access is checked first.

## 017 — Editing: optimistic change sets, one save queue per tree, undo from server inverses
Date: 2026-09-14
Status: accepted

**Context.** SPEC §5.3 and §6.18 need optimistic UI with rollback, an honest save
indicator, and undo/redo of at least 20 steps. ADR 004 already gives every change set an
exact inverse from the server.
- Options for applying edits: wait for the server (slow, not optimistic); patch the query
  cache by hand per edit type (a second implementation of the graph rules); or run the
  shared `applyChangeSet` on the cached graph.
- Options for undo: compute inverses on the client, or keep the server's.
- Options for concurrency: send in parallel, or strictly in order.

**Decision.**
- `editing/changeQueue.ts` `commitChange` applies ops to the cached graph with the shared
  `applyChangeSet`. A locally invalid change throws `ChangeRejectedError` synchronously, so
  forms show the message and nothing is sent.
- One sequential queue per tree. Network, timeout, and 5xx failures retry with backoff
  (1, 2, 4, 8, 15, 30 s); offline waits for `online`. A 4xx drops the rest of the queue,
  refetches the graph (`refetchQueries`, so it works with no screen observing), toasts, and
  announces.
- Undo/redo stacks (Zustand, per tree, capped at 100, in memory) hold the server's inverse
  ops. Undo and redo are ordinary change sets. The toast's Undo targets its own change by
  identity (`undoChange`), even if later edits exist.
- Pure planners in `packages/shared/src/relatives/` turn intent into ops: add relative,
  delete, merge, and relationship edits. UI screens never build ops by hand.

**Consequences.**
- The client and server enforce the same invariants with the same code. A server refusal
  can only come from state the client hadn't seen, such as another editor's change or the
  tree going into review.
- History is lost on refresh (QUESTIONS Q39). Undo becomes available only once a change
  has saved, because the inverse comes from the server.
- An undo that later edits made impossible shows a toast with the reason and is dropped
  from history.

## 018 — Person screens are panel routes; one canvas menu; deletion is a dialog
Date: 2026-09-14
Status: accepted

**Context.** SPEC §5.3 wants actions in a docked panel and a context menu, never a
full-page navigation that loses canvas position. §6.1 wants every screen restorable from
its URL.
- Options for add/edit/relationships/merge/compare: modal dialogs over the canvas, full
  pages, or sub-routes rendered in the docked panel.
- Options for the context menu: Radix ContextMenu on every card (one menu instance per
  card, and no keyboard trigger), or one controlled menu for the whole canvas.

**Decision.**
- Every person screen is a lazy child route of the tree route, rendered in `PanelShell`
  beside the canvas and full-screen below md. The routes are `add`, `compare`,
  `needs-detail`, `people/:id/{add,add/:relation,edit,relationships,merge,merge/:other}`.
  Each has its own title. Editing URLs opened without edit rights explain why
  (`ReadOnlyPanel`).
- One `CardMenu` per canvas: a controlled Radix dropdown anchored at the pointer, or at
  the card for the Menu key and Shift+F10. It focuses the first item and returns focus to
  the card unless the chosen action moves focus itself.
- Person deletion is a confirm dialog (state in a small Zustand store). It names every
  affected relationship and offers only non-orphaning modes, followed by an Undo toast.
  Destructive confirmations aren't bookmarkable.
- The four primitives are always-visible links in the panel and in the menu.

**Consequences.** The canvas never unmounts while editing, and back/forward walks panel
screens. Two menus can't be open at once. macOS keyboards have no Menu key, but every menu
action is also in the panel.

## 019 — Add relative: pre-answered connection questions, explicit "not in the tree yet", dry-run preview
Date: 2026-09-14
Status: accepted

**Context.** SPEC §4.2 asks for "pick the relationship and the app resolves it", with
placeholders and a one-sentence explanation. The planner can reuse existing intermediates
or create placeholders. The UI must decide what to ask.
- Options: always ask every question (slow); never ask and always pick the first candidate
  (silently wrong on remarriage or multiple aunts); or ask only where real choices exist,
  pre-answered.

**Decision.**
- `connectionSteps` lists only questions with existing candidates. `resolveConnection`
  fills unanswered ones with the first option and re-asks follow-ups when an earlier
  answer changes.
- Where a new connector is allowed, a "Someone not in the tree yet" option maps to the
  planner's `NEW_PERSON`. For a child, a "`<name>` on their own" option maps to
  `SOLO_UNION`.
- Before the user types, the screen dry-runs the planner with a blank person. It shows
  which unnamed people will be added, and switches to asking the parent kind when birth
  parents are full (Q12).
- "Add partner" asks spouse / partner / former spouse. Quick add inherits the anchor's
  last name for children, siblings, fathers, and grandchildren. An "add another" checkbox
  keeps the form open.

**Consequences.** Common cases are one field plus Enter. Unusual ones are visible radios,
not hidden defaults. The summary shown after adding is the same sentence the preview was
built from.

## 020 — Address entry: free text by default, Places only with a key and only on focus
Date: 2026-09-14
Status: accepted

**Context.** SPEC §5.4 wants Places autocomplete with a free-text fallback. §6.23 forbids
loading third-party SDKs except at point of use. The task brief makes free text the
default path, and no key exists here.
- Options: `@googlemaps/js-api-loader` at app start; a lazy script tag on first focus of
  the address field; or no Places at all.

**Decision.**
- `placesLoader.ts` injects the Maps JS script only when `VITE_GOOGLE_PLACES_KEY` is set,
  and only on first focus of the Address field. A chosen place fills the street, city,
  region, postal code, and country fields.
- The API widens its CSP (`maps.googleapis.com`, `maps.gstatic.com`, Google Fonts) only
  when the key is configured. Without it the CSP stays `script-src 'self'`
  (`securityHeaders.test.ts`).
- No typings package; a minimal local interface covers the one widget used.

**Consequences.** Without a key nothing third-party loads and every address field is
plain text; this is the tested path. The Places path is unverified here (QUESTIONS Q40).
The form doesn't carry `lat`/`lng`, so saving an address clears any stored coordinates.


## 021 — List view shares the tree's routes; the chosen view is in the URL and remembered
Date: 2026-09-14
Status: accepted

**Context.** SPEC §5.3 wants a list/outline view with the same add/edit actions. It is the
screen-reader and small-screen path. Every screen must restore from its URL (§6.1).
- Options:
  - A separate route tree under `/trees/:id/list/...`, duplicating every person route.
  - A view mode held only in UI state (lost on refresh).
  - A `?view=` parameter plus a remembered preference.

**Decision.**
- The tree route renders either the canvas or `TreeOutline` in the same slot. Every
  person screen (panel routes, dialogs) works identically over both.
- `?view=list|canvas` selects the view, and is saved as a display preference in
  `lib/preferences.ts`, the only storage module.
- Screens that drop the query string, such as a person's panel, keep the last chosen
  view. Without a saved choice, windows narrower than 640 px start in List.
- The outline is built from `computeLayout`'s rows by the pure `outlineTree`. Its
  generations and order match the canvas, and collapsed branches are left out of both.

**Consequences.** No duplicated routes. A pasted `?view=list` link opens the list, and a
refresh anywhere restores the last view on that device. The view isn't shared between
devices; it is a preference, not data.

## 022 — Page titles read the live query cache, not the loader snapshot
Date: 2026-09-14
Status: accepted

**Context.** Route titles were computed from loader data. Loader data is a snapshot, so
after an in-place rename or a person rename the title stayed stale until navigation. The
M7 rename test caught it.
- Options:
  - Revalidate the router after every edit (an extra fetch per change).
  - Set `document.title` imperatively from each screen.
  - Read titles from the query cache.

**Decision.**
- Title functions look up the tree in the TanStack Query cache by the loader's tree id,
  falling back to the loader snapshot.
- `DocumentTitle` re-reads titles when the query cache changes, via
  `useSyncExternalStore`.

**Consequences.** Titles follow optimistic edits immediately with no extra requests. Title
functions depend on the query client, a module singleton already used by loaders.


## 023 — Collaboration surfaces: dialog routes, a public share view over the same canvas
Date: 2026-09-15
Status: accepted

**Context.** SPEC §5.6 wants access control and share links per tree, and §6.5 records that
the old product's access and link-request dialogs scrolled sideways and clipped their own
controls. §5.3's canvas and list should not be rebuilt for share-link visitors.

**Decision.**
- Access, sharing, and link requests are **dialogs rendered by routes**
  (`/trees/:id/access`, `/trees/:id/link-requests`), so they are addressable and
  restorable, and the canvas stays behind them. Dialog width is capped, content wraps, and
  an e2e check asserts nothing inside scrolls sideways or sits outside the window at
  768 px.
- The public share view (`/s/:token`) reuses `TreeCanvas` and `TreeOutline`. The redacted
  graph is widened to the canvas's shape by the pure `toViewGraph`, which only fills absent
  fields with nulls — it cannot add back anything the server withheld.
- `TreeOutline` took `personHref` and `editTreeId` instead of a tree object, so the same
  list serves the app, viewers, and share links.
- Share link tokens are shown **once**, at creation: only the hash is stored (Q24), so the
  screen says to copy it now and offers a Copy button with a keyboard fallback.
- Selection and view mode in the share view live in the query string, like everywhere else.

**Consequences.** One canvas, one list, one dialog primitive across every audience. A lost
share link can't be recovered, only replaced — the trade for never storing a usable token.

## 024 — Email addresses in the access list are for the owner and for yourself
Date: 2026-09-15
Status: accepted

**Context.** SPEC §5.6 describes the access list as "person, email, role", which is the
owner's management screen. Editors and viewers also open it to see who else is on a tree.
Sending every collaborator's address to every member would spread personal data further
than the feature needs, and §9 asks for server-side redaction by entitlement.

**Decision.** `GET /api/trees/:id/access` returns `email: null` for everyone except the
caller, unless the caller is the owner (who manages access and therefore needs addresses).
Names and roles are visible to all members. The rule is enforced in the API, and the list
falls back to the name, or "Someone with access", when there is no address to show.

**Consequences.** Members can still see who has access and their roles. Screens that need
an address — inviting, changing a role, revoking — are owner-only anyway. Tested in
`collaboration.test.ts` › "keeps other people's email addresses from members who don't
manage access".


## 025 — Review: one claimable link, a hard lock, and the same assignment through resubmission
Date: 2026-09-15
Status: accepted

**Context.** SPEC §5.7 wants the owner to submit for review, the reviewer to work from
`/review/:token`, and change requests to flow back. §5.7 says to pick one behaviour for
editing during review and be consistent (QUESTIONS Q21 chose: locked).

**Decision.**
- **Claim on first open.** A review link is a bearer token, but the first signed-in person
  to open it is recorded as the reviewer; anyone else gets a plain refusal and is told to
  ask for their own link. A decision needs an author, so signing in is required (Q1).
- **One open assignment per tree.** Submitting while a review is open is refused; sending
  to someone else means withdrawing first. Withdrawing revokes the token and returns the
  tree to draft.
- **Resubmitting reuses the same assignment**, clearing its decision, so the reviewer's
  link keeps working and the history stays on one row. Change requests are separate rows
  with their own author, time, and resolved state.
- **The lock lives in one place.** `commitChangeSet` already refuses writes while
  `in_review` (409), and `canEditTree` hides edit affordances. The banner explains the
  pause rather than showing disabled controls.
- **Reviewers read through their own endpoint.** `GET /api/review/:token` returns the full
  graph with planning answers; claiming also grants the `reviewer` role on the tree itself,
  which is read-only everywhere else.

**Consequences.** A forwarded review link is useless to a second person, which is the point.
The owner can always withdraw, so nobody is stuck waiting on a reviewer who never opens it.
An approved tree returns to draft on the next edit (Q21), and the banner says so before the
first edit.

## 026 — Removing the only parent leaves their children as roots, named first
Date: 2026-09-16
Status: accepted

**Context.** §3 says "Deleting a person with descendants is blocked unless the user
explicitly confirms a cascade that names every affected relationship. Never orphan a
subtree." The same section also says "A person may have zero parents (the graph is allowed
to have many roots)". The build read the first sentence strictly: `deletionImpact` withheld
the `remove` mode whenever a child's only parent was going, so the person at the top of a
tree could not be removed at all without deleting every descendant. A user hit this
immediately: a grandfather entered by mistake could not be taken out without losing the
family below him (QUESTIONS Q44).

**Decision.** `remove` is always offered. A child whose last parent is removed becomes a
root of their own — a state §3 explicitly allows — and the union that held them is removed
along with its child links, since a family with no partners left cannot exist. `wouldOrphan`
stays in `DeletionImpact`, now as the warning the dialog shows before confirming: "Maya
Sharma and Leo Okonkwo will have no parent in the tree, at the top of a line of their own…
To keep the connection instead, replace Suresh Sharma with a placeholder."

**Consequences.** "Never orphan a subtree" is honoured as "never silently": nothing is
deleted that the user was not shown by name, and the placeholder mode still keeps a line
intact for anyone who wants that. Undo restores the parent, the union, and every child link
in one step. The alternative — keeping the refusal — leaves no way to correct the top of a
tree, which is the one place the product being replaced is already weakest (§6.1).

## 027 — A new partner joins the one-parent family rather than starting a second one
Date: 2026-09-16
Status: accepted

**Context.** `attachParent` has always joined an existing one-parent family when a second
parent is added, so a child entered under a father gains a mother in the same family. The
partner relations did the opposite: they always created a new union. Someone who entered a
parent, then that parent's children, then the parent's spouse, got a second family and saw
the spouse labelled "Step-mother" of children who are hers — the second bug reported from
the running app.

**Decision.** Adding a partner joins the anchor's one-parent family (the union where they
are the only partner) by default, becoming the second parent of the children already there.
`connectionSteps` asks when it matters — "Is this person also a parent of Maya Sharma and
Leo Okonkwo?", answered *Yes — their other parent* (default) or *No — a separate family*
(`NEW_UNION`) — and the plan summary says what happened: "She is also recorded as a parent
of Maya and Leo." The same rule runs for a child-in-law and for a sibling's partner, which
are the same situation one hop away.

**Consequences.** The common case (a couple entered one at a time) now needs no correction,
and the uncommon case (a remarriage entered after the children) is one radio away. A wrong
guess is fixable under Relationships without deleting anyone. The kinship calculator was
right all along — it was being fed a step-parent — so nothing in §4.2 changed.

## 028 — No planning questionnaire: Kinfolk builds family trees only
Date: 2026-09-16
Status: accepted

**Context.** SPEC §3, §5.4 and §5.7 carry five advisory questions per person (objective,
concerns, market outlook, family relationships, rate of return), owner-and-reviewer only,
with their own redaction path. The product owner removed them from scope: "This app is
purely to create family trees, nothing else" (QUESTIONS Q45).

**Decision.** The whole seam goes rather than being hidden: `planningSchema` and the
`planning` field, the form section, `canSeePlanning`, the owner-only write check, the
`standard` visibility level (which existed only to drop planning), the reviewer's planning
block, and the `Person.planning` column (migration `20260916104500_drop_person_planning`).
Share-link redaction is untouched — it was always an allow-list, not a planning filter.

**Consequences.** Tree access is one decision now, not two: a member sees the tree, a share
link sees the redacted allow-list. `graphForVisibility` has two modes instead of three. The
spec is not edited, so §3, §5.4 and §5.7 describe a feature the build no longer has;
QUESTIONS Q45 records the deviation and recommends the spec be amended. Restoring it would
need a new column and a new form section — no data is kept.

## 029 — The layout is ordered by the family, not by the order it was entered
Date: 2026-09-16
Status: accepted

**Context.** `computeLayout` sorted its input by `createdAt` and then broke every tie with
that order: which partner-class is numbered first (and so where `assignGenerations` starts
its anchoring walk), which group is the "hub" of a partner row, which forest root is placed
first, and how a person's unions are ordered. Re-stamping the same 60-person tree in a
different entry order moved every row and changed the drawing's width by 6% — the same
family drawn differently depending on when each person happened to be typed in.

**Decision.** Structural choices break ties with `comparePeople`: birth date (oldest first,
undated last), then name, then id — no `createdAt` anywhere. That covers class numbering for
`assignGenerations`, the hub of each partner row, union order, the order the forest is
walked (which decides the family each subtree hangs under), and the order roots are packed
into the drawing (the focus person's line first, then by eldest member). The output arrays
are sorted into reading order, so exports are byte-identical too. Sibling order keeps entry
order as its *last* resort, after birth date: for people with no dates it is the only thing
the user has told us, and it is local to one family row.

**Consequences.** A tree built bottom-up, sideways, or by import draws exactly like the same
tree typed top-down; `computeLayout.test.ts` asserts that for a dated family and for the
seed tree. Layouts from before this change can shift once — a one-off, in the direction of
elder lines to the left. Undated siblings still follow entry order, which is the one place
two identical families can still differ.

## 030 — Planners that build ops directly validate them before returning
Date: 2026-09-16
Status: accepted

**Context.** Planners built on `PlanState` run every op through `applyChangeSet` as they go,
so an impossible request fails while it is being planned. `planMerge` and `planReparent`
build op arrays directly and did not, so merging a parent with their own child, or moving a
child under their own descendant, returned a plan that only failed when it was saved. The
merge screen previewed the merge happily and refused on the button press; the "move to
different parents" menu listed families that could never accept the child.

**Decision.** Both run their ops through `applyChangeSet` before returning, so they throw
where the choice is made, with the message the server would have given. `planMerge` also
refuses a parent/child pair up front with a plainer sentence than the cycle check gives
("Ravi Sharma descends from Vikram Sharma, so they can't be the same person"), because that
merge would otherwise silently drop the link between them rather than cycle. A new
`reparentTargets` lists the families a child can actually move into, and the Relationships
screen offers only those.

**Consequences.** Planning costs one extra graph application, cheap next to the round trip
it replaces. Impossible options are no longer offered, and anything that slips through (a
stale graph, a concurrent edit) still fails safely at the server.

## 031 — Quick add takes a whole date of birth
Date: 2026-09-16
Status: accepted

**Context.** Quick add asked only for a birth year, on the reasoning that §5.3 wants entry
to be fast and a year is enough to sort siblings and derive an age band. In use that reads
as a limitation: someone who knows the full date has to add the person, reopen them, and
type the day and month into the full form.

**Decision.** Quick add takes day, month and year in one row, sharing `DateFields` with the
full form, and the year alone is still enough to submit — the other two are optional and
labelled as such. `quickAddSchema` reuses the same date parsing as the person form, so a
partial date (year only, or month and year) stays valid and `approximate` stays available in
the full form only.

**Consequences.** One more tab stop on the fastest path, and no round trip for anyone who
knows the date. Sibling order improves as a side effect: full dates sort exactly where year
alone could only approximate (ADR 029).

## 032 — Cards show a living person's age; the deceased keep their lifespan
Date: 2026-09-16
Status: accepted

**Context.** §5 says a person card shows "birth–death years (not a bare age)", and §6.17 lists
"cards show a bare integer age with no dates and no indication of death" as one of the defects
being replaced. The build followed that: every card read "b. 1988". The product owner asked for
the opposite — "instead of displaying birth year on each member's card, display their current
age" (QUESTIONS Q47).

**Decision.** A card shows the current age for the living, and the lifespan for anyone who has
died. `cardLabel(person, today)` is `ageLabel(person, today) ?? lifespanLabel(person)`, so:
- living with a date of birth → "Age 38", or "Age about 37" when only the year or an
  approximate date is known;
- deceased → "1935–2005", "1935–?", "d. 2001", or "Deceased" — they have no current age, and
  §3 is explicit that the deceased show a lifespan;
- nobody with a date of birth in the future or no date at all gets a made-up number.

The three things §6.17 is actually about are kept: the age is labelled rather than a bare
integer, death is still stated on the card (and in the card's description for screen readers,
with a distinct background and a grey photo), and the full dates are one click away in the
panel, which shows "Born April 12, 1988" beside "Living · Age 38". The canvas and the list view
use the same label, so the two views of one tree never disagree. The merge picker still lists
dates, because dates are what tell two people of the same name apart.

Today is passed into the card rather than read inside it: every card then agrees on the date,
tests are deterministic, and a fresh `Date` per render would defeat `PersonCard`'s memoisation
and re-render every card on every pan.

**Consequences.** A tree open across midnight on someone's birthday shows a stale age until the
page is reloaded — acceptable, and the alternative (a timer per card) is not worth it. The
deviation from §5 and §6.17 is recorded in QUESTIONS Q47 and `DEFECTS-VERIFIED` row 17, which
drops from verified to partly verified: the "no dates, no death indicator" halves still hold,
but cards now show an age by explicit product decision.

## 033 — Kinfolk is ATS-branded: navy palette, dark by default, and a signed export
Date: 2026-09-16
Status: accepted

**Context.** Kinfolk is built for ATS Wealth Management, who supplied two logo files: the tree
alone (transparent) and the full lockup on white. The brief: put the logo in the product without
overdoing it, a professional dark theme, blue and pink for men and women, and exports that carry
the tree behind the family, the lockup in the corner, the date, and "CONFIDENTIAL".

**Decision.**
- **Two assets, one colourway.** `apps/web/scripts/buildBrandAssets.mjs` trims the supplied art,
  keys the white background out into an alpha mask, and writes `ats-mark.png` (512px) and
  `ats-lockup.png` (900px) in the brand navy — 75 KB each, from 1.7 MB of source. The originals
  live in `apps/web/brand-source/`, outside anything the server hands out.
- **Painted through a CSS mask.** The app draws both through `mask-image` over
  `--kf-brand-ink`, so one file is the brand navy in daylight and a pale ink at night, with no
  second download and no JavaScript. Exports use the same PNGs directly, where navy on white
  paper is right.
- **Where the logo appears.** The tree with "Kinfolk / by ATS Wealth Management" in the header of
  every signed-in screen; the full lockup at the foot of the screens outsiders see (sign-in, an
  invitation, a shared tree); and the export. Nowhere else — a logo on every panel is a brochure,
  not a tool.
- **Palette.** One navy system replaces the warm paper and teal: `#102a5e` accent on a cool paper
  ground in light, a `#0b1220` ground with a `#8fb5ee` accent in dark. Dark is now the default
  (`DEFAULT_THEME`); light and "match this device" stay in Account → Appearance. All 70
  contrast pairs still pass in both themes, including the two new gender colours.
- **Gender colour, as an accent.** `--kf-male` / `--kf-female` tint the monogram circle and the
  gender glyph on a card, and a slim bar down the side of each card in an export. Not the whole
  card: across sixty cards a wash of colour is noise, and colour is never the only signal — the
  card's description says "male" or "female" in words either way.
- **The export is a document.** The tree mark sits centred behind the family at 7% opacity; the
  foot carries the export date on the left, CONFIDENTIAL centred in navy small caps, and the
  lockup on the right. Titles and footer scale with the drawing (a family tree exports many
  thousands of pixels wide, where 13px type is invisible), and the artwork travels as a data URI
  because the SVG is rasterised in an isolated image that cannot fetch files.

**Consequences.** Re-running the asset script is the only step if ATS sends new artwork; nothing
else knows the shape of the logo. An export with no artwork still renders (the branding is
skipped, not fatal). The mask means the logo is always one flat colour — correct for this mark,
but a future multi-colour logo would need real `<img>` elements and a second file.

## 034 — Public records: one PDF per person, stored with the tree
Date: 2026-09-16
Status: accepted

**Context.** ATS pulls a person's history from a government public-records site by hand and wants
it attached to that person for easy viewing. The spec has no document model: §3 gives a Person a
photo and nothing else.

**Decision.** One nullable `Person.publicRecordUrl`, filled by an upload that mirrors photos
exactly: ask for an upload target, send the bytes, then attach the returned URL through an
ordinary ChangeSet, so it is audited, undoable, and refused for viewers like any other edit.
- **PDF only, decided by the bytes.** The declared type and the filename are both ignored; the
  server checks the file starts with `%PDF-`. Up to 25 MB — records run to many scanned pages.
- **Stored under the tree.** `trees/{treeId}/people/{personId}/records/{uuid}.pdf`, behind the
  same authorizer as photos, so only members of that tree can open it and a share-link visitor
  never sees the field at all (the redacted view is an allow-list).
- **`publicRecordUrl` is server-managed.** `assertClientSettableFields` refuses any value that
  does not match this tree's record prefix, so a person can never be pointed at another family's
  file or off the site.
- **Opened in a new tab, not downloaded.** The file route sends `content-disposition: inline`
  with `x-content-type-options: nosniff`, so a PDF opens in the browser's viewer and nothing
  else is ever rendered as a page. The link is in the person panel (one click from a card) and
  in the edit form beside the photo.

**Consequences.** One document per person. A second (a will, a deed) would need a table rather
than a column, and this column would become its first row. The file is not in exports or GEDCOM:
an export is a picture of the tree, and a records PDF is not a genealogical fact.

## 035 — The client household is marked on the canvas
Date: 2026-09-16
Status: accepted

**Context.** A tree is built for one household — the ATS client and their spouse. The canvas
already marked the focus person (the person relationships are computed from, which is the first
person added and changeable from the card menu or the panel). Nothing showed the couple.

**Decision.** `useTreeView.clientHousehold` is the focus person plus anyone they are *currently*
partnered with; a former spouse is not in it. Both cards get an accent border and a soft ring,
the focus person keeps the "Focus" badge, and their partner gets a "Client" badge. The marking is
in the card's accessible name too (", client"), because a badge and a colour are not enough on
their own. The legend explains it.

**Consequences.** Changing the focus person moves the marking, which is what "this is the couple
the tree is for" means. A household with two current partners recorded would mark all of them —
correct for the data, and rare enough to leave alone. Nothing about the graph changed: this is a
reading of it.

## 036 — A preview deployment is an explicit mode, and it has no development sign-in
Date: 2026-09-16
Status: accepted
Supersedes part of ADR 007

**Context.** ATS need to look at the work in progress on a URL rather than over a laptop. ADR 007
put each external service behind a seam with two real implementations and made production
"refuse to boot without Google, S3, and SMTP settings, so a dev adapter can never ship silently".
That rule is right and it is also exactly what stops a preview: there is no Google project, no
mail provider, and the whole point is that it costs nothing. Lying about `NODE_ENV` is not an
option either — it is what turns on `Secure` cookies.

**Decision.** A preview is a first-class, named state rather than a fudge.
- **`ALLOW_DEV_ADAPTERS=true`** lets `NODE_ENV=production` boot without Google, S3 and SMTP.
  Nothing else relaxes: cookies stay `Secure`, CSRF still checks the Origin against `WEB_URL`,
  helmet is unchanged. The boot log names every service being stood in for and says not to put
  real client data in it; the refusal message points at the flag, so the strict path is still
  what a missing variable tells you about.
- **Google sign-in is off, not stood in for.** `DevOAuthProvider` mints a session for whatever
  address is typed into its consent form: correct on a laptop, an open door on a public URL. Off
  a developer's machine the fallback is now `DisabledOAuthProvider` — `/api/auth/providers`
  reports `off`, the OAuth routes are never registered (404), and the web app drops the button.
  Password sign-in carries the preview.
- **`SIGNUP_ALLOWLIST`** (addresses and `@domains`) decides who may register. Empty means anyone,
  which is right for the product and wrong for a URL that has been sent to a client.
- **`PORT`** is accepted as the platform's name for `API_PORT`, `/api/health` answers a health
  check by asking the database a question, and `tsx` moved to dependencies because `pnpm start`
  runs the server through it and a production install has no dev dependencies.
- **`render.yaml`** describes the whole thing — service, database, build, health check — so the
  deployment is reviewable in the repository rather than remembered from a dashboard.

**Consequences.** The honest part of ADR 007 survives: a stand-in can still never ship *silently*.
What changed is that it can now ship *deliberately*, saying so at boot, in one named mode that a
reader can grep for. A preview cannot deliver email, so anything that depends on a link arriving
by email has to be copied out of the UI; `docs/DEPLOY.md` says which flows those are. Real
production means dropping the flag and setting the services, which the boot error then walks you
through.

## 037 — Public records sit behind a shared passphrase, checked by the server
Date: 2026-09-18
Status: accepted

**Context.** ATS asked for the public-records PDF to be password protected: the passphrase is
typed before a record is uploaded or opened. Records already needed membership of the tree
(ADR 034); this adds a second thing you must know, so that a laptop left signed in does not
also expose a person's history.

**Decision.** The gate is on the server, because a gate the browser enforces is not one — the
PDF has a URL, and any signed-in member could fetch it directly.
- `RECORDS_PASSPHRASE` configures it. **Unset means no gate**, which is what a developer's
  machine and the test suite want; setting it turns the prompt on everywhere at once. The
  passphrase is never a literal in this repository — it would be published with the code.
- `POST /api/records/unlock` compares it in constant time and mints a signed, httpOnly cookie
  good for thirty minutes. The passphrase itself never comes back to the client and is not
  stored anywhere.
- Both upload routes call `requireRecordsUnlock`, and `treeFileAuthorizer` refuses any key
  containing `/records/` without the cookie. Photos are untouched.
- A wrong passphrase is **403, not 401**: a 401 sends the web client through refresh-and-retry
  and then bounces it to the sign-in screen, which would log someone out for a typo.
- The UI asks in a dialog and then does what was asked — opening the PDF from inside the submit
  handler, so the browser still counts it as the same click and allows the new tab.

**Consequences.** One passphrase for everyone who works on a tree: it says *that someone knew
it*, never *who*. The audit trail still names the person who attached or removed a record,
because that is an ordinary tree change, but opening one is not attributable beyond the signed-in
account. If ATS ever needs "who read this record, and when", this becomes per-user re-authentication
rather than a shared secret, and the unlock endpoint is where that would go. Rotating the
passphrase is an environment variable change and a restart; every open session keeps working for
up to thirty minutes afterwards.

## 038 — Production runs without Google sign-in

**Context.** ADR 036 made every real service mandatory once `ALLOW_DEV_ADAPTERS` is off, Google
included. ATS wants client onboarding to start with password sign-in only, and the preview flag
cannot be kept just to skip Google, because it also lets uploads live on disk and email go
undelivered.

**Decision.** `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are optional in production. Storage (S3)
and email (SMTP, `MAIL_FROM`) stay required. Setting one Google variable still requires the other.
Without them the server already uses `DisabledOAuthProvider`: no button, and the endpoints 404.

**Consequences.** A production boot no longer lists Google as a stand-in, because it is off, not
faked. Adding Google later is two environment variables and a restart.
