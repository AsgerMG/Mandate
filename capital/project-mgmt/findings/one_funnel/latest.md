# One funnel — every stage, one population, one denominator

```
started            2026-08-13T00:07:17.220Z
corpus             postgres instruments=1088 at 2026-08-13T00:07:17.621Z
store              POSTGRES BY DECISION, not by which credentials loaded. It is the corpus a
                   founder's request reads; the committed snapshot is `hydrateDbInstruments`'s
                   degradation path, offers strictly fewer instruments, and a run that took it
                   is REFUSED rather than labelled. observedAt 2026-08-13T00:07:17.621Z
ranker: all 814 request(s) on EMBEDDING
set                __recallSetDescribed.json  split=holdout  seed=20260806
population         897 founder(s) — one per company, described, drawn BEFORE the offerability cut
draw fingerprint   13cb71cf3a1d1847  <- two runs quoting different fingerprints
                   measured different founders, whatever seed they name
leak bar           isDescribed — `own_project_title_leaks` excluded, exact / 8-gram / sibling cleared by
                   check_recall_leaks. NOT the head-to-head's stricter
                   cross-regime-only draw, which exists because a model reads
                   the query text and nothing here does.
levers             pool=18 writer_cap=8 published_cap=7 top=5
```

founder intake — 22 of 23 askable fields are asked in production today, identity=real own-history=withheld capital=withheld answers=strict consortium=yes
DERIVED   entityCountries      set  897/897 (100%)  own  897/897 (100%)  companies.country
DERIVED   region               set  128/897 ( 14%)  own  128/897 ( 14%)  the register's beneficiary region on an award under a DIFFERENT notified scheme (`regionSource = other_scheme`)
DERIVED   sector               set  897/897 (100%)  own  897/897 (100%)  companies.sector_top
DERIVED   ticketBand           set  897/897 (100%)  own  153/897 ( 17%)  the median award this company received UNDER A DIFFERENT NOTIFIED SCHEME (`answerTicketSource = other_scheme`)
PINNED    activities           set  897/897 (100%)  own    0/897 (  0%)  uniform — 611 comparators, an EXCLUSION axis
PINNED    consortium           set  897/897 (100%)  own    0/897 (  0%)  uniform — asked in the ADAPTIVE round, so on the instant path no real founder has answered it
PINNED    useOfFunds           set  897/897 (100%)  own    0/897 (  0%)  uniform — 59 hard filters turn on it
WITHHELD  balanceBand                                               -  no filed accounts anywhere in the corpus
WITHHELD  bankRelationship                                          -  nothing in the corpus states whether a company has a lender
WITHHELD  cofinancingBand                                           -  aid intensity is a property of the SCHEME, not of the applicant's willingness to co-finance
WITHHELD  conditionality                                            -  a stated willingness, not a fact
WITHHELD  developmentStage                                          -  no TRL or maturity fact about a company
WITHHELD  exclusionFlags                                            -  the GBER and de minimis exclusions are self-declared and nothing in the register records them for a beneficiary
WITHHELD  fteBand                                                   -  we hold no headcount for any company
WITHHELD  institutionalBacking                                      -  derivable in principle from `private_funding_events` — a source no public award appears in, so it could not leak — but that table is not in `public/data/companies_index
WITHHELD  institutionalOwner                                        -  no ownership data
WITHHELD  lossesOverHalfCapital                                      -  derived by sanitizeEligibility from exclusionFlags, which is itself withheld
WITHHELD  needBy                                                    -  a founder's own timing
WITHHELD  nonEuControl                                              -  no ultimate-control data
WITHHELD  ownerOver25                                               -  no ownership or shareholding data
WITHHELD  turnoverBand                                              -  no filed accounts anywhere in the corpus
WITHHELD  wouldOpenEntity                                           -  a stance about the future
STAGED    organisationType     set    0/897 (  0%)  own    0/897 (  0%)  held back on 356/897 — prefillOrganisationType(company name)
WITHHELD  capitalSought                                             -  no leak-free derivation of INTENT exists; empty is the neutral value
██ HELD BACK — organisationType is STAGED behind NEXT_PUBLIC_ORGANISATION_TYPE_ARM, which is not "on" — the control is not rendered and production never populates it. 356/897 founders had a leak-free answer and were not given one, so nothing in this run is excluded by something a founder could not have said. Switch NEXT_PUBLIC_ORGANISATION_TYPE_ARM on and re-measure to see what asking would cost or win; do not compare the two numbers without saying which is which.
██ HELD BACK — region was answered "FR", which the control never offers for this founder — production cannot produce that answer. 2/897 founders had a leak-free answer and were not given one, so nothing in this run is excluded by something a founder could not have said.

Mean instrument table **86.1** rows, mean accessible pool **76.6** rows, over the 814 founders whose answer reached the founder stages.

`+/-` is the 95% binomial half-width on this run's own n. A move smaller than it
is not a move.

| stage | founders | of start | lost here | mechanism |
|---|---:|---:|---:|---|
| the answer key names a fund this company actually won | 897 | 100.0% +/-0.0 | 0 | `loadRecallSet` + `reattributeMissingAnswers` |
| ... and the corpus still holds that fund | 897 | 100.0% +/-0.0 | 0 | `loadDbInstruments` |
| ... and it is publishable on the corpus's own facts | 814 | 90.7% +/-1.9 | -83 (9.3 pts) | `publishableInstruments` — seven predicates, `corpus.ts` |
| ... and its openness could be CONFIRMED (the degradation policy) | 814 | 90.7% +/-1.9 | 0 | `unconfirmedOpen` — the degradation clause of the same filter |
| ... and this founder's screen keeps it (country, capital, channel + leaf caps) | 792 | 88.3% +/-2.1 | -22 (2.5 pts) | `buildInstrumentTableHydrated` = `candidateInstrumentIds` |
| ... and its encoded eligibility gates do not conclusively fail (accessiblePool) | 746 | 83.2% +/-2.4 | -46 (5.1 pts) | `accessiblePool` → `VER-BLOCKED` |
| ... and it survives the cut to VERDICT_POOL (18 rows) | 459 | 51.2% +/-3.3 | -287 (32.0 pts) | `.slice(0, VERDICT_POOL)` |
| ... and it survives the cut to the writer's candidates (8) | 357 | 39.8% +/-3.2 | -102 (11.4 pts) | `.slice(0, WRITER_CANDIDATE_CAP)` — bounds the order, not the table |
| ... and it is one of the 7 rows the brief publishes | 344 | 38.4% +/-3.2 | -13 (1.4 pts) | `order.slice(0, BRIEF_LIMITS.institutionsMax)` |
| ... and it is in the first 6 of them | 316 | 35.2% +/-3.1 | -28 (3.1 pts) | the first 6 rows of the same order, our own scoring |
| ... and it is in the first 5 of them | 292 | 32.6% +/-3.1 | -24 (2.7 pts) | the first 5 rows of the same order, our own scoring |
| ... and the MODEL, which re-orders the 18 before the cuts below, still leaves it in the first 5 | ? | ? | **UNMEASURED** | `agentSelectMemoPool` → Anthropic, in `pipeline.ts` — a PERMUTATION of the 18, applied above the two cuts below it |

██ The 7, 6, 5-row cuts are rank within `toWriter`, and they assume `assembleBriefRows`
carries that order into the published table. IT DOES NOT: it puts every actionable row
ahead of every watch-only one, after the ranker (`memoCandidates.ts`). The effect is
TWO-SIDED, so these rows are not a bound in either direction — a won fund that is
actionable is PROMOTED past any watch-only row above it and can enter a cut it is shown
outside of, and a won fund whose own copy reads as watch-only is pushed behind every
actionable row and can leave one it is shown inside. Measured on the 35 real briefs in
`brief_records`: 6 of them (17%) demoted at least one row, 8 rows in total. It is a small
perturbation of a table this size, and it is not zero.

## The model stage — ESTIMATED, not measured

```
tape               adviser_medium_n773_x2.json
draw fingerprint   37e0879c895d4d6a  <- a DIFFERENT population from the one above
graded on          98 founder(s), conditioned on the won fund being in the 18-row pool
control EXACT@5   45/98 = 45.9%
ranker  EXACT@5   50/98 = 51.0%
ratio              1.111
```

Applied to this run's own 292 founders at `top_5`, the model stage projects to **~324 founders (36.2% of the start)**.

██ ESTIMATED. ██ The ratio comes from 98 founders of a different draw, and that run's own McNemar put the difference inside its noise. Read it as a scale, not as a
measurement, and do not quote the projected count without this sentence.

## What this cannot see

- **model** — one Anthropic call per founder. It re-orders the pool ABOVE the writer cap rather than removing anything, so it has no survivor set of its own and cannot be a row in a nested ladder; its effect is estimated below from the last paid head-to-head's own tape, at the end where it becomes observable, and is never measured here.
- **the intake.** A replayed founder's answers are resolved from their own register history, not typed into the first screen a real founder fills in — and the founder-intake block above says, field by field, which carried a value, which were withheld for want of an honest source, and which were held back because production cannot populate them. A ceiling measured on these answers bounds THIS harness, not the product.
- **`discoverAndResearch`, `judgeOpenAnswers` and the `ProfileSignal`** are model calls on the live request path. They are absent here, so `applyProfileSignal` attaches nothing and the adaptive round's `lateFields` is empty.
- **REGIME@5 is deliberately not a row.** It credits a SIBLING of the won fund, so a founder can be lost at one stage and credited at a later one — which breaks the nesting property this whole ladder rests on. It is a different question (did we send them to the right funder) and it needs its own ladder, not a row in this one.

## What a wider `WRITER_CANDIDATE_CAP` could buy

A candidate at 1-based rank `r` in the candidate order publishes **iff**
`r <= WRITER_CANDIDATE_CAP` **and** `r - w(r) <= 7`, where `w(r)` is the
number of watch-only rows above it (`assembleBriefRows`, pinned by
`briefRows.test.ts`). So rank 8+k needs k rows to demote, and with nothing
watch-only this constant changes NOTHING a founder reads, at any value.

```
watch-only budget  brief_records, 33 published brief(s), 2026-07-27 .. 2026-08-11
                   production's own dropped_watch_only — real writer prose, no model call here
                   0 -> 27   1 -> 4   2 -> 2   (mean 0.24 of 7.12 candidates)
```

██ A DIFFERENT POPULATION from the ladder above, and it is not a row in it. These
are the briefs this product has actually published, not these founders. It bounds
the ladder's last rows; it may never be blended into them.

| cap | ranks it admits | founders whose fund is there | needs w >= | P(w >=) here | reachable |
|---:|---|---:|---:|---:|---:|
| 9 | rank 9 | 18 (2.0%) | 2 | 6.1% | 0.12 pts |
| 10 | rank 10 | 6 (0.7%) | 3 | 0.0% | 0.00 pts |
| 11 | rank 11 | 7 (0.8%) | 4 | 0.0% | 0.00 pts |
| 12 | rank 12 | 17 (1.9%) | 5 | 0.0% | 0.00 pts |

**Raising the cap to the whole pool (deepest rank reached: 18) is worth 0.12 points**, against a +/-3.2 half-width on this row.
The loss printed at `writer_cap` is the ORDER, not the cap: a fund at rank 8+ is cut
by the published cap of 7 however wide the writer's list is. It belongs to the
ranker and to what reaches it, and it will not be recovered by a constant.

The same distribution bounds the UNMEASURED `watch_only` row in BOTH directions,
which is what the row's own caveat cannot do — it names only the losing one.

A row reads watch-only 3.4% of the time (0.24 of 7.12 candidates). So:

- **it LOSES at most 12 of the 344 founders at `published`** — that is every one
  whose own row reads watch-only, and it is an over-count, because a demoted row
  still publishes wherever fewer actionable rows exist to fill the cap.
- **it GAINS about 2.4** — the founders whose fund sits at rank 8, the one seat inside the
  writer's cap but past the published one, and is carried in by a demotion above
  it. This is what today's headroom actually buys, and it is the whole of it.

So `published`'s 344 is an upper bound by AT MOST 12 founders (1.3 points), not by an
open-ended unknown, and the same holds for every row beneath it. Measuring it
exactly still needs a paid memo per founder; bounding it did not.

## Why the corpus stage loses a fund

Reasons OVERLAP — a row can fail several — so these do not sum to the stage loss.

```
    26  nothing outside its own id names the row
    20  the register says the window has shut
    19  no application route on record
    11  no amounts and no dates — below the data floor
     7  withheld by editorial policy
     0  ██ UNATTRIBUTED — no known predicate explains the loss
```

## Where this disagrees with an existing published figure

| published figure | its population | this run's row | this run |
|---|---|---|---:|
| `check_recall_floor` pool **97.7%** | 300 tune pairs of __recallSetDescribed.json, answer already offerable, published 2026-08-12 | `founder_screen` given `liveness_confirmed` | 97.3% |
| `check_recall_floor` EXACT@5 **25.0%** | same, and on the INSTANT SCREEN's six rows, not the memo's | `top_5` given `liveness_confirmed` | 35.9% |
| `poolRecallCurve` inPoolAtAll 87.6% | 820 held-out, answer already offerable | `gates_pass` given `liveness_confirmed` | 91.6% |
| `poolRecallCurve` at K=18 54.8% | same | `pool_cut` given `liveness_confirmed` | 56.4% |
| head-to-head control EXACT@5 45.9% | 98, split=all, cross-regime only, in-pool | `top_5` given `pool_cut` | 63.6% |
| head-to-head ranker EXACT@5 51.0% | same | `model` — UNMEASURED here | ? |
| "we find the right fund 98% of the time" | no population — the sentence has none | `top_5` as a share of the START | 32.6% |

The last row is the one the four figures were being read as. It is the only one a
founder experiences: of every company that won a fund we hold, this share would have
seen that fund in the first 5 rows of their brief.

