# Kinfolk — Product Specification

Kinfolk is a production-quality web application built from scratch. Read this entire
document before writing any code.

This is a rebuild of an existing product that is badly broken. Section 6 lists that
product's actual, observed defects. Every one of them is a hard requirement to avoid, and
the definition of done in §12 requires you to verify each. Treat §6 as an
anti-specification.

This file is the source of truth. Do not edit it. If something here is ambiguous, wrong, or
conflicts with what is already built, stop and raise it rather than reinterpreting it.

---

## 1. What this product is

This is not a genealogy hobby app. It is a **client-intake and record-keeping tool for
financial advisors, trustees, and estate planners**. A professional invites a client; the
client maps out their family — including extended family, because that's who inherits, who
gets named as beneficiary, and who creates complexity — fills in contact and personal
detail for each relative, answers a short planning questionnaire, and submits the tree to
the professional for review. The professional approves it or sends it back with requested
changes.

Two consequences shape every decision:

1. **The data is sensitive and near-legal in weight.** Names, dates of birth, phone
   numbers, home addresses, marital status, planning objectives. Accuracy, auditability,
   and never silently losing an edit matter more than delight.
2. **The primary user is a non-technical adult, often 50+, on a laptop with a trackpad.**
   The interface must be legible, forgiving, obvious, and must never require discovering a
   hover-only control.

The product should feel warm — it's about families — but warmth comes from typography,
spacing, and copy, not from cartoon illustration or pink-and-blue cards.

---

## 2. Users and roles

| Role | Who | Can do |
|---|---|---|
| **Owner** | The client who created the tree | Everything: people, relationships, invites, sharing, submit for review, delete |
| **Editor** | A relative or assistant granted access | Add/edit people and relationships. Cannot delete the tree, manage access, or submit for review |
| **Viewer** | Granted read access | Read-only. Edit affordances are **absent**, not disabled |
| **Reviewer** | The advisor / trustee | Opens the tree via a review link. Read-only canvas plus Approve / Request changes |
| **Link visitor** | Anyone holding a share token | Read-only, redacted: names, relationships, birth years only. No phone, email, address, notes, or planning answers |

One account can own several trees and hold access to others'. Role is per-tree. Redaction
is enforced **server-side** — the API must not return fields the caller isn't entitled to,
regardless of what the client asks for.

---

## 3. Domain model

Model the family as a **graph, not a nested tree**. Nesting cannot represent remarriage,
half-siblings, adoption, or in-law branches, and that limitation is precisely why the
original product fails.

```
User          id, email, firstName, lastName, passwordHash, avatarUrl, createdAt

Tree          id, name, description, ownerId, thumbnailUrl, focusPersonId,
              status: draft | in_review | approved | changes_requested,
              createdAt, updatedAt

Person        id, treeId,
              firstName, lastName?, maidenName?, nickname?, suffix?,
              gender: male | female | other | unknown,
              lifeStatus: living | deceased | unknown,
              birthDate?        { year, month?, day?, approximate: bool },
              deathDate?        { year, month?, day?, approximate: bool },
              birthPlace?, maritalStatus?,
              email?, phone?,
              address?          { formatted, street, city, state, postalCode,
                                  country, lat, lng },
              photoUrl?, profession?, notes?,
              isPlaceholder: bool,          // an "unknown" connector person
              details?          { favoriteDestination, specialNeeds, hobbies,
                                  favoriteFood, favoriteMusic },
              socials?          { facebook, linkedin, instagram, youtube, tiktok },
              planning?         { overallObjective, areasOfConcern, marketOutlook,
                                  familyRelationships, rateOfReturnView },
              linkedTreeId?

Union         id, treeId, partnerAId, partnerBId?,     // B optional: single-parent unit
              type: marriage | partnership | unknown,
              status: current | divorced | separated | widowed | ended,
              startDate?, endDate?

ParentChild   id, treeId, childId, unionId,
              kind: biological | adopted | step | foster | guardian,
              // every child attaches to a Union, even a single-parent one.
              // this is what makes half-siblings and step-families representable.

Access        id, treeId, userId?, email, role: editor | viewer,
              status: invited | active | revoked, invitedAt, acceptedAt

Invitation    id, treeId, personId, email, token,
              stage: sent | joined | tree_created | linked,
              sentAt, expiresAt

LinkRequest   id, fromTreeId, toTreeId, personId, requestedBy,
              status: pending | approved | rejected, createdAt, resolvedAt

ChangeRequest id, treeId, authorId, body, status: open | resolved, createdAt

ShareLink     id, treeId, token, expiresAt?, revokedAt?, createdBy

AuditEvent    id, treeId, actorId, action, targetType, targetId, before, after, createdAt
```

**Invariants the model and API must enforce:**

- **Children always attach to a Union, never to a bare person.** A single known parent gets
  a Union with one partner. This single decision is what makes half-siblings, step-parents,
  and remarriage fall out naturally instead of requiring special cases.
- A person may be a partner in any number of Unions (serial remarriage), and may be a child
  in more than one ParentChild row only when kinds differ (e.g. biological parents plus an
  adoptive union) — surface that explicitly in the UI, never silently.
- A person may have zero parents (the graph is allowed to have many roots — in-law branches
  are separate roots that connect only through a Union).
- Cycles are forbidden: a person cannot be their own ancestor. Validate on every
  relationship write and return a clear, human error.
- Age is **derived**, never stored. Deceased people show a lifespan, not an age.
- Dates may be partial (year only, or month + year) and flagged approximate. Never require
  a full date.
- Deleting a person with descendants is blocked unless the user explicitly confirms a
  cascade that names every affected relationship. Never orphan a subtree.
- Every mutation writes an AuditEvent.

---

## 4. Relationship coverage — the central requirement

The product being replaced only lets you add a **child** or a **spouse**. That means you
can never add a parent, a sibling, a grandparent, an aunt, an uncle, a cousin, a niece, a
nephew, or any in-law. The tree cannot grow upward or sideways. This is the single biggest
failure and the main reason for the rebuild. Build the opposite.

### 4.1 Primitive operations — available on every person, always

From **any** person in the tree, in **any** generation, including the topmost generation,
including people who married in, including placeholders:

- **Add parent** (up to two; adding the second attaches to the same Union as the first)
- **Add partner / spouse** (marriage, partnership, or former — multiple allowed)
- **Add child** (to a selected Union, or create a single-parent Union)
- **Add sibling** (full, half, step, or adopted)

These four are never hidden, never conditional on generation or role, and never absent from
the topmost node. If the four primitives all work correctly from every node, extended family
becomes reachable by composition.

### 4.2 Derived relationships — must be directly offerable, not just composable

Composition is not enough on its own. A non-technical user should not have to reason "to add
my cousin I must first add my parent, then their sibling, then that person's child." Provide
an **Add relative** flow where the user picks the relationship **relative to the selected
person** from a plain-language list, and the app resolves it into the correct graph edges:

```
Parent · Mother · Father
Sibling · Brother · Sister · Half-sibling · Step-sibling
Partner · Spouse · Former spouse · Partner (unmarried)
Child · Son · Daughter · Step-child · Adopted child
Grandparent · Grandchild
Great-grandparent · Great-grandchild
Aunt / Uncle          (a sibling of a parent, or their partner)
Niece / Nephew        (a child of a sibling)
Cousin                (a child of an aunt or uncle)
Parent-in-law · Sibling-in-law · Child-in-law
```

**Resolution rules.** When a requested relationship needs intermediate people who don't
exist yet, the app creates them as **placeholder persons** and tells the user exactly what
it did, in one sentence, with an undo:

> Added Maya as Ravi's cousin. To connect her we also added an unnamed parent for Ravi and
> an unnamed sibling for that parent — you can name them anytime. **Undo**

Placeholders are first-class:
- Rendered with a dashed border and a muted label ("Ravi's parent — unnamed").
- Fully editable later; naming one simply clears `isPlaceholder`.
- Countable in a "needs detail" list so the user can finish them off in one pass.
- Never blocking: a tree with placeholders is valid and submittable, though the review
  screen should note how many remain.

If the user later adds the real person, offer a **merge** action rather than leaving a
duplicate.

### 4.3 In-law and married-in branches

When someone marries into the family, the user must be able to build out **their** side:
their parents, their siblings, their siblings' children. That side is a separate root
component of the graph, connected only through the Union.

- The layout engine must render multiple root families side by side without overlap.
- Provide a visual distinction between the focus person's blood line and married-in
  branches — a subtle one (tint band or a thin bracket above the branch), toggleable, never
  a hard color split.
- Allow a person to be added completely detached (no relationship yet) and connected later.
  Disconnected components must render, not disappear.

### 4.4 Relationship calculator

Every tree has a **focus person** (defaults to the tree's head; changeable at any time from
any card's menu).

- Each person's card and detail panel shows their relationship to the focus person in plain
  English: "First cousin once removed", "Maternal grandmother", "Half-brother",
  "Sister-in-law", "Step-son".
- A **Compare** tool lets the user pick any two people and get the relationship in both
  directions plus the connecting path, drawn on the canvas.
- Implement this as a pure, unit-tested module: shortest ancestral path → canonical kinship
  label, with correct handling of removal ("once removed"), degree ("second cousin"), half
  and step qualifiers, maternal/paternal sides, and in-law derivation. Fall back to
  "Related — 4 steps away" rather than guessing when no canonical term exists.

### 4.5 Structures that must render and behave correctly

Every one of these is a required test fixture and a required visual case:

1. A single person with no relationships.
2. A couple with no children.
3. A couple with children, correctly centered beneath them.
4. A single parent with children.
5. **Remarriage:** one person in two Unions, children in each, both unions rendered, the
   divorced one with a distinct (dashed) connector.
6. **Half-siblings:** children sharing exactly one parent, grouped under the correct union
   but adjacent to their half-siblings.
7. **Step-family:** a partner's children from a prior union, shown as step-children.
8. **Adoption and foster**, labeled distinctly from biological.
9. **Aunts and uncles** — siblings of a parent, plus their partners.
10. **First cousins** — children of those aunts and uncles.
11. **Second cousins and "once removed"** — four generations deep on a collateral line.
12. **Nieces and nephews** — children of siblings.
13. **Grandparents and great-grandparents**, added upward from the original root.
14. **Full in-law branch** — a spouse's parents and siblings as a separate root component.
15. **Twins / multiple births**, ordered sensibly and marked.
16. **Deceased members** across several generations.
17. **Placeholder-only connectors** — a cousin reachable only through two unnamed people.
18. **Disconnected components** — two families in one tree, not yet linked.
19. A 500-person tree spanning six generations, for performance.

### 4.6 Editing relationships, not just creating them

Users get relationships wrong. Make them fixable without deleting people:

- Re-parent a person (move to a different Union) via the detail panel or drag onto a
  couple's connector.
- Change a union's type or status (married → divorced) and its dates.
- Change a parent-child kind (biological → adopted).
- Detach a relationship without deleting either person.
- Merge two people the user entered twice, with a field-by-field conflict resolution step.
- Every one of these is undoable.

---

## 5. Feature inventory

### 5.1 Auth
Email + password, Google OAuth, forgot password → emailed OTP → verify → reset.
Sessions use **httpOnly, secure, SameSite cookies** with short-lived access plus refresh
tokens. No tokens in `localStorage`. Route guards resolve auth state before first paint —
no flash of the login screen for a signed-in user, none of app chrome for a signed-out one.

### 5.2 Dashboard (`/`)
Lists **every tree the user owns or can access** as cards: name, thumbnail or generated
monogram, member count, status badge, last-edited relative time, role badge when not owner.
Prominent "New family tree". Also surfaces pending invitations received, pending link
requests, and open change requests as an actionable list. A true empty state (zero trees)
explains what a tree is and offers one clear action.

### 5.3 Tree canvas (`/trees/:treeId`)

**Layout engine.** Deterministic, computed from the graph — never hand-placed. Generational
Sugiyama-style:
1. Assign generations (longest path from any root); all roots of disconnected components
   start at generation 0 unless a union anchors them to an existing generation.
2. Within a generation keep union partners adjacent, order sibling groups by birth date
   (unknown dates last, stable), order families by first appearance.
3. Center children beneath the midpoint of their union's connector.
4. Resolve overlaps by shifting whole subtrees, never individual nodes.
5. Route edges orthogonally with rounded corners; edges never cross a card.
6. Divorced/ended unions use a distinct connector style.
7. Output is a pure function of the graph — identical data always renders identically.

**Canvas behavior.**
- Infinite pan and zoom. Pan by drag or two-finger trackpad; zoom via ctrl/⌘+scroll and
  on-screen buttons; **zoom anchors to the cursor.**
- 25%–200% range with a visible percentage and "reset to 100%".
- **Fit-to-content on load and via a fit button.** Never opens clipped or off-screen.
- No fixed bordered stage that content overflows out of.
- Minimap once the tree exceeds ~25 people.
- Keyboard: arrows move selection along relationships, `+`/`-` zoom, `f` fit, `Esc`
  deselect, `/` search, `Enter` open detail, `⌘Z`/`⌘⇧Z` undo/redo.
- Virtualize nodes above ~200 people; stay smooth at 500+.

**Person card.** Photo or monogram, full name, birth–death years (not a bare age),
city/region, relationship-to-focus label. Deceased people are visually distinct.
Placeholders are dashed. The focus person is clearly marked with a legend.

**Interaction.** Selecting a card opens a **side panel docked to the canvas** — never a
full-page navigation that loses canvas position. Actions live in that panel and in a
right-click context menu, and are all keyboard reachable. Hover may preview an affordance;
it must never be the only way to reach one.

**Adding people.** Two modes:
- **Quick add** — name, gender, living/deceased, birth year. Four fields, Enter to submit,
  appears on canvas immediately. Support "add another" so a user can enter five siblings in
  a row without reopening anything.
- **Full details** — the complete form, expandable from quick add.

Because there is no AI assistant, manual entry speed is a first-class concern. Also provide
**GEDCOM import** and a **CSV import** with column mapping and a preview diff, so a user
migrating from another tool isn't retyping hundreds of people.

**Other canvas features.** Search that filters and zooms to a person; collapse/expand any
branch; a "needs detail" panel listing placeholders and missing birth dates; undo/redo with
at least 20 steps; autosave with an honest indicator ("Saved 2s ago" / "Saving…" /
"Couldn't save — retrying"); optimistic UI with rollback on failure. Exports: PNG, PDF, and
GEDCOM — all shipped working.

**Accessible parallel view.** A full list/outline view of the same tree, grouped by
generation and family unit, with the same add/edit actions. This is both the screen-reader
path and the small-screen path.

### 5.4 Person detail / edit
Grouped: **Identity** (name, gender, birth, death, life status, photo) · **Contact** (email,
phone, address with Places autocomplete and a free-text fallback) · **Relationships** (a
readable list — "Mother: Deval · Brother: Arjun · Wife: Priya (m. 2011)" — with links, type
editing, and detach) · **Personal** (profession, hobbies, favorites, special needs, socials)
· **Planning** (the five advisory questions — owner and reviewer only, never in a shared
view).

Only `firstName`, `lifeStatus`, and `gender` are required. Date of birth is encouraged, not
blocking. Validation is inline, per-field, on blur and on submit. A failed submit focuses
and scrolls to the first invalid field, shows the message beside it, and announces it to
screen readers. A submit click must never do nothing visible. Unsaved-changes guard on
navigate-away.

### 5.5 Invitations and linked trees
Invite a relative by email from their card. A real four-stage indicator with timestamps —
**Invite sent → Joined → Built their tree → Linked** — reflecting actual backend state, with
resend and revoke. An invitee who builds their own tree can request to link it to their node
in the inviting tree; the owner approves or rejects from a Link requests screen. Linked
people show an affordance that opens the connected tree with a breadcrumb back.

### 5.6 Access control and sharing
Per-tree access list: person, email, role, searchable, sortable, role changeable inline,
revocable with confirmation. Add by name + email + role. Share-link generation with
copy-to-clipboard, optional expiry, and revoke. Shared view redacted per §2.

### 5.7 Review workflow
Owner submits for review → status `in_review`, with a clear banner explaining what that
means and whether editing is still allowed (pick one behavior and be consistent).
Reviewer opens `/review/:token`: read-only canvas plus **Approve** and **Request changes**
(free text, required, minimum length). Change requests appear on the owner's dashboard and
as a tree banner with the note, author, and timestamp, plus "Mark resolved / Resubmit".
Status badge always visible: Draft · In review · Changes requested · Approved.

### 5.8 Key events
Derived birthdays and anniversaries (from union start dates) across all the user's trees.
Columns: person, date, event type, tree, days until. Sortable, searchable, filterable by
month. **It must actually populate from the data** — this screen is empty in the original
despite the data existing. Optional opt-in email reminders per tree.

### 5.9 Account
Profile with name, email, avatar upload, change password. Delete account behind
type-to-confirm, stating exactly what is destroyed, with a data export offered first.

---

## 6. Defects in the existing product — each is a hard requirement

I audited the product being replaced. These are real, observed failures. Fix every one.

1. **Route state lost on refresh.** The add/edit member screen is a bare route with no id;
   reloading renders an empty "Add Family Member" form and the user's work context is gone.
   → Every screen is addressable and fully restorable from its URL alone.
2. **Edit mislabeled as add.** Opening an existing person shows "Let's Add their details".
   → Copy always reflects the actual mode and subject.
3. **First click on the tree-name edit button does nothing.** It takes two clicks to open.
   → No dead first-interactions anywhere in the app.
4. **Key Events renders empty** despite members having birth dates, and declares table
   columns it never fills. → Ship it working.
5. **Dialogs overflow their own width.** Access-control and link-request dialogs have
   internal horizontal scrollbars, and their filter and role dropdowns are clipped off the
   right edge. → Dialogs are responsive, content-fitted, and never clip a control.
6. **Silent validation failure.** Submitting an empty required form produces no error, no
   focus change, no toast — nothing. → See §5.4.
7. **Buttons have no accessible names.** The accessibility tree is a list of unnamed
   `button` elements: add-spouse, add-child, node edit, node delete, and every zoom control.
   → Every control is labeled; the app is fully operable by keyboard and screen reader.
8. **Hover-only micro-icons.** Edit and delete are ~12px icons that appear on hover,
   overlapping the avatar. Unusable on touch, hostile on a trackpad. → See §5.3.
9. **Only two relationship directions exist.** Add child and add spouse. No parent, no
   sibling, no grandparent, no aunt, uncle, cousin, niece, nephew, or in-law. The tree can
   never grow upward or sideways. → §4 in full.
10. **Two clashing visual languages.** Some dialogs use a serif display face on cream,
    others the sans app style, with different button shapes in each. → One design system.
11. **A leftover test page ships in production** at `/new`, titled "Google Login Example".
    → No dead routes, no example pages in the build.
12. **Empty tree state is a blank bordered box** with no explanation and no way to add a
    first person. → Every empty state teaches and offers the next action.
13. **The dashboard never lists trees.** It always renders the same marketing hero; trees
    exist only in a collapsed sidebar rail. → §5.2.
14. **"Coming soon" dead menu items** (Location map, Export) ship in the production menu.
    → Don't ship stubs.
15. **A disabled button labeled only by its own failure** ("No linked tree members found")
    with no explanation of what the feature is. → Explain; don't just disable.
16. **The canvas is a fixed bordered stage** that content overflows; the tree title card
    pans under the top bar and clips; no fit-on-load.
17. **Cards show a bare integer age** with no dates and no indication of death.
18. **No undo, no save state, no optimistic UI.** The user never knows whether an edit
    landed.
19. **Auth token in `localStorage`**, and the API rejects it inconsistently when replayed.
    → Cookie sessions, consistent 401 handling, one refresh-and-retry.
20. **Icons shipped as base64 PNG Figma exports** embedded in the bundle — blurry at zoom,
    heavy. → Inline SVG sprite, crisp at every zoom level.
21. **Plain "Loading…" text everywhere**, including one list that can hang indefinitely on
    "Loading family tree link requests…". → Skeletons, timeouts, retry, real error states.
22. **Every route sets the same `<title>`** ("Family Tree"). → Per-route titles and meta.
23. **One ~1 MB unsplit bundle**, with Google Maps and Google Identity loaded on every route
    including logged-out ones. → Route-level code splitting; load third-party SDKs lazily at
    point of use.
24. **Weak destructive confirmation** — a one-click trash icon deletes a whole tree from the
    sidebar. → Type-to-confirm for tree and account deletion; undo toast for person deletion.
25. **No way to correct a wrong relationship** short of deleting people. → §4.6.

---

## 7. Technology

Use this stack unless you have a concrete reason to deviate, and state the reason if you do.

- **Frontend:** React 18 + TypeScript (strict), Vite, React Router v6 with data loaders,
  TanStack Query for server state, Zustand for canvas/UI state, Tailwind, and Radix
  primitives for dialogs, menus, popovers, and tooltips so accessibility is correct by
  construction.
- **Canvas:** hand-rolled — absolutely-positioned HTML cards over an SVG edge layer inside a
  single CSS-transform pan/zoom container. Do not reach for a generic node-editor library;
  family layout is too specific. The layout engine and the kinship calculator are **pure,
  framework-free, unit-tested TypeScript modules.**
- **Backend:** Node + TypeScript (Fastify or NestJS), PostgreSQL via Prisma, Zod schemas
  shared between client and server.
- **Files:** S3-compatible storage with presigned uploads, server-side image resize, strict
  MIME and size validation.
- **Testing:** Vitest for units (layout engine and kinship calculator especially), React
  Testing Library for components, Playwright for end-to-end flows.

Do **not** build an AI assistant, an LLM chat panel, or any natural-language tree
generation. It is explicitly out of scope. No AI provider SDKs, no API-key UI, no
"5 free messages" metering.

### 7.1 Repository layout and scaffolding

pnpm workspaces, Node 22. Create this structure in milestone 1.

```
kinfolk/
├── CLAUDE.md                  # conventions + live state (already exists)
├── docs/
│   ├── SPEC.md                # this file — do not edit
│   ├── PROGRESS.md            # milestone status
│   ├── DECISIONS.md           # ADR log
│   └── DEFECTS-VERIFIED.md    # §6 verification table
├── apps/
│   ├── web/                   # React + Vite client
│   │   ├── src/
│   │   │   ├── canvas/        # pan/zoom container, edge layer, cards
│   │   │   ├── features/      # dashboard, tree, person, access, review, events
│   │   │   ├── components/    # design-system primitives
│   │   │   ├── lib/
│   │   │   └── routes/
│   │   └── e2e/               # playwright specs
│   └── api/                   # Fastify or NestJS
│       ├── src/
│       │   ├── modules/       # auth, trees, people, relationships, access, review
│       │   └── lib/
│       └── prisma/
│           ├── schema.prisma
│           ├── migrations/
│           └── seed.ts        # the §4.5 fixture tree
├── packages/
│   └── shared/
│       └── src/
│           ├── schemas/       # Zod — imported by BOTH web and api
│           ├── layout/        # pure layout engine + tests
│           ├── kinship/       # pure relationship calculator + tests
│           └── types/
├── pnpm-workspace.yaml
├── package.json
├── .nvmrc
├── .editorconfig
├── .gitignore
└── .env.example
```

`packages/shared/layout` and `packages/shared/kinship` must not import React, the DOM, or
any network client. They are testable with `pnpm test:unit` alone and must stay that way.

**Root `package.json` scripts.** These exact names are referenced in `CLAUDE.md`; do not
rename them.

```json
{
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "build": "pnpm -r build",
    "test": "vitest run",
    "test:unit": "vitest run packages/shared",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "lint": "eslint . && tsc --noEmit -b",
    "format": "prettier --write .",
    "db:migrate": "pnpm --filter api exec prisma migrate dev",
    "db:seed": "pnpm --filter api exec tsx prisma/seed.ts",
    "db:reset": "pnpm --filter api exec prisma migrate reset --force"
  }
}
```

**`.nvmrc`**

```
22
```

**`.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false

[*.{yml,yaml}]
indent_size = 2
```

**`.gitignore`**

```
node_modules/
dist/
build/
.turbo/
coverage/
playwright-report/
test-results/
.env
.env.*
!.env.example
*.log
.DS_Store
.vscode/
.idea/
```

**`.env.example`** — every variable the app reads, with empty values and a one-line comment
each. Keep it in sync: adding a new env var without adding it here is a bug.

```bash
# --- Database ---
DATABASE_URL=                    # postgres://user:pass@localhost:5432/kinfolk

# --- API ---
API_PORT=4000
API_URL=http://localhost:4000
WEB_URL=http://localhost:5173    # used for CORS and for links in outbound email

# --- Sessions ---
SESSION_SECRET=                  # 32+ random bytes; rotate invalidates all sessions
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=30d

# --- Google OAuth ---
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# --- Google Places (address autocomplete; optional, app degrades to free text) ---
VITE_GOOGLE_PLACES_KEY=

# --- Object storage (photos, exports) ---
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

# --- Outbound email (invites, OTP, review notifications) ---
SMTP_URL=
MAIL_FROM=                       # "Kinfolk <no-reply@example.com>"

# --- Feature flags ---
ENABLE_EMAIL_REMINDERS=false
```

Rules for env handling: validate the whole environment with a Zod schema at API boot and
fail loudly with the missing variable names, never at first use. Only `VITE_`-prefixed
variables are readable by the client — no secret is ever exposed to the browser.

---

## 8. Design direction

- **Tone:** calm, editorial, archival — a well-set family record book, not a SaaS dashboard.
- **Type:** one humanist sans for UI (Inter or similar), at most one serif reserved for page
  titles. A real type scale, used consistently. Never a decorative serif inside dialogs
  while the rest of the app is sans.
- **Color:** warm neutral ground, one deep ink for text, one restrained accent for primary
  actions, semantic colors for status. Gender gets a small subtle marker — **do not color
  whole cards pink and blue**; it reads as a toy and fails for `other` and `unknown`.
- **Density:** generous. Minimum 16px body text, 44×44px touch targets, 4.5:1 contrast on
  all text including placeholders and disabled states.
- **Motion:** functional only. Animate layout transitions so the user can track what moved
  when the graph changes. Respect `prefers-reduced-motion`.
- **Dark mode:** proper support via CSS custom properties, canvas included.
- **Responsive:** full functionality down to 768px. Below that the canvas becomes a pannable
  read view with a toggle to the list/outline view, and editing happens in full-screen
  sheets. The page body never scrolls horizontally at any width.

---

## 9. Non-functional requirements

- **Accessibility: WCAG 2.1 AA, non-negotiable.** Every interactive element named and
  keyboard-reachable, visible focus rings, dialogs trap and restore focus, live regions
  announce save state and validation errors, and the list/outline view gives screen-reader
  users full parity with the canvas.
- **Performance:** initial route under 200 KB gzipped JS; 60fps canvas interaction at 500
  people; Lighthouse ≥ 95 on performance and accessibility.
- **Errors:** an error boundary per route; every network call has designed loading, empty,
  error, and success states; errors are actionable plain language, never a raw status code.
- **Security:** parameterized queries; authorization checked server-side on every request
  against tree membership (never trust a client-supplied role); rate limiting on auth and
  invite endpoints; CSRF protection; strict CSP; signed expiring share tokens; no PII in
  URLs or logs.

---

## 10. Build order

Ship each milestone working and tested before starting the next.

1. **Foundation** — repo structure and scaffolding files per §7.1, strict TypeScript,
   design tokens, component primitives, auth (email + Google), account, protected routing,
   per-route titles.
2. **Data layer** — schema, migrations, and a seed script producing a realistic ~60-person
   tree covering every structure in §4.5: remarriage, half-siblings, step-children,
   adoption, aunts/uncles, first and second cousins, once-removed, nieces/nephews, a full
   in-law branch, twins, deceased members, placeholders, and one disconnected component.
   This seed is the fixture for every layout and kinship test.
3. **Layout engine** — the pure module plus unit tests over all 19 cases in §4.5, asserting
   no overlaps, no edge-through-card, and deterministic output.
4. **Kinship calculator** — pure module plus unit tests for every label in §4.2 in both
   directions, including removal, degree, half/step, maternal/paternal, and in-laws.
5. **Canvas** — render, pan, zoom, fit, select, keyboard nav, minimap, search, collapse.
6. **People and relationships** — the four primitives, the derived Add-relative flow with
   placeholder creation, quick add, full detail panel, relationship editing, merge,
   undo/redo, autosave.
7. **Dashboard, tree management, empty states, list/outline view.**
8. **Collaboration** — invitations, access control, share links, linked trees.
9. **Review workflow** — submit, approve, request changes, status.
10. **Key events, GEDCOM/CSV import, PNG/PDF/GEDCOM export.**

---

## 11. Verification of §6

Before declaring done, walk the numbered list in §6 and demonstrate, item by item, that the
defect does not exist in this build — a test, a screenshot, or a one-line explanation of the
design decision that precludes it. Record it in `docs/DEFECTS-VERIFIED.md`. Do not skip
items or mark them "N/A" without justification.

---

## 12. Definition of done

- Every route survives a hard refresh and a directly pasted URL.
- All four relationship primitives work from **every** node, including the topmost
  generation, married-in people, and placeholders.
- A user can add, without leaving the canvas and without any workaround: a grandparent, a
  great-grandparent, an aunt, an uncle, a first cousin, a second cousin, a niece, a nephew,
  a half-sibling, a step-child, a parent-in-law, and a sibling-in-law.
- The kinship calculator returns the correct label for every pair in the seed tree.
- Every button has an accessible name; automated axe scans return zero violations; the app
  is fully usable with keyboard alone.
- Any invalid form submit produces a visible, focused, screen-reader-announced error.
- The tree opens fitted to content at every window width from 768px to 2560px.
- Every destructive action is confirmed or undoable, and every edit is undoable.
- Every network state — loading, empty, error, offline — has a designed UI.
- No route, menu item, or button ships labeled "coming soon"; no example or test page exists
  in the build; no AI assistant exists anywhere in the codebase.
- The 500-person seed tree pans and zooms at 60fps.
- `.env.example` lists every variable the app reads, and the API fails at boot with named
  missing variables rather than at first use.
- `docs/DEFECTS-VERIFIED.md` covers all 25 items in §6.
- Playwright covers: sign up → create tree → add three generations upward and downward →
  add an aunt, a cousin, and an in-law branch → correct a wrong relationship → invite a
  member → share a link → submit for review → reviewer requests changes → owner resolves
  and resubmits → reviewer approves.