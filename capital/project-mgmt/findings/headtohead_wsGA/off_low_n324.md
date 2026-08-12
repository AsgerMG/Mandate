# wsGA — the AI ranker against our own scoring

```
started            2026-08-12T17:22:29.408Z
corpus             postgres instruments=1088 at 2026-08-12T17:22:29.986Z
ranker: all 324 request(s) on EMBEDDING
agent-select: arm=off, no calls made
agent-select exits: the seam was not reached
set                __recallSetDescribed.json  split=tune  seed=20260806
draw               324 of 324 eligible, country cap 49 (15%) BOUND
draw fingerprint   fc6257b3ee65c313  <- two runs quoting different fingerprints
                   graded different founders, whatever seed they name
levers             seam=late depth=40 count=7 effort=low lookups=5 pool=18 published_cap=7
base rate curve    846 held-out founders; P(won in first 18)=44.2%
paid calls         0
spend              EUR 0.0000
```

founder intake — 23 askable fields, identity=real own-history=withheld capital=withheld answers=strict consortium=yes
DERIVED   entityCountries      set  324/324 (100%)  own  324/324 (100%)  companies.country
DERIVED   organisationType     set   87/324 ( 27%)  own   87/324 ( 27%)  prefillOrganisationType(company name) — production's own classifier
DERIVED   region               set   82/324 ( 25%)  own   82/324 ( 25%)  the register's beneficiary region on an award under a DIFFERENT notified scheme (`regionSource = other_scheme`)
DERIVED   sector               set  324/324 (100%)  own  324/324 (100%)  companies.sector_top
DERIVED   ticketBand           set  324/324 (100%)  own  102/324 ( 31%)  the median award this company received UNDER A DIFFERENT NOTIFIED SCHEME (`answerTicketSource = other_scheme`)
PINNED    activities           set  324/324 (100%)  own    0/324 (  0%)  uniform — 611 comparators, an EXCLUSION axis
PINNED    consortium           set  324/324 (100%)  own    0/324 (  0%)  uniform — asked in the ADAPTIVE round, so on the instant path no real founder has answered it
PINNED    useOfFunds           set  324/324 (100%)  own    0/324 (  0%)  uniform — 59 hard filters turn on it
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
| control (our own scoring) | 120/324 (37.0% +/-5.3) |
| ranker | 120/324 (37.0% +/-5.3) |

Measured over the WHOLE draw of 324, including the founders no call was made on.
On the `late` seam the ranker permutes the control's own pool, so these two
numbers are equal BY CONSTRUCTION and any difference in this table is a bug.

**204 of 324 founders (63.0%) have no answer in the pool at all.** Neither arm can win on them and they are a concordant
miss in every paired test below.

## EXACT — the won fund in the published projection

Graded on 324 founder(s) — the whole draw.

| arm | EXACT@5 | EXACT@6 |
|---|---:|---:|
| control (our own scoring) | 60/324 (18.5% +/-4.2) | 69/324 (21.3% +/-4.5) |
| ranker | 60/324 (18.5% +/-4.2) | 69/324 (21.3% +/-4.5) |

These are the CODE-SIDE projection: `orderMemoCandidates` cut to the published
cap. `pipeline.ts` reads the ORDER OF THE WRITER'S NOTES as the ranking, so the
rows a founder actually reads are in the order the writer chose to mention them.
This is the right quantity for 'does the cut throw the answer away' and it is NOT
a claim about the finished brief.

## The paired test — McNemar, exact, signed

```
EXACT@5  McNemar(signed) z = +0.00  on 0 discordant (ranker 0, control 0; both 60, neither 264)  exact p = 1.000  -- NO discordant pairs: the arms are identical on these cases, not tied on evidence
EXACT@6  McNemar(signed) z = +0.00  on 0 discordant (ranker 0, control 0; both 69, neither 255)  exact p = 1.000  -- NO discordant pairs: the arms are identical on these cases, not tied on evidence
```

Concordant pairs carry no information about which arm is better and are excluded
by the test, not by a filter here. A run with few discordant pairs has little
evidence in it however many founders it cost.

## Secondary — the won fund's RANK, Wilcoxon signed-rank

```
n=0 non-tied pairs (242 dropped: the fund is absent from one arm's list)
mean rank shift +0.00 (NEGATIVE favours the ranker — a lower rank is better)
z = +0.00   p = 1.000
```

SECONDARY BY PRE-REGISTRATION. It is a more powerful test of a DIFFERENT
quantity, and a more powerful test of a different quantity is not a second
chance at the same question. It may support or qualify the headline; it may not
carry it. See project-mgmt/wsGA_prereg.md.

## Composition — because DE and FR were already legible

| country | founders | share | won fund in pool | control EXACT@5 | ranker EXACT@5 |
|---|---:|---:|---:|---:|---:|
| NO | 74 | 22.8% | 49% | 16 | 16 |
| DE | 72 | 22.2% | 33% | 13 | 13 |
| FR | 62 | 19.1% | 23% | 6 | 6 |
| GB | 28 | 8.6% | 7% | 2 | 2 |
| IT | 27 | 8.3% | 26% | 4 | 4 |
| ES | 19 | 5.9% | 74% | 7 | 7 |
| CZ | 16 | 4.9% | 44% | 4 | 4 |
| SE | 10 | 3.1% | 40% | 0 | 0 |
| NL | 9 | 2.8% | 67% | 3 | 3 |
| DK | 6 | 1.9% | 100% | 5 | 5 |
| BE | 1 | 0.3% | 0% | 0 | 0 |

DE + FR hold 134 of 324 = **41.4%** of the draw. The unstratified population is 53% DE+FR.

## Fallbacks and reach

- fell back to the shipped order: **0** of 324 call(s). A fallback publishes the CONTROL's order under the treatment's name.
- exits: `agent-select exits: the seam was not reached`

```
{"armOff":0,"reversed":0,"poolNotLongerThanCount":0,"menuNotLongerThanWant":0,"dryPriced":0,"noUsablePick":0,"threw":0,"chose":0}
```

## Per founder

| founder | country | accessible | won @ accessible | in pool | rank control/ranker | EUR |
|---|---|---:|---:|---:|---|---:|
| ACB | FR | 110 | 6 | yes | 6/6 | 0.0000 |
| DSI AEROSPACE | DE | 116 | 6 | yes | 6/6 | 0.0000 |
| ERASMUS UNIVERSITAIR MEDISCH CENTRUM ROTTERDAM | NL | 47 | 9 | yes | 8/8 | 0.0000 |
| ECOFUEL LABORATORIES S.R.O. | CZ | 67 | 26 | **no** | —/— | 0.0000 |
| ALUDYNE NORWAY | NO | 82 | — | **no** | —/— | 0.0000 |
| MAGTEL OPERACIONES | ES | 115 | 18 | yes | —/— | 0.0000 |
| BITPET | NO | 91 | 3 | yes | 3/3 | 0.0000 |
| AVIANT | NO | 90 | 69 | **no** | —/— | 0.0000 |
| UNIVERSIDAD POLITECNICA DE MADRID | ES | 78 | 29 | **no** | —/— | 0.0000 |
| COMMISSARIAT A L ENERGIE ATOMIQUE ET AUX ENERGIES ALTERNATIVES | FR | 96 | 14 | yes | —/— | 0.0000 |
| DEUTSCHES ZENTRUM FUR LUFT - UND RAUMFAHRT EV | DE | 131 | 95 | **no** | —/— | 0.0000 |
| KS KONSULENT | NO | 90 | 46 | **no** | —/— | 0.0000 |
| Cargill Deutschland GmbH | DE | 119 | 15 | yes | —/— | 0.0000 |
| CENTRE HOSPITALIER REGIONAL ET UNIVERSITAIRE DE LILLE | FR | 108 | 20 | **no** | —/— | 0.0000 |
| LUNDS UNIVERSITET | SE | 77 | 52 | **no** | —/— | 0.0000 |
| LEARN & GO | FR | 108 | 92 | **no** | —/— | 0.0000 |
| AURA AERO SAS | FR | 91 | 3 | yes | 3/3 | 0.0000 |
| ELKEM | NO | 87 | 74 | **no** | —/— | 0.0000 |
| CENTRUM VÝZKUMU ŘEŽ S.R.O. | CZ | 76 | 3 | yes | 3/3 | 0.0000 |
| Evidence B | FR | 109 | 99 | **no** | —/— | 0.0000 |
| AVERBIS | DE | 126 | 20 | **no** | —/— | 0.0000 |
| ONIO | NO | 96 | 36 | **no** | —/— | 0.0000 |
| GREMSE-IT GMBH | DE | 113 | — | **no** | —/— | 0.0000 |
| MENLO SYSTEMS GMBH | DE | 119 | 6 | yes | 6/6 | 0.0000 |
| CONSORZIO NAZIONALE INTERUNIVERSITARIO PER LE TELECOMUNICAZIONI | IT | 71 | — | **no** | —/— | 0.0000 |
| ADVANCED SURFACE PLATING ApS | DK | 38 | 11 | yes | —/— | 0.0000 |
| NORSVIN R D | NO | 91 | 5 | yes | 5/5 | 0.0000 |
| CENTROTHERM INTERNATIONAL | DE | 118 | 22 | **no** | —/— | 0.0000 |
| SAFRAN AIRCRAFT ENGINES | FR | 98 | 4 | yes | 4/4 | 0.0000 |
| CULTIMATE FOODS | DE | 124 | — | **no** | —/— | 0.0000 |
| KUNNSKAPSPARKEN BODØ | NO | 95 | 62 | **no** | —/— | 0.0000 |
| ASS VAL'HOR | FR | 107 | 17 | yes | —/— | 0.0000 |
| CENTRUM VÝZKUMU ŘEŽ S.R.O. | CZ | 71 | 14 | yes | —/— | 0.0000 |
| AIRBUS ATLANTIC | FR | 114 | 73 | **no** | —/— | 0.0000 |
| INES PLATEFORME FORMATION EVALUATION | FR | 106 | 105 | **no** | —/— | 0.0000 |
| INSTITUT DE RECHERCHE TECHNOLOGIQUE JULES VERNE | FR | 88 | 80 | **no** | —/— | 0.0000 |
| Siemens | DE | 117 | 39 | **no** | —/— | 0.0000 |
| PEGAS NONWOVENS S.R.O. | CZ | 67 | 1 | yes | 1/1 | 0.0000 |
| SOPHIA HIGH TECH | IT | 83 | 17 | yes | —/— | 0.0000 |
| FRAUNHOFER GESELLSCHAFT ZUR FORDERUNG DER ANGEWANDTEN FORSCHUNG EV | DE | 105 | 30 | **no** | —/— | 0.0000 |
| LEONARDO -SOCIETA PER AZIONI | IT | 28 | — | **no** | —/— | 0.0000 |
| ENERGY TRANSITION NORWAY | NO | 92 | 87 | **no** | —/— | 0.0000 |
| GE AVIO SRL | IT | 73 | 40 | **no** | —/— | 0.0000 |
| DCUBED GMBH | DE | 119 | 113 | **no** | —/— | 0.0000 |
| SURFIX | NL | 36 | 2 | yes | 2/2 | 0.0000 |
| MOVING PROJECTS S.R.L. | IT | 76 | 69 | **no** | —/— | 0.0000 |
| CONSIGLIO NAZIONALE DELLE RICERCHE | IT | 20 | — | **no** | —/— | 0.0000 |
| NUROMEDIA | DE | 119 | 40 | **no** | —/— | 0.0000 |
| UNIVERSITA DEGLI STUDI DI MILANO | IT | 21 | — | **no** | —/— | 0.0000 |
| Paques Biomaterials B.V. | NL | 51 | 14 | yes | —/— | 0.0000 |
| GEORGSMARIENHUTTE | DE | 124 | 37 | **no** | —/— | 0.0000 |
| AGENTFLY TECHNOLOGIES S.R.O. | CZ | 76 | 15 | yes | —/— | 0.0000 |
| Diehl Aviation Laupheim GmbH | DE | 127 | — | **no** | —/— | 0.0000 |
| UNIVERSITY OF STUTTGART | DE | 112 | 4 | yes | 4/4 | 0.0000 |
| ASOCIACION EMPRESARIAL DE INVESTIGACION CENTRO TECNOLOGICO DEL MUEBLE Y LA MADERA DE LA REGION DE MURCIA | ES | 87 | 6 | yes | 6/6 | 0.0000 |
| ESTABANELL Y PAHISA ENERGIA | ES | 109 | 11 | yes | 8/8 | 0.0000 |
| CENTRUM VÝZKUMU ŘEŽ S.R.O. | CZ | 70 | 37 | **no** | —/— | 0.0000 |
| LYSE | NO | 92 | 38 | **no** | —/— | 0.0000 |
| MEDICINES DISCOVERY CATAPULT | GB | 22 | — | **no** | —/— | 0.0000 |
| ALFA LAVAL GOLBEY SAS | FR | 107 | 74 | **no** | —/— | 0.0000 |
| 3D COMPONENTS | NO | 92 | 9 | yes | —/— | 0.0000 |
| BLACK SEMICONDUCTOR | DE | 125 | 5 | yes | 4/4 | 0.0000 |
| DELIVRONE | FR | 108 | 90 | **no** | —/— | 0.0000 |
| FUNDACION CENER | ES | 86 | 20 | **no** | —/— | 0.0000 |
| OKOMERA | FR | 105 | 90 | **no** | —/— | 0.0000 |
| STATWOLF DATA SCIENCE S.R.L. | IT | 23 | — | **no** | —/— | 0.0000 |
| BASELL POLYOLEFINE GMBH | DE | 120 | 13 | yes | —/— | 0.0000 |
| FORTecH Software GmbH | DE | 122 | 2 | yes | 2/2 | 0.0000 |
| ADTRAN NETWORKS SE | DE | 127 | 120 | **no** | —/— | 0.0000 |
| KELDA DYNAMICS | NO | 91 | 22 | **no** | —/— | 0.0000 |
| Neolitik | FR | 98 | 63 | **no** | —/— | 0.0000 |
| FALKOR | NO | 90 | 24 | **no** | —/— | 0.0000 |
| FERRIERE NORD | IT | 31 | — | **no** | —/— | 0.0000 |
| GENTIAN | NO | 90 | 10 | yes | —/— | 0.0000 |
| UNIVERSITAT DE BARCELONA | ES | 82 | — | **no** | —/— | 0.0000 |
| UNIVERSIDAD POLITECNICA DE MADRID | ES | 77 | 28 | **no** | —/— | 0.0000 |
| SAFRAN DATA SYSTEMS | FR | 104 | 9 | yes | 8/8 | 0.0000 |
| DIGITALTWIN TECHNOLOGY | DE | 118 | 21 | **no** | —/— | 0.0000 |
| AB5 CONSULTING | GB | 22 | — | **no** | —/— | 0.0000 |
| CONSIGLIO NAZIONALE DELLE RICERCHE | IT | 22 | 4 | yes | 4/4 | 0.0000 |
| KURAGE | FR | 109 | 92 | **no** | —/— | 0.0000 |
| ACTRONIKA | FR | 108 | — | **no** | —/— | 0.0000 |
| AVINOR | NO | 95 | 2 | yes | 2/2 | 0.0000 |
| LECLANCHE GMBH | DE | 120 | — | **no** | —/— | 0.0000 |
| SAINT DIZIER ENVIRONNEMENT | FR | 114 | 96 | **no** | —/— | 0.0000 |
| HUDDLE CORP | FR | 96 | 5 | yes | 5/5 | 0.0000 |
| PACERTOOL | NO | 90 | 22 | **no** | —/— | 0.0000 |
| FISKÅ MØLLE | NO | 88 | 41 | **no** | —/— | 0.0000 |
| BENTELER AUTOMOTIVE RAUFOSS | NO | 87 | 19 | **no** | —/— | 0.0000 |
| AGOPRENE | NO | 95 | — | **no** | —/— | 0.0000 |
| VALO VERTE | FR | 114 | 12 | yes | —/— | 0.0000 |
| PLASMASOLVE S.R.O. | CZ | 75 | 37 | **no** | —/— | 0.0000 |
| Holosolis | FR | 105 | — | **no** | —/— | 0.0000 |
| A G H T MILES | GB | 22 | — | **no** | —/— | 0.0000 |
| CHILLSERVICES | DE | 132 | 27 | **no** | —/— | 0.0000 |
| HERIOT WATT UNIVERSITY THE | GB | 21 | — | **no** | —/— | 0.0000 |
| Fondazione Rome Technopole | IT | 73 | 23 | **no** | —/— | 0.0000 |
| TXT E-TECH SRL | IT | 74 | 68 | **no** | —/— | 0.0000 |
| BABYSENSOR | NO | 90 | 8 | yes | 7/7 | 0.0000 |
| Beyond Leather Materials ApS | DK | 33 | 2 | yes | 2/2 | 0.0000 |
| FRATELLI PIACENZA | IT | 91 | 6 | yes | 4/4 | 0.0000 |
| VAIMOO | IT | 84 | 34 | **no** | —/— | 0.0000 |
| MORFO | FR | 107 | — | **no** | —/— | 0.0000 |
| ELEKTROBIT AUTOMOTIVE | DE | 125 | 106 | **no** | —/— | 0.0000 |
| Merck Electronics KGaA | DE | 112 | — | **no** | —/— | 0.0000 |
| ASISTOBE | NO | 87 | — | **no** | —/— | 0.0000 |
| SMARTE BYER NORGE | NO | 90 | 41 | **no** | —/— | 0.0000 |
| MYCOPHYTO | FR | 98 | 32 | **no** | —/— | 0.0000 |
| LINGALAKS | NO | 96 | 2 | yes | 2/2 | 0.0000 |
| SCIERIE PALETTERIE GERHARD | FR | 104 | 23 | **no** | —/— | 0.0000 |
| ALMIRALL SA | ES | 98 | 5 | yes | 5/5 | 0.0000 |
| SCIERIE GERMAIN MOUGENOT | FR | 114 | 27 | **no** | —/— | 0.0000 |
| WARTSILA ITALIA | IT | 21 | — | **no** | —/— | 0.0000 |
| AGROVISTA | GB | 27 | — | **no** | —/— | 0.0000 |
| FRAUNHOFER GESELLSCHAFT ZUR FORDERUNG DER ANGEWANDTEN FORSCHUNG EV | DE | 107 | — | **no** | —/— | 0.0000 |
| AKER SOLUTIONS | NO | 96 | 30 | **no** | —/— | 0.0000 |
| MAHLE New Mobility Solutions GmbH | DE | 113 | 3 | yes | 3/3 | 0.0000 |
| BASQUEVOLT SA | ES | 101 | — | **no** | —/— | 0.0000 |
| BRUKER NANO | DE | 132 | 3 | yes | 3/3 | 0.0000 |
| CENATE | NO | 89 | 19 | **no** | —/— | 0.0000 |
| IMMERSION | FR | 100 | 20 | **no** | —/— | 0.0000 |
| FRAUNHOFER GESELLSCHAFT ZUR FORDERUNG DER ANGEWANDTEN FORSCHUNG EV | DE | 107 | 40 | **no** | —/— | 0.0000 |
| PIAGGIO AERO INDUSTRIES | IT | 83 | 29 | **no** | —/— | 0.0000 |
| ADJUTEC PHARMA | NO | 96 | 9 | yes | 7/7 | 0.0000 |
| DIGITAL CATAPULT | GB | 23 | — | **no** | —/— | 0.0000 |
| AVATAR MEDICAL | FR | 100 | 13 | yes | —/— | 0.0000 |
| DNV IMATIS | NO | 90 | 9 | yes | 8/8 | 0.0000 |
| AEON ENGINEERING | GB | 16 | — | **no** | —/— | 0.0000 |
| CONNECTED PLACES CATAPULT | GB | 27 | — | **no** | —/— | 0.0000 |
| UNIVERSITE COTE D'AZUR | FR | 85 | 72 | **no** | —/— | 0.0000 |
| GWE BUSINESS WEST | GB | 22 | — | **no** | —/— | 0.0000 |
| LEONARDO -SOCIETA PER AZIONI | IT | 24 | 6 | yes | 6/6 | 0.0000 |
| ADVANCED SURFACE PLATING ApS | DK | 36 | 5 | yes | 5/5 | 0.0000 |
| 4MOST EUROPE | GB | 21 | — | **no** | —/— | 0.0000 |
| AKER SOLUTIONS | NO | 96 | 1 | yes | 1/1 | 0.0000 |
| GRAYN | NO | 90 | 74 | **no** | —/— | 0.0000 |
| ELFLY | NO | 97 | 4 | yes | 4/4 | 0.0000 |
| 3B FIBREGLASS NORWAY | NO | 87 | — | **no** | —/— | 0.0000 |
| AGENTFLY TECHNOLOGIES S.R.O. | CZ | 77 | 12 | yes | —/— | 0.0000 |
| CETASOL | SE | 83 | 15 | yes | —/— | 0.0000 |
| FALKOR | NO | 95 | 21 | **no** | —/— | 0.0000 |
| DNV IMATIS | NO | 90 | 8 | yes | 7/7 | 0.0000 |
| SATT NOD | FR | 109 | 19 | **no** | —/— | 0.0000 |
| AVIANT | NO | 89 | — | **no** | —/— | 0.0000 |
| ELFLY | NO | 97 | 2 | yes | 2/2 | 0.0000 |
| Polyperception | BE | 36 | 22 | **no** | —/— | 0.0000 |
| STICHTING IMEC NEDERLAND | NL | 45 | 2 | yes | 2/2 | 0.0000 |
| LIVEEO GMBH | DE | 121 | 5 | yes | 5/5 | 0.0000 |
| ROOFLINEAI GMBH | DE | 121 | 27 | **no** | —/— | 0.0000 |
| SAGA ROBOTICS | NO | 88 | 34 | **no** | —/— | 0.0000 |
| LABORD GLUECOM FRANCE | FR | 114 | 5 | yes | 5/5 | 0.0000 |
| DISTRO | FR | 114 | 106 | **no** | —/— | 0.0000 |
| HYSYTECH | IT | 30 | — | **no** | —/— | 0.0000 |
| MENLO SYSTEMS GMBH | DE | 119 | 6 | yes | 6/6 | 0.0000 |
| LUNDS UNIVERSITET | SE | 68 | 18 | yes | —/— | 0.0000 |
| SOLARLITE CSP TECHNOLOGY | DE | 123 | 7 | yes | 7/7 | 0.0000 |
| Matoha | GB | 22 | 2 | yes | 2/2 | 0.0000 |
| ENOSIS | FR | 114 | 95 | **no** | —/— | 0.0000 |
| Focused Energy GmbH | DE | 115 | 24 | **no** | —/— | 0.0000 |
| SOLUTION SEEKER | NO | 89 | 1 | yes | 1/1 | 0.0000 |
| KUNNSKAPSPARKEN BODØ | NO | 89 | 29 | **no** | —/— | 0.0000 |
| AIBA | NO | 90 | 3 | yes | 3/3 | 0.0000 |
| ELEKTROBIT AUTOMOTIVE | DE | 110 | 30 | **no** | —/— | 0.0000 |
| EURIX | IT | 28 | — | **no** | —/— | 0.0000 |
| LUNDS UNIVERSITET | SE | 74 | 37 | **no** | —/— | 0.0000 |
| BLYKALLA AB | SE | 71 | 34 | **no** | —/— | 0.0000 |
| PACE AEROSPACE ENGINEERING AND INFORMATION TECHNOLOGY | DE | 123 | 69 | **no** | —/— | 0.0000 |
| ACITURRI ENGINEERING | ES | 108 | 3 | yes | 3/3 | 0.0000 |
| BOLIGMAPPA | NO | 90 | 1 | yes | 1/1 | 0.0000 |
| DIOXYCLE | FR | 96 | 81 | **no** | —/— | 0.0000 |
| HUTCHINSON | FR | 101 | 20 | **no** | —/— | 0.0000 |
| Diehl Aviation Gilching GmbH | DE | 127 | — | **no** | —/— | 0.0000 |
| NXP SEMICONDUCTORS GERMANY GMBH | DE | 112 | 23 | **no** | —/— | 0.0000 |
| SFE PROCESS | FR | 115 | 101 | **no** | —/— | 0.0000 |
| ENERGY SYSTEMS CATAPULT LIMITED | GB | 27 | — | **no** | —/— | 0.0000 |
| UNIVERSITA DEGLI STUDI DELLA CAMPANIA LUIGI VANVITELLI | IT | 78 | 22 | **no** | —/— | 0.0000 |
| AKKODIS INGENIERIE PRODUIT | FR | 106 | 1 | yes | 1/1 | 0.0000 |
| ABORA ENERGY SOCIEDAD LIMITADA | ES | 109 | 6 | yes | 4/4 | 0.0000 |
| HYDRONAUT PROJECT A.S. | CZ | 70 | 38 | **no** | —/— | 0.0000 |
| KUNNSKAPSPARKEN BODØ | NO | 95 | 12 | yes | —/— | 0.0000 |
| FRENTECH AEROSPACE S.R.O. | CZ | 63 | 1 | yes | 1/1 | 0.0000 |
| IMST | DE | 109 | 34 | **no** | —/— | 0.0000 |
| AGOPRENE | NO | 95 | 63 | **no** | —/— | 0.0000 |
| AIBA | NO | 87 | 5 | yes | 4/4 | 0.0000 |
| CLOUD CYCLE LTD | GB | 22 | — | **no** | —/— | 0.0000 |
| EPIGUARD | NO | 90 | 56 | **no** | —/— | 0.0000 |
| EVYON | NO | 89 | 12 | yes | —/— | 0.0000 |
| ABERDEEN CITY COUNCIL | GB | 16 | — | **no** | —/— | 0.0000 |
| UNIVERSITA DEGLI STUDI DI CATANIA | IT | 71 | 15 | yes | —/— | 0.0000 |
| MATERIÁLOVÝ A METALURGICKÝ VÝZKUM S.R.O. | CZ | 71 | 21 | **no** | —/— | 0.0000 |
| AKER SOLUTIONS | NO | 96 | 9 | yes | —/— | 0.0000 |
| ZEFAL | FR | 114 | 66 | **no** | —/— | 0.0000 |
| Bioomix ApS | DK | 33 | 3 | yes | 3/3 | 0.0000 |
| CARTESIAN | NO | 97 | 6 | yes | 5/5 | 0.0000 |
| Siemens | DE | 118 | 32 | **no** | —/— | 0.0000 |
| HELIUP | FR | 94 | 68 | **no** | —/— | 0.0000 |
| IADYS | FR | 99 | 7 | yes | 7/7 | 0.0000 |
| MOTEURS LEROY SOMER | FR | 96 | — | **no** | —/— | 0.0000 |
| QUANTUM OPTICS JENA | DE | 116 | 5 | yes | 5/5 | 0.0000 |
| BAYERISCHE MOTOREN WERKE AKTIENGESELLSCHAFT | DE | 119 | 4 | yes | 4/4 | 0.0000 |
| AIBA | NO | 89 | 6 | yes | —/— | 0.0000 |
| GEOKOMPETENZZENTRUM FREIBERG EV | DE | 128 | 100 | **no** | —/— | 0.0000 |
| ENTER | FR | 107 | 93 | **no** | —/— | 0.0000 |
| WELL ID | NO | 90 | 17 | yes | —/— | 0.0000 |
| DEUTSCHES ZENTRUM FUR LUFT - UND RAUMFAHRT EV | DE | 131 | 22 | **no** | —/— | 0.0000 |
| HIGH VALUE MANUFACTURING CATAPULT | GB | 22 | — | **no** | —/— | 0.0000 |
| ASML Berlin GmbH | DE | 113 | 1 | yes | 1/1 | 0.0000 |
| Cisteo MEDICAL | FR | 109 | 93 | **no** | —/— | 0.0000 |
| 60ND SL | ES | 98 | 4 | yes | 4/4 | 0.0000 |
| LUNDS UNIVERSITET | SE | 70 | — | **no** | —/— | 0.0000 |
| Induo | FR | 107 | 85 | **no** | —/— | 0.0000 |
| VITESCO TECHNOLOGIES | DE | 119 | 34 | **no** | —/— | 0.0000 |
| FONDAZIONE ISTITUTO ITALIANO DI TECNOLOGIA | IT | 15 | — | **no** | —/— | 0.0000 |
| MUNIC | FR | 108 | 95 | **no** | —/— | 0.0000 |
| CRODA EUROPE | GB | 22 | — | **no** | —/— | 0.0000 |
| KARLSRUHER INSTITUT FUER TECHNOLOGIE | DE | 99 | — | **no** | —/— | 0.0000 |
| Freiberger Compound Materials Gesellschaft mit beschränkter Haftung | DE | 124 | 20 | **no** | —/— | 0.0000 |
| MENLO SYSTEMS GMBH | DE | 115 | 4 | yes | 4/4 | 0.0000 |
| DEUTSCHES ZENTRUM FUR LUFT - UND RAUMFAHRT EV | DE | 131 | 83 | **no** | —/— | 0.0000 |
| MAGIA DIAGNOSTICS | FR | 109 | 96 | **no** | —/— | 0.0000 |
| BATTOLYSER HOLDING BV | NL | 45 | 19 | **no** | —/— | 0.0000 |
| SILIOS TECHNOLOGIES | FR | 103 | 32 | **no** | —/— | 0.0000 |
| DALKIA | FR | 114 | 1 | yes | 1/1 | 0.0000 |
| FUNDACION TECNOLOGICA ADVANTX | ES | 74 | 1 | yes | 1/1 | 0.0000 |
| CRUARD CHARPENTE ET CONSTRUCTION BOIS | FR | 95 | 84 | **no** | —/— | 0.0000 |
| AEGENIC | GB | 16 | — | **no** | —/— | 0.0000 |
| INTERMODULATION PRODUCTS AB | SE | 64 | 9 | yes | —/— | 0.0000 |
| 28X | GB | 22 | — | **no** | —/— | 0.0000 |
| VÝZKUMNÝ A ZKUŠEBNÍ ÚSTAV PLZEŇ S.R.O. | CZ | 75 | 39 | **no** | —/— | 0.0000 |
| AQUASIUM TECHNOLOGY | GB | 28 | — | **no** | —/— | 0.0000 |
| BIOME TECHNOLOGIES | GB | 21 | — | **no** | —/— | 0.0000 |
| REPSOL EXPLORACION SA | ES | 101 | 4 | yes | —/— | 0.0000 |
| 2FREEDOM IMAGING SOFTWARE AND HARDWARE | ES | 99 | 2 | yes | 2/2 | 0.0000 |
| CENTRO NACIONAL DE TECNOLOGIA Y SEGURIDAD ALIMENTARIA | ES | 97 | 14 | yes | —/— | 0.0000 |
| NEXT GENERATION SENSORS BV | NL | 45 | 5 | yes | 5/5 | 0.0000 |
| Cemecon Scandinavia A/S | DK | 26 | 2 | yes | 2/2 | 0.0000 |
| CAP HOLDING | IT | 30 | — | **no** | —/— | 0.0000 |
| WAGENINGEN UNIVERSITY | NL | 48 | 26 | **no** | —/— | 0.0000 |
| CRYTUR, SPOL. S R.O. | CZ | 61 | 22 | **no** | —/— | 0.0000 |
| REINOVA | IT | 78 | 31 | **no** | —/— | 0.0000 |
| BRIGHTSPARKS AGENCY | GB | 28 | — | **no** | —/— | 0.0000 |
| A HEALTHIER EARTH | GB | 27 | — | **no** | —/— | 0.0000 |
| LINGEA S.R.O. | CZ | 70 | 23 | **no** | —/— | 0.0000 |
| EAST MIDLANDS CHAMBER | GB | 21 | — | **no** | —/— | 0.0000 |
| BOEING UNITED KINGDOM | GB | 28 | — | **no** | —/— | 0.0000 |
| DEMCON SYNC BIOSYSTEMS BV | NL | 47 | 42 | **no** | —/— | 0.0000 |
| FUNDACION PRIVADA INSTITUTO DE SALUD GLOBAL BARCELONA | ES | 77 | 14 | yes | —/— | 0.0000 |
| FUNDACIO HOSPITAL UNIVERSITARI VALL D'HEBRON - INSTITUT DE RECERCA | ES | 76 | 9 | yes | 7/7 | 0.0000 |
| LEONARDO -SOCIETA PER AZIONI | IT | 28 | 5 | yes | 5/5 | 0.0000 |
| ADVANCED CONSTRUCTION TECHNOLOGIES | GB | 22 | — | **no** | —/— | 0.0000 |
| FONONTECH HOLDING BV | NL | 49 | 6 | yes | 6/6 | 0.0000 |
| MINE STORAGE INTERNATIONAL AB | SE | 78 | 9 | yes | —/— | 0.0000 |
| LUNDS UNIVERSITET | SE | 77 | 37 | **no** | —/— | 0.0000 |
| CENTRUM VÝZKUMU ŘEŽ S.R.O. | CZ | 76 | 4 | yes | 4/4 | 0.0000 |
| FOM TECHNOLOGIES | DK | 28 | 5 | yes | 5/5 | 0.0000 |
| AEROSPAZIO TECNOLOGIE | IT | 82 | 4 | yes | 4/4 | 0.0000 |
| UNIVERSITA DEGLI STUDI DI SALERNO | IT | 73 | 24 | **no** | —/— | 0.0000 |
| LUNDS UNIVERSITET | SE | 69 | 46 | **no** | —/— | 0.0000 |
| NMIS UNIVERSITY OF STRATHCLYDE | GB | 22 | — | **no** | —/— | 0.0000 |
| INESAN, S.R.O. | CZ | 72 | 49 | **no** | —/— | 0.0000 |
| ACTECO PRODUCTOS Y SERVICIOS | ES | 116 | 5 | yes | 5/5 | 0.0000 |
| Seep | GB | 28 | 4 | yes | 4/4 | 0.0000 |
| ALLOYED | GB | 22 | — | **no** | —/— | 0.0000 |
| AKER SOLUTIONS | NO | 96 | 15 | yes | —/— | 0.0000 |
| NEXTERA | NO | 90 | 65 | **no** | —/— | 0.0000 |
| BITPET | NO | 91 | — | **no** | —/— | 0.0000 |
| GAS 2 FEED | NO | 96 | 36 | **no** | —/— | 0.0000 |
| AS B ZEOS | NO | 88 | 16 | yes | —/— | 0.0000 |
| FRAUNHOFER GESELLSCHAFT ZUR FORDERUNG DER ANGEWANDTEN FORSCHUNG EV | DE | 107 | — | **no** | —/— | 0.0000 |
| Ceus UG (haftungsbeschränkt) | DE | 119 | 2 | yes | 2/2 | 0.0000 |
| GLENCORE NIKKELVERK | NO | 89 | 2 | yes | 2/2 | 0.0000 |
| 50HERTZ TRANSMISSION | DE | 125 | 7 | yes | 7/7 | 0.0000 |
| KONGSBERG DEFENCE AEROSPACE | NO | 91 | 52 | **no** | —/— | 0.0000 |
| ELKEM | NO | 87 | 13 | yes | —/— | 0.0000 |
| Diehl Aerospace GmbH | DE | 120 | — | **no** | —/— | 0.0000 |
| NAMLAB GGMBH | DE | 125 | 21 | **no** | —/— | 0.0000 |
| FFT PRODUKTIONSSYSTEME | DE | 116 | 42 | **no** | —/— | 0.0000 |
| ADJUCOR GMBH | DE | 128 | 118 | **no** | —/— | 0.0000 |
| AKIGAI | NO | 90 | 7 | yes | 6/6 | 0.0000 |
| SOLREED | FR | 106 | 87 | **no** | —/— | 0.0000 |
| AF DECOM | NO | 91 | — | **no** | —/— | 0.0000 |
| Twenty-One Semiconductors | DE | 117 | 42 | **no** | —/— | 0.0000 |
| OSLO ECONOMICS | NO | 90 | 50 | **no** | —/— | 0.0000 |
| G E O S INGENIEURGESELLSCHAFT MBH | DE | 120 | 27 | **no** | —/— | 0.0000 |
| ALTERMAT | FR | 114 | 20 | **no** | —/— | 0.0000 |
| NEUROCONN | DE | 124 | 2 | yes | 2/2 | 0.0000 |
| ParTec AG | DE | 113 | 17 | yes | —/— | 0.0000 |
| Merck Electronics KGaA | DE | 110 | 18 | yes | —/— | 0.0000 |
| AMADEUS | FR | 107 | 77 | **no** | —/— | 0.0000 |
| CORTICALIS | NO | 87 | 23 | **no** | —/— | 0.0000 |
| DEUTSCHES ZENTRUM FUR LUFT - UND RAUMFAHRT EV | DE | 124 | — | **no** | —/— | 0.0000 |
| AURA AERO SAS | FR | 91 | 31 | **no** | —/— | 0.0000 |
| ANIMAJ | FR | 106 | 91 | **no** | —/— | 0.0000 |
| VITESCO TECHNOLOGIES | DE | 125 | 31 | **no** | —/— | 0.0000 |
| Siemens | DE | 118 | 9 | yes | 8/8 | 0.0000 |
| 3D COMPONENTS | NO | 88 | 15 | yes | —/— | 0.0000 |
| SOCIETE FINANCIERE BERT | FR | 108 | 9 | yes | —/— | 0.0000 |
| A4MT | FR | 116 | 58 | **no** | —/— | 0.0000 |
| ABBVIE DEUTSCHLAND GMBH CO KG | DE | 121 | 113 | **no** | —/— | 0.0000 |
| SWABIAN INSTRUMENTS | DE | 126 | 1 | yes | 1/1 | 0.0000 |
| INSTITUT TECHNOLOGIQUE FCBA (FORET CELLULOSE BOIS...) | FR | 98 | 83 | **no** | —/— | 0.0000 |
| GADS | FR | 109 | 102 | **no** | —/— | 0.0000 |
| ANGIOLUTIONS GMBH | DE | 128 | 52 | **no** | —/— | 0.0000 |
| PRE DIAGNOSTICS | NO | 90 | 38 | **no** | —/— | 0.0000 |
| ARCTIC ENERGY PARTNERS | NO | 97 | 7 | yes | 6/6 | 0.0000 |
| FISKÅ MØLLE | NO | 91 | 2 | yes | 2/2 | 0.0000 |
| KUNNSKAPSPARKEN BODØ | NO | 95 | 73 | **no** | —/— | 0.0000 |
| RHEINMETALL WAFFE MUNITION GMBH | DE | 120 | 35 | **no** | —/— | 0.0000 |
| PRONOE | FR | 105 | 74 | **no** | —/— | 0.0000 |
| BENCHMARK GENETICS NORWAY | NO | 96 | 1 | yes | 1/1 | 0.0000 |
| AVL DEUTSCHLAND | DE | 122 | 54 | **no** | —/— | 0.0000 |
| GKN AEROSPACE NORWAY | NO | 97 | 23 | **no** | —/— | 0.0000 |
| ALSTOM TRANSPORT SA | FR | 107 | 64 | **no** | —/— | 0.0000 |
| MYWORKOUT | NO | 90 | 8 | yes | 7/7 | 0.0000 |
| Technische Hochschule Rosenheim | DE | 105 | 17 | yes | —/— | 0.0000 |
| DELTALYS | FR | 95 | 42 | **no** | —/— | 0.0000 |
| TECO 2030 | NO | 96 | 32 | **no** | —/— | 0.0000 |
| KOBLA | NO | 91 | 13 | yes | —/— | 0.0000 |
| CHANTIERS DE L ATLANTIQUE | FR | 114 | 97 | **no** | —/— | 0.0000 |
| GRAMINOR | NO | 91 | 4 | yes | 4/4 | 0.0000 |
| ASPLAN VIAK | NO | 95 | 13 | yes | —/— | 0.0000 |
| UNIVERSITY OF STUTTGART | DE | 105 | — | **no** | —/— | 0.0000 |
| AVL DEUTSCHLAND | DE | 123 | 29 | **no** | —/— | 0.0000 |
| AVIANT | NO | 91 | — | **no** | —/— | 0.0000 |
