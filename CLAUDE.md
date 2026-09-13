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

- Nothing built yet. Repo is scaffolding + docs only.

## Gotchas
*(Cap: 20 lines. Non-obvious things that cost time. Each line: the trap, then the fix.)*

- _none yet_

## Deviations from SPEC.md
*(Cap: 15 lines. Anywhere the build knowingly differs from the spec, and why. If a
deviation is large, open an ADR and link it here instead of explaining it twice.)*

- _none yet_