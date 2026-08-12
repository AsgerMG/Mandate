# One funnel — every stage, one population, one denominator

```
started            2026-08-12T22:08:38.024Z
corpus             postgres instruments=1088 at 2026-08-12T22:08:38.640Z
store              POSTGRES BY DECISION, not by which credentials loaded. It is the corpus a
                   founder's request reads; the committed snapshot is `hydrateDbInstruments`'s
                   degradation path, offers strictly fewer instruments, and a run that took it
                   is REFUSED rather than labelled. observedAt 2026-08-12T22:08:38.640Z
ranker: all 6 request(s) on EMBEDDING
set                __recallSetDescribed.json  split=holdout  seed=20260806
population         6 founder(s) sampled of 897 — one per company, described, drawn BEFORE the offerability cut
draw fingerprint   a380f1bedd491465  <- two runs quoting different fingerprints
                   measured different founders, whatever seed they name
leak bar           isDescribed — `own_project_title_leaks` excluded, exact / 8-gram / sibling cleared by
                   check_recall_leaks. NOT the head-to-head's stricter
                   cross-regime-only draw, which exists because a model reads
                   the query text and nothing here does.
levers             pool=18 writer_cap=8 published_cap=7 top=5
```

founder intake — 23 askable fields, identity=real own-history=withheld capital=withheld answers=strict consortium=yes
DERIVED   entityCountries      set    6/6 (100%)  own    6/6 (100%)  companies.country
DERIVED   organisationType     set    2/6 ( 33%)  own    2/6 ( 33%)  prefillOrganisationType(company name) — production's own classifier
DERIVED   region               set    1/6 ( 17%)  own    1/6 ( 17%)  the register's beneficiary region on an award under a DIFFERENT notified scheme (`regionSource = other_scheme`)
DERIVED   sector               set    6/6 (100%)  own    6/6 (100%)  companies.sector_top
DERIVED   ticketBand           set    6/6 (100%)  own    1/6 ( 17%)  the median award this company received UNDER A DIFFERENT NOTIFIED SCHEME (`answerTicketSource = other_scheme`)
PINNED    activities           set    6/6 (100%)  own    0/6 (  0%)  uniform — 611 comparators, an EXCLUSION axis
PINNED    consortium           set    6/6 (100%)  own    0/6 (  0%)  uniform — asked in the ADAPTIVE round, so on the instant path no real founder has answered it
PINNED    useOfFunds           set    6/6 (100%)  own    0/6 (  0%)  uniform — 59 hard filters turn on it
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
WITHHELD  capitalSought                                             -  no leak-free derivation of INTENT exists; empty is the neutral value
██ organisationType answered for 2/6 founders while NEXT_PUBLIC_ORGANISATION_TYPE_ARM is OFF — production never populates this field, so these founders are being judged against 215 cited STRUCTURAL gates no real founder can trip. Measured cost: 4.0 points of accessible-pool recall. Turn the arm on, or stop answering it; do not quote the number without saying which.

Mean instrument table **104.8** rows, mean accessible pool **96.5** rows, over the 6 founders whose answer reached the founder stages.

`+/-` is the 95% binomial half-width on this run's own n. A move smaller than it
is not a move.

| stage | founders | of start | lost here | mechanism |
|---|---:|---:|---:|---|
| the answer key names a fund this company actually won | 6 | 100.0% +/-0.0 | 0 | `loadRecallSet` + `reattributeMissingAnswers` |
| ... and the corpus still holds that fund | 6 | 100.0% +/-0.0 | 0 | `loadDbInstruments` |
| ... and it is publishable on the corpus's own facts | 6 | 100.0% +/-0.0 | 0 | `publishableInstruments` — seven predicates, `corpus.ts` |
| ... and its openness could be CONFIRMED (the degradation policy) | 6 | 100.0% +/-0.0 | 0 | `unconfirmedOpen` — the degradation clause of the same filter |
| ... and this founder's screen keeps it (country, capital, channel + leaf caps) | 6 | 100.0% +/-0.0 | 0 | `buildInstrumentTableHydrated` = `candidateInstrumentIds` |
| ... and its encoded eligibility gates do not conclusively fail (accessiblePool) | 5 | 83.3% +/-29.8 | -1 (16.7 pts) | `accessiblePool` → `VER-BLOCKED` |
| ... and it survives the cut to VERDICT_POOL (18 rows) | 3 | 50.0% +/-40.0 | -2 (33.3 pts) | `.slice(0, VERDICT_POOL)` |
| ... and it survives the cut to the writer's candidates (8) | 2 | 33.3% +/-37.7 | -1 (16.7 pts) | `orderMemoCandidates().toWriter` |
| ... and the writer's own prose does not demote it behind the actionable rows | ? | ? | **UNMEASURED** | `isWatchOnly` in `assembleBriefRows` — needs the writer |
| ... and it is one of the 7 rows the brief publishes | 2 | 33.3% +/-37.7 | 0 | `order.slice(0, BRIEF_LIMITS.institutionsMax)` |
| ... and it is in the first 6 of them | 2 | 33.3% +/-37.7 | 0 | the first 6 rows of the same order, our own scoring |
| ... and it is in the first 5 of them | 1 | 16.7% +/-29.8 | -1 (16.7 pts) | the first 5 rows of the same order, our own scoring |
| ... and the MODEL, which re-orders the 18 before the cuts below, still leaves it in the first 5 | ? | ? | **UNMEASURED** | `agentSelectMemoPool` → Anthropic, at `pipeline.ts:1756` — a PERMUTATION of the 18, applied above the two cuts below it |

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

Applied to this run's own 1 founders at `top_5`, the model stage projects to **~1 founders (18.5% of the start)**.

██ ESTIMATED. ██ The ratio comes from 98 founders of a different draw, and that run's own McNemar put the difference inside its noise. Read it as a scale, not as a
measurement, and do not quote the projected count without this sentence.

## What this cannot see

- **watch_only** — WRT-WATCH-ONLY reads the writer's `nextStep` and `whyEligible` prose, so it cannot be evaluated without a paid memo per founder. It is a DEMOTION, not a deletion (`assembleBriefRows`: actionable rows first, the rest behind them in rank order), so it moves every row's position in BOTH directions and the rows below are neither an upper nor a lower bound — see the note under the table.
- **model** — one Anthropic call per founder. It re-orders the pool ABOVE the writer cap rather than removing anything, so it has no survivor set of its own and cannot be a row in a nested ladder; its effect is estimated below from the last paid head-to-head's own tape, at the end where it becomes observable, and is never measured here.
- **the intake.** Every founder here answers 23 fields resolved from their own register history, not from the first screen a real founder fills in. A ceiling measured on these answers bounds THIS harness, not the product.
- **`discoverAndResearch`, `judgeOpenAnswers` and the `ProfileSignal`** are model calls on the live request path. They are absent here, so `applyProfileSignal` attaches nothing and the adaptive round's `lateFields` is empty.
- **REGIME@5 is deliberately not a row.** It credits a SIBLING of the won fund, so a founder can be lost at one stage and credited at a later one — which breaks the nesting property this whole ladder rests on. It is a different question (did we send them to the right funder) and it needs its own ladder, not a row in this one.

## Why the corpus stage loses a fund

Reasons OVERLAP — a row can fail several — so these do not sum to the stage loss.

```
     0  nothing was lost at this stage
     0  ██ UNATTRIBUTED — no known predicate explains the loss
```

## Where this disagrees with an existing published figure

| published figure | its population | this run's row | this run |
|---|---|---|---:|
| `check_recall_floor` pool **97.7%** | 300 tune pairs of __recallSetDescribed.json, answer already offerable, published 2026-08-12 | `founder_screen` given `liveness_confirmed` | 100.0% |
| `check_recall_floor` EXACT@5 **25.0%** | same, and on the INSTANT SCREEN's six rows, not the memo's | `top_5` given `liveness_confirmed` | 16.7% |
| `poolRecallCurve` inPoolAtAll 87.6% | 820 held-out, answer already offerable | `gates_pass` given `liveness_confirmed` | 83.3% |
| `poolRecallCurve` at K=18 54.8% | same | `pool_cut` given `liveness_confirmed` | 50.0% |
| head-to-head control EXACT@5 45.9% | 98, split=all, cross-regime only, in-pool | `top_5` given `pool_cut` | 33.3% |
| head-to-head ranker EXACT@5 51.0% | same | `model` — UNMEASURED here | ? |
| "we find the right fund 98% of the time" | no population — the sentence has none | `top_5` as a share of the START | 16.7% |

The last row is the one the four figures were being read as. It is the only one a
founder experiences: of every company that won a fund we hold, this share would have
seen that fund in the first 5 rows of their brief.

