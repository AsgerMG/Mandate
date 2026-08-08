# Resume point — 2026-08-09 01:49

Written because a 90-minute wake-up timer is a child of one CLI session and dies
with it. This file does not.

## The one number

**The memo names the right fund in the five about 3 times in 10.** The data now
supports ~9 in 10. Everything below serves closing that gap.

**But read this before quoting 30%**: it is measured against **278 nameable
instruments while the product offers 753**. The answer key has never named
CDTI, Neotec, Misiones or Innovate UK — Spain's, Britain's and France's national
innovation agencies, **21,632 awards between them**. Any change that suppresses
standalone funds will look like a free accuracy win and will remove Neotec from
a Spanish founder's table. **The fix is the key, not the ranking.**

## Do these first, in order

1. **`check_recall_floor` is RED on main** — `regime5` 83% against an 84% floor
   on `traced:exact_attribution`, n=143, one case short. An agent
   (`wsBN-floor-bisect`) was bisecting; two independent workstreams point at the
   committed **snapshot**, not a code change. **Do not lower the floor to go
   green** — that was done once and reversed. The open question is better than
   the bisect: *should a floor calibrated on one corpus vintage survive a corpus
   republish at all?* One case on n=143 is inside sampling noise, and a floor
   that flips on a legitimate refresh gets ignored within a week — which is
   exactly how eight guards became orphans here.

2. **Merge `workstream-az-region-money`** once the floor is resolved. It is
   finished, green, and the **biggest measured accuracy lever we have**: region
   asked up front and pre-filled from the registered address, ceiling 8% → 51%
   across 751 funds in 21 countries, at **no new question for the founder**. It
   conflicts on one import line in `panel.tsx`; the resolution is to take both
   sides (`regionOptions`, `toIso2`, and `StepHeader` added to the existing
   `panelReport` import). It measured 82% on that floor against main's 83%, so
   it is one case worse and **not the cause**.

3. **`wsBB-standalone-selection` should be deleted, not merged.** Its successor
   `wsBB2-standalone` is merged and contains everything of value; the original's
   last commit accidentally reverted the three files it had just written.

## My verification gap, which caused (1)

I verified `compileall` and `tsc` after every merge today — about fifteen — and
**did not re-run `check_recall_floor` each time**. That is how a floor regression
went unnoticed. The full check takes minutes and needs credentials, so "run it
every merge" is the answer that gets skipped; a cheaper merge-time signal is the
real fix and was asked for.

## What is still owned by an agent

- `wsBN-floor-bisect` — the floor question above.

Everything else has landed. If an agent's branch exists with commits ahead of
`main`, it is finished work waiting to be verified and merged.

## Standing rules that cost real work when broken

- **Never lower a floor or loosen a guard to make something pass.**
- **Prove a guard can fail before leaving it green** — a guard never seen red is
  not a guard.
- **Never remove a worktree you did not create.** `--force` bypasses git's
  dirty-tree protection silently.
- **Use `scripts/agent-worktree.sh`** — 70MB per agent instead of 1.3GB.
- **Verify, do not trust, a merge**: `python3 -m compileall -q ETL/`,
  `npx tsc --noEmit`, then the floor.
- **What a fund IS comes from the official source**, never from our own columns.

## Today's pattern, in one line

Nearly every defect was **something produced that nothing consumes, something
consumed that nothing produces, or something checked that never runs.** Fifteen
instances. When something looks inexplicable, look for that shape first.
