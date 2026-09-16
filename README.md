# Kinfolk

A family-tree builder for financial advisors, trustees, and estate planners, built for
**ATS Wealth Management**. A client maps their family — including the extended branches most
tools cannot express — fills in contact detail, and submits the tree to a professional for
review.

The family is a **graph, not a nested tree**: every child hangs off a `Union`, so remarriage,
half-siblings, step-families, and in-law branches fall out without special cases. Two pure
modules do the thinking — a layout engine that turns a graph into coordinates, and a kinship
calculator that turns two people into "First cousin once removed" — and both are framework-free
and unit-tested case by case.

## Running it

Needs Node 22 and pnpm. No Docker: the database is an embedded Postgres.

```bash
pnpm install
pnpm --filter api db:embedded     # starts Postgres on :5432, prints DATABASE_URL
pnpm db:migrate                   # create the schema
pnpm db:seed                      # the 60-person sample family and a 500-person tree
pnpm dev                          # api on :4000, web on :5173
```

`pnpm db:seed` prints the sign-in it creates. The API needs `DATABASE_URL` and a 32-character
`SESSION_SECRET` in the environment (see `.env.example`).

```bash
pnpm lint        # eslint + tsc
pnpm test        # vitest: shared, api (against a real Postgres), web (RTL + axe)
pnpm e2e         # playwright, one-process stack on :5180/:4180 — run it alone
```

## Layout

| Path | What lives there |
|---|---|
| `apps/web` | React 18, Vite, React Router data routes, TanStack Query, Tailwind |
| `apps/api` | Fastify 5, Prisma 6, Postgres. Also serves the built web app in production |
| `packages/shared` | Zod schemas and every pure module: layout, kinship, planners, GEDCOM, CSV, export |

Every edit is a **ChangeSet**: the client plans operations with a pure planner, applies them
optimistically, and posts them; the server locks the tree, applies the same pure function,
persists, writes one audit event per operation, and returns the exact inverse — which is what
makes undo work.

## The documents

Read these before changing anything structural.

| File | What it holds |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | The product specification. The source of truth |
| [docs/PROGRESS.md](docs/PROGRESS.md) | Milestone status, what is done, what is next |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Architecture decision records, 001 onwards |
| [docs/QUESTIONS.md](docs/QUESTIONS.md) | Where the spec is ambiguous or wrong, and what was built instead |
| [docs/DEFECTS-VERIFIED.md](docs/DEFECTS-VERIFIED.md) | Proof that each defect in SPEC §6 is absent, test by test |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Putting a preview on a URL for ATS to look at |
| [CLAUDE.md](CLAUDE.md) | Conventions, invariants, and the live state of the build |

## Status

Milestones 1–10 are built: authentication, the tree API, the layout engine, the kinship
calculator, the canvas, person and relationship editing, the dashboard and list view,
collaboration (access, share links, invitations, linked trees), the review workflow, key
events, GEDCOM and CSV import, and PNG/PDF/GEDCOM/CSV export. 24 of the 25 defects listed in
SPEC §6 are verified absent with named tests; the 25th needs a Google Places key.
