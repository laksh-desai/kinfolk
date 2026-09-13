---
description: Adversarial review of what was just built against the defect list
---

Review the current state of the app against `docs/SPEC.md` §6 and the definition of done
in §12. Be adversarial — assume the implementation is subtly wrong.

For each applicable item:

- Find the code that is supposed to prevent the defect. Quote it.
- Try to construct a case where it still happens (a route without an id, a form submit
  with every field empty, a dialog at 768px, a node in the topmost generation, a person
  with no birth date, a tree with two disconnected components).
- If you find a real gap, write a failing test first, then fix it.

Do not update `docs/DEFECTS-VERIFIED.md` to "done" for anything you could not actually
demonstrate. Report gaps you found and could not close.