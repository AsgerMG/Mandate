# Archive — superseded plans and one-shot probes

Nothing here is current. These are plans and investigations that were real
work at the time and that the strategy has since moved past. They are kept,
not deleted, for one reason: **a plan that was tried and abandoned is the
cheapest way to stop someone trying it again.**

## What made a file eligible to move here

Two tests, both mechanical, both applied before the move:

1. **No code, CI step, Makefile target or check reads it.** Nineteen files in
   `project-mgmt/` are read by something that runs — `coverage_baseline.json`
   by the coverage gate, `RESUME_HERE.md` by `check_published_figures.ts`,
   `europe_scope.md` by the scope module, and so on. Those stayed where they
   are.
2. **No other tracked file mentions it by name.** Fourteen candidates were
   skipped on this test alone, because they cross-reference each other. A
   moved file that something still points at is a broken link, and broken
   links are how a repo starts lying about itself.

## What is still live, and where

The current architecture and the routes measured dead are recorded in the
repo's live documents, not here. The progress brief is
`project-mgmt/dashboard/precision.html`, regenerated from the database by
`refresh.py` — every figure on it is derived, none is typed.

## If you are about to redo something

Search here first. In particular, the ranking work in these plans was
measured to zero across ten separate routes, including an oracle that held
the answer key. That is expensive knowledge and it is written down.
