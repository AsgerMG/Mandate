# One funnel — every stage, one population, one denominator

```
started            2026-08-12T22:56:10.374Z
corpus             postgres instruments=1088 at 2026-08-12T22:56:10.830Z
store              POSTGRES BY DECISION, not by which credentials loaded. It is the corpus a
                   founder's request reads; the committed snapshot is `hydrateDbInstruments`'s
                   degradation path, offers strictly fewer instruments, and a run that took it
                   is REFUSED rather than labelled. observedAt 2026-08-12T22:56:10.830Z
ranker: all 814 request(s) on EMBEDDING
set                __recallSetDescribed.json  split=holdout  seed=20260806
population         897 founder(s) — one per company, described, drawn BEFORE the offerability cut
draw fingerprint   13cb71cf3a1d1847  <- two runs quoting different fingerprints
                   measured different founders, whatever seed they name
leak bar           isDescribed — `own_project_title_leaks` excluded, exact / 8-gram / sibling cleared by
                   check_recall_leaks. NOT the head-to-head's stricter
                   cross-regime-only draw, which exists because a model reads
                   the query text and nothing here does.
levers             pool=18 writer_cap=8 published_cap=7 top=5 select_depth=40
pool swept at      18, 25, 40, 60, all — the whole ladder at each, paired off one pool object
```

founder intake — 23 askable fields, identity=real own-history=withheld capital=withheld answers=strict consortium=yes
DERIVED   entityCountries      set  897/897 (100%)  own  897/897 (100%)  companies.country
DERIVED   organisationType     set  356/897 ( 40%)  own  356/897 ( 40%)  prefillOrganisationType(company name) — production's own classifier
DERIVED   region               set  130/897 ( 14%)  own  130/897 ( 14%)  the register's beneficiary region on an award under a DIFFERENT notified scheme (`regionSource = other_scheme`)
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
WITHHELD  capitalSought                                             -  no leak-free derivation of INTENT exists; empty is the neutral value
██ organisationType answered for 356/897 founders while NEXT_PUBLIC_ORGANISATION_TYPE_ARM is OFF — production never populates this field, so these founders are being judged against 215 cited STRUCTURAL gates no real founder can trip. Measured cost: 4.0 points of accessible-pool recall. Turn the arm on, or stop answering it; do not quote the number without saying which.

Mean instrument table **86.2** rows, mean accessible pool **74.0** rows, over the 814 founders whose answer reached the founder stages.

`+/-` is the 95% binomial half-width on this run's own n. A move smaller than it
is not a move.

| stage | founders | of start | lost here | mechanism |
|---|---:|---:|---:|---|
| the answer key names a fund this company actually won | 897 | 100.0% +/-0.0 | 0 | `loadRecallSet` + `reattributeMissingAnswers` |
| ... and the corpus still holds that fund | 897 | 100.0% +/-0.0 | 0 | `loadDbInstruments` |
| ... and it is publishable on the corpus's own facts | 814 | 90.7% +/-1.9 | -83 (9.3 pts) | `publishableInstruments` — seven predicates, `corpus.ts` |
| ... and its openness could be CONFIRMED (the degradation policy) | 814 | 90.7% +/-1.9 | 0 | `unconfirmedOpen` — the degradation clause of the same filter |
| ... and this founder's screen keeps it (country, capital, channel + leaf caps) | 792 | 88.3% +/-2.1 | -22 (2.5 pts) | `buildInstrumentTableHydrated` = `candidateInstrumentIds` |
| ... and its encoded eligibility gates do not conclusively fail (accessiblePool) | 713 | 79.5% +/-2.6 | -79 (8.8 pts) | `accessiblePool` → `VER-BLOCKED` |
| ... and it survives the cut to VERDICT_POOL (18 rows) | 447 | 49.8% +/-3.3 | -266 (29.7 pts) | `.slice(0, VERDICT_POOL)` |
| ... and it survives the cut to the writer's candidates (8) | 346 | 38.6% +/-3.2 | -101 (11.3 pts) | `orderMemoCandidates().toWriter` |
| ... and the writer's own prose does not demote it behind the actionable rows | ? | ? | **UNMEASURED** | `isWatchOnly` in `assembleBriefRows` — needs the writer |
| ... and it is one of the 7 rows the brief publishes | 329 | 36.7% +/-3.2 | -17 (1.9 pts) | `order.slice(0, BRIEF_LIMITS.institutionsMax)` |
| ... and it is in the first 6 of them | 303 | 33.8% +/-3.1 | -26 (2.9 pts) | the first 6 rows of the same order, our own scoring |
| ... and it is in the first 5 of them | 279 | 31.1% +/-3.0 | -24 (2.7 pts) | the first 5 rows of the same order, our own scoring |
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

## The cut, swept — the whole funnel at every pool depth

Paired. One pool object per founder, 5 projections of it, the same embeddings and
the same gates behind every column. `pool_cut` is the row `BRIEF_VERDICT_POOL` moves;
every row below it is what that costs.

| stage | K=18 | K=25 | K=40 | K=60 | K=all |
|---|---:|---:|---:|---:|---:|
| answer_key | **897** 100.0% | **897** 100.0% | **897** 100.0% | **897** 100.0% | **897** 100.0% |
| in_corpus | **897** 100.0% | **897** 100.0% | **897** 100.0% | **897** 100.0% | **897** 100.0% |
| publishable | **814** 90.7% | **814** 90.7% | **814** 90.7% | **814** 90.7% | **814** 90.7% |
| liveness_confirmed | **814** 90.7% | **814** 90.7% | **814** 90.7% | **814** 90.7% | **814** 90.7% |
| founder_screen | **792** 88.3% | **792** 88.3% | **792** 88.3% | **792** 88.3% | **792** 88.3% |
| gates_pass | **713** 79.5% | **713** 79.5% | **713** 79.5% | **713** 79.5% | **713** 79.5% |
| pool_cut ← | **447** 49.8% | **500** 55.7% | **598** 66.7% | **640** 71.3% | **713** 79.5% |
| writer_cap | **346** 38.6% | **346** 38.6% | **346** 38.6% | **346** 38.6% | **346** 38.6% |
| watch_only | — | — | — | — | — |
| published | **329** 36.7% | **329** 36.7% | **329** 36.7% | **329** 36.7% | **329** 36.7% |
| top_6 | **303** 33.8% | **303** 33.8% | **303** 33.8% | **303** 33.8% | **303** 33.8% |
| top_5 | **279** 31.1% | **279** 31.1% | **279** 31.1% | **279** 31.1% | **279** 31.1% |
| model | — | — | — | — | — |

`←` marks a row the lever moves. Every other row is identical at every depth, which is
a measurement and not an assumption: the stages above the cut do not read this number,
and the stages below it can only be reached through the one channel counted next.

### What a wider pool costs on the deterministic path

With no model in the loop a wider cut is a SUPERSET WITH AN IDENTICAL PREFIX, so the
only way it can change the rows below `pool_cut` is `resolveNameCollisions`, whose
survivor rule `preferBetterEvidencedRow` is a total order INDEPENDENT OF POSITION: a
better-evidenced sibling admitted at rank 30 can demote the row that held that label at
rank 3. Counted here on every founder, won fund or not, because "the won fund did not
move" is a weaker statement than "nothing moved".

| K | founders whose `toWriter` differs from K=18 | writer_cap entered / left | published entered / left | top_6 entered / left | top_5 entered / left |
|---|---:|---:|---:|---:|---:|
| 18 | 0 | +0 / -0 | +0 / -0 | +0 / -0 | +0 / -0 |
| 25 | 0 | +0 / -0 | +0 / -0 | +0 / -0 | +0 / -0 |
| 40 | 0 | +0 / -0 | +0 / -0 | +0 / -0 | +0 / -0 |
| 60 | 0 | +0 / -0 | +0 / -0 | +0 / -0 | +0 / -0 |
| all | 0 | +0 / -0 | +0 / -0 | +0 / -0 | +0 / -0 |

A net of zero over a churn of forty is a different fact from a net of zero over a churn
of zero, so both are printed. `entered` and `left` are founders, counted separately.

### The model's ceiling at each depth

`pool_cut` is the maximum ANY ranker can deliver at that depth, at any price: a founder
whose won fund is outside the cut is unreachable by construction. The rows below it in
the table above are our own deterministic order standing in for a ranker that is not in
this run.

| K | mean rows the ranker is shown | the answer is on the list | vs the shipped default |
|---|---:|---:|---:|
| 18 (ships) | 18.0 | **49.8%** +/-3.3 | — |
| 25 | 24.6 | **55.7%** +/-3.3 | +5.9 pts |
| 40 | 37.0 | **66.7%** +/-3.1 | +16.8 pts |
| 60 | 52.5 | **71.3%** +/-3.0 | +21.5 pts |
| all | 74.0 | **79.5%** +/-2.6 | +29.7 pts |

### The one thing only a paid run settles, stated as a number

Let `c_K` be the model's EXACT@5 rate among founders whose won fund is ON the menu it
is shown. The tape measures `c_18` = **51.0%** (50/98). Population EXACT@5 is
`P(won inside K) x c_K`, so break-even at K needs `c_K = c_base x P_base / P_K`.

| K | `c_K` break-even needs | relative collapse from 51.0% | head degradation tolerable if the new band converts at 30% |
|---|---:|---:|---:|
| 18 (ships) | — | — | — |
| 25 | 45.6% | 10.6% | 7% |
| 40 | 38.1% | 25.3% | 20% |
| 60 | 35.6% | 30.2% | 25% |
| all | 32.0% | 37.3% | 35% |

**Read the second column as the whole risk.** Hold the head's accuracy fixed and a
wider menu cannot lose at any conversion rate `b >= 0` on the newly-visible band — it
only ever adds founders who were unreachable. The entire case against widening is that
a longer menu makes the model WORSE ON THE ROWS IT WAS ALREADY SHOWN, and no free run
can measure that, because it is the model.

The nearest free evidence about the newly-visible band, re-derived from the same tape's
per-founder rows rather than from its prose — the model's conversion by where the won
fund sat in the 18-row menu it was actually shown:

| the won fund's rank in the menu | founders | control EXACT@5 | ranker EXACT@5 |
|---|---:|---:|---:|
| 1-3 | 31 | 31 (100%) | 26 (84%) |
| 4-6 | 16 | 14 (88%) | 2 (13%) |
| 7-9 | 20 | 0 (0%) | 13 (65%) |
| 10-12 | 12 | 0 (0%) | 3 (25%) |
| 13-15 | 9 | 0 (0%) | 3 (33%) |
| 16-18 | 10 | 0 (0%) | 3 (30%) |

██ There is no row here for ranks past the end of that menu, because that band was
never shown to a model. Its conversion rate is the one quantity this whole question
turns on and it does not exist yet at any depth.

### The depth the selector can actually read

`AGENT_SELECT_DEPTH` is 40. `agentSelectRows` cuts the menu to it and returns
`[...chosen, ...everything else in the shipped order]`, so a pool row past that depth is
never shown and can only land behind all `SELECT_COUNT` picks — past the published cap.
A pool wider than the depth therefore measures the depth while printing its own number.
Every column above is honest about the CUT; only the columns at or below the depth are
honest about what a founder could receive.


## The model stage — ESTIMATED, not measured

```
tape               adviser_medium_n773_x2.json
draw fingerprint   37e0879c895d4d6a  <- a DIFFERENT population from the one above
graded on          98 founder(s), conditioned on the won fund being in the 18-row pool
control EXACT@5   45/98 = 45.9%
ranker  EXACT@5   50/98 = 51.0%
ratio              1.111
```

Applied to this run's own 279 founders at `top_5`, the model stage projects to **~310 founders (34.6% of the start)**.

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
| `check_recall_floor` EXACT@5 **25.0%** | same, and on the INSTANT SCREEN's six rows, not the memo's | `top_5` given `liveness_confirmed` | 34.3% |
| `poolRecallCurve` inPoolAtAll 87.6% | 820 held-out, answer already offerable | `gates_pass` given `liveness_confirmed` | 87.6% |
| `poolRecallCurve` at K=18 54.8% | same | `pool_cut` given `liveness_confirmed` | 54.9% |
| head-to-head control EXACT@5 45.9% | 98, split=all, cross-regime only, in-pool | `top_5` given `pool_cut` | 62.4% |
| head-to-head ranker EXACT@5 51.0% | same | `model` — UNMEASURED here | ? |
| "we find the right fund 98% of the time" | no population — the sentence has none | `top_5` as a share of the START | 31.1% |

The last row is the one the four figures were being read as. It is the only one a
founder experiences: of every company that won a fund we hold, this share would have
seen that fund in the first 5 rows of their brief.

