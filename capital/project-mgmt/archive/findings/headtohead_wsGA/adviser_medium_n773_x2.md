# wsGA — the AI ranker against our own scoring

```
started            2026-08-12T18:12:43.580Z
corpus             postgres instruments=1088 at 2026-08-12T18:12:44.095Z
ranker: all 773 request(s) on EMBEDDING
agent-select: arm=adviser depth=40 count=7 effort=medium maxtok=6144 unsure=declare lookups=134 (62 brief(s) retrieved) model=claude-sonnet-5 — 145/148 chose, 3 FELL BACK to the shipped order (3 empty reply, 0 unparseable), 0 short reply, 0 unusable id(s), 0 seat(s) on a row already picked under the SAME TITLE (a floor) across 0 brief(s), 3 SELECT-rule violation(s) on 3 reply(ies), thought on 210/148 call(s) (488444 thinking token(s) billed, 627554 readable char(s)), 4 CUT OFF at max_tokens, EUR 9.2660 total, EUR 0.0626 per brief
agent-select exits (148 call(s) to the seam): 3 no usable pick, shipped order kept, 145 the model chose
set                __recallSetDescribed.json  split=all  seed=20260806
draw               773 of 773 eligible, country cap 116 (15%) BOUND
draw fingerprint   37e0879c895d4d6a  <- two runs quoting different fingerprints
                   graded different founders, whatever seed they name
levers             seam=late depth=40 count=7 effort=medium lookups=5 pool=18 published_cap=7
base rate curve    846 held-out founders; P(won in first 18)=44.2%
paid calls         148, 186 founder(s) skipped once the ceiling was hit
call cap           40 per country; 0 founder(s) turned away by it
null (REPEAT)      50 founder(s) had the treatment fired twice (REPEAT_FIRST=50)
spend              EUR 9.2660 = EUR 0.0626 per paid call
```

founder intake — 23 askable fields, identity=real own-history=withheld capital=withheld answers=strict consortium=yes
DERIVED   entityCountries      set  773/773 (100%)  own  773/773 (100%)  companies.country
DERIVED   organisationType     set  203/773 ( 26%)  own  203/773 ( 26%)  prefillOrganisationType(company name) — production's own classifier
DERIVED   region               set  193/773 ( 25%)  own  193/773 ( 25%)  the register's beneficiary region on an award under a DIFFERENT notified scheme (`regionSource = other_scheme`)
DERIVED   sector               set  773/773 (100%)  own  773/773 (100%)  companies.sector_top
DERIVED   ticketBand           set  773/773 (100%)  own  231/773 ( 30%)  the median award this company received UNDER A DIFFERENT NOTIFIED SCHEME (`answerTicketSource = other_scheme`)
PINNED    activities           set  773/773 (100%)  own    0/773 (  0%)  uniform — 611 comparators, an EXCLUSION axis
PINNED    consortium           set  773/773 (100%)  own    0/773 (  0%)  uniform — asked in the ADAPTIVE round, so on the instant path no real founder has answered it
PINNED    useOfFunds           set  773/773 (100%)  own    0/773 (  0%)  uniform — 59 hard filters turn on it
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

| | won fund in the arm's 18-row pool |
|---|---:|
| control (our own scoring) | 284/773 (36.7% +/-3.4) |
| ranker | 284/773 (36.7% +/-3.4) |
| SHOWN to the ranker (the control's 18) | 284/773 (36.7% +/-3.4) |

Measured over the WHOLE draw of 773, including the founders no call was made on.
On the `late` seam the ranker permutes the control's own pool, so these two
numbers are equal BY CONSTRUCTION and any difference in this table is a bug.

**489 of 773 founders (63.3%) have no answer in the pool at all.** Neither arm can win on them and they are a concordant
miss in every paired test below.

## EXACT — the won fund in the published projection

Graded on 98 founder(s) — the draw was CONDITIONED on the control's ceiling, so this is the in-pool sub-population and the population figure is this times the ceiling above.

| arm | EXACT@5 | EXACT@6 |
|---|---:|---:|
| control (our own scoring) | 45/98 (45.9% +/-9.9) | 51/98 (52.0% +/-9.9) |
| ranker | 50/98 (51.0% +/-9.9) | 57/98 (58.2% +/-9.8) |

These are the CODE-SIDE projection: `orderMemoCandidates` cut to the published
cap. `pipeline.ts` reads the ORDER OF THE WRITER'S NOTES as the ranking, so the
rows a founder actually reads are in the order the writer chose to mention them.
This is the right quantity for 'does the cut throw the answer away' and it is NOT
a claim about the finished brief.

## The paired test — McNemar, exact, signed

```
EXACT@5  McNemar(signed) z = +0.80  on 39 discordant (ranker 22, control 17; both 28, neither 31)  exact p = 0.522  -- inside its own noise
EXACT@6  McNemar(signed) z = +0.95  on 40 discordant (ranker 23, control 17; both 34, neither 24)  exact p = 0.430  -- inside its own noise
```

Concordant pairs carry no information about which arm is better and are excluded
by the test, not by a filter here. A run with few discordant pairs has little
evidence in it however many founders it cost.

## The null — the ranker against ITSELF, same prompt, same pool, same second

```
EXACT@5  ranker vs CONTROL  22 discordant of 50 = 44.0%
EXACT@5  ranker vs ITSELF   9 discordant of 50 = 18.0%   (ab 5, ba 4, exact p = 1.000)
          ratio 2.44
EXACT@6  ranker vs CONTROL  25 discordant of 50 = 50.0%
EXACT@6  ranker vs ITSELF   13 discordant of 50 = 26.0%   (ab 9, ba 4, exact p = 0.267)
          ratio 1.92
identical pick lists on 1/50 founders (2.0%)
```

The second reply is not a second treatment. It is the NULL: two samples of
one arm, on one prompt, on one pool object, in one loop iteration. If the
ranker disagrees with itself about as often as it disagrees with the score,
the head-to-head is measuring sampling noise and no n fixes it. Every prior
run of this arm sampled the model once and had no way to tell a judgement
from a coin.

The self-comparison is also a FALSIFICATION TEST of this harness: two
samples of one arm must not be significantly different from each other. An
exact p below 0.05 on the `ranker vs ITSELF` line means something in the
replay is not held constant, and the primary result must be discarded.

## Secondary — the won fund's RANK, Wilcoxon signed-rank

```
POOL rank (of 18) — the sensitive one
  n=75 non-tied pairs (0 dropped: the fund is absent from one arm's list)
  mean rank shift -0.76 (NEGATIVE favours the ranker — a lower rank is better)
  z = -0.82   p = 0.414
PUBLISHED rank (of 7)
  n=42 non-tied pairs (43 dropped: the fund is absent from one arm's list)
  mean rank shift +0.09 (NEGATIVE favours the ranker — a lower rank is better)
  z = +0.15   p = 0.881
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
| NO | 187 | 24.2% | 50% | 37 | 37.8% | 49 | 21 |
| FR | 157 | 20.3% | 25% | 17 | 17.3% | 9 | 8 |
| DE | 132 | 17.1% | 39% | 14 | 14.3% | 27 | 9 |
| CZ | 34 | 4.4% | 41% | 7 | 7.1% | 9 | 2 |
| ES | 48 | 6.2% | 54% | 6 | 6.1% | 17 | 2 |
| NL | 23 | 3.0% | 48% | 5 | 5.1% | 5 | 4 |
| IT | 69 | 8.9% | 25% | 4 | 4.1% | 9 | 1 |
| SE | 39 | 5.0% | 46% | 4 | 4.1% | 8 | 1 |
| GB | 64 | 8.3% | 5% | 2 | 2.0% | 2 | 1 |
| DK | 12 | 1.6% | 75% | 2 | 2.0% | 7 | 1 |
| EE | 4 | 0.5% | 50% | 0 | 0.0% | 0 | 0 |
| FI | 2 | 0.3% | 0% | 0 | 0.0% | 0 | 0 |
| BE | 1 | 0.1% | 0% | 0 | 0.0% | 0 | 0 |
| PT | 1 | 0.1% | 0% | 0 | 0.0% | 0 | 0 |

DE + FR hold 289 of 773 = **37.4%** of the draw, and 31 of 98 = **31.6%** of the CALLS. The unstratified described population is 53% DE+FR.

The second share is the one that matters under `ONLY_IN_POOL=1`: the in-pool
rate varies enormously by market, so a draw capped at 15% can still produce a
called set one market dominates. `MAX_COUNTRY_CALLS` is the cap on that.

## The void conditions, checked rather than promised

Every one of these is a reason the pre-registration declares the run VOID —
no conclusion of any kind. See project-mgmt/wsGA_prereg.md section 4.

| condition | | observed |
|---|---|---|
| ranker attestation clean | ok | ranker: all 773 request(s) on EMBEDDING |
| fell back on <= 5% of calls | ok | 2 of 98 (2.0%) |
| chose on >= 95% of calls | ok | 145 of 148 call(s) |
| no call cut off at max_tokens | **VOID** | read from the arm tally line above |

## Fallbacks and reach

- fell back to the shipped order: **2** of 98 call(s). A fallback publishes the CONTROL's order under the treatment's name.
- mean menu shown: 18.0 rows
- mean deepest index reached: 14.1
- exits: `agent-select exits (148 call(s) to the seam): 3 no usable pick, shipped order kept, 145 the model chose`

```
{"armOff":0,"reversed":0,"poolNotLongerThanCount":0,"menuNotLongerThanWant":0,"dryPriced":0,"noUsablePick":3,"threw":0,"chose":145}
```

## Per founder

| founder | country | accessible | won @ accessible | in pool | rank control/ranker | EUR |
|---|---|---:|---:|---:|---|---:|
| NORVENTO ENERXIA SL | ES | 94 | — | **no** | —/— | 0.0000 |
| PHILIPS ELECTRONICS NEDERLAND B.V. | NL | 43 | — | **no** | —/— | 0.0000 |
| HELSINGBORGS KOMMUN | SE | 77 | 36 | **no** | —/— | 0.0000 |
| HIGH VALUE MANUFACTURING CATAPULT | GB | 18 | — | **no** | —/— | 0.0000 |
| GLENCORE NIKKELVERK | NO | 85 | 2 | yes | 2/8 | 0.1270 |
| SOCIETE FINANCIERE BERT | FR | 107 | 9 | yes | —/— | 0.1241 |
| IMST | DE | 104 | 32 | **no** | —/— | 0.0000 |
| LINGEA S.R.O. | CZ | 69 | 23 | **no** | —/— | 0.0000 |
| QUARKSLAB | FR | 109 | 90 | **no** | —/— | 0.0000 |
| LUNDS UNIVERSITET | SE | 67 | 18 | yes | —/6 | 0.1393 |
| AMICOAT | NO | 83 | 21 | **no** | —/— | 0.0000 |
| NXP SEMICONDUCTORS GERMANY GMBH | DE | 105 | 21 | **no** | —/— | 0.0000 |
| GREENERWAVE | FR | 98 | 16 | yes | —/4 | 0.1798 |
| FORGES D'ALBERT | FR | 109 | 26 | **no** | —/— | 0.0000 |
| UNIVERSITEIT TWENTE | NL | 45 | 33 | **no** | —/— | 0.0000 |
| TECHNISCHE UNIVERSITAET DRESDEN | DE | 119 | — | **no** | —/— | 0.0000 |
| 60ND SL | ES | 93 | 4 | yes | 4/— | 0.0821 |
| KUNNSKAPSPARKEN BODØ | NO | 89 | 29 | **no** | —/— | 0.0000 |
| IDM | FR | 110 | 91 | **no** | —/— | 0.0000 |
| Latitudo 40 | IT | 74 | 66 | **no** | —/— | 0.0000 |
| FERRIERE NORD | IT | 27 | — | **no** | —/— | 0.0000 |
| CASINVENT PHARMA, A.S. | CZ | 61 | 5 | yes | 5/— | 0.1038 |
| ADTRAN NETWORKS SE | DE | 121 | 115 | **no** | —/— | 0.0000 |
| AMICOAT | NO | 90 | 6 | yes | 5/6 | 0.1023 |
| EQUINOR ENERGY | NO | 93 | 12 | yes | —/4 | 0.1103 |
| AB5 CONSULTING | GB | 18 | — | **no** | —/— | 0.0000 |
| BIOFY | NO | 91 | — | **no** | —/— | 0.0000 |
| CIOL | NO | 91 | 28 | **no** | —/— | 0.0000 |
| EFESTOS HUB | GB | 24 | — | **no** | —/— | 0.0000 |
| NORTURA | NO | 91 | 6 | yes | 6/8 | 0.0597 |
| AGOPRENE | NO | 91 | — | **no** | —/— | 0.0000 |
| CRODA EUROPE | GB | 22 | — | **no** | —/— | 0.0000 |
| STICHTING KONINKLIJK NEDERLANDS LUCHT - EN RUIMTEVAARTCENTRUM | NL | 37 | — | **no** | —/— | 0.0000 |
| FLOWPHYS | NO | 92 | 22 | **no** | —/— | 0.0000 |
| UNIVERSITA DEGLI STUDI DI MILANO | IT | 16 | — | **no** | —/— | 0.0000 |
| EQUINOR ENERGY | NO | 93 | 59 | **no** | —/— | 0.0000 |
| INTERACTIVE FULLY ELECTRICAL VEHICLES SRL | IT | 14 | — | **no** | —/— | 0.0000 |
| ALLOYED | GB | 18 | — | **no** | —/— | 0.0000 |
| KUNNSKAPSPARKEN BODØ | NO | 91 | 73 | **no** | —/— | 0.0000 |
| DIGITALTWIN TECHNOLOGY | DE | 113 | 20 | **no** | —/— | 0.0000 |
| GADS | FR | 108 | 98 | **no** | —/— | 0.0000 |
| NORWEGIAN CIRCULAR MATERIAL TECHNOLOGY | NO | 92 | 33 | **no** | —/— | 0.0000 |
| DEUTSCHES ZENTRUM FUR LUFT - UND RAUMFAHRT EV | DE | 127 | 99 | **no** | —/— | 0.0000 |
| Focused Energy GmbH | DE | 108 | 24 | **no** | —/— | 0.0000 |
| FUNDACION PRIVADA INSTITUTO DE SALUD GLOBAL BARCELONA | ES | 68 | 10 | yes | —/6 | 0.1292 |
| Fincantieri | IT | 16 | — | **no** | —/— | 0.0000 |
| ENANTIS S.R.O. | CZ | 70 | 45 | **no** | —/— | 0.0000 |
| ILICUT | FR | 109 | 35 | **no** | —/— | 0.0000 |
| AIRBUS ATLANTIC | FR | 110 | 75 | **no** | —/— | 0.0000 |
| AKER BP | NO | 92 | 83 | **no** | —/— | 0.0000 |
| EGÚ BRNO, A.S. | CZ | 70 | 8 | yes | 8/4 | 0.1519 |
| ALTERMAT | FR | 110 | 20 | **no** | —/— | 0.0000 |
| BIOFY | NO | 82 | 1 | yes | 1/4 | 0.1839 |
| C12 QUANTUM ELECTRONICS | FR | 88 | 81 | **no** | —/— | 0.0000 |
| ADJUTEC PHARMA | NO | 92 | 9 | yes | 7/4 | 0.1550 |
| GEORGSMARIENHUTTE | DE | 115 | 34 | **no** | —/— | 0.0000 |
| Paques Biomaterials B.V. | NL | 43 | 11 | yes | —/— | 0.0838 |
| Beyond Leather Materials ApS | DK | 27 | — | **no** | —/— | 0.0000 |
| AVA OCEAN | NO | 91 | 11 | yes | —/4 | 0.0442 |
| SOGEI SOCIETA GENERALE D INFORMATICA | IT | 69 | — | **no** | —/— | 0.0000 |
| FORNYBARAKADEMIET | NO | 93 | 1 | yes | 1/2 | 0.0680 |
| AGROSOFT TÁBOR, S.R.O. | CZ | 70 | 3 | yes | 3/8 | 0.0912 |
| HQS QUANTUM SIMULATIONS GMBH | DE | 107 | 17 | yes | —/1 | 0.1935 |
| FIBERCOP | IT | 25 | — | **no** | —/— | 0.0000 |
| NUROMEDIA | DE | 114 | 38 | **no** | —/— | 0.0000 |
| ALSTOM TRANSPORT SA | FR | 103 | 65 | **no** | —/— | 0.0000 |
| FORTecH Software GmbH | DE | 120 | 2 | yes | 2/1 | 0.1413 |
| FUNDACION I+D AUTOMOCION Y MECATRONICA | ES | 60 | 7 | yes | 7/5 | 0.1748 |
| TERMIZO A.S. | CZ | 63 | 39 | **no** | —/— | 0.0000 |
| PREMIER TECH EAU ET ENVIRONNEMENT | FR | 109 | 94 | **no** | —/— | 0.0000 |
| SAFRAN DATA SYSTEMS | FR | 99 | 9 | yes | 8/— | 0.1397 |
| ARCTIC ENERGY PARTNERS | NO | 93 | 7 | yes | 6/7 | 0.0641 |
| aiXscale Photonics GmbH | DE | 119 | — | **no** | —/— | 0.0000 |
| CZ TECH | NO | 93 | 73 | **no** | —/— | 0.0000 |
| FUNDACIO EURECAT | ES | 65 | — | **no** | —/— | 0.0000 |
| NEXT GENERATION SENSORS BV | NL | 39 | 5 | yes | 5/5 | 0.1908 |
| FLOWPHYS | NO | 84 | 36 | **no** | —/— | 0.0000 |
| ASPLAN VIAK | NO | 91 | 13 | yes | —/6 | 0.1052 |
| ANIMALIA | NO | 91 | 1 | yes | 1/1 | 0.0556 |
| PIAGGIO AERO INDUSTRIES | IT | 78 | 28 | **no** | —/— | 0.0000 |
| Induo | FR | 102 | 80 | **no** | —/— | 0.0000 |
| ACTIA AUTOMOTIVE | FR | 109 | 8 | yes | 8/4 | 0.0751 |
| FAIRMAT SAS | FR | 96 | — | **no** | —/— | 0.0000 |
| DEUTSCHES ZENTRUM FUR LUFT - UND RAUMFAHRT EV | DE | 120 | — | **no** | —/— | 0.0000 |
| ALFA LAVAL GOLBEY SAS | FR | 103 | 76 | **no** | —/— | 0.0000 |
| DNV IMATIS | NO | 90 | 9 | yes | 8/— | 0.1038 |
| BOEING UNITED KINGDOM | GB | 24 | — | **no** | —/— | 0.0000 |
| ARISTON | IT | 35 | — | **no** | —/— | 0.0000 |
| AF DECOM | NO | 91 | — | **no** | —/— | 0.0000 |
| ENERGY TRANSITION NORWAY | NO | 92 | 87 | **no** | —/— | 0.0000 |
| LUTECH SPA | IT | 59 | — | **no** | —/— | 0.0000 |
| SYNPO, AKCIOVÁ SPOLEČNOST | CZ | 70 | 41 | **no** | —/— | 0.0000 |
| TGS PREDIKTOR | NO | 83 | 25 | **no** | —/— | 0.0000 |
| FICONTEC SERVICE GMBH | DE | 119 | 2 | yes | 2/2 | 0.1326 |
| VÝZKUMNÝ ÚSTAV STAVEBNÍCH HMOT,A.S. | CZ | 56 | 16 | yes | —/— | 0.2034 |
| ACTIA AUTOMOTIVE | FR | 109 | 20 | **no** | —/— | 0.0000 |
| ASS VAL'HOR | FR | 102 | 17 | yes | —/— | 0.2210 |
| EQUINOR ENERGY | NO | 93 | 44 | **no** | —/— | 0.0000 |
| ADDITIVE MANUFACTURING SOLUTIONS LTD | GB | 17 | — | **no** | —/— | 0.0000 |
| ASM TERNI | IT | 24 | — | **no** | —/— | 0.0000 |
| NEXTWORKS | IT | 78 | 22 | **no** | —/— | 0.0000 |
| 3B FIBREGLASS NORWAY | NO | 83 | — | **no** | —/— | 0.0000 |
| SILIOS TECHNOLOGIES | FR | 98 | 29 | **no** | —/— | 0.0000 |
| ROOFLINEAI GMBH | DE | 119 | 26 | **no** | —/— | 0.0000 |
| NC SPECTRUM | NO | 91 | 8 | yes | 8/— | 0.0713 |
| AGREKA BUILD | GB | 24 | — | **no** | —/— | 0.0000 |
| OIVI | NO | 90 | 1 | yes | 1/1 | 0.1856 |
| BASQUEVOLT SA | ES | 94 | — | **no** | —/— | 0.0000 |
| BP EUROPA SE | DE | 114 | 9 | yes | —/— | 0.1588 |
| BITPET | NO | 91 | — | **no** | —/— | 0.0000 |
| CRYTUR, SPOL. S R.O. | CZ | 60 | 22 | **no** | —/— | 0.0000 |
| CARIAD SE | DE | 105 | 35 | **no** | —/— | 0.0000 |
| SAINT DIZIER ENVIRONNEMENT | FR | 110 | 92 | **no** | —/— | 0.0000 |
| A.M.L. MICROTECHNIQUE LORRAINE | FR | 100 | 7 | yes | 6/2 | 0.1117 |
| ADIONICS | FR | 109 | 88 | **no** | —/— | 0.0000 |
| PRONOE | FR | 100 | 70 | **no** | —/— | 0.0000 |
| ELKEM | NO | 83 | 13 | yes | —/4 | 0.1013 |
| EMBEDDED BRAINS | DE | 129 | 101 | **no** | —/— | 0.0000 |
| CTD | NO | 89 | 82 | **no** | —/— | 0.0000 |
| ACS SOLUTIONS | DE | 129 | 119 | **no** | —/— | 0.0000 |
| TECHFEM | IT | 75 | 12 | yes | —/— | 0.1607 |
| MER MEC ENGINEERING | IT | 73 | 27 | **no** | —/— | 0.0000 |
| EXEMPLAS | GB | 22 | — | **no** | —/— | 0.0000 |
| MYWORKOUT | NO | 90 | 8 | yes | 7/5 | 0.0687 |
| AEROSPACE VALLEY | FR | 108 | 31 | **no** | —/— | 0.0000 |
| LUNDS UNIVERSITET | SE | 69 | 36 | **no** | —/— | 0.0000 |
| ABB | GB | 23 | — | **no** | —/— | 0.0000 |
| BRISTOL BATH REGIONAL CAPITAL | GB | 18 | — | **no** | —/— | 0.0000 |
| AEROTEX | GB | 24 | — | **no** | —/— | 0.0000 |
| CERMAQ NORWAY | NO | 90 | 2 | yes | 2/2 | 0.0584 |
| Cisteo MEDICAL | FR | 108 | 92 | **no** | —/— | 0.0000 |
| FRANZ SCHMIDT HAENSCH GMBH CO | DE | 107 | 4 | yes | 4/8 | 0.0745 |
| ELEKTROBIT AUTOMOTIVE | DE | 125 | 106 | **no** | —/— | 0.0000 |
| Aubert & Duval | FR | 98 | 19 | **no** | —/— | 0.0000 |
| 2FREEDOM IMAGING SOFTWARE AND HARDWARE | ES | 94 | 2 | yes | 2/3 | 0.1385 |
| FRAUNHOFER GESELLSCHAFT ZUR FORDERUNG DER ANGEWANDTEN FORSCHUNG EV | DE | 76 | — | **no** | —/— | 0.0000 |
| Seep | GB | 24 | 4 | yes | 4/6 | 0.1059 |
| CIRCULAR NORWAY | NO | 93 | 39 | **no** | —/— | 0.0000 |
| REPSOL EXPLORACION SA | ES | 94 | — | **no** | —/— | 0.0000 |
| INESAN, S.R.O. | CZ | 71 | 48 | **no** | —/— | 0.0000 |
| ARGYLL AND BUTE COUNCIL | GB | 23 | — | **no** | —/— | 0.0000 |
| SATT NOD | FR | 108 | 89 | **no** | —/— | 0.0000 |
| LABORD GLUECOM FRANCE | FR | 109 | 5 | yes | 5/— | 0.1777 |
| AKER SOLUTIONS HYDROPOWER | NO | 93 | 35 | **no** | —/— | 0.0000 |
| EAST MIDLANDS CHAMBER | GB | 19 | — | **no** | —/— | 0.0000 |
| ARIANEGROUP | DE | 118 | 2 | yes | 2/1 | 0.0613 |
| AEROSPAZIO TECNOLOGIE | IT | 78 | 4 | yes | 4/7 | 0.2010 |
| AUGMENTCITY | NO | 91 | 81 | **no** | —/— | 0.0000 |
| FALKOR | NO | 91 | 21 | **no** | —/— | 0.0000 |
| WELL ID | NO | 90 | 17 | yes | —/— | 0.0721 |
| CULTIMATE FOODS | DE | 115 | — | **no** | —/— | 0.0000 |
| INES PLATEFORME FORMATION EVALUATION | FR | 101 | 96 | **no** | —/— | 0.0000 |
| TELEFONICA INNOVACION DIGITAL SL | ES | 94 | 5 | yes | 5/8 | 0.1722 |
| HERIOT WATT UNIVERSITY THE | GB | 16 | — | **no** | —/— | 0.0000 |
| Diehl Aviation Laupheim GmbH | DE | 121 | — | **no** | —/— | 0.0000 |
| COMPOUND SEMICONDUCTOR APPLICATIONS CATAPULT | GB | 22 | — | **no** | —/— | 0.0000 |
| ALSYMEX | FR | 108 | 10 | yes | —/— | 0.2053 |
| WISE SRL | IT | 15 | — | **no** | —/— | 0.0000 |
| SPHERICAL SYSTEMS BV | NL | 34 | — | **no** | —/— | 0.0000 |
| ONIO | NO | 92 | 36 | **no** | —/— | 0.0000 |
| LEONARDO -SOCIETA PER AZIONI | IT | 24 | 5 | yes | 5/8 | 0.1076 |
| SCANDINAVIAN REAL HEART AB | SE | 74 | 17 | yes | —/6 | 0.1882 |
| FREEN OÜ | EE | 66 | 25 | **no** | —/— | 0.0000 |
| VAIMOO | IT | 79 | 35 | **no** | —/— | 0.0000 |
| ANIMAJ | FR | 101 | 86 | **no** | —/— | 0.0000 |
| INSTITUT DE RECHERCHE POUR LE DEVELOPPEMENT | FR | 95 | 23 | **no** | —/— | 0.0000 |
| Siemens | DE | 112 | 38 | **no** | —/— | 0.0000 |
| ERICSSON TELECOMUNICAZIONI | IT | 76 | 1 | yes | 1/1 | 0.1575 |
| SARL LES VIGNES | FR | 101 | 85 | **no** | —/— | 0.0000 |
| SOLUTION SEEKER | NO | 89 | 1 | yes | 1/8 | 0.0445 |
| BEYONDER | NO | 85 | 1 | yes | 1/1 | 0.0467 |
| 2PD Ltd | GB | 21 | — | **no** | —/— | 0.0000 |
| 77 FOODS | FR | 100 | 85 | **no** | —/— | 0.0000 |
| AKKODIS DIGITAL | FR | 100 | 54 | **no** | —/— | 0.0000 |
| AKIGAI | NO | 90 | 7 | yes | 6/2 | 0.0435 |
| AEON ENGINEERING | GB | 16 | — | **no** | —/— | 0.0000 |
| PLASMASOLVE S.R.O. | CZ | 70 | 37 | **no** | —/— | 0.0000 |
| AKER SOLUTIONS | NO | 92 | 1 | yes | 1/1 | 0.0387 |
| ION-X SAS | FR | 92 | 75 | **no** | —/— | 0.0000 |
| ASOCIACION EMPRESARIAL DE INVESTIGACION CENTRO TECNOLOGICO DEL MUEBLE Y LA MADERA DE LA REGION DE MURCIA | ES | 73 | — | **no** | —/— | 0.0000 |
| ACTA MOBILIER | FR | 101 | 15 | yes | —/— | 0.1520 |
| SKIS ROSSIGNOL - CLUB ROSSIGNOL | FR | 98 | 85 | **no** | —/— | 0.0000 |
| BENCHMARK GENETICS NORWAY | NO | 91 | 1 | yes | 1/1 | 0.0287 |
| PHENIX GROUPE | FR | 108 | 96 | **no** | —/— | 0.0000 |
| APTUNION INDUSTRIE | FR | 102 | 4 | yes | 4/3 | 0.0528 |
| ACTIA AUTOMOTIVE | FR | 109 | 49 | **no** | —/— | 0.0000 |
| ASGARD THERAPEUTICS AB | SE | 72 | 3 | yes | 3/3 | 0.0801 |
| AQDOT | GB | 24 | — | **no** | —/— | 0.0000 |
| AARHUS UNIVERSITETSHOSPITAL | DK | 23 | 2 | yes | 2/7 | 0.0387 |
| CARONTE TOURIST | IT | 75 | 19 | **no** | —/— | 0.0000 |
| AVATAR MEDICAL | FR | 99 | 14 | yes | —/— | 0.0793 |
| MENLO SYSTEMS GMBH | DE | 111 | 7 | yes | 6/4 | 0.0369 |
| ALL SEEING EYE LTD | GB | 22 | — | **no** | —/— | 0.0000 |
| UNIVERSITAIR MEDISCH CENTRUM UTRECHT | NL | 44 | 9 | yes | 8/3 | 0.0463 |
| CENTRUM VÝZKUMU ŘEŽ S.R.O. | CZ | 70 | 14 | yes | —/— | 0.0345 |
| Ceus UG (haftungsbeschränkt) | DE | 113 | 2 | yes | 2/2 | 0.0924 |
| WARTSILA ITALIA | IT | 17 | — | **no** | —/— | 0.0000 |
| MUNIC | FR | 107 | 104 | **no** | —/— | 0.0000 |
| 7SENSE AGRITECH | NO | 91 | — | **no** | —/— | 0.0000 |
| MARTEL INNOVATE BV | NL | 47 | 29 | **no** | —/— | 0.0000 |
| DOSCON | NO | 93 | 25 | **no** | —/— | 0.0000 |
| HYDRONAUT PROJECT A.S. | CZ | 69 | 38 | **no** | —/— | 0.0000 |
| CONCULAR | DE | 126 | 115 | **no** | —/— | 0.0000 |
| SURFIX | NL | 33 | 2 | yes | 2/3 | 0.0471 |
| VALEO SCHALTER UND SENSOREN | DE | 114 | 40 | **no** | —/— | 0.0000 |
| SENSOCURE | NO | 82 | 38 | **no** | —/— | 0.0000 |
| FACTIVERSE | NO | 90 | 6 | yes | 5/6 | 0.0402 |
| 3D COMPONENTS | NO | 84 | 15 | yes | —/— | 0.0314 |
| KODETRACER | NO | 89 | 11 | yes | —/— | 0.0394 |
| DIPS | NO | 90 | 11 | yes | —/— | 0.0303 |
| IADYS | FR | 98 | 7 | yes | 7/1 | 0.0569 |
| BEEFUTURES HOLDING | NO | 82 | 5 | yes | 5/— | 0.0247 |
| QUOBLY | FR | 98 | 81 | **no** | —/— | 0.0000 |
| FFT PRODUKTIONSSYSTEME | DE | 107 | 39 | **no** | —/— | 0.0000 |
| CRCAM NORD MIDI PYRENEES | FR | 110 | 20 | **no** | —/— | 0.0000 |
| UNIVERSIDAD POLITECNICA DE MADRID | ES | 68 | 21 | **no** | —/— | 0.0000 |
| AD HOC MARINE DESIGNS | GB | 22 | — | **no** | —/— | 0.0000 |
| BOLIGMAPPA | NO | 90 | 1 | yes | 1/1 | 0.0492 |
| KATAPULT IMPACT PLATFORM | NO | 83 | 20 | **no** | —/— | 0.0000 |
| FUNDACION CENER | ES | 72 | 10 | yes | —/— | 0.0984 |
| CONSIGLIO NAZIONALE DELLE RICERCHE | IT | 16 | — | **no** | —/— | 0.0000 |
| CORVUS ENERGY FUEL CELL | NO | 94 | — | **no** | —/— | 0.0000 |
| FINANCE INNOVATION | NO | 81 | 3 | yes | 3/— | 0.0449 |
| CAMBRIDGE ELECTRIC CEMENT | GB | 18 | — | **no** | —/— | 0.0000 |
| FLUIDECT GMBH | DE | 108 | 28 | **no** | —/— | 0.0000 |
| HYSYTECH | IT | 26 | — | **no** | —/— | 0.0000 |
| CEMONITE | NO | 83 | 18 | yes | —/5 | 0.0282 |
| CORTICALIS | NO | 83 | 23 | **no** | —/— | 0.0000 |
| A HEALTHIER EARTH | GB | 23 | — | **no** | —/— | 0.0000 |
| BRUKER NANO | DE | 128 | 3 | yes | 3/4 | 0.0939 |
| ADVANCED SURFACE PLATING ApS | DK | 32 | 7 | yes | 7/4 | 0.0978 |
| ELKEM | NO | 83 | 74 | **no** | —/— | 0.0000 |
| AXON CABLE | FR | 99 | 5 | yes | 5/8 | 0.0817 |
| EURO WIPES | FR | 110 | 58 | **no** | —/— | 0.0000 |
| BASEMARK OY | FI | 31 | — | **no** | —/— | 0.0000 |
| SCANIA CV | SE | 71 | 13 | yes | —/7 | 0.0354 |
| MARITIME ROBOTICS | NO | 91 | 1 | yes | 1/1 | 0.0296 |
| DEUTSCHES ZENTRUM FUR LUFT - UND RAUMFAHRT EV | DE | 127 | 22 | **no** | —/— | 0.0000 |
| EXACT THERAPEUTICS | NO | 91 | 1 | yes | 1/3 | 0.0402 |
| KUNNSKAPSPARKEN BODØ | NO | 91 | 62 | **no** | —/— | 0.0000 |
| VOLVO TECHNOLOGY | SE | 77 | 24 | **no** | —/— | 0.0000 |
| MOTEURS LEROY SOMER | FR | 91 | — | **no** | —/— | 0.0000 |
| SASMINIMUM | FR | 92 | 16 | yes | —/— | 0.1222 |
| B A U M CONSULT | DE | 127 | 54 | **no** | —/— | 0.0000 |
| SOLARLITE CSP TECHNOLOGY | DE | 114 | 7 | yes | 7/3 | 0.0382 |
| 3D MEDICAL | FR | 99 | 10 | yes | —/4 | 0.1097 |
| CENTRUM VÝZKUMU ŘEŽ S.R.O. | CZ | 71 | 3 | yes | 3/2 | 0.0412 |
| VITESCO TECHNOLOGIES | DE | 117 | 32 | **no** | —/— | 0.0000 |
| 28X | GB | 22 | — | **no** | —/— | 0.0000 |
| GAS AND HEAT S.P.A. | IT | 28 | — | **no** | —/— | 0.0000 |
| HYDROGENIOUS LOHC TECHNOLOGIES GMBH | DE | 121 | 89 | **no** | —/— | 0.0000 |
| ALTILIUM METALS | GB | 18 | — | **no** | —/— | 0.0000 |
| INOCURE S.R.O. | CZ | 70 | 42 | **no** | —/— | 0.0000 |
| COMPUTERWELL | NO | 89 | 17 | yes | —/— | 0.0785 |
| LUNDS UNIVERSITET | SE | 68 | 45 | **no** | —/— | 0.0000 |
| BASELL POLYOLEFINE GMBH | DE | 114 | 12 | yes | —/— | 0.0918 |
| ALIVE LABS | GB | 24 | — | **no** | —/— | 0.0000 |
| Heimann Sensor GmbH | DE | 107 | 6 | yes | 6/— | 0.0894 |
| ADJUCOR GMBH | DE | 122 | 113 | **no** | —/— | 0.0000 |
| BLYKALLA AB | SE | 66 | 31 | **no** | —/— | 0.0000 |
| PRO LIGNUM | FR | 90 | 76 | **no** | —/— | 0.0000 |
| VÚTS, A.S. | CZ | 63 | 40 | **no** | —/— | 0.0000 |
| BAIKOWSKI | FR | 100 | 83 | **no** | —/— | 0.0000 |
| ABERDEEN HARBOUR BOARD | GB | 25 | — | **no** | —/— | 0.0000 |
| CUBOGAS S.R.L. | IT | 79 | 23 | **no** | —/— | 0.0000 |
| DENS | NL | 46 | 24 | **no** | —/— | 0.0000 |
| CIRCLE | FR | 90 | 76 | **no** | —/— | 0.0000 |
| FRAUNHOFER GESELLSCHAFT ZUR FORDERUNG DER ANGEWANDTEN FORSCHUNG EV | DE | 76 | 22 | **no** | —/— | 0.0000 |
| LEARN & GO | FR | 107 | 90 | **no** | —/— | 0.0000 |
| COMMISSARIAT A L ENERGIE ATOMIQUE ET AUX ENERGIES ALTERNATIVES | FR | 95 | 14 | yes | —/5 | 0.0338 |
| CLOUD CYCLE LTD | GB | 18 | — | **no** | —/— | 0.0000 |
| ZF FRIEDRICHSHAFEN | DE | 109 | 57 | **no** | —/— | 0.0000 |
| REINOVA | IT | 77 | 32 | **no** | —/— | 0.0000 |
| Siemens | DE | 113 | 9 | yes | 8/— | 0.0401 |
| ANGIOLUTIONS GMBH | DE | 122 | 52 | **no** | —/— | 0.0000 |
| Matoha | GB | 18 | 2 | yes | 2/5 | 0.1211 |
| ARKEMA FRANCE SA | FR | 104 | 61 | **no** | —/— | 0.0000 |
| Twenty-One Semiconductors | DE | 117 | 37 | **no** | —/— | 0.0000 |
| NABOLAGSHAGER | NO | 90 | 41 | **no** | —/— | 0.0000 |
| AMADEUS | FR | 106 | 76 | **no** | —/— | 0.0000 |
| AEROSPACE VALLEY | FR | 107 | 42 | **no** | —/— | 0.0000 |
| AVIANT | NO | 91 | — | **no** | —/— | 0.0000 |
| DISTRO | FR | 109 | 100 | **no** | —/— | 0.0000 |
| AF OFFSHORE DECOM | NO | 93 | 3 | yes | 3/2 | 0.0419 |
| PACERTOOL | NO | 90 | 22 | **no** | —/— | 0.0000 |
| AKKODIS INGENIERIE PRODUIT | FR | 101 | 1 | yes | 1/3 | 0.0547 |
| KAROLINSKA INSTITUTET | SE | 68 | 34 | **no** | —/— | 0.0000 |
| AVL DEUTSCHLAND | DE | 113 | 52 | **no** | —/— | 0.0000 |
| Bioomix ApS | DK | 27 | — | **no** | —/— | 0.0000 |
| INSTITUT DE RECHERCHE POUR LE DEVELOPPEMENT | FR | 95 | 22 | **no** | —/— | 0.0000 |
| CODASIP GMBH | DE | 101 | 3 | yes | 3/1 | 0.0946 |
| LUNDS UNIVERSITET | SE | 76 | 36 | **no** | —/— | 0.0000 |
| AURA AERO SAS | FR | 90 | 31 | **no** | —/— | 0.0000 |
| ERASMUS UNIVERSITAIR MEDISCH CENTRUM ROTTERDAM | NL | 44 | 9 | yes | 8/4 | 0.0861 |
| ÅKP | NO | 91 | 73 | **no** | —/— | 0.0000 |
| BIOME TECHNOLOGIES | GB | 17 | — | **no** | —/— | 0.0000 |
| AURORA PROPULSION TECHNOLOGIES OY | FI | 34 | — | **no** | —/— | 0.0000 |
| AKER SOLUTIONS | NO | 92 | 15 | yes | —/3 | 0.0624 |
| ELFLY | NO | 93 | 2 | yes | 2/1 | 0.0675 |
| 4MOST EUROPE | GB | 17 | — | **no** | —/— | 0.0000 |
| BIRMINGHAM CHAMBER OF COMMERCE | GB | 14 | — | **no** | —/— | 0.0000 |
| AGENTFLY TECHNOLOGIES S.R.O. | CZ | 72 | 12 | yes | —/— | 0.0937 |
| ORKLA FOODS NORGE | NO | 91 | 3 | yes | 3/— | 0.0000 |
| KELDA DYNAMICS | NO | 91 | 22 | **no** | —/— | 0.0000 |
| Frontgrade Gaisler AB | SE | 63 | 20 | **no** | —/— | 0.0000 |
| INSTITUT DE RECHERCHE TECHNOLOGIQUE JULES VERNE | FR | 84 | — | **no** | —/— | 0.0000 |
| AI|FFINITY S.R.O. | CZ | 70 | 1 | yes | 1/— | 0.0000 |
| ESTABANELL Y PAHISA ENERGIA | ES | 102 | 9 | yes | 8/— | 0.0000 |
| AALBORG KOMMUNE | DK | 26 | 4 | yes | 4/— | 0.0000 |
| KONGSBERG MARITIME | NO | 91 | 1 | yes | 1/— | 0.0000 |
| VALO VERTE | FR | 109 | 12 | yes | —/— | 0.0000 |
| BARCELONA SUPERCOMPUTING CENTER CENTRO NACIONAL DE SUPERCOMPUTACION | ES | 95 | 26 | **no** | —/— | 0.0000 |
| VÝZKUMNÝ ÚSTAV STAVEBNÍCH HMOT,A.S. | CZ | 57 | 1 | yes | 1/— | 0.0000 |
| VALEO EAUTOMOTIVE GERMANY | DE | 109 | 3 | yes | 3/— | 0.0000 |
| InBiot | ES | 94 | — | **no** | —/— | 0.0000 |
| Cemecon Scandinavia A/S | DK | 22 | 2 | yes | 2/— | 0.0000 |
| NAVAL GROUP | FR | 99 | 85 | **no** | —/— | 0.0000 |
| ACITURRI ENGINEERING | ES | 99 | 3 | yes | 3/— | 0.0000 |
| FISKÅ MØLLE | NO | 83 | 40 | **no** | —/— | 0.0000 |
| ARCTIC KNOWLEDGE | NO | 91 | 52 | **no** | —/— | 0.0000 |
| BARCELONA SUPERCOMPUTING CENTER CENTRO NACIONAL DE SUPERCOMPUTACION | ES | 86 | — | **no** | —/— | 0.0000 |
| FILIATER | FR | 91 | 77 | **no** | —/— | 0.0000 |
| ASML Berlin GmbH | DE | 111 | 1 | yes | 1/— | 0.0000 |
| FALKOR | NO | 90 | 24 | **no** | —/— | 0.0000 |
| CU SERVICES LIMITED | GB | 17 | — | **no** | —/— | 0.0000 |
| 50HERTZ TRANSMISSION | DE | 116 | 7 | yes | 7/— | 0.0000 |
| INSTITUT TECHNOLOGIQUE FCBA (FORET CELLULOSE BOIS...) | FR | 90 | 76 | **no** | —/— | 0.0000 |
| SAFETEC NORDIC | NO | 94 | 27 | **no** | —/— | 0.0000 |
| 3T ADDITIVE MANUFACTURING | GB | 24 | — | **no** | —/— | 0.0000 |
| FUNDACION TECNOLOGICA ADVANTX | ES | 60 | 1 | yes | 1/— | 0.0000 |
| RISE RESEARCH INSTITUTES OF SWEDEN AB | SE | 72 | 21 | **no** | —/— | 0.0000 |
| BATTOLYSER HOLDING BV | NL | 37 | — | **no** | —/— | 0.0000 |
| BABYSENSOR | NO | 90 | 8 | yes | 7/— | 0.0000 |
| GRAYN | NO | 90 | 74 | **no** | —/— | 0.0000 |
| ENOSIS | FR | 109 | 91 | **no** | —/— | 0.0000 |
| KLOSSER INNOVASJON | NO | 89 | 83 | **no** | —/— | 0.0000 |
| VERKOR | FR | 110 | — | **no** | —/— | 0.0000 |
| AVERBIS | DE | 126 | 20 | **no** | —/— | 0.0000 |
| LAFARGE GRANULATS | FR | 101 | 86 | **no** | —/— | 0.0000 |
| DESTINUS SPAIN | ES | 100 | 4 | yes | 4/— | 0.0000 |
| AIXTRON SE | DE | 109 | 29 | **no** | —/— | 0.0000 |
| EXCESS ENGINEERING | NO | 83 | 1 | yes | 1/— | 0.0000 |
| LIVEEO GMBH | DE | 119 | 5 | yes | 5/— | 0.0000 |
| EGÚ BRNO, A.S. | CZ | 62 | 35 | **no** | —/— | 0.0000 |
| CENATE | NO | 85 | 16 | yes | —/— | 0.0000 |
| PEGAS NONWOVENS S.R.O. | CZ | 62 | 1 | yes | 1/— | 0.0000 |
| TERRITOIRE D'ENERGIE SOMME | FR | 109 | 12 | yes | —/— | 0.0000 |
| KLOSSER INNOVASJON | NO | 90 | 78 | **no** | —/— | 0.0000 |
| STMICROELECTRONICS FRANCE | FR | 96 | — | **no** | —/— | 0.0000 |
| ABORA ENERGY SOCIEDAD LIMITADA | ES | 102 | 5 | yes | 5/— | 0.0000 |
| GVS | IT | 26 | — | **no** | —/— | 0.0000 |
| FRAUNHOFER GESELLSCHAFT ZUR FORDERUNG DER ANGEWANDTEN FORSCHUNG EV | DE | 76 | — | **no** | —/— | 0.0000 |
| CENTRO NACIONAL DE TECNOLOGIA Y SEGURIDAD ALIMENTARIA | ES | 88 | 11 | yes | —/— | 0.0000 |
| UNIVERSITA COMMERCIALE LUIGI BOCCONI | IT | 69 | 9 | yes | 7/— | 0.0000 |
| WALTER TOSTO | IT | 88 | 30 | **no** | —/— | 0.0000 |
| DNV | NO | 92 | 29 | **no** | —/— | 0.0000 |
| BULL SAS | FR | 91 | 77 | **no** | —/— | 0.0000 |
| Cargill Deutschland GmbH | DE | 113 | 15 | yes | —/— | 0.0000 |
| EVYON | NO | 85 | 11 | yes | —/— | 0.0000 |
| FLENDER GMBH | DE | 101 | — | **no** | —/— | 0.0000 |
| SOPHIA HIGH TECH | IT | 76 | 17 | yes | —/— | 0.0000 |
| CTD | NO | 91 | 20 | **no** | —/— | 0.0000 |
| AQUAPRO | NO | 91 | 9 | yes | —/— | 0.0000 |
| DIOXYCLE | FR | 91 | 76 | **no** | —/— | 0.0000 |
| TEEM PHOTONICS | FR | 109 | 107 | **no** | —/— | 0.0000 |
| ASGARD THERAPEUTICS AB | SE | 72 | 7 | yes | 7/— | 0.0000 |
| G E O S INGENIEURGESELLSCHAFT MBH | DE | 110 | 24 | **no** | —/— | 0.0000 |
| VÝZKUMNÝ A ZKUŠEBNÍ ÚSTAV PLZEŇ S.R.O. | CZ | 63 | 38 | **no** | —/— | 0.0000 |
| AGENTFLY TECHNOLOGIES S.R.O. | CZ | 71 | 15 | yes | —/— | 0.0000 |
| CIPHERBIT SLU | ES | 94 | 9 | yes | —/— | 0.0000 |
| Merck Electronics KGaA | DE | 99 | 17 | yes | —/— | 0.0000 |
| ADHEX TECHNOLOGIES | FR | 100 | 24 | **no** | —/— | 0.0000 |
| RECYC ELIT | FR | 111 | 98 | **no** | —/— | 0.0000 |
| DSI AEROSPACE | DE | 111 | 7 | yes | 6/— | 0.0000 |
| ADVANCED MANUFACTURING SHEFFIELD | GB | 24 | — | **no** | —/— | 0.0000 |
| BIOSYNTHIS | FR | 100 | 19 | **no** | —/— | 0.0000 |
| A.V. SIMULATION | FR | 108 | 9 | yes | —/— | 0.0000 |
| VEGEA | IT | 79 | 2 | yes | 2/— | 0.0000 |
| BLIXT TECH AB | SE | 72 | 64 | **no** | —/— | 0.0000 |
| ASCENDANCE FLIGHT TECHNOLOGIES | FR | 98 | 95 | **no** | —/— | 0.0000 |
| CONSTELLR GMBH | DE | 110 | 4 | yes | 4/— | 0.0000 |
| MECACHROME FRANCE | FR | 96 | 6 | yes | 6/— | 0.0000 |
| INCLUSIVE CREATION | NO | 91 | 11 | yes | —/— | 0.0000 |
| CENTROTHERM INTERNATIONAL | DE | 110 | 19 | **no** | —/— | 0.0000 |
| MAGTEL OPERACIONES | ES | 108 | 18 | yes | —/— | 0.0000 |
| AQUALUNG CARBON CAPTURE | NO | 85 | — | **no** | —/— | 0.0000 |
| A G H T MILES | GB | 18 | — | **no** | —/— | 0.0000 |
| CEALTECH | NO | 85 | 16 | yes | —/— | 0.0000 |
| Polyperception | BE | 31 | 21 | **no** | —/— | 0.0000 |
| ASISTOBE | NO | 83 | — | **no** | —/— | 0.0000 |
| ALCOA NORWAY | NO | 93 | — | **no** | —/— | 0.0000 |
| UNIVERSIDAD POLITECNICA DE MADRID | ES | 69 | 23 | **no** | —/— | 0.0000 |
| JOTUN | NO | 90 | — | **no** | —/— | 0.0000 |
| ALGINOR BIOREFINERY | NO | 82 | — | **no** | —/— | 0.0000 |
| CRUARD CHARPENTE ET CONSTRUCTION BOIS | FR | 90 | 79 | **no** | —/— | 0.0000 |
| HENNLICH S.R.O. | CZ | 64 | 26 | **no** | —/— | 0.0000 |
| AGOPRENE | NO | 91 | 63 | **no** | —/— | 0.0000 |
| DEUTSCHE POST | DE | 114 | 7 | yes | 6/— | 0.0000 |
| JOTUN | NO | 83 | 2 | yes | 2/— | 0.0000 |
| BAYERISCHE AKADEMIE DER WISSENSCHAFTEN | DE | 126 | 1 | yes | 1/— | 0.0000 |
| WAGENINGEN UNIVERSITY | NL | 40 | 24 | **no** | —/— | 0.0000 |
| UNIVERSITE COTE D'AZUR | FR | 78 | 65 | **no** | —/— | 0.0000 |
| FUTURASUN HOLDING SRL | IT | 64 | — | **no** | —/— | 0.0000 |
| LEDE | NO | 93 | 39 | **no** | —/— | 0.0000 |
| ACORAI AB | SE | 72 | 4 | yes | 4/— | 0.0000 |
| AINIA | ES | 95 | 1 | yes | 1/— | 0.0000 |
| COMTES FHT A.S. | CZ | 63 | 22 | **no** | —/— | 0.0000 |
| RATIER-FIGEAC | FR | 96 | 6 | yes | 6/— | 0.0000 |
| AERNNOVA COMPOSITES ILLESCAS SA | ES | 99 | 2 | yes | 2/— | 0.0000 |
| MINE STORAGE INTERNATIONAL AB | SE | 73 | 7 | yes | —/— | 0.0000 |
| BOUYGUES IMMOBILIER | FR | 108 | 30 | **no** | —/— | 0.0000 |
| ACTYX | DE | 127 | 121 | **no** | —/— | 0.0000 |
| VIVALYX GMBH | DE | 112 | 108 | **no** | —/— | 0.0000 |
| GOLIVER THERAPEUTICS | FR | 99 | 84 | **no** | —/— | 0.0000 |
| EURIX | IT | 24 | — | **no** | —/— | 0.0000 |
| ECOFUEL LABORATORIES S.R.O. | CZ | 62 | 25 | **no** | —/— | 0.0000 |
| STATWOLF DATA SCIENCE S.R.L. | IT | 23 | — | **no** | —/— | 0.0000 |
| ASOCIACION DE INVESTIGACION METALURGICA DEL NOROESTE | ES | 67 | — | **no** | —/— | 0.0000 |
| Scienion GmbH | DE | 111 | 2 | yes | 2/— | 0.0000 |
| BERNHARD NOCHT INSTITUT FUER TROPENMEDIZIN | DE | 76 | 2 | yes | 2/— | 0.0000 |
| CENTRUM VÝZKUMU ŘEŽ S.R.O. | CZ | 69 | 36 | **no** | —/— | 0.0000 |
| ÚJV ŘEŽ, A. S. | CZ | 71 | 46 | **no** | —/— | 0.0000 |
| AVIANT | NO | 90 | 69 | **no** | —/— | 0.0000 |
| AVINOR | NO | 91 | 2 | yes | 2/— | 0.0000 |
| CLUSTER PARA LA MINERIA SOSTENIBLE Y SERVICIOS ASOCIADOS DE LA PENINSULA IBERICA IBERIAN SUSTAINABLE MINING CLUSTER | ES | 94 | — | **no** | —/— | 0.0000 |
| EODYNE SYSTEMS SL | ES | 93 | 3 | yes | 3/— | 0.0000 |
| UNIVERSITA DEGLI STUDI DI CATANIA | IT | 61 | 11 | yes | —/— | 0.0000 |
| BITPET | NO | 91 | 3 | yes | 3/— | 0.0000 |
| ASOCIACION DE INVESTIGACION DE INDUSTRIAS CARNICAS DEL PRINCIPADO DE ASTURIAS | ES | 68 | — | **no** | —/— | 0.0000 |
| ADVANCED CONSTRUCTION TECHNOLOGIES | GB | 18 | — | **no** | —/— | 0.0000 |
| CEMONITE | NO | 83 | 11 | yes | —/— | 0.0000 |
| SAFRAN AIRCRAFT ENGINES | FR | 97 | 4 | yes | 4/— | 0.0000 |
| PHILIPS | DE | 112 | 29 | **no** | —/— | 0.0000 |
| ALGORYX SIMULATION | SE | 78 | 55 | **no** | —/— | 0.0000 |
| INSTITUT PHOTOVOLTAIQUE D ILE DE FRANCE IPVF | FR | 90 | 80 | **no** | —/— | 0.0000 |
| MENLO SYSTEMS GMBH | DE | 111 | 7 | yes | 6/— | 0.0000 |
| Freiberger Compound Materials Gesellschaft mit beschränkter Haftung | DE | 116 | 20 | **no** | —/— | 0.0000 |
| SOCIETE EUROPEENNE DE CARDIOLOGIE | FR | 107 | 78 | **no** | —/— | 0.0000 |
| PETROGAL SA | PT | 30 | — | **no** | —/— | 0.0000 |
| CHANTIERS DE L ATLANTIQUE | FR | 109 | 90 | **no** | —/— | 0.0000 |
| STICHTING IMEC NEDERLAND | NL | 42 | 2 | yes | 2/— | 0.0000 |
| HOPROD | FR | 109 | 26 | **no** | —/— | 0.0000 |
| Pumacy Technologies AG | DE | 105 | 35 | **no** | —/— | 0.0000 |
| ELFLY | NO | 93 | 4 | yes | 4/— | 0.0000 |
| COMAT | FR | 89 | 75 | **no** | —/— | 0.0000 |
| DEUTSCHES FORSCHUNGSZENTRUM FUR KUNSTLICHE INTELLIGENZ GMBH | DE | 100 | 37 | **no** | —/— | 0.0000 |
| AQUALANDE | FR | 100 | 49 | **no** | —/— | 0.0000 |
| EURNEX E V | DE | 128 | 7 | yes | 7/— | 0.0000 |
| OKOMERA | FR | 100 | 85 | **no** | —/— | 0.0000 |
| DMK DEUTSCHES MILCHKONTOR | DE | 114 | 9 | yes | —/— | 0.0000 |
| ALTERNATIVE TECHNOLOGY SOLUTIONS | GB | 23 | — | **no** | —/— | 0.0000 |
| KONGSBERG DEFENCE AEROSPACE | NO | 91 | 52 | **no** | —/— | 0.0000 |
| ASOCIACION DE LA INVESTIGACION Y COOPERACION INDUSTRIAL DE ANDALUCIA F. DE PAULA ROJAS"" | ES | 67 | — | **no** | —/— | 0.0000 |
| UNIVERSITAT DE BARCELONA | ES | 68 | — | **no** | —/— | 0.0000 |
| X FAB DRESDEN | DE | 114 | 8 | yes | 7/— | 0.0000 |
| MEYER WERFT | DE | 106 | 6 | yes | 5/— | 0.0000 |
| AKIRA SCIENCE AB | SE | 65 | 55 | **no** | —/— | 0.0000 |
| INGENIARS | IT | 22 | — | **no** | —/— | 0.0000 |
| POLITECNICO DI BARI | IT | 66 | 30 | **no** | —/— | 0.0000 |
| UNIVERSITE DE BORDEAUX | FR | 87 | 26 | **no** | —/— | 0.0000 |
| UNIVERSITA DELLA CALABRIA | IT | 56 | 24 | **no** | —/— | 0.0000 |
| AKER SOLUTIONS | NO | 92 | 30 | **no** | —/— | 0.0000 |
| KLYV THERAPEUTICS | NO | 92 | 5 | yes | 4/— | 0.0000 |
| BARCELONA SUPERCOMPUTING CENTER CENTRO NACIONAL DE SUPERCOMPUTACION | ES | 94 | 1 | yes | 1/— | 0.0000 |
| 3D COMPONENTS | NO | 92 | 9 | yes | —/— | 0.0000 |
| BRISTOL CITY COUNCIL | GB | 23 | — | **no** | —/— | 0.0000 |
| FRENTECH AEROSPACE S.R.O. | CZ | 62 | 1 | yes | 1/— | 0.0000 |
| DUMAREY AUTOMOTIVE ITALIA | IT | 16 | — | **no** | —/— | 0.0000 |
| OSPEDALE SAN RAFFAELE SRL | IT | 70 | — | **no** | —/— | 0.0000 |
| COMAU | IT | 26 | — | **no** | —/— | 0.0000 |
| AS TFTAK | EE | 72 | 7 | yes | 7/— | 0.0000 |
| FUTURE INNOVATIONS | NO | 93 | 74 | **no** | —/— | 0.0000 |
| FEV EUROPE | DE | 114 | 2 | yes | 2/— | 0.0000 |
| NAVTOR | NO | 91 | 73 | **no** | —/— | 0.0000 |
| ABERDEEN CITY COUNCIL | GB | 16 | — | **no** | —/— | 0.0000 |
| SOLREED | FR | 101 | 82 | **no** | —/— | 0.0000 |
| AIRFORESTRY AB | SE | 75 | 1 | yes | 1/— | 0.0000 |
| GEOKOMPETENZZENTRUM FREIBERG EV | DE | 128 | 100 | **no** | —/— | 0.0000 |
| BRIGHTSPARKS AGENCY | GB | 24 | — | **no** | —/— | 0.0000 |
| AGENCE LOCALE DE L ENERGIE ET DU CLIMAT | FR | 102 | 27 | **no** | —/— | 0.0000 |
| INSTITUT GUSTAVE ROUSSY | FR | 86 | 23 | **no** | —/— | 0.0000 |
| AGRIBIOTIX | NO | 90 | 3 | yes | 3/— | 0.0000 |
| DEMCON SYNC BIOSYSTEMS BV | NL | 44 | 39 | **no** | —/— | 0.0000 |
| MAGIA DIAGNOSTICS | FR | 108 | 105 | **no** | —/— | 0.0000 |
| CONSIGLIO NAZIONALE DELLE RICERCHE | IT | 22 | 4 | yes | 4/— | 0.0000 |
| DIGITAL CATAPULT | GB | 23 | — | **no** | —/— | 0.0000 |
| ROSEAU TECHNOLOGIES | FR | 100 | 90 | **no** | —/— | 0.0000 |
| HYDROGENPRO | NO | 91 | 3 | yes | 3/— | 0.0000 |
| Fondazione Rome Technopole | IT | 51 | 17 | yes | —/— | 0.0000 |
| CONNECTED PLACES CATAPULT | GB | 23 | — | **no** | —/— | 0.0000 |
| BIOECONOMY FOR CHANGE | FR | 101 | 43 | **no** | —/— | 0.0000 |
| UNIVERSITA DEGLI STUDI DELLA CAMPANIA LUIGI VANVITELLI | IT | 63 | 22 | **no** | —/— | 0.0000 |
| R2M SOLUTION SRL | IT | 17 | — | **no** | —/— | 0.0000 |
| QUANTUM OPTICS JENA | DE | 111 | 6 | yes | 6/— | 0.0000 |
| EvoLogics GmbH | DE | 108 | 12 | yes | —/— | 0.0000 |
| ASOCIACION DE LA INDUSTRIA NAVARRA | ES | 67 | — | **no** | —/— | 0.0000 |
| INFUTURE | NO | 89 | 76 | **no** | —/— | 0.0000 |
| CELLEVATE AB | SE | 66 | 7 | yes | 7/— | 0.0000 |
| KUNNSKAPSPARKEN BODØ | NO | 91 | 12 | yes | —/— | 0.0000 |
| ENERGY SYSTEMS CATAPULT LIMITED | GB | 23 | — | **no** | —/— | 0.0000 |
| TIOTECH | NO | 83 | 1 | yes | 1/— | 0.0000 |
| ACB | FR | 109 | 6 | yes | 6/— | 0.0000 |
| DANISI ENGINEERING S.R.L. | IT | 22 | — | **no** | —/— | 0.0000 |
| DCUBED GMBH | DE | 113 | 108 | **no** | —/— | 0.0000 |
| AIRBORNE COMPOSITES | GB | 23 | — | **no** | —/— | 0.0000 |
| UNIVERSITA DEGLI STUDI DI SALERNO | IT | 63 | 24 | **no** | —/— | 0.0000 |
| ASGARD THERAPEUTICS AB | SE | 72 | 21 | **no** | —/— | 0.0000 |
| LUNDS UNIVERSITET | SE | 69 | — | **no** | —/— | 0.0000 |
| ParTec AG | DE | 109 | 15 | yes | —/— | 0.0000 |
| NELLIE TECHNOLOGIES | GB | 18 | 15 | yes | —/— | 0.0000 |
| ACTIONSENSE LTD | GB | 22 | — | **no** | —/— | 0.0000 |
| LE BIO MARAIS | FR | 109 | 12 | yes | —/— | 0.0000 |
| Merck Electronics KGaA | DE | 105 | — | **no** | —/— | 0.0000 |
| DERMAGNOSTIX GMBH | DE | 119 | 1 | yes | 1/— | 0.0000 |
| CONSORZIO NAZIONALE INTERUNIVERSITARIO PER LE TELECOMUNICAZIONI | IT | 45 | — | **no** | —/— | 0.0000 |
| TALGA GROUP LTD | SE | 67 | — | **no** | —/— | 0.0000 |
| ACTIA AUTOMOTIVE | FR | 107 | 6 | yes | 6/— | 0.0000 |
| PARISOT INDUSTRIE | FR | 110 | 20 | **no** | —/— | 0.0000 |
| STICHTING HOGESCHOOL ROTTERDAM | NL | 45 | 25 | **no** | —/— | 0.0000 |
| QUANTUNE TECHNOLOGIES GMBH | DE | 120 | 26 | **no** | —/— | 0.0000 |
| FONDAZIONE ISTITUTO ITALIANO DI TECNOLOGIA | IT | 15 | — | **no** | —/— | 0.0000 |
| A4MT | FR | 111 | 57 | **no** | —/— | 0.0000 |
| DELIVRONE | FR | 107 | 22 | **no** | —/— | 0.0000 |
| CENTRE FOR PROCESS INNOVATION LIMITED LBG | GB | 16 | — | **no** | —/— | 0.0000 |
| HELSINGBORGS KOMMUN | SE | 77 | 1 | yes | 1/— | 0.0000 |
| CENTRO DI COMPETENZA PER LA SICUREZZA E L OTTIMIZZAZIONE DELLE INFRASTRUTTURE STRATEGICHE START 4 0 | IT | 82 | 3 | yes | 3/— | 0.0000 |
| 3D REPO | GB | 22 | — | **no** | —/— | 0.0000 |
| ACCIONA CONSTRUCCION | ES | 106 | 4 | yes | 4/— | 0.0000 |
| SOLARGE INTERNATIONAL | NL | 44 | 23 | **no** | —/— | 0.0000 |
| FUNDACION PARA EL DESARROLLO DE LAS NUEVAS TECNOLOGIAS DEL HIDROGENO EN ARAGON | ES | 72 | 52 | **no** | —/— | 0.0000 |
| HUDDLE CORP | FR | 91 | 5 | yes | 5/— | 0.0000 |
| ABBVIE DEUTSCHLAND GMBH CO KG | DE | 119 | 112 | **no** | —/— | 0.0000 |
| ALBASENSE | GB | 17 | — | **no** | —/— | 0.0000 |
| Holosolis | FR | 100 | — | **no** | —/— | 0.0000 |
| Cordys Analytics B.V. | NL | 45 | 7 | yes | 7/— | 0.0000 |
| UNIVERSITY OF STUTTGART | DE | 76 | 4 | yes | 4/— | 0.0000 |
| BENECKE KALIKO | DE | 119 | 48 | **no** | —/— | 0.0000 |
| CENTRE HOSPITALIER REGIONAL ET UNIVERSITAIRE DE LILLE | FR | 107 | 21 | **no** | —/— | 0.0000 |
| SCIERIE GERMAIN MOUGENOT | FR | 109 | 26 | **no** | —/— | 0.0000 |
| Evidence B | FR | 108 | 97 | **no** | —/— | 0.0000 |
| MOVING PROJECTS S.R.L. | IT | 75 | 68 | **no** | —/— | 0.0000 |
| AQUASIUM TECHNOLOGY | GB | 24 | — | **no** | —/— | 0.0000 |
| Aktiv | DK | 29 | 3 | yes | 3/— | 0.0000 |
| APTUNION INDUSTRIE | FR | 110 | 17 | yes | —/— | 0.0000 |
| BMZ GERMANY | DE | 122 | 102 | **no** | —/— | 0.0000 |
| AVL DEUTSCHLAND | DE | 119 | 29 | **no** | —/— | 0.0000 |
| AEGENIC | GB | 16 | — | **no** | —/— | 0.0000 |
| KARLSRUHER INSTITUT FUER TECHNOLOGIE | DE | 69 | — | **no** | —/— | 0.0000 |
| TXT E-TECH SRL | IT | 69 | 65 | **no** | —/— | 0.0000 |
| NANOSCRIBE GMBH CO KG | DE | 108 | — | **no** | —/— | 0.0000 |
| ACCIAI SPECIALI TERNI | IT | 79 | 29 | **no** | —/— | 0.0000 |
| ENTER | FR | 106 | 102 | **no** | —/— | 0.0000 |
| MAHLE New Mobility Solutions GmbH | DE | 111 | 3 | yes | 3/— | 0.0000 |
| CORTEC GMBH | DE | 120 | 109 | **no** | —/— | 0.0000 |
| REVERION GMBH | DE | 112 | 8 | yes | 8/— | 0.0000 |
| COMING PLUS, A.S. | CZ | 63 | 22 | **no** | —/— | 0.0000 |
| ENERGY ROBOTICS GMBH | DE | 120 | 6 | yes | 6/— | 0.0000 |
| FOM TECHNOLOGIES | DK | 24 | 5 | yes | 5/— | 0.0000 |
| LEONARDO -SOCIETA PER AZIONI | IT | 24 | — | **no** | —/— | 0.0000 |
| OXFORD PV GERMANY | DE | 116 | 79 | **no** | —/— | 0.0000 |
| FONONTECH HOLDING BV | NL | 47 | 6 | yes | 5/— | 0.0000 |
| OHB System AG | DE | 106 | 4 | yes | 3/— | 0.0000 |
| ASOCIACION CENTRO TECNOLOGICO CEIT | ES | 65 | — | **no** | —/— | 0.0000 |
| CAP HOLDING | IT | 26 | — | **no** | —/— | 0.0000 |
| AIRY Automotive | DK | 31 | 4 | yes | 4/— | 0.0000 |
| AGENCIA ESTATAL CONSEJO SUPERIOR DE INVESTIGACIONES CIENTIFICAS | ES | 68 | — | **no** | —/— | 0.0000 |
| CETASOL | SE | 78 | 15 | yes | —/— | 0.0000 |
| ALOCALO GMBH | DE | 119 | 112 | **no** | —/— | 0.0000 |
| FSTECHNOLOGY | IT | 76 | 13 | yes | —/— | 0.0000 |
| Diehl Aerospace GmbH | DE | 110 | — | **no** | —/— | 0.0000 |
| KARLSTADS UNIVERSITET | SE | 76 | 26 | **no** | —/— | 0.0000 |
| Siemens | DE | 113 | 30 | **no** | —/— | 0.0000 |
| MATERIÁLOVÝ A METALURGICKÝ VÝZKUM S.R.O. | CZ | 70 | 21 | **no** | —/— | 0.0000 |
| LUNDS UNIVERSITET | SE | 76 | 51 | **no** | —/— | 0.0000 |
| SITAEL | IT | 67 | 3 | yes | 3/— | 0.0000 |
| KAROLINSKA INSTITUTET | SE | 76 | 32 | **no** | —/— | 0.0000 |
| AKKODIS ITALY | IT | 16 | — | **no** | —/— | 0.0000 |
| 1SPATIAL GROUP | GB | 22 | — | **no** | —/— | 0.0000 |
| CELLFION AB | SE | 73 | 3 | yes | 3/— | 0.0000 |
| TECHNISCHE HOCHSCHULE KOLN | DE | 77 | 16 | yes | —/— | 0.0000 |
| DEUTSCHES KLIMARECHENZENTRUM | DE | 128 | 54 | **no** | —/— | 0.0000 |
| TELECOM ITALIA SPA O TIM | IT | 24 | 8 | yes | 8/— | 0.0000 |
| MAN TRUCK BUS SE | DE | 111 | 6 | yes | 5/— | 0.0000 |
| ACORAI AB | SE | 72 | 3 | yes | 3/— | 0.0000 |
| MAX-PLANCK-GESELLSCHAFT ZUR FORDERUNG DER WISSENSCHAFTEN EV | DE | 119 | — | **no** | —/— | 0.0000 |
| AS TFTAK | EE | 66 | 24 | **no** | —/— | 0.0000 |
| ABUNDANCE INVESTMENT | GB | 24 | — | **no** | —/— | 0.0000 |
| ZURICH INSTRUMENTS GERMANY | DE | 125 | 1 | yes | 1/— | 0.0000 |
| ESK Schultze GmbH & Co. KG | DE | 122 | 60 | **no** | —/— | 0.0000 |
| Diehl Aviation Gilching GmbH | DE | 121 | — | **no** | —/— | 0.0000 |
| Technische Hochschule Rosenheim | DE | 70 | 14 | yes | —/— | 0.0000 |
| FUNDACIO HOSPITAL UNIVERSITARI VALL D'HEBRON - INSTITUT DE RECERCA | ES | 67 | 6 | yes | 5/— | 0.0000 |
| UNIVERSITA DEGLI STUDI DEL SANNIO | IT | 62 | — | **no** | —/— | 0.0000 |
| CENTRUM VÝZKUMU ŘEŽ S.R.O. | CZ | 71 | 4 | yes | 4/— | 0.0000 |
| OHB System AG | DE | 104 | 15 | yes | —/— | 0.0000 |
| GE AVIO SRL | IT | 66 | — | **no** | —/— | 0.0000 |
| STICHTING KONINKLIJK NEDERLANDS LUCHT - EN RUIMTEVAARTCENTRUM | NL | 44 | 14 | yes | —/— | 0.0000 |
| GREEN 14 AB | SE | 72 | 1 | yes | 1/— | 0.0000 |
| RHEINMETALL WAFFE MUNITION GMBH | DE | 114 | 34 | **no** | —/— | 0.0000 |
| DEUTSCHES ZENTRUM FUR LUFT - UND RAUMFAHRT EV | DE | 127 | 83 | **no** | —/— | 0.0000 |
| UNIVERSITA' DEGLI STUDI DI MILANO-BICOCCA | IT | 21 | — | **no** | —/— | 0.0000 |
| INTERMODULATION PRODUCTS AB | SE | 63 | 9 | yes | —/— | 0.0000 |
| ADVANCED SURFACE PLATING ApS | DK | 30 | — | **no** | —/— | 0.0000 |
| ASOCIACION DE LA INDUSTRIA NAVARRA | ES | 67 | 7 | yes | 7/— | 0.0000 |
| BLACK SEMICONDUCTOR | DE | 117 | 6 | yes | 4/— | 0.0000 |
| ASOCIACION DE INVESTIGACION DE LA INDUSTRIA DEL JUGUETE CONEXAS Y AFINES | ES | 61 | — | **no** | —/— | 0.0000 |
| Infineon | DE | 126 | — | **no** | —/— | 0.0000 |
| EXEMPLAS | GB | 23 | — | **no** | —/— | 0.0000 |
| SWERIM | SE | 78 | 6 | yes | —/— | 0.0000 |
| BAYERISCHE MOTOREN WERKE AKTIENGESELLSCHAFT | DE | 117 | 4 | yes | 4/— | 0.0000 |
| CELLUGY | DK | 30 | 2 | yes | 2/— | 0.0000 |
| CIRCULAR MATERIALS SRL | IT | 72 | — | **no** | —/— | 0.0000 |
| LULEA TEKNISKA UNIVERSITET | SE | 76 | 24 | **no** | —/— | 0.0000 |
| CACTUX S.R.O. | CZ | 70 | 37 | **no** | —/— | 0.0000 |
| DIESELLAND OÜ | EE | 76 | 18 | yes | —/— | 0.0000 |
| GWE BUSINESS WEST | GB | 22 | — | **no** | —/— | 0.0000 |
| COMTES FHT A.S. | CZ | 70 | 5 | yes | 5/— | 0.0000 |
| HELSINGBORGS KOMMUN | SE | 77 | 5 | yes | 5/— | 0.0000 |
| COLAS | GB | 17 | — | **no** | —/— | 0.0000 |
| AGROVISTA | GB | 23 | — | **no** | —/— | 0.0000 |
| ITEC B.V. | NL | 46 | 2 | yes | 2/— | 0.0000 |
| ACHELOUS ENERGY | GB | 18 | — | **no** | —/— | 0.0000 |
| LEONARDO -SOCIETA PER AZIONI | IT | 24 | 6 | yes | 6/— | 0.0000 |
| C I R A CENTRO ITALIANO RICERCHE AEROSPAZIALI SCPA | IT | 81 | 3 | yes | 3/— | 0.0000 |
| MEDICINES DISCOVERY CATAPULT | GB | 22 | — | **no** | —/— | 0.0000 |
| DAZETECHNOLOGY S.R.L. | IT | 18 | — | **no** | —/— | 0.0000 |
| RISE RESEARCH INSTITUTES OF SWEDEN AB | SE | 72 | 31 | **no** | —/— | 0.0000 |
| 5G COMMUNICATIONS FOR FUTURE INDUSTRY VERTICALS | ES | 93 | 6 | yes | 6/— | 0.0000 |
| 5G COMMUNICATIONS FOR FUTURE INDUSTRY VERTICALS | ES | 95 | 4 | yes | 4/— | 0.0000 |
| JANSEN RECYCLING GROUP B V | NL | 46 | 24 | **no** | —/— | 0.0000 |
| CORPOWER OCEAN AB | SE | 73 | 36 | **no** | —/— | 0.0000 |
| AEROSPACEHV | GB | 24 | — | **no** | —/— | 0.0000 |
| SERVIZO GALEGO DE SAUDE | ES | 94 | 2 | yes | 2/— | 0.0000 |
| BARCELONA SUPERCOMPUTING CENTER CENTRO NACIONAL DE SUPERCOMPUTACION | ES | 95 | 61 | **no** | —/— | 0.0000 |
| ASOCIACION CENTRO TECNOLOGICO CEIT | ES | 60 | — | **no** | —/— | 0.0000 |
| FRATELLI PIACENZA | IT | 89 | 6 | yes | 4/— | 0.0000 |
| IRNOVA | SE | 67 | 12 | yes | —/— | 0.0000 |
| UNIVERSITA DEGLI STUDI DI NAPOLI PARTHENOPE | IT | 69 | 19 | **no** | —/— | 0.0000 |
| ACTECO PRODUCTOS Y SERVICIOS | ES | 109 | 5 | yes | 5/— | 0.0000 |
| NMIS UNIVERSITY OF STRATHCLYDE | GB | 17 | — | **no** | —/— | 0.0000 |
| CONCR3DE B V | NL | 41 | 16 | yes | —/— | 0.0000 |
| ALMIRALL SA | ES | 93 | 5 | yes | 5/— | 0.0000 |
| INVENTYA | GB | 17 | — | **no** | —/— | 0.0000 |
| Latitudo 40 | IT | 74 | 67 | **no** | —/— | 0.0000 |
| AI NERGY | DK | 32 | 6 | yes | 6/— | 0.0000 |
| CARTESIAN | NO | 93 | 6 | yes | 5/— | 0.0000 |
| ELKEM TESTVIRKSOMHET | NO | 85 | 16 | yes | —/— | 0.0000 |
| FINANCE INNOVATION | NO | 82 | 12 | yes | —/— | 0.0000 |
| DNV | NO | 92 | 13 | yes | —/— | 0.0000 |
| NORSVIN R D | NO | 90 | 5 | yes | 5/— | 0.0000 |
| ANIMALIA | NO | 90 | 79 | **no** | —/— | 0.0000 |
| DNV IMATIS | NO | 90 | 8 | yes | 7/— | 0.0000 |
| FUTURE INNOVATIONS | NO | 93 | 16 | yes | —/— | 0.0000 |
| EPIGUARD | NO | 90 | 56 | **no** | —/— | 0.0000 |
| LAYERONE | NO | 90 | 17 | yes | —/— | 0.0000 |
| BENTELER AUTOMOTIVE RAUFOSS | NO | 83 | 19 | **no** | —/— | 0.0000 |
| AIBA | NO | 83 | 5 | yes | 4/— | 0.0000 |
| NEXTERA | NO | 90 | 65 | **no** | —/— | 0.0000 |
| SALT LOFOTEN | NO | 91 | 62 | **no** | —/— | 0.0000 |
| EWOS | NO | 91 | 1 | yes | 1/— | 0.0000 |
| FLOWFOOD | NO | 90 | 1 | yes | 1/— | 0.0000 |
| ZEFAL | FR | 109 | 68 | **no** | —/— | 0.0000 |
| DYNAMIC WELL SOLUTIONS | NO | 84 | 2 | yes | 2/— | 0.0000 |
| INSTITUT NATIONAL DE RECHERCHE POUR L'AGRICULTURE, L'ALIMENTATION ET L'ENVIRONNEMENT | FR | 85 | 28 | **no** | —/— | 0.0000 |
| KURAGE | FR | 109 | 92 | **no** | —/— | 0.0000 |
| ACTRONIKA | FR | 107 | — | **no** | —/— | 0.0000 |
| BULL SAS | FR | 90 | — | **no** | —/— | 0.0000 |
| GENTIAN | NO | 90 | 10 | yes | —/— | 0.0000 |
| PRE DIAGNOSTICS | NO | 90 | 38 | **no** | —/— | 0.0000 |
| AURA AERO SAS | FR | 90 | 3 | yes | 3/— | 0.0000 |
| DALKIA | FR | 109 | 1 | yes | 1/— | 0.0000 |
| MEDSENSIO | NO | 90 | 35 | **no** | —/— | 0.0000 |
| OSLO ECONOMICS | NO | 90 | 50 | **no** | —/— | 0.0000 |
| HAFENSTROM | NO | 91 | 85 | **no** | —/— | 0.0000 |
| MYCOPHYTO | FR | 97 | 31 | **no** | —/— | 0.0000 |
| TOUL ENERGIE | FR | 100 | 9 | yes | —/— | 0.0000 |
| PPM ROBOTICS | NO | 91 | 33 | **no** | —/— | 0.0000 |
| DELTA ELECTRONICS NORWAY | NO | 91 | 47 | **no** | —/— | 0.0000 |
| SHIFT MATERIALS | NO | 85 | 64 | **no** | —/— | 0.0000 |
| AKER SOLUTIONS | NO | 92 | 9 | yes | —/— | 0.0000 |
| EGGA UTVIKLING | NO | 91 | 7 | yes | 6/— | 0.0000 |
| BIO ME | NO | 82 | 21 | **no** | —/— | 0.0000 |
| ANDERSEN MEK VERKSTED | NO | 92 | 73 | **no** | —/— | 0.0000 |
| BJØRK INNOVATION | NO | 91 | 46 | **no** | —/— | 0.0000 |
| ECM GREENTECH | FR | 90 | 79 | **no** | —/— | 0.0000 |
| TECO 2030 | NO | 92 | 32 | **no** | —/— | 0.0000 |
| BRETAGNE CHIMIE FINE SAS | FR | 102 | 6 | yes | 6/— | 0.0000 |
| CHAMBERY GRAND LAC ECONOMIE | FR | 101 | 46 | **no** | —/— | 0.0000 |
| RESITEC | NO | 91 | 63 | **no** | —/— | 0.0000 |
| BMOTION TECHNOLOGIES | FR | 90 | 75 | **no** | —/— | 0.0000 |
| GRASP | NO | 90 | 10 | yes | —/— | 0.0000 |
| AGENCE LOCALE DE L ENERGIE ET DU CLIMAT | FR | 96 | 29 | **no** | —/— | 0.0000 |
| AF OFFSHORE DECOM | NO | 93 | 1 | yes | 1/— | 0.0000 |
| AGRIBIOTIX | NO | 90 | 18 | yes | —/— | 0.0000 |
| AIBA | NO | 90 | 3 | yes | 3/— | 0.0000 |
| TIPEE | FR | 109 | 95 | **no** | —/— | 0.0000 |
| DNV | NO | 91 | 2 | yes | 2/— | 0.0000 |
| KOBLA | NO | 91 | 13 | yes | —/— | 0.0000 |
| FORTIFIED TECHNOLOGIES | NO | 81 | 55 | **no** | —/— | 0.0000 |
| AIBA | NO | 89 | 6 | yes | —/— | 0.0000 |
| ROOFSCAPES STUDIO | FR | 109 | 91 | **no** | —/— | 0.0000 |
| NOBATEK | FR | 101 | 83 | **no** | —/— | 0.0000 |
| EDEN TECH | FR | 108 | 91 | **no** | —/— | 0.0000 |
| SOPAC MEDICAL | FR | 108 | 5 | yes | 5/— | 0.0000 |
| SYNOVANCE | FR | 100 | 85 | **no** | —/— | 0.0000 |
| Airbus | FR | 96 | 7 | yes | 7/— | 0.0000 |
| DELTALYS | FR | 90 | 38 | **no** | —/— | 0.0000 |
| HELIUP | FR | 89 | 67 | **no** | —/— | 0.0000 |
| AQUALUNG CARBON CAPTURE | NO | 85 | 2 | yes | 2/— | 0.0000 |
| BIOMAR A S | NO | 91 | 61 | **no** | —/— | 0.0000 |
| GKN AEROSPACE NORWAY | NO | 93 | 23 | **no** | —/— | 0.0000 |
| LYSE | NO | 92 | 38 | **no** | —/— | 0.0000 |
| GRASP | NO | 90 | 8 | yes | 7/— | 0.0000 |
| GLUCOSET | NO | 90 | 27 | **no** | —/— | 0.0000 |
| SFE PROCESS | FR | 110 | 95 | **no** | —/— | 0.0000 |
| ADDEV MATERIALS AEROSPACE SAS | FR | 103 | 32 | **no** | —/— | 0.0000 |
| SCIERIE PALETTERIE GERHARD | FR | 99 | 23 | **no** | —/— | 0.0000 |
| ALCOA NORWAY | NO | 85 | 4 | yes | 4/— | 0.0000 |
| NORDIC BRAIN TECH | NO | 90 | 20 | **no** | —/— | 0.0000 |
| AFFINISEP | FR | 108 | 104 | **no** | —/— | 0.0000 |
| RATIER-FIGEAC | FR | 108 | 12 | yes | —/— | 0.0000 |
| GAS 2 FEED | NO | 91 | 35 | **no** | —/— | 0.0000 |
| NODE PHARMA | NO | 90 | 1 | yes | 1/— | 0.0000 |
| KUNNSKAPSPARKEN HELGELAND | NO | 92 | 68 | **no** | —/— | 0.0000 |
| CHILLSERVICES | DE | 128 | 27 | **no** | —/— | 0.0000 |
| EUROPEAN MUD COMPANY | NO | 83 | 1 | yes | 1/— | 0.0000 |
| INNOTEC21 | DE | 128 | 114 | **no** | —/— | 0.0000 |
| VITESCO TECHNOLOGIES | DE | 119 | 29 | **no** | —/— | 0.0000 |
| HUBBLO | FR | 108 | 95 | **no** | —/— | 0.0000 |
| PACE AEROSPACE ENGINEERING AND INFORMATION TECHNOLOGY | DE | 119 | 64 | **no** | —/— | 0.0000 |
| INAVENTA SOLAR | NO | 85 | 37 | **no** | —/— | 0.0000 |
| Neolitik | FR | 93 | 59 | **no** | —/— | 0.0000 |
| SUPRACON | DE | 105 | 10 | yes | —/— | 0.0000 |
| NEUROCONN | DE | 115 | 2 | yes | 2/— | 0.0000 |
| BIOFY | NO | 89 | 3 | yes | 3/— | 0.0000 |
| SMARTE BYER NORGE | NO | 90 | 41 | **no** | —/— | 0.0000 |
| FRAUNHOFER GESELLSCHAFT ZUR FORDERUNG DER ANGEWANDTEN FORSCHUNG EV | DE | 70 | 25 | **no** | —/— | 0.0000 |
| IMMERSION | FR | 100 | 20 | **no** | —/— | 0.0000 |
| SOPAC MEDICAL | FR | 108 | 18 | yes | —/— | 0.0000 |
| GREMSE-IT GMBH | DE | 106 | — | **no** | —/— | 0.0000 |
| GRAMINOR | NO | 90 | 4 | yes | 4/— | 0.0000 |
| NAMLAB GGMBH | DE | 125 | 21 | **no** | —/— | 0.0000 |
| KONGSBERG MARITIME | NO | 91 | 8 | yes | 8/— | 0.0000 |
| HUTCHINSON | FR | 97 | 20 | **no** | —/— | 0.0000 |
| BLUE SOLUTIONS | FR | 98 | 23 | **no** | —/— | 0.0000 |
| LA MANUFACTURE ABBEVILLOISE | FR | 109 | 83 | **no** | —/— | 0.0000 |
| Water Horizon | FR | 89 | 13 | yes | —/— | 0.0000 |
| PILI | FR | 97 | 85 | **no** | —/— | 0.0000 |
| ZF FRIEDRICHSHAFEN | DE | 118 | 64 | **no** | —/— | 0.0000 |
| REVERION GMBH | DE | 113 | 34 | **no** | —/— | 0.0000 |
| MINUS SOLUTIONS | NO | 83 | 54 | **no** | —/— | 0.0000 |
| CIGNUS INSTRUMENTS | NO | 91 | 1 | yes | 1/— | 0.0000 |
| LYBE SCIENTIFIC | NO | 90 | 25 | **no** | —/— | 0.0000 |
| BORALEX | FR | 101 | — | **no** | —/— | 0.0000 |
| ALUDYNE NORWAY | NO | 82 | — | **no** | —/— | 0.0000 |
| NJØS FRUKT OG BÆRSENTER | NO | 81 | 14 | yes | —/— | 0.0000 |
| AVIANT | NO | 89 | — | **no** | —/— | 0.0000 |
| ADVANCED WIRELESS SOLUTIONS AND SERVICES | FR | 106 | 8 | yes | 8/— | 0.0000 |
| SAGA ROBOTICS | NO | 83 | 33 | **no** | —/— | 0.0000 |
| KS KONSULENT | NO | 87 | 44 | **no** | —/— | 0.0000 |
| ELEKTROBIT AUTOMOTIVE | DE | 108 | 28 | **no** | —/— | 0.0000 |
| SWABIAN INSTRUMENTS | DE | 126 | 1 | yes | 1/— | 0.0000 |
| MENLO SYSTEMS GMBH | DE | 111 | 5 | yes | 4/— | 0.0000 |
| AS B ZEOS | NO | 80 | 14 | yes | —/— | 0.0000 |
| FISKÅ MØLLE | NO | 90 | 2 | yes | 2/— | 0.0000 |
| MORFO | FR | 102 | — | **no** | —/— | 0.0000 |
| INTEGRATED DETECTOR ELECTRONICS | NO | 89 | 27 | **no** | —/— | 0.0000 |
| AVA OCEAN | NO | 91 | 1 | yes | 1/— | 0.0000 |
| LECLANCHE GMBH | DE | 114 | — | **no** | —/— | 0.0000 |
| COMPUTERWELL | NO | 89 | — | **no** | —/— | 0.0000 |
| UNIVERSITY OF STUTTGART | DE | 70 | — | **no** | —/— | 0.0000 |
| ACOME | FR | 109 | 8 | yes | 8/— | 0.0000 |
| LINGALAKS | NO | 91 | 2 | yes | 2/— | 0.0000 |
