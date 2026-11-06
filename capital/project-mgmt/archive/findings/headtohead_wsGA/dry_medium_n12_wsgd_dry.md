# wsGA — the AI ranker against our own scoring

```
started            2026-08-12T21:02:41.230Z
corpus             postgres instruments=1088 at 2026-08-12T21:02:41.797Z
ranker: all 12 request(s) on EMBEDDING
agent-select: arm=dry, no calls made
agent-select exits (7 call(s) to the seam): 7 priced, not called
set                __recallSetDescribed.json  split=all  seed=20260806
draw               12 of 515 eligible, country cap 2 (15%) BOUND
draw fingerprint   3b02a4cc9344739d  <- two runs quoting different fingerprints
                   graded different founders, whatever seed they name
levers             seam=late depth=40 count=7 effort=medium lookups=5 pool=40 published_cap=7
base rate curve    846 held-out founders; P(won in the first 40)=63.8%
paid calls         7 of a MAX_CALLS ceiling of 12
call cap           none per country (MAX_COUNTRY_CALLS unset)
null (REPEAT)      0 founder(s) had the treatment fired twice
spend              EUR 0.0000 = EUR 0.0000 per paid call
```

founder intake — 23 askable fields, identity=real own-history=withheld capital=withheld answers=strict consortium=yes
DERIVED   entityCountries      set   12/12 (100%)  own   12/12 (100%)  companies.country
DERIVED   organisationType     set    3/12 ( 25%)  own    3/12 ( 25%)  prefillOrganisationType(company name) — production's own classifier
DERIVED   region               set    6/12 ( 50%)  own    6/12 ( 50%)  the register's beneficiary region on an award under a DIFFERENT notified scheme (`regionSource = other_scheme`)
DERIVED   sector               set   12/12 (100%)  own   12/12 (100%)  companies.sector_top
DERIVED   ticketBand           set   12/12 (100%)  own    6/12 ( 50%)  the median award this company received UNDER A DIFFERENT NOTIFIED SCHEME (`answerTicketSource = other_scheme`)
PINNED    activities           set   12/12 (100%)  own    0/12 (  0%)  uniform — 611 comparators, an EXCLUSION axis
PINNED    consortium           set   12/12 (100%)  own    0/12 (  0%)  uniform — asked in the ADAPTIVE round, so on the instant path no real founder has answered it
PINNED    useOfFunds           set   12/12 (100%)  own    0/12 (  0%)  uniform — 59 hard filters turn on it
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

## The ceiling — a ranker cannot pick a fund it was not handed

| | won fund in the arm's 40-row pool |
|---|---:|
| control (our own scoring) | 7/12 (58.3% +/-27.9) |
| ranker | 7/12 (58.3% +/-27.9) |
| SHOWN to the ranker (the control's 40) | 7/12 (58.3% +/-27.9) |

Measured over the WHOLE draw of 12, including the founders no call was made on.
On the `late` seam the ranker permutes the control's own pool, so these two
numbers are equal BY CONSTRUCTION and any difference in this table is a bug.

**5 of 12 founders (41.7%) have no answer in the pool at all.** Neither arm can win on them and they are a concordant
miss in every paired test below.

## EXACT — the won fund in the published projection

Graded on 7 founder(s) — the draw was CONDITIONED on the control's ceiling, so this is the in-pool sub-population and the population figure is this times the ceiling above.

| arm | EXACT@5 | EXACT@6 |
|---|---:|---:|
| control (our own scoring) | 3/7 (42.9% +/-36.7) | 3/7 (42.9% +/-36.7) |
| ranker | 3/7 (42.9% +/-36.7) | 3/7 (42.9% +/-36.7) |

These are the CODE-SIDE projection: `orderMemoCandidates` cut to the published
cap. `pipeline.ts` reads the ORDER OF THE WRITER'S NOTES as the ranking, so the
rows a founder actually reads are in the order the writer chose to mention them.
This is the right quantity for 'does the cut throw the answer away' and it is NOT
a claim about the finished brief.

## The paired test — McNemar, exact, signed

```
EXACT@5  McNemar(signed) z = +0.00  on 0 discordant (ranker 0, control 0; both 3, neither 4)  exact p = 1.000  -- NO discordant pairs: the arms are identical on these cases, not tied on evidence
EXACT@6  McNemar(signed) z = +0.00  on 0 discordant (ranker 0, control 0; both 3, neither 4)  exact p = 1.000  -- NO discordant pairs: the arms are identical on these cases, not tied on evidence
```

Concordant pairs carry no information about which arm is better and are excluded
by the test, not by a filter here. A run with few discordant pairs has little
evidence in it however many founders it cost.

## Secondary — the won fund's RANK, Wilcoxon signed-rank

```
POOL rank (of 40) — the sensitive one
  n=0 non-tied pairs (0 dropped: the fund is absent from one arm's list)
  mean rank shift +0.00 (NEGATIVE favours the ranker — a lower rank is better)
  z = +0.00   p = 1.000
PUBLISHED rank (of 7)
  n=0 non-tied pairs (4 dropped: the fund is absent from one arm's list)
  mean rank shift +0.00 (NEGATIVE favours the ranker — a lower rank is better)
  z = +0.00   p = 1.000
```

TWO windows, and the first is the one to read. The published projection is
only 7 rows, so a won fund that sits at pool rank 9 under one arm and 14
under the other is absent from both and the pair is DROPPED. The dry run made
that concrete: on the published window the rank test kept three pairs of 120.

SECONDARY BY PRE-REGISTRATION. It is a more powerful test of a DIFFERENT
quantity, and a more powerful test of a different quantity is not a second
chance at the same question. It may support or qualify the headline; it may not
carry it. See project-mgmt/wsGA_prereg.md.

## Composition — because DE and FR were already legible

| country | drawn | share of draw | won fund in pool | CALLED | share of CALLS | control EXACT@5 | ranker EXACT@5 |
|---|---:|---:|---:|---:|---:|---:|---:|
| ES | 2 | 16.7% | 100% | 2 | 28.6% | 2 | 2 |
| FR | 2 | 16.7% | 100% | 2 | 28.6% | 0 | 0 |
| DE | 2 | 16.7% | 50% | 1 | 14.3% | 0 | 0 |
| IT | 2 | 16.7% | 50% | 1 | 14.3% | 1 | 1 |
| NL | 2 | 16.7% | 50% | 1 | 14.3% | 0 | 0 |
| NO | 2 | 16.7% | 0% | 0 | 0.0% | 0 | 0 |

DE + FR hold 4 of 12 = **33.3%** of the draw, and 3 of 7 = **42.9%** of the CALLS. The unstratified described population is 53% DE+FR.

The second share is the one that matters under `ONLY_IN_POOL=1`: the in-pool
rate varies enormously by market, so a draw capped at 15% can still produce a
called set one market dominates. `MAX_COUNTRY_CALLS` is the cap on that.

## The void conditions, checked rather than promised

Every one of these is a reason the pre-registration declares the run VOID —
no conclusion of any kind. See project-mgmt/wsGA_prereg.md section 4.

| condition | | observed |
|---|---|---|
| ranker attestation clean | ok | ranker: all 12 request(s) on EMBEDDING |
| fell back on <= 5% of calls | ok | 0 of 7 (0.0%) |
| chose on >= 95% of calls | **VOID** | 0 of 7 call(s) |
| no call cut off at max_tokens | ok | read from the arm tally line above |

## Fallbacks and reach

- fell back to the shipped order: **0** of 7 call(s). A fallback publishes the CONTROL's order under the treatment's name.
- mean menu shown: 37.7 rows
- exits: `agent-select exits (7 call(s) to the seam): 7 priced, not called`

```
{"armOff":0,"reversed":0,"poolNotLongerThanCount":0,"menuNotLongerThanWant":0,"dryPriced":7,"noUsablePick":0,"threw":0,"chose":0}
```

## Per founder

| founder | country | accessible | won @ accessible | in pool | rank control/ranker | EUR |
|---|---|---:|---:|---:|---|---:|
| CORTEC GMBH | DE | 120 | 109 | **no** | —/— | 0.0000 |
| KLOSSER INNOVASJON | NO | 90 | 78 | **no** | —/— | 0.0000 |
| AERNNOVA COMPOSITES ILLESCAS SA | ES | 99 | 2 | yes | 2/2 | 0.0000 |
| LEONARDO -SOCIETA PER AZIONI | IT | 24 | 5 | yes | 5/5 | 0.0000 |
| Water Horizon | FR | 89 | 13 | yes | —/— | 0.0000 |
| PHILIPS | DE | 112 | 29 | yes | —/— | 0.0000 |
| Paques Biomaterials B.V. | NL | 43 | 11 | yes | —/— | 0.0000 |
| EQUINOR ENERGY | NO | 93 | 44 | **no** | —/— | 0.0000 |
| 5G COMMUNICATIONS FOR FUTURE INDUSTRY VERTICALS | ES | 95 | 4 | yes | 4/4 | 0.0000 |
| TERRITOIRE D'ENERGIE SOMME | FR | 109 | 12 | yes | —/— | 0.0000 |
| PHILIPS ELECTRONICS NEDERLAND B.V. | NL | 43 | — | **no** | —/— | 0.0000 |
| INTERACTIVE FULLY ELECTRICAL VEHICLES SRL | IT | 14 | — | **no** | —/— | 0.0000 |
