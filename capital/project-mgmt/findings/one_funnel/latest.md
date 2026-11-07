# One funnel — every stage, one population, one denominator

```
started            2026-11-07T12:43:17.274Z
corpus             postgres instruments=1088 at 2026-11-07T12:43:17.606Z
store              POSTGRES BY DECISION, not by which credentials loaded. It is the corpus a
                   founder's request reads; the committed snapshot is `hydrateDbInstruments`'s
                   degradation path, offers strictly fewer instruments, and a run that took it
                   is REFUSED rather than labelled. observedAt 2026-11-07T12:43:17.606Z
ranker: all 819 request(s) on EMBEDDING
set                __recallSetDescribed.json  split=holdout  seed=20260806
population         897 founder(s) — one per company, described, drawn BEFORE the offerability cut
draw fingerprint   13cb71cf3a1d1847  <- two runs quoting different fingerprints
                   measured different founders, whatever seed they name
leak bar           isDescribed — `own_project_title_leaks` excluded, exact / 8-gram / sibling cleared by
                   check_recall_leaks. NOT the head-to-head's stricter
                   cross-regime-only draw, which exists because a model reads
                   the query text and nothing here does.
levers             pool=40 writer_cap=7 published_cap=7 top=5 select_depth=40 row_order=off award_term=oneside
request stages     `npm run stages` against `runIntelligence`, stage by stage
  discovering  ABSENT — `discoverAndResearch` is a paid web-search-grounded call the request path makes on every brief; this run passes `records: []`, so no web-found comparable's channels union into `fieldChannels` -- which seeds `codes` in `selectInstrumentRows` (pool membership) and sets `usedInField` (tier 1 of the row sort, above the entire score).
  querying_db  REDUCED — `matchCompany` and `findPeersBySubsector` run, but the request path also matches the web-found names and, for a founder NOT in the corpus, takes the peer sub-sector from those matches. Here an unmatched founder gets no peers at all, and `fieldChannels` is empty for 34.3% of this population.
  generating   ABSENT — No writer call is made. `orderMemoCandidates` is production's own cut, so the candidates handed to the writer are real; the rows the writer would publish out of them are not measured here and no figure below is a published order.
  done         runs
```

██ THE REQUEST PATH'S `discovering` STAGE IS ABSENT IN THIS RUN. `discoverAndResearch` is a paid web-search-grounded call the request path makes on every brief; this run passes `records: []`, so no web-found comparable's channels union into `fieldChannels` -- which seeds `codes` in `selectInstrumentRows` (pool membership) and sets `usedInField` (tier 1 of the row sort, above the entire score). Every number below is a measurement of a pipeline that DOES NOT HAVE that stage, not of the one a founder is served. Do not quote a figure from this run as end-to-end without saying so.

██ THE REQUEST PATH'S `querying_db` STAGE IS REDUCED IN THIS RUN. `matchCompany` and `findPeersBySubsector` run, but the request path also matches the web-found names and, for a founder NOT in the corpus, takes the peer sub-sector from those matches. Here an unmatched founder gets no peers at all, and `fieldChannels` is empty for 34.3% of this population. Every number below is a measurement of a pipeline that runs that stage on less than the request path hands it, not of the one a founder is served. Do not quote a figure from this run as end-to-end without saying so.

██ THE REQUEST PATH'S `generating` STAGE IS ABSENT IN THIS RUN. No writer call is made. `orderMemoCandidates` is production's own cut, so the candidates handed to the writer are real; the rows the writer would publish out of them are not measured here and no figure below is a published order. Every number below is a measurement of a pipeline that DOES NOT HAVE that stage, not of the one a founder is served. Do not quote a figure from this run as end-to-end without saying so.


founder intake — 22 of 23 askable fields are asked in production today, identity=real own-history=withheld capital=withheld answers=strict consortium=yes description=full
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

Mean instrument table **82.6** rows, mean accessible pool **79.0** rows, over the 819 founders whose answer reached the founder stages.

`+/-` is the 95% binomial half-width on this run's own n. A move smaller than it
is not a move.

| stage | founders | of start | lost here | mechanism |
|---|---:|---:|---:|---|
| the answer key names a fund this company actually won | 897 | 100.0% +/-0.0 | 0 | `loadRecallSet` + `reattributeMissingAnswers` |
| ... and the corpus still holds that fund | 897 | 100.0% +/-0.0 | 0 | `loadDbInstruments` |
| ... and it is publishable on the corpus's own facts | 819 | 91.3% +/-1.8 | -78 (8.7 pts) | `publishableInstruments` — seven predicates, `corpus.ts` |
| ... and its openness could be CONFIRMED (the degradation policy) | 819 | 91.3% +/-1.8 | 0 | `unconfirmedOpen` — the degradation clause of the same filter |
| ... and this founder's screen keeps it (country, capital, channel + leaf caps) | 801 | 89.3% +/-2.0 | -18 (2.0 pts) | `buildInstrumentTableHydrated` = `candidateInstrumentIds` |
| ... and its encoded eligibility gates do not conclusively fail (accessiblePool) | 790 | 88.1% +/-2.1 | -11 (1.2 pts) | `accessiblePool` → `VER-BLOCKED` |
| ... and it survives the cut to VERDICT_POOL (40 rows) | 686 | 76.5% +/-2.8 | -104 (11.6 pts) | `.slice(0, VERDICT_POOL)` |
| ... and it survives the cut to the writer's candidates (7) | 376 | 41.9% +/-3.2 | -310 (34.6 pts) | `orderMemoCandidates().toWriter` |
| ... and the writer's own prose does not demote it behind the actionable rows | ? | ? | **UNMEASURED** | `isWatchOnly` in `assembleBriefRows` — needs the writer |
| ... and it is one of the 7 rows the brief publishes | 376 | 41.9% +/-3.2 | 0 | `order.slice(0, BRIEF_LIMITS.institutionsMax)` |
| ... and it is in the first 6 of them | 354 | 39.5% +/-3.2 | -22 (2.5 pts) | the first 6 rows of the same order, our own scoring |
| ... and it is in the first 5 of them | 330 | 36.8% +/-3.2 | -24 (2.7 pts) | the first 5 rows of the same order, our own scoring |
| ... and the MODEL, which re-orders the 40 before the cuts below, still leaves it in the first 5 | ? | ? | **UNMEASURED** | `agentSelectMemoPool` → Anthropic, in `pipeline.ts` — a PERMUTATION of the 40, applied above the two cuts below it |

██ The 7, 6, 5-row cuts are rank within `toWriter`, and they assume `assembleBriefRows`
carries that order into the published table. IT DOES NOT: it puts every actionable row
ahead of every watch-only one, after the ranker (`memoCandidates.ts`). The effect is
TWO-SIDED, so these rows are not a bound in either direction — a won fund that is
actionable is PROMOTED past any watch-only row above it and can enter a cut it is shown
outside of, and a won fund whose own copy reads as watch-only is pushed behind every
actionable row and can leave one it is shown inside. Measured on the 38 real briefs in
`brief_records`: 6 of them (16%) demoted at least one row, 8 rows in total. It is a small
perturbation of a table this size, and it is not zero.

## The model stage — ESTIMATED, not measured

██ NO ESTIMATE. ██ No head-to-head tape was found under
`project-mgmt/findings/headtohead_wsGA/`, so the model stage is UNMEASURED and
UNESTIMATED. It is not zero loss and it is not zero gain; it is unknown.

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
    15  the register says the window has shut
    11  no amounts and no dates — below the data floor
     7  withheld by editorial policy
     0  ██ UNATTRIBUTED — no known predicate explains the loss
```

## Where this disagrees with an existing published figure

| published figure | its population | this run's row | this run |
|---|---|---|---:|
| `check_recall_floor` pool **97.7%** | 300 tune pairs of __recallSetDescribed.json, answer already offerable, published 2026-08-18 | `founder_screen` given `liveness_confirmed` | 97.8% |
| `check_recall_floor` EXACT@5 **26.7%** | same, and on the INSTANT SCREEN's six rows, not the memo's | `top_5` given `liveness_confirmed` | 40.3% |
| `poolRecallCurve` inPoolAtAll 96.0% | 821 held-out, answer already offerable | `gates_pass` given `liveness_confirmed` | 96.5% |
| `poolRecallCurve` at K=40 82.2% | same | `pool_cut` given `liveness_confirmed` | 83.8% |
| "we find the right fund 98% of the time" | no population — the sentence has none | `top_5` as a share of the START | 36.8% |

The last row is the one the four figures were being read as. It is the only one a
founder experiences: of every company that won a fund we hold, this share would have
seen that fund in the first 5 rows of their brief.

