# The pool-to-table gap: it is not a lift problem, it is a leaf problem

Date: 2026-08-06, workstream E. Everything here is holdout, n=200, replayed
through `scripts/measure_recall.ts` and `scripts/diagnose_ordering.ts` against
live Postgres and Voyage. The diagnostic imports every scorer from
`shortlist.ts` rather than reimplementing it, so a component it prints is the
component that ran.

## Baseline, re-established rather than inherited

> **SUPERSEDED 2026-08-06 by workstream K. Read this block before using any
> number below it.** Everything in this note was measured at `N=200` with the
> STRIDE sampler, which `95f5fce` showed aliases against this set's ordering
> (N=200 gave EXACT@5 36%, N=250 gave 25%, same code), on a harness that
> `dac300a` showed decays along a run, against a semantic index that was both
> leaking and 19 hours stale. The *relative* findings below — which arm beat
> which, on the same sample, in the same run — are unaffected and are why this
> note is kept. The *levels* are not reproducible.
>
> Re-measured: seeded shuffle, holdout, `N=600`, three seeds, leak-free index.
>
> | | in pool | EXACT@5 | REGIME@5 |
> |---|--:|--:|--:|
> | as published here | 97% | 35% | 89% |
> | **re-measured** | **75%** | **24%** | **87%** |
>
> The pool term is the one that broke, and this note's central claim depends on
> it — see "Where the remaining loss actually is" at the end.

```
cd website/frontend
SET=__recallSetPlus.json     SPLIT=holdout N=200 npx tsx scripts/measure_recall.ts
SET=__recallSetComposed.json SPLIT=holdout N=200 npx tsx scripts/measure_recall.ts
```

| set | in pool | EXACT@5 | REGIME@5 |
|---|--:|--:|--:|
| `__recallSetPlus` | 98% | **35%** | **89%** |
| `__recallSetComposed` (now active) | 97% | **35%** | **89%** |

The two agree to the case on every headline and on every sub-population, which
is worth stating: the Composed set landed mid-session from another workstream
and it does not move this workstream's numbers.

## The finding that redirects the workstream

The handoff said: *"the reassignment is rank-preserving, so region gives the
right door the best slot the GROUP holds, and 61.7% of the time the group holds
none in the top five. The remaining loss is pool-to-table."* Measured over the
125 cases where the won fund is in the pool and below the cut:

| | n | share |
|---|--:|--:|
| the won fund's regime holds **no** slot in the five → needs LIFT | 19 | **15%** |
| regime holds a slot and the won leaf is its best member → needs LIFT | **0** | **0%** |
| regime holds a slot and **siblings outrank the won leaf** → needs REORDER | 106 | **85%** |

**85% of the remaining loss is within-regime leaf choice, not group lift.** The
group is not short of slots: its best slot is at **median position 2**, and a
mean of **3.07 of the five rows are already siblings of the won fund**. The
regime is in the table, near the top, holding three of five seats — and the
right leaf is not in any of them.

The 61.7% figure is not wrong, it is about a different group. Region routing
measured *same-name* groups (median 7.4 members). The group that matters here is
the whole notified regime by `parent_id`: **median 75 members in the pool**,
with the won fund at **median rank 16 inside it**.

## Why no current signal separates them

For the 106 reorder cases, the won leaf minus the sibling that took the group's
best slot:

| | median difference | won leaf is higher in |
|---|--:|--:|
| theme percentile | −0.090 | 32/106 |
| sectorFit | 0.000 | 11/106 |
| **peer rank** (lower is better) | **+16** | **16/106** |
| eventCount | −9 | 46/106 |
| awardP50 | −26,967 | 46/106 |

Read down that column: theme is against the won fund, sectorFit ties outright,
peer rank is against it in 90 of 106, and the two size signals are coin flips.
**Not one signal in the ranker points at the won leaf.** Aggregated over all
five rows that beat it, the pattern is a single portrait — the five are the
popular, large, frequently-awarded delivery bodies:

| | won fund | the five |
|---|--:|--:|
| known to the peer prior | 69/125 (55%) | 563/625 (**90%**) |
| peer rank, median | 24 | **2** |
| theme percentile, mean | 0.581 | 0.736 |
| sectorFit, mean | 0.637 | 0.870 |
| eventCount, mean | 177 | 382 |
| awardP50, mean | 612,612 | 1,272,070 |

`sectorFit` deserves its own line: the five sit at a **median of 1.000**, i.e.
saturated against the 0.25 clip. It is not separating anything at the top of the
table; it is a constant there.

So the honest statement is: with the facts this founder supplies — country,
sector, and a description that in profile mode is one of eleven canned sector
templates — **the system has no signal that identifies the won leaf inside its
regime better than the popularity prior already does.** Every remedy below fails
for that reason, and it is the same reason each time.

## What was tried, and what it cost

Rule for keeping a change: EXACT@5 rises on the Plus set and REGIME@5 falls by
no more than 1pp. Everything below was run on both sets.

| change | Plus EXACT@5 | Plus REGIME@5 | verdict |
|---|--:|--:|---|
| baseline | 35% | 89% | — |
| **ticket fit wired into `rowRelevance`** | **36%** | **89%** | **KEPT** |
| sibling reassignment disabled entirely | 36% | 89% | reverted, see below |
| both hard tiers disabled | 34% | 89% | reverted |
| peer prior fused with the ranker by RRF (k=10) | **30%** | 88% | reverted |

### KEPT — ticket fit was computed and thrown away

`rowRelevance` assigned `const ticket = ticketFit(inst)` and returned an
expression naming only `fit` and `reassigned`. Dead since the commit that added
it (`3a77474`, *"Make ticketBand actually affect what a founder is shown"*), so
the comment block describing a ticket term in the row sort described code that
never ran. `measure_recall.ts` feeds every replay the same ticketBand, which is
why nothing caught it.

Observed directly instead (`scripts/measure_ticket_effect.ts`, 12 profiles, mean
`awardP50` of the five shown rows):

| | b2m5_15m | b15m_50m | gt50m |
|---|--:|--:|--:|
| dropped (shipped) | 510,143 | 1,118,196 | **1,118,196** |
| multiplied in | 553,849 | 1,261,472 | **1,389,064** |

The two largest bands were returning the **identical table**: the only live
ticket signal was the sibling reassignment, whose permutation saturates once the
ask is above every fund's median. Fixed in `8f36e35`.

### REVERTED — the peer prior as a score rather than a rank

The brief asked whether the prior should be a rank or a score. Reciprocal-rank
fusion of the ranker's order with the prior's, replacing the head/tail split:
**30% against 35%, on both sets independently.** A five-point loss.

The reason generalises and is worth keeping. `emit_peer_prior.py` measures the
two signals as near-orthogonal — the prior catches 32 cases the ranker misses,
the ranker 26 the prior misses — so the shipped shape is a **union**: the ranker
owns the top slots outright and the prior owns the tail. RRF rewards the
**intersection**, and a row that is merely good on both displaces the rows that
are excellent on one. **Fusing orthogonal signals by intersection destroys the
union property that made them worth combining.** Do not retry a blend here.

### REVERTED — disabling the sibling reassignment

Reads +1pp (36% vs 35%), which passes the keep-rule, and it was still reverted.
The reassignment's preference is `objective × award × region`, and in this
harness `useOfFunds` and `ticketBand` are **constants across every replay**, so
its permutation is founder-independent and the +1pp is a harness artifact.
Removing it would delete the only live ticket discrimination in the row sort and
the whole carrier of region routing, to buy two cases on a measurement that
cannot see either. The finding that stands is the mechanism, not the point:
**for the two channels that are 91% of the pool, which leaf is shown is decided
by a permutation that is the same for every founder in a country.**

### RE-MEASURED — the two hard tiers, and one of them cannot be measured at all

`usedInField` is derived from `fieldChannels`, which comes from
`matchCompany(company, country)`. Verified directly: `matchCompany("TestCo", …)`
returns `matched: false` for all six countries, so **`fieldChannels` is empty and
`usedInField` is false for every row of every replay.** The tier cannot cost or
gain anything on this harness, and re-measuring it here would be measuring
nothing. Its production cost is real and remains unmeasured.

The second tier, the non-startup-ready demotion, was measured alone: removing it
takes EXACT@5 from 35% to **34%** with REGIME@5 unchanged. **The documented
3-point cost of the pair does not reproduce on the honest ground truth** — the
tiers are free, or slightly positive. Keep them; the note in `shortlist.ts`
saying they cost three points is stale.

## Two dead computations still in `rowRelevance`

Both flagged by tsc as assigned-never-read, both inside the same function:

- `ticket` — fixed above.
- `prior` — `channelPrior(...)` is computed on every call and discarded. The
  comment beneath it explains, correctly, that the channel prior was measured
  and rejected for this sort. The computation was not removed with the decision.
  Left in place only because another workstream was editing this file at the
  time; it should be deleted.

## Where the remaining loss actually is

Restated as a target rather than a lament. The won fund is in the pool 98% of
the time. Its regime is in the five 89% of the time, holding a mean of three
seats. **The entire remaining loss is choosing one leaf out of a median of 75
delivery bodies of one national regime**, and the only fact measured to separate
them is the recipient region — `region_routing.md`, 44.2% @1 against a 28.3%
popularity baseline, rising to 49.4% on the leak-free arm.

> **This conclusion no longer holds as stated (workstream K, 2026-08-06).** It
> rests entirely on "the won fund is in the pool 98% of the time", and the pool
> measures **75%** under an unbiased draw — 70% on `profile` mode and **60% on
> the regime-51+ population**, which is where the median-75 national regimes
> this paragraph is about actually live.
>
> What survives: the *conditional* finding above it is still correct as
> written, because it was scoped to the 125 cases where the won fund IS in the
> pool and below the cut. Within that set, 85% still need a reorder rather than
> lift.
>
> What does not: "the ENTIRE remaining loss is choosing one leaf". A quarter of
> won funds are not in the pool at all, and for the crowded national regimes it
> is two fifths. Leaf choice is one of two roughly comparable losses now, not
> the whole of it — and the pool half cannot be reached by any ranking signal.
>
> Before re-planning on this: the pool fall is recorded as UNRESOLVED in
> `project-mgmt/findings/leak_audit_wsK.md`. It is measurably not the leak that
> workstream closed, and it may be a live regression rather than a true level.

Region is inert in every run above, because `regionScorer` returns `() => 1`
when no region is answered and the intake asks for it only adaptively. So the
next thing to attack is not another ranking signal. It is **getting the region
question asked**, and then widening `regionScorer` from the same-`schemeCode`
group (median 7.4) to the regime (median 75) — which is a different and larger
comparison than the one `region_routing.md` measured and rejected, and must be
measured on its own before it is believed.

## Concurrency warning for whoever reads this next

This tree had **two agents writing it simultaneously** for the whole session.
`__recallSetComposed.json`, `scripts/recallSet.ts`, `check_recall_leaks.ts` and
the `measure_recall.ts` refactor belong to the other workstream and landed
mid-run. Every number above was re-established after that landed, and each was
run on both sets for exactly this reason. Nothing in this note was committed
with `git add -A`.
