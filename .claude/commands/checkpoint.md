---
description: Close out a milestone — update all four docs and report
---

Run the checkpoint protocol in CLAUDE.md, in full, for the milestone just completed.

Before writing anything:

1. Run `pnpm lint && pnpm test`. If either fails, stop and report — do not checkpoint a
   red build.
2. Run `git diff --stat` against the last checkpoint commit to see what actually changed.
   Base the updates on the diff, not on memory of what you intended to do.

Then update `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/DEFECTS-VERIFIED.md`, and the
three live sections of `CLAUDE.md`.

Rules:

- Only durable facts go in CLAUDE.md. A future session that has never seen this
  conversation should be able to pick up from it.
- Respect the line caps. If a section is over, condense the oldest entries into one
  summary line — do not just append.
- Do not restate anything already in `docs/SPEC.md`.
- If a decision was made between real alternatives and there is no ADR for it, write one
  now.

Finish with a three-line report: what changed in PROGRESS, what ADRs were added, which
defect items were ticked.