# Resume here — 2026-08-17, ~22:45

**A snapshot, not a standing document.** If the date above is old, trust
`project-mgmt/findings/one_funnel/latest.md` and `git log` over anything here.

## The number

**38.2% at six rows**, n=897, confirmed on the reference instrument today after
the `AWARD_TERM=oneside` flip. **Quote it with its concentration or not at all**
— remove `vinnova_grant` and the flip is +0.4 at z=0.9.

Milestone **50%**, goal **60%**. Both are decisions, both live once in
`project-mgmt/dashboard/refresh.py`, and the generator refuses to publish a page
that re-types either.

## The one thing to understand

```
reach 73  ×  convert 52  =  38.2
```

**Reach alone cannot reach the milestone.** At its hard ceiling (86%, everything
the gates allow) today's conversion still gives 44.6%. Conversion must reach
**58%** at that ceiling, or 68% at today's reach. There is no other route.

And two steps are **74% of everything the product loses**: the cut to the AI's
list of 40 (22%) and our own ranking's cut to eight (52%). Same defect — the
order. Everything below "seven published" on the dashboard is *grading*, not
product; the memo publishes seven and stops.

## What closed today, and it closed hard

Three independent measurements now point the same way, and the ordering route
for the sibling problem is **shut**:

- **wsGY** — perfect ordering gives 86.3%; the score is *indifferent* to the
  answer, not biased (within four percentile points on every fact we hold).
- **wsHG** — a *perfect* answer to the largest statable separator is inert:
  `gates_pass` moved **zero**, funnel −0.1. **The wiring, not the answer.**
- **wsHH** — the largest *already-wired* separator carries no information. The
  embedding picks the won door **44.9%**; a door's NAME, which the ranker never
  computes, lands at **50.9%**. Every re-embedding (name / description /
  eligibility / both / profile) sits between 43.4 and 50.9. **My percentile-
  compression hypothesis was disproved in one line: a rank transform is
  monotone, so it cannot reverse a pair. 0 of 287.**

**A candidate separator must now beat 50.9% on the 287 pairs.** Free check:
`npx tsx scripts/_wshh_report.ts`. The one place worth reopening topic is
`vinnova_grant`, 54.0% ±8.7, 126 pairs.

**So the pointer is the INTAKE, from three directions.** And note the standing
memo's "founders cannot state topic" line is *narrowed*, not binding: that route
asked founders to classify the funding landscape; the fact that separates two
doors is their own business.

## In flight

- **wsHI** (`wsHI-tokens`, worktree live) — raise `MAX_TOKENS_BY_EFFORT`, prove
  truncation is **zero** at a 40-row menu, and fix the truncation counter, which
  is itself wrong (calls per seam invocation, truncations per API call — hence
  the impossible `thought on 210/148`). **It gates every paid run.** It also
  writes the pre-registration wsHK will run under. Budget: $3 max, pre-declared.

## Next, in order

1. **Merge wsHI** when it reports; verify, push, remove its worktree.
2. **wsHK — the paid confirming run**, EUR 11-15, **only after wsHI**. The owner
   approved it on that precondition. It measures the model's half, which is the
   half every conversion change lands in and the free ladder cannot see.
3. **The intake.** Three measurements now point there and nothing free is left
   pointed at the 74%. Before designing anything, read
   `project_door_separation` and wsHG's per-option table:
   `feasibility_study` **+25**, `production_capex` **−21** — one option carries
   the signal, another carries anti-signal.
4. **The owner's queue** (`AWAITING_APPROVAL.md`) is the reach half: 3,362 gates
   by union, the container redeploy (316 commits behind, and its guard has
   **never once published** a verdict), the 63 corrections (+0.4, correctness
   not lever), 15 successor redirects, and two publish steps the renames need.

## Rules that cost something when broken

- `npm run stages` is **~2 hours at n=897**. The ~18 min figure is N=200 — I
  quoted it without its population for a week and every agent brief carried it.
- **Never run two funnels at once** if avoidable; they contend badly. They are
  safe (each pins its corpus at start) but cross-run *levels* are not comparable.
- `NO_PG=1` is forbidden: serves a snapshot AND drops the ranker to lexical.
- Every ranker run must attest `ranker: all N request(s) on EMBEDDING`.
- Agents **commit incrementally**. One died at a spend limit with 310 lines in
  untracked files and I rescued them by hand this morning.
