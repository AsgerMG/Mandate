# One funnel — every stage, one population, one denominator

```
started            2026-08-17T19:45:40.458Z
corpus             postgres instruments=1088 at 2026-08-17T19:45:40.879Z
store              POSTGRES BY DECISION, not by which credentials loaded. It is the corpus a
                   founder's request reads; the committed snapshot is `hydrateDbInstruments`'s
                   degradation path, offers strictly fewer instruments, and a run that took it
                   is REFUSED rather than labelled. observedAt 2026-08-17T19:45:40.879Z
ranker: all 1656 request(s) on EMBEDDING
set                __recallSetDescribed.json  split=holdout  seed=20260806
population         897 founder(s) — one per company, described, drawn BEFORE the offerability cut
draw fingerprint   13cb71cf3a1d1847  <- two runs quoting different fingerprints
                   measured different founders, whatever seed they name
leak bar           isDescribed — `own_project_title_leaks` excluded, exact / 8-gram / sibling cleared by
                   check_recall_leaks. NOT the head-to-head's stricter
                   cross-regime-only draw, which exists because a model reads
                   the query text and nothing here does.
levers             pool=40 writer_cap=8 published_cap=7 top=5 select_depth=40 row_order=off
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

Mean instrument table **87.8** rows, mean accessible pool **79.5** rows, over the 828 founders whose answer reached the founder stages.

`+/-` is the 95% binomial half-width on this run's own n. A move smaller than it
is not a move.

| stage | founders | of start | lost here | mechanism |
|---|---:|---:|---:|---|
| the answer key names a fund this company actually won | 897 | 100.0% +/-0.0 | 0 | `loadRecallSet` + `reattributeMissingAnswers` |
| ... and the corpus still holds that fund | 897 | 100.0% +/-0.0 | 0 | `loadDbInstruments` |
| ... and it is publishable on the corpus's own facts | 828 | 92.3% +/-1.7 | -69 (7.7 pts) | `publishableInstruments` — seven predicates, `corpus.ts` |
| ... and its openness could be CONFIRMED (the degradation policy) | 828 | 92.3% +/-1.7 | 0 | `unconfirmedOpen` — the degradation clause of the same filter |
| ... and this founder's screen keeps it (country, capital, channel + leaf caps) | 806 | 89.9% +/-2.0 | -22 (2.5 pts) | `buildInstrumentTableHydrated` = `candidateInstrumentIds` |
| ... and its encoded eligibility gates do not conclusively fail (accessiblePool) | 774 | 86.3% +/-2.3 | -32 (3.6 pts) | `accessiblePool` → `VER-BLOCKED` |
| ... and it survives the cut to VERDICT_POOL (40 rows) | 643 | 71.7% +/-2.9 | -131 (14.6 pts) | `.slice(0, VERDICT_POOL)` |
| ... and it survives the cut to the writer's candidates (8) | 362 | 40.4% +/-3.2 | -281 (31.3 pts) | `orderMemoCandidates().toWriter` |
| ... and the writer's own prose does not demote it behind the actionable rows | ? | ? | **UNMEASURED** | `isWatchOnly` in `assembleBriefRows` — needs the writer |
| ... and it is one of the 7 rows the brief publishes | 347 | 38.7% +/-3.2 | -15 (1.7 pts) | `order.slice(0, BRIEF_LIMITS.institutionsMax)` |
| ... and it is in the first 6 of them | 321 | 35.8% +/-3.1 | -26 (2.9 pts) | the first 6 rows of the same order, our own scoring |
| ... and it is in the first 5 of them | 297 | 33.1% +/-3.1 | -24 (2.7 pts) | the first 5 rows of the same order, our own scoring |
| ... and the MODEL, which re-orders the 40 before the cuts below, still leaves it in the first 5 | ? | ? | **UNMEASURED** | `agentSelectMemoPool` → Anthropic, in `pipeline.ts` — a PERMUTATION of the 40, applied above the two cuts below it |

██ The 7, 6, 5-row cuts are rank within `toWriter`, and they assume `assembleBriefRows`
carries that order into the published table. IT DOES NOT: it puts every actionable row
ahead of every watch-only one, after the ranker (`memoCandidates.ts`). The effect is
TWO-SIDED, so these rows are not a bound in either direction — a won fund that is
actionable is PROMOTED past any watch-only row above it and can enter a cut it is shown
outside of, and a won fund whose own copy reads as watch-only is pushed behind every
actionable row and can leave one it is shown inside. Measured on the 35 real briefs in
`brief_records`: 6 of them (17%) demoted at least one row, 8 rows in total. It is a small
perturbation of a table this size, and it is not zero.

## The derived intake answer, measured without being adopted

```
answers            /tmp/wshg_uof.json
derived            642 of 887 founder(s) got a non-empty answer from their own
                   description prose; the rest keep the harness's pin, the same fallback
                   `answersFor` uses for a ticketBand it cannot derive
actually moved     446 founder(s) — the rest were served an IDENTICAL request in both
                   arms and are the CONTROL: 451 founder(s), verified byte-identical
                   across the two arms before this table was written
pin                industrial_research, experimental_development — uniform, for everyone
paths              59 hard filter gates turn on this field, and `objectiveScorer` multiplies
                   it into the score. The two can cancel; the table below is how you see that.
```

**Nothing was written.** The derived answer is an in-memory substitution in this process only.
`founderIntake` still pins the field, and this run does not change what any founder is served.

| stage | pinned | derived | delta |
|---|---:|---:|---:|
| answer_key | **897** 100.0% | **897** 100.0% | 0 (0.0 pts) |
| in_corpus | **897** 100.0% | **897** 100.0% | 0 (0.0 pts) |
| publishable | **828** 92.3% | **828** 92.3% | 0 (0.0 pts) |
| liveness_confirmed | **828** 92.3% | **828** 92.3% | 0 (0.0 pts) |
| founder_screen | **806** 89.9% | **806** 89.9% | 0 (0.0 pts) |
| gates_pass | **774** 86.3% | **774** 86.3% | 0 (0.0 pts) |
| pool_cut ← | **643** 71.7% | **644** 71.8% | +1 (+0.1 pts) |
| writer_cap ← | **362** 40.4% | **361** 40.2% | -1 (-0.1 pts) |
| watch_only | UNMEASURED | UNMEASURED | — |
| published ← | **347** 38.7% | **346** 38.6% | -1 (-0.1 pts) |
| top_6 ← | **321** 35.8% | **320** 35.7% | -1 (-0.1 pts) |
| top_5 ← | **297** 33.1% | **296** 33.0% | -1 (-0.1 pts) |
| model | UNMEASURED | UNMEASURED | — |

`←` marks a row the derived answer moves. A row it does not move is a measurement, not an
assumption: both arms ran the same code on the same founders in the same process.

### Which founders move, and in which direction

Paired at the founder. `entered` gained the row under the derived answer, `left` lost it. A net
of zero over a churn of forty is a different fact from a net of zero over a churn of zero, so
both are printed, with an EXACT two-sided McNemar on the discordant pairs.

| row | entered | left | net | exact McNemar p |
|---|---:|---:|---:|---:|
| gates_pass | +0 | -0 | 0 | 1.000 |
| pool_cut | +3 | -2 | +1 | 1.000 |
| writer_cap | +0 | -1 | -1 | 1.000 |
| published | +0 | -1 | -1 | 1.000 |
| top_6 | +0 | -1 | -1 | 1.000 |
| top_5 | +0 | -1 | -1 | 1.000 |

### Restricted to the 446 founders whose answer actually changed

The table above is over all 897 founders, roughly half of whom kept the pin, so it
dilutes the effect by that share. This is the same movement over the affected founders only.
It is the MECHANISM figure. The one above is the PRODUCT figure, because the product would
have to serve everybody.

| row | pinned | derived | entered | left |
|---|---:|---:|---:|---:|
| gates_pass | 395 88.6% | 395 88.6% | +0 | -0 |
| pool_cut | 323 72.4% | 324 72.6% | +3 | -2 |
| writer_cap | 185 41.5% | 184 41.3% | +0 | -1 |
| published | 178 39.9% | 177 39.7% | +0 | -1 |
| top_6 | 163 36.5% | 162 36.3% | +0 | -1 |
| top_5 | 151 33.9% | 150 33.6% | +0 | -1 |


## The model stage — ESTIMATED, not measured

```
tape               adviser_medium_n773_x2.json
draw fingerprint   37e0879c895d4d6a  <- a DIFFERENT population from the one above
graded on          98 founder(s), conditioned on the won fund being in the 40-row pool
control EXACT@5   45/98 = 45.9%
ranker  EXACT@5   50/98 = 51.0%
ratio              1.111
```

Applied to this run's own 297 founders at `top_5`, the model stage projects to **~330 founders (36.8% of the start)**.

██ ESTIMATED. ██ The ratio comes from 98 founders of a different draw, and that run's own McNemar put the difference inside its noise. Read it as a scale, not as a
measurement, and do not quote the projected count without this sentence.

## What this cannot see

- **watch_only** — WRT-WATCH-ONLY reads the writer's `nextStep` and `whyEligible` prose, so it cannot be evaluated without a paid memo per founder. It is a DEMOTION, not a deletion (`assembleBriefRows`: actionable rows first, the rest behind them in rank order), so it moves every row's position in BOTH directions and the rows below are neither an upper nor a lower bound — see the note under the table.
- **model** — one Anthropic call per founder. It re-orders the pool ABOVE the writer cap rather than removing anything, so it has no survivor set of its own and cannot be a row in a nested ladder; its effect is estimated below from the last paid head-to-head's own tape, at the end where it becomes observable, and is never measured here.
- **the intake.** A replayed founder's answers are resolved from their own register history, not typed into the first screen a real founder fills in — and the founder-intake block above says, field by field, which carried a value, which were withheld for want of an honest source, and which were held back because production cannot populate them. A ceiling measured on these answers bounds THIS harness, not the product.
- **`discoverAndResearch`, `judgeOpenAnswers` and the `ProfileSignal`** are model calls on the live request path. They are absent here, so `applyProfileSignal` attaches nothing and the adaptive round's `lateFields` is empty.
- **REGIME@5 is deliberately not a row.** It credits a SIBLING of the won fund, so a founder can be lost at one stage and credited at a later one — which breaks the nesting property this whole ladder rests on. It is a different question (did we send them to the right funder) and it needs its own ladder, not a row in this one.

## Why the corpus stage loses a fund

Reasons OVERLAP — a row can fail several — so these do not sum to the stage loss.

```
    26  nothing outside its own id names the row
    19  no application route on record
    11  no amounts and no dates — below the data floor
     7  withheld by editorial policy
     6  the register says the window has shut
     0  ██ UNATTRIBUTED — no known predicate explains the loss
```

## Where this disagrees with an existing published figure

| published figure | its population | this run's row | this run |
|---|---|---|---:|
| `check_recall_floor` pool **97.7%** | 300 tune pairs of __recallSetDescribed.json, answer already offerable, published 2026-08-12 | `founder_screen` given `liveness_confirmed` | 97.3% |
| `check_recall_floor` EXACT@5 **25.0%** | same, and on the INSTANT SCREEN's six rows, not the memo's | `top_5` given `liveness_confirmed` | 35.9% |
| `poolRecallCurve` inPoolAtAll 93.4% | 830 held-out, answer already offerable | `gates_pass` given `liveness_confirmed` | 93.5% |
| `poolRecallCurve` at K=40 77.5% | same | `pool_cut` given `liveness_confirmed` | 77.7% |
| head-to-head control EXACT@5 45.9% | 98, split=all, cross-regime only, in-pool | `top_5` given `pool_cut` | 46.2% |
| head-to-head ranker EXACT@5 51.0% | same | `model` — UNMEASURED here | ? |
| "we find the right fund 98% of the time" | no population — the sentence has none | `top_5` as a share of the START | 33.1% |

The last row is the one the four figures were being read as. It is the only one a
founder experiences: of every company that won a fund we hold, this share would have
seen that fund in the first 5 rows of their brief.

