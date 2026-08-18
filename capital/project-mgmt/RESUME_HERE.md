# Resume here — 2026-08-19, ~01:30

**A snapshot, not a standing document.** If the date above is old, trust
`project-mgmt/findings/one_funnel/latest.md` and `git log` over anything here.

## The number

**39.0% at six rows**, n=897, run `2026-08-18T22:14`, draw `13cb71cf3a1d1847`,
`ranker: all 819 request(s) on EMBEDDING`, corpus postgres 1088.

**It moved 38.46 → 39.02 and that is NOT a result.** wsHV's own reading, kept
because it is the honest one: `pool_cut` — the ranker-sensitive stage, upstream
of every confound — moved **−0.22 against ±2.86**. Rebuilding the fund profiles
moved nothing. And the four stages *below* `pool_cut` are not comparable at all,
because `WRITER_CANDIDATE_CAP` went 8 → 7 in `65300766`, ten minutes after the
baseline run started. Do not present the headline movement as a gain.

**NORTH STAR: 86-90%**, set by the owner 2026-08-17. Milestone **50%**, goal
**60%** on the way. Both live once in `project-mgmt/dashboard/refresh.py` and the
generator refuses a page that re-types either. **The north star is not typed** —
it is `reachCeiling`, what perfect ordering scores today, so it rises on its own
as encodings are corrected.

## The one thing to understand

```
reach 74  ×  convert 53  =  39.0
```

**Reach alone cannot reach the milestone.** At the hard ceiling of what the gates
allow, today's conversion still falls short; the AI's half has to reach ~67% for
the milestone. There is no other route. Two steps carry most of what the product
loses and they are the same defect — **the order**. Everything below "seven
published" on the dashboard is *grading*, not product.

## Yesterday's structural finding, which is the important one

**Every harness bypassed the production route.** `measure_funnel.ts` has zero
references to `/api/intelligence`. `npm run prodcheck` sends ONE real company
through the live deployment's four routes and found **five defects in twenty
minutes** that a green 846-test suite had passed, for about EUR 1.30. All five
are fixed and confirmed in a real founder's memo: a scheme that ended in 2020, a
row named by an id slug, a raw database key in the prose, a row that could not
say which fund it was, and the founder's raise labelled as the fund's award.

`prodcheck` is a **LOOK** — one company, no percentage, `assertOneFounder` ends
the run on a second. The heavy run is the **VERIFICATION**. They never merge.

## In flight

- **wsHW** — the EUR 4 re-read. wsHO's exact design, strata and sample, so the
  difference is attributable to the week's work and nothing else. Ends with a
  `prodcheck` read. Every figure labelled `indicative, n=`; it may not print a
  percentage that reaches the dashboard.
- **wsHX** — promote the 3,362 gates **by union, never overwrite** (unblocked by
  the successful redeploy), and count how many of the 897 answers are schemes
  that have since closed. Nine found by accident, **not a census**. It may NOT
  change the answer key — it brings the count and the argument.

## Next, in order

1. **Merge wsHW and wsHX** when they report; verify, push, remove worktrees.
2. **The eleventh sector** — needs the owner. `restore` is a pure function of
   `company_sector_labels`, the volume's copy is empty, so the fixed pipeline
   still reports 8 of 11, and that is a figure on our own home page. The LLM
   alternative prices at ~USD 136.
3. **Three doors of SA.40391 are byte-identical on the page** — the project's
   central defect at a size somebody can finish, separating facts already held.
4. **The intake.** Three measurements point there: the score is *indifferent*
   not biased (wsGY, perfect ordering = 86.3%); a perfect answer to the largest
   statable separator is inert (wsHG, `gates_pass` moved zero); the largest
   already-wired separator carries no information (wsHH, embedding picks the won
   door 44.9% where its NAME lands 50.9% — **a candidate must beat 50.9% on the
   287 pairs**, free check `npx tsx scripts/_wshh_report.ts`).
5. **Not yet, deliberately:** the full EUR 30.70 run. Indicative while the
   product moves; one full run when it looks finished.

## Rules that cost something when broken

- `npm run stages` is **~2 hours at n=897**. The ~18 min figure is N=200 — I
  quoted it without its population for a week and every agent brief carried it.
- **Never run two funnels at once** if avoidable. They are safe (each pins its
  corpus at start) but cross-run *levels* are not comparable.
- `NO_PG=1` is forbidden: serves a snapshot AND drops the ranker to lexical.
  It cost 5.3 points once.
- Every ranker run must attest `ranker: all N request(s) on EMBEDDING`.
- Agents **commit incrementally**, own worktree via `scripts/agent-worktree.sh`.
- **Check nothing is running inside a worktree before removing it.** I deleted
  `node_modules` out from under a live two-hour measurement.
- **Never move a floor, tolerance or ceiling to make a build green.**
- The Railway CLI is **not missing** — `railway_service.py` shells `npx --yes
  @railway/cli` and it is authenticated. I claimed otherwise twice by testing
  `command -v railway`.
