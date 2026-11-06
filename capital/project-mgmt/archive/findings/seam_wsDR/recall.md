# wsDR — the seam in both positions (mode=recall)

```
corpus=postgres instruments=1088 at 2026-08-11T08:34:12.876Z
ranker: all 45 request(s) on EMBEDDING
agent-select: arm=adviser depth=40 count=6 effort=low lookups=0 (0 brief(s) retrieved) model=claude-sonnet-5 — 90/90 chose, 0 FELL BACK to the shipped order (0 empty reply, 0 unparseable), 0 short reply, 0 unusable id(s), EUR 2.0501 total, EUR 0.0228 per brief
arm=adviser · LEVER=seam position (late|early), both run per founder in ONE process off ONE pool object
default seam for the product: AGENT_SELECT_SEAM=late
levers: depth=40 count=6 effort=low lookups=5 pool=18 published_cap=7
base rate quoted to the model: curve on 846 held-out founders, P(won in first 6)=26.6% P(won in first 18)=44.2% P(won in first 40)=63.8%
total EUR 2.0501 over 45 founders x 2 seams
```

## The base-rate line, as the two seams print it

```
late  (list of 18):

Measured on 846 held-out companies, the scheme that actually paid out is in
the first six rows about 25% of the time, and somewhere in this list of 18
about 45% of the time.
So about 20% of the time it is in this list but BELOW the sixth row --
that is the whole of what a choice of yours can win -- and about 55% of the
time it is not in this list at all, and nothing you pick can reach it.
```
```
early (list of 40):

Measured on 846 held-out companies, the scheme that actually paid out is in
the first six rows about 25% of the time, and somewhere in this list of 40
about 65% of the time.
So about 40% of the time it is in this list but BELOW the sixth row --
that is the whole of what a choice of yours can win -- and about 35% of the
time it is not in this list at all, and nothing you pick can reach it.
```

## Depth

| | list shown | mean deepest reach |
|---|---:|---:|
| late (after the cut) | 18.0 | 13.0 |
| early (before the cut) | 37.0 | 23.8 |

mean accessible pool: **87.4** rows

## Pool recall — does the answer survive each cut (45 founders with an answer key)

| cut | won fund in the 18-row pool |
|---|---:|
| the score's (control) | 14/45 — 31.1% |
| late seam | 14/45 — 31.1% |
| early seam | 14/45 — 31.1% |

The late seam is a pure permutation of the score's cut, so its pool recall is equal to the control BY CONSTRUCTION and any difference in that row is a bug. The early seam's is the number the membership change has to be bought with.

- **the early cut DROPPED the answer** the score's cut held: 0 (none)
- **the early cut ADMITTED an answer** the score's cut missed: 0 (none)

## EXACT — the won fund in the published projection

| arm | EXACT@5 | EXACT@6 |
|---|---:|---:|
| off (score only) | 9/45 — 20.0% | 11/45 — 24.4% |
| late seam | 10/45 — 22.2% | 10/45 — 22.2% |
| early seam | 8/45 — 17.8% | 9/45 — 20.0% |

## Movement in the published projection

- mean rows the late seam changed: **2.2** of 7
- mean rows the early seam changed: **3.1** of 7
- fell back to the shipped order: late 0, early 0, of 45

## Per founder

| founder | accessible | won @ accessible | late menu/deepest | early menu/deepest | won in pool off/late/early | won rank off/late/early | EUR |
|---|---:|---:|---|---|---|---|---:|
| KARLSRUHER INSTITUT FUER TECHNOLOGIE (DE) | 114 | — | 18/14 | 40/20 | **no**/**no**/**no** | —/—/— | 0.0550 |
| UNIVERSITY OF STUTTGART (DE) | 114 | 5 | 18/15 | 40/32 | yes/yes/yes | 5/2/— | 0.0514 |
| CONSIGLIO NAZIONALE DELLE RICERCHE (IT) | 20 | — | 18/9 | 20/11 | **no**/**no**/**no** | —/—/— | 0.0383 |
| ERASMUS UNIVERSITAIR MEDISCH CENTRUM ROTTERDAM (NL) | 49 | 8 | 18/11 | 40/11 | yes/yes/yes | 7/4/5 | 0.0460 |
| DEUTSCHES ZENTRUM FUR LUFT - UND RAUMFAHRT EV (DE) | 134 | 100 | 18/14 | 40/32 | **no**/**no**/**no** | —/—/— | 0.0511 |
| FUNDACION TECNOLOGICA ADVANTX (ES) | 127 | 1 | 18/5 | 40/26 | yes/yes/yes | 1/1/1 | 0.0391 |
| UNIVERSITAT DE BARCELONA (ES) | 135 | — | 18/16 | 40/16 | **no**/**no**/**no** | —/—/— | 0.0457 |
| FONDAZIONE ISTITUTO ITALIANO DI TECNOLOGIA (IT) | 24 | — | 18/17 | 24/17 | **no**/**no**/**no** | —/—/— | 0.0380 |
| STICHTING IMEC NEDERLAND (NL) | 52 | 2 | 18/13 | 40/16 | yes/yes/yes | 2/2/2 | 0.0463 |
| UNIVERSITA DEGLI STUDI DI MILANO (IT) | 30 | — | 18/12 | 30/12 | **no**/**no**/**no** | —/—/— | 0.0415 |
| COMMISSARIAT A L ENERGIE ATOMIQUE ET AUX ENERGIES ALTERNATIVES (FR) | 99 | 20 | 18/14 | 40/20 | **no**/**no**/**no** | —/—/— | 0.0465 |
| LIVEEO GMBH (DE) | 126 | 5 | 18/14 | 40/30 | yes/yes/yes | 5/—/— | 0.0544 |
| WAGENINGEN UNIVERSITY (NL) | 48 | 3 | 18/14 | 40/26 | yes/yes/yes | 3/1/1 | 0.0461 |
| UNIVERSIDAD POLITECNICA DE MADRID (ES) | 133 | 66 | 18/12 | 40/36 | **no**/**no**/**no** | —/—/— | 0.0417 |
| UNIVERSITA DEGLI STUDI DI SALERNO (IT) | 79 | 28 | 18/9 | 40/30 | **no**/**no**/**no** | —/—/— | 0.0464 |
| Cisteo MEDICAL (FR) | 110 | 12 | 18/14 | 40/27 | yes/yes/yes | —/2/2 | 0.0495 |
| UNIVERSITE COTE D'AZUR (FR) | 87 | 2 | 18/13 | 40/9 | yes/yes/yes | 2/4/5 | 0.0481 |
| LUNDS UNIVERSITET (SE) | 80 | — | 18/9 | 40/9 | **no**/**no**/**no** | —/—/— | 0.0385 |
| Focused Energy GmbH (DE) | 115 | 25 | 18/12 | 40/37 | **no**/**no**/**no** | —/—/— | 0.0497 |
| BLYKALLA AB (SE) | 71 | 36 | 18/17 | 40/37 | **no**/**no**/**no** | —/—/— | 0.0393 |
| BASQUEVOLT SA (ES) | 162 | — | 18/10 | 40/13 | **no**/**no**/**no** | —/—/— | 0.0416 |
| FONONTECH HOLDING BV (NL) | 50 | 6 | 18/12 | 40/27 | yes/yes/yes | 6/—/— | 0.0454 |
| AURA AERO SAS (FR) | 97 | 2 | 18/17 | 40/32 | yes/yes/yes | 2/3/4 | 0.0522 |
| DCUBED GMBH (DE) | 119 | 119 | 18/13 | 40/39 | **no**/**no**/**no** | —/—/— | 0.0516 |
| MAGTEL OPERACIONES (ES) | 169 | 28 | 18/17 | 40/17 | **no**/**no**/**no** | —/—/— | 0.0405 |
| INSTITUT DE RECHERCHE TECHNOLOGIQUE JULES VERNE (FR) | 89 | 77 | 18/13 | 40/31 | **no**/**no**/**no** | —/—/— | 0.0472 |
| CHANTIERS DE L ATLANTIQUE (FR) | 114 | 93 | 18/9 | 40/30 | **no**/**no**/**no** | —/—/— | 0.0462 |
| MOVING PROJECTS S.R.L. (IT) | 82 | 31 | 18/17 | 40/39 | **no**/**no**/**no** | —/—/— | 0.0458 |
| FERRIERE NORD (IT) | 31 | — | 18/12 | 31/13 | **no**/**no**/**no** | —/—/— | 0.0458 |
| G E O S INGENIEURGESELLSCHAFT MBH (DE) | 113 | 29 | 18/12 | 40/33 | **no**/**no**/**no** | —/—/— | 0.0546 |
| CULTIMATE FOODS (DE) | 124 | — | 18/14 | 40/29 | **no**/**no**/**no** | —/—/— | 0.0522 |
| Paques Biomaterials B.V. (NL) | 51 | 14 | 18/9 | 40/19 | yes/yes/yes | —/—/— | 0.0457 |
| Diehl Aviation Gilching GmbH (DE) | 127 | — | 18/9 | 40/36 | **no**/**no**/**no** | —/—/— | 0.0528 |
| IMMERSION (FR) | 101 | 22 | 18/13 | 40/39 | **no**/**no**/**no** | —/—/— | 0.0450 |
| AEROSPAZIO TECNOLOGIE (IT) | 82 | 5 | 18/17 | 40/21 | yes/yes/yes | 5/3/3 | 0.0452 |
| NEUROCONN (DE) | 124 | 2 | 18/10 | 40/27 | yes/yes/yes | 2/2/6 | 0.0527 |
| FRATELLI PIACENZA (IT) | 91 | 8 | 18/16 | 40/27 | yes/yes/yes | 6/—/— | 0.0461 |
| WARTSILA ITALIA (IT) | 21 | — | 18/13 | 21/9 | **no**/**no**/**no** | —/—/— | 0.0380 |
| SOPHIA HIGH TECH (IT) | 83 | 23 | 18/16 | 40/32 | **no**/**no**/**no** | —/—/— | 0.0466 |
| AMADEUS (FR) | 108 | 90 | 18/16 | 40/17 | **no**/**no**/**no** | —/—/— | 0.0483 |
| CENTRO NACIONAL DE TECNOLOGIA Y SEGURIDAD ALIMENTARIA (ES) | 150 | 59 | 18/14 | 40/14 | **no**/**no**/**no** | —/—/— | 0.0386 |
| CONNECTED PLACES CATAPULT (GB) | 27 | — | 18/9 | 27/20 | **no**/**no**/**no** | —/—/— | 0.0388 |
| DIGITAL CATAPULT (GB) | 24 | — | 18/17 | 24/23 | **no**/**no**/**no** | —/—/— | 0.0399 |
| ENERGY SYSTEMS CATAPULT LIMITED (GB) | 27 | — | 18/15 | 27/19 | **no**/**no**/**no** | —/—/— | 0.0388 |
| HERIOT WATT UNIVERSITY THE (GB) | 21 | — | 18/13 | 21/12 | **no**/**no**/**no** | —/—/— | 0.0381 |
