# wsHO — the forty-row call, priced; the ceiling, exercised; the ordering, pointed

```
started            2026-08-18T22:27:23.639Z
finished           2026-08-18T22:40:24.484Z
corpus             postgres instruments=1088 at 2026-08-18T22:27:24.196Z
ranker: all 819 request(s) on EMBEDDING
agent-select: arm=off, no calls made
agent-select exits: the seam was not reached
set                __recallSetDescribed.json  split=holdout  seed=20260806
population         897 founder(s), fingerprint 13cb71cf3a1d1847
walked             897 of 897 in seeded-shuffle order
```

### The full lever set this figure was produced under

A paid figure without the configuration that produced it is not reusable, and
this one is meant to be the baseline the eventual full run is compared against.
Every value below is read from the SHIPPED constant, never from `process.env` —
a dump that cannot say which arm produced it is not evidence (wsHA).

```
arm                off          seam late
AWARD_TERM         oneside       <- flipped 2026-08-17 on wsHE; NEVER SEEN BY A MODEL BEFORE
PROFILE_BLOCK      complete      <- NEVER SEEN BY A MODEL BEFORE
POOL_BLEND         off          ROW_PROXIMITY off
VERDICT_POOL       40           SELECT_DEPTH 40   menu = min(depth, pool)
SELECT_COUNT       7            SELECT_COUNT_MODE exactly
AGENT_SELECT_UNSURE declare     LOOKUP_MAX 5
WRITER_CANDIDATE_CAP 7   published_cap 7   shown 6
AGENT_SELECT_EFFORT low      maxtok 8192   clock 40000ms
```

**EVERY LEVER ABOVE IS THE SHIPPED DEFAULT. Nothing was tuned for the measurement.**
`AGENT_SELECT_EFFORT` is `low`, which is what production runs
(max_tokens 8,192, 40s clock). The cost, the ceiling and the
ordering below are therefore the SHIPPED rung's and no other's.

```
leak bar           cross_regime ONLY on paid calls (wsGA's stricter bar)
strata called      C,R  (D is never called by pre-registration)
rail               EUR 4.00; 0 founder(s) turned away by it
spend              EUR 0.0000 over 0 seam call(s)
```

**INDICATIVE. Not a measurement.** Every figure below carries its own `n=`.
No figure from this run may reach the dashboard headline — that is `one_funnel`
and nothing else. Pre-registered in `project-mgmt/wsHO_prereg.md`, committed
before the first paid token.

## The void conditions, checked rather than promised

Quoted from `wsHO_prereg.md` §6. Every one is a field printed above.

| condition | | observed |
|---|---|---|
| 1. `exits.threw` is zero | ok | 0 |
| 2. slowest call <= 80% of the clock | ok | 0ms of 40000ms = 0.0% |
| 3. no call cut off at max_tokens (VOIDS Q3 ONLY) | ok | 0/0 API call(s) |
| 4. ranker attestation clean | ok | ranker: all 819 request(s) on EMBEDDING |
| 5. fell back on <= 5% of calls | ok | 0 of 268 (0.0%) |
| 6. both arms handed the same pool array, every called founder | ok | 268 of 268 |
| 7. `menuMax` is 40 | **VOID** | menuMax=0 |

## Q1 — what a forty-row call actually costs

No paid call was made on this run, so there is no distribution to report.

## Q2 — can the run be trusted

```
agent-select: arm=off, no calls made
agent-select exits: the seam was not reached
{"armOff":0,"reversed":0,"poolNotLongerThanCount":0,"menuNotLongerThanWant":0,"dryPriced":0,"noUsablePick":0,"threw":0,"chose":0}
```

- **truncation: 0 of 0 API call(s)** — the denominator is
  `apiCalls`, incremented on the line that builds the request, not `calls`,
  which counts seam invocations. wsGA's published line divided the second by
  the first and printed `thought on 210/148 call(s)`. This is the first LIVE
  exercise of the fix `lib/intelligence/tallyDenominator.test.ts` pins.
- **`exits.threw`: 0** — a ceiling the clock cannot reach never
  truncates, it times out, and a timeout lands here rather than in `truncated`.
  A zero on the line above is only evidence when this one is zero too.
- **slowest call: 0ms of 40000ms = 0.0% of the clock**
  — the first recorded duration for this seam in this repo.

## Q3 — which way the model's ordering points (INDICATIVE)

### The strata, measured on this run's own walk

| stratum | what the model can do | walked | share of gradable | CALLED |
|---|---|---:|---:|---:|
| **R** | RESCUE — won fund in the forty, not in our six | 316 | 38.6% | 150 |
| **C** | HARM only — won fund already in our six | 350 | 42.7% | 118 |
| **D** | nothing — won fund not in the forty at all | 153 | 18.7% | 0 |
| U | not gradable — the won fund is not publishable | 78 | — | 0 |

### The two rates, and the population estimate

| | n | count | rate |
|---|---:|---:|---:|
| **rescue** — won fund enters the six under the model | 150 | 0 | 0.0% +/-0.0 |
| **harm** — won fund LEAVES the six under the model | 118 | 0 | 0.0% +/-0.0 |

```
delta = s_R * rescue  -  s_C * harm
      = 0.386 * 0.000  -  0.427 * 0.000
      = +0.00 points of population EXACT@6
        95% interval  0.00 to 0.00
```

The pre-registration's bar for claiming a direction — 15 called in each
stratum — is met (R 150, C 118). The direction is **flat**, and it is
INDICATIVE: the interval spans zero and this run was never powered to close it.

### The paired test on the called set

```
EXACT@6 (n=268 called, R+C)  McNemar(signed) z = +0.00  on 0 discordant (model 0, our score 0; both 118, neither 150)  exact p = 1.000  -- NO discordant pairs: the arms are identical on these cases, not tied on evidence
```

This pools the two strata and is reported for comparability with wsGA, which
did the same. It is NOT the estimand: pooling weights the strata by how the
budget happened to fall rather than by how the population is composed.

### Concentration — because wsHE's +2.4 was +0.4 with one agency removed

- **RESCUES: 0** across **0** regime(s)
- **HARMS: 0** across **0** regime(s)

### Secondary — the won fund's POOL RANK, Wilcoxon signed-rank

```
POOL rank (of 40)
  n=0 non-tied pairs (0 dropped)
  mean rank shift +0.00 (NEGATIVE favours the model — a lower rank is better)
  z = +0.00   p = 1.000
```

SECONDARY BY PRE-REGISTRATION. A more powerful test of a different quantity is
not a second chance at the same question.

## Composition of the CALLED set

| country | calls | share |
|---|---:|---:|
| NO | 70 | 26.1% |
| FR | 36 | 13.4% |
| GB | 35 | 13.1% |
| DE | 35 | 13.1% |
| IT | 30 | 11.2% |
| ES | 17 | 6.3% |
| SE | 17 | 6.3% |
| CZ | 11 | 4.1% |
| NL | 8 | 3.0% |
| DK | 6 | 2.2% |
| EE | 3 | 1.1% |

## Per called founder

| founder | country | stratum | won @ pool | six control/model | menu | out tokens | EUR |
|---|---|---|---:|---|---:|---|---:|
| ENANTIS S.R.O. | CZ | R | 18 -> 18 | n/n | 0 |  | 0.0000 |
| TOUL ENERGIE | FR | R | 9 -> 9 | n/n | 0 |  | 0.0000 |
| AF OFFSHORE DECOM | NO | C | 4 -> 4 | Y/Y | 0 |  | 0.0000 |
| CU SERVICES LIMITED | GB | C | 4 -> 4 | Y/Y | 0 |  | 0.0000 |
| BRISTOL CITY COUNCIL | GB | C | 4 -> 4 | Y/Y | 0 |  | 0.0000 |
| RATIER-FIGEAC | FR | R | 9 -> 9 | n/n | 0 |  | 0.0000 |
| APTUNION INDUSTRIE | FR | C | 5 -> 5 | Y/Y | 0 |  | 0.0000 |
| UNIVERSITA COMMERCIALE LUIGI BOCCONI | IT | R | 14 -> 14 | n/n | 0 |  | 0.0000 |
| MARITIME ROBOTICS | NO | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| BIO ME | NO | R | 19 -> 19 | n/n | 0 |  | 0.0000 |
| Bouyer Leroux | FR | C | 3 -> 3 | Y/Y | 0 |  | 0.0000 |
| AIXTRON SE | DE | R | 32 -> 32 | n/n | 0 |  | 0.0000 |
| Aktiv | DK | C | 3 -> 3 | Y/Y | 0 |  | 0.0000 |
| JANSEN RECYCLING GROUP B V | NL | R | 28 -> 28 | n/n | 0 |  | 0.0000 |
| ADVANCED MANUFACTURING SHEFFIELD | GB | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| DESTINUS SPAIN | ES | C | 3 -> 3 | Y/Y | 0 |  | 0.0000 |
| TELECOM ITALIA SPA O TIM | IT | R | 21 -> 21 | n/n | 0 |  | 0.0000 |
| 3T ADDITIVE MANUFACTURING | GB | C | 3 -> 3 | Y/Y | 0 |  | 0.0000 |
| CELLFION AB | SE | C | 3 -> 3 | Y/Y | 0 |  | 0.0000 |
| EURNEX E V | DE | R | 7 -> 7 | n/n | 0 |  | 0.0000 |
| WISE SRL | IT | C | 3 -> 3 | Y/Y | 0 |  | 0.0000 |
| CELLUGY | DK | C | 2 -> 2 | Y/Y | 0 |  | 0.0000 |
| CEALTECH | NO | R | 18 -> 18 | n/n | 0 |  | 0.0000 |
| NELLIE TECHNOLOGIES | GB | R | 16 -> 16 | n/n | 0 |  | 0.0000 |
| SWERIM | SE | R | 8 -> 8 | n/n | 0 |  | 0.0000 |
| AERNNOVA COMPOSITES ILLESCAS SA | ES | C | 2 -> 2 | Y/Y | 0 |  | 0.0000 |
| CRCAM NORD MIDI PYRENEES | FR | R | 18 -> 18 | n/n | 0 |  | 0.0000 |
| INFUTURE | NO | R | 36 -> 36 | n/n | 0 |  | 0.0000 |
| ADDITIVE MANUFACTURING SOLUTIONS LTD | GB | C | 2 -> 2 | Y/Y | 0 |  | 0.0000 |
| ALCOA NORWAY | NO | C | 4 -> 4 | Y/Y | 0 |  | 0.0000 |
| AEROTEX | GB | C | 3 -> 3 | Y/Y | 0 |  | 0.0000 |
| FSTECHNOLOGY | IT | R | 13 -> 13 | n/n | 0 |  | 0.0000 |
| BP EUROPA SE | DE | R | 8 -> 8 | n/n | 0 |  | 0.0000 |
| AVA OCEAN | NO | R | 11 -> 11 | n/n | 0 |  | 0.0000 |
| CIGNUS INSTRUMENTS | NO | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| CARIAD SE | DE | R | 37 -> 37 | n/n | 0 |  | 0.0000 |
| HENNLICH S.R.O. | CZ | R | 26 -> 26 | n/n | 0 |  | 0.0000 |
| RISE RESEARCH INSTITUTES OF SWEDEN AB | SE | R | 23 -> 23 | n/n | 0 |  | 0.0000 |
| 3D REPO | GB | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| HOPROD | FR | R | 22 -> 22 | n/n | 0 |  | 0.0000 |
| UNIVERSITA' DEGLI STUDI DI MILANO-BICOCCA | IT | R | 18 -> 18 | n/n | 0 |  | 0.0000 |
| TALGA GROUP LTD | SE | R | 7 -> 7 | n/n | 0 |  | 0.0000 |
| ANDERSEN MEK VERKSTED | NO | R | 27 -> 27 | n/n | 0 |  | 0.0000 |
| AALBORG KOMMUNE | DK | C | 4 -> 4 | Y/Y | 0 |  | 0.0000 |
| CACTUX S.R.O. | CZ | R | 26 -> 26 | n/n | 0 |  | 0.0000 |
| CEMONITE | NO | R | 26 -> 26 | n/n | 0 |  | 0.0000 |
| ARISTON | IT | R | 25 -> 25 | n/n | 0 |  | 0.0000 |
| MECACHROME FRANCE | FR | C | 6 -> 6 | Y/Y | 0 |  | 0.0000 |
| Heimann Sensor GmbH | DE | C | 6 -> 6 | Y/Y | 0 |  | 0.0000 |
| SCANDINAVIAN REAL HEART AB | SE | R | 18 -> 18 | n/n | 0 |  | 0.0000 |
| FEV EUROPE | DE | C | 2 -> 2 | Y/Y | 0 |  | 0.0000 |
| SHIFT MATERIALS | NO | R | 24 -> 24 | n/n | 0 |  | 0.0000 |
| MARTEL INNOVATE BV | NL | R | 31 -> 31 | n/n | 0 |  | 0.0000 |
| MEYER WERFT | DE | C | 6 -> 6 | Y/Y | 0 |  | 0.0000 |
| AEROSPACE VALLEY | FR | R | 24 -> 24 | n/n | 0 |  | 0.0000 |
| FORGES D'ALBERT | FR | R | 22 -> 22 | n/n | 0 |  | 0.0000 |
| BRISTOL BATH REGIONAL CAPITAL | GB | C | 2 -> 2 | Y/Y | 0 |  | 0.0000 |
| UNIVERSITA DEGLI STUDI DI NAPOLI PARTHENOPE | IT | R | 25 -> 25 | n/n | 0 |  | 0.0000 |
| KLOSSER INNOVASJON | NO | R | 32 -> 32 | n/n | 0 |  | 0.0000 |
| SITAEL | IT | C | 3 -> 3 | Y/Y | 0 |  | 0.0000 |
| BERNHARD NOCHT INSTITUT FUER TROPENMEDIZIN | DE | C | 2 -> 2 | Y/Y | 0 |  | 0.0000 |
| CELLEVATE AB | SE | C | 6 -> 6 | Y/Y | 0 |  | 0.0000 |
| OHB System AG | DE | C | 5 -> 5 | Y/Y | 0 |  | 0.0000 |
| GREENERWAVE | FR | R | 12 -> 12 | n/n | 0 |  | 0.0000 |
| ACTA MOBILIER | FR | R | 12 -> 12 | n/n | 0 |  | 0.0000 |
| CENTRE FOR PROCESS INNOVATION LIMITED LBG | GB | C | 3 -> 3 | Y/Y | 0 |  | 0.0000 |
| AUGMENTCITY | NO | R | 24 -> 24 | n/n | 0 |  | 0.0000 |
| VALEO EAUTOMOTIVE GERMANY | DE | C | 4 -> 4 | Y/Y | 0 |  | 0.0000 |
| X FAB DRESDEN | DE | R | 9 -> 9 | n/n | 0 |  | 0.0000 |
| CHOMARAT TEXTILES INDUSTRIES | FR | R | 12 -> 12 | n/n | 0 |  | 0.0000 |
| ASOCIACION DE INVESTIGACION DE LA INDUSTRIA DEL JUGUETE CONEXAS Y AFINES | ES | C | 2 -> 2 | Y/Y | 0 |  | 0.0000 |
| NEXTWORKS | IT | R | 21 -> 21 | n/n | 0 |  | 0.0000 |
| UNIVERSITE DE BORDEAUX | FR | R | 28 -> 28 | n/n | 0 |  | 0.0000 |
| NC SPECTRUM | NO | R | 8 -> 8 | n/n | 0 |  | 0.0000 |
| CIOL | NO | R | 40 -> 40 | n/n | 0 |  | 0.0000 |
| AQDOT | GB | C | 3 -> 3 | Y/Y | 0 |  | 0.0000 |
| LE BIO MARAIS | FR | R | 11 -> 11 | n/n | 0 |  | 0.0000 |
| QUANTUNE TECHNOLOGIES GMBH | DE | R | 30 -> 30 | n/n | 0 |  | 0.0000 |
| ALIVE LABS | GB | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| Scienion GmbH | DE | C | 2 -> 2 | Y/Y | 0 |  | 0.0000 |
| VOLVO TECHNOLOGY | SE | R | 25 -> 25 | n/n | 0 |  | 0.0000 |
| ALGINOR BIOREFINERY | NO | R | 24 -> 24 | n/n | 0 |  | 0.0000 |
| CIPHERBIT SLU | ES | R | 8 -> 8 | n/n | 0 |  | 0.0000 |
| 5G COMMUNICATIONS FOR FUTURE INDUSTRY VERTICALS | ES | C | 5 -> 5 | Y/Y | 0 |  | 0.0000 |
| KUNNSKAPSPARKEN HELGELAND | NO | R | 33 -> 33 | n/n | 0 |  | 0.0000 |
| AQUALUNG CARBON CAPTURE | NO | C | 4 -> 4 | Y/Y | 0 |  | 0.0000 |
| POLITECNICO DI BARI | IT | R | 27 -> 27 | n/n | 0 |  | 0.0000 |
| Aubert & Duval | FR | R | 16 -> 16 | n/n | 0 |  | 0.0000 |
| COMPOUND SEMICONDUCTOR APPLICATIONS CATAPULT | GB | C | 2 -> 2 | Y/Y | 0 |  | 0.0000 |
| BULL SAS | FR | R | 10 -> 10 | n/n | 0 |  | 0.0000 |
| ABERDEEN HARBOUR BOARD | GB | C | 2 -> 2 | Y/Y | 0 |  | 0.0000 |
| AIRY Automotive | DK | C | 3 -> 3 | Y/Y | 0 |  | 0.0000 |
| 2PD Ltd | GB | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| EWOS | NO | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| ALBASENSE | GB | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| DYNAMIC WELL SOLUTIONS | NO | C | 2 -> 2 | Y/Y | 0 |  | 0.0000 |
| FUNDACION I+D AUTOMOCION Y MECATRONICA | ES | R | 8 -> 8 | n/n | 0 |  | 0.0000 |
| AD HOC MARINE DESIGNS | GB | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| AGRIBIOTIX | NO | C | 3 -> 3 | Y/Y | 0 |  | 0.0000 |
| CONSTELLR GMBH | DE | C | 4 -> 4 | Y/Y | 0 |  | 0.0000 |
| ACCIONA CONSTRUCCION | ES | C | 4 -> 4 | Y/Y | 0 |  | 0.0000 |
| ASOCIACION DE LA INVESTIGACION Y COOPERACION INDUSTRIAL DE ANDALUCIA F. DE PAULA ROJAS"" | ES | R | 22 -> 22 | n/n | 0 |  | 0.0000 |
| JOTUN | NO | R | 29 -> 29 | n/n | 0 |  | 0.0000 |
| ASGARD THERAPEUTICS AB | SE | R | 7 -> 7 | n/n | 0 |  | 0.0000 |
| AARHUS UNIVERSITETSHOSPITAL | DK | C | 2 -> 2 | Y/Y | 0 |  | 0.0000 |
| BRETAGNE CHIMIE FINE SAS | FR | C | 3 -> 3 | Y/Y | 0 |  | 0.0000 |
| GREEN 14 AB | SE | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| ORKLA FOODS NORGE | NO | C | 3 -> 3 | Y/Y | 0 |  | 0.0000 |
| BLUE SOLUTIONS | FR | R | 28 -> 28 | n/n | 0 |  | 0.0000 |
| EODYNE SYSTEMS SL | ES | C | 3 -> 3 | Y/Y | 0 |  | 0.0000 |
| SERVIZO GALEGO DE SAUDE | ES | C | 2 -> 2 | Y/Y | 0 |  | 0.0000 |
| FRANZ SCHMIDT HAENSCH GMBH CO | DE | C | 4 -> 4 | Y/Y | 0 |  | 0.0000 |
| DERMAGNOSTIX GMBH | DE | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| EXEMPLAS | GB | C | 2 -> 2 | Y/Y | 0 |  | 0.0000 |
| HELSINGBORGS KOMMUN | SE | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| DANISI ENGINEERING S.R.L. | IT | R | 18 -> 18 | n/n | 0 |  | 0.0000 |
| SASMINIMUM | FR | R | 15 -> 15 | n/n | 0 |  | 0.0000 |
| Pumacy Technologies AG | DE | R | 40 -> 40 | n/n | 0 |  | 0.0000 |
| CONCR3DE B V | NL | R | 17 -> 17 | n/n | 0 |  | 0.0000 |
| PARISOT INDUSTRIE | FR | R | 18 -> 18 | n/n | 0 |  | 0.0000 |
| ASOCIACION DE LA INDUSTRIA NAVARRA | ES | R | 12 -> 12 | n/n | 0 |  | 0.0000 |
| DNV | NO | R | 11 -> 11 | n/n | 0 |  | 0.0000 |
| INCLUSIVE CREATION | NO | R | 12 -> 12 | n/n | 0 |  | 0.0000 |
| BORALEX | FR | R | 33 -> 33 | n/n | 0 |  | 0.0000 |
| UNIVERSITA DELLA CALABRIA | IT | R | 27 -> 27 | n/n | 0 |  | 0.0000 |
| VEGEA | IT | C | 2 -> 2 | Y/Y | 0 |  | 0.0000 |
| FIBERCOP | IT | C | 3 -> 3 | Y/Y | 0 |  | 0.0000 |
| NAVTOR | NO | R | 28 -> 28 | n/n | 0 |  | 0.0000 |
| CAMBRIDGE ELECTRIC CEMENT | GB | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| SUPRACON | DE | R | 10 -> 10 | n/n | 0 |  | 0.0000 |
| ZURICH INSTRUMENTS GERMANY | DE | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| Fincantieri | IT | C | 3 -> 3 | Y/Y | 0 |  | 0.0000 |
| NODE PHARMA | NO | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| KARLSTADS UNIVERSITET | SE | R | 27 -> 27 | n/n | 0 |  | 0.0000 |
| ABUNDANCE INVESTMENT | GB | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| AI NERGY | DK | C | 6 -> 6 | Y/Y | 0 |  | 0.0000 |
| CZ TECH | NO | R | 31 -> 31 | n/n | 0 |  | 0.0000 |
| ACTIA AUTOMOTIVE | FR | R | 17 -> 17 | n/n | 0 |  | 0.0000 |
| DENS | NL | R | 28 -> 28 | n/n | 0 |  | 0.0000 |
| WALTER TOSTO | IT | R | 26 -> 26 | n/n | 0 |  | 0.0000 |
| VÝZKUMNÝ ÚSTAV STAVEBNÍCH HMOT,A.S. | CZ | R | 20 -> 20 | n/n | 0 |  | 0.0000 |
| COMAU | IT | C | 3 -> 3 | Y/Y | 0 |  | 0.0000 |
| AGENCE LOCALE DE L ENERGIE ET DU CLIMAT | FR | R | 35 -> 35 | n/n | 0 |  | 0.0000 |
| COMTES FHT A.S. | CZ | R | 22 -> 22 | n/n | 0 |  | 0.0000 |
| GRASP | NO | R | 10 -> 10 | n/n | 0 |  | 0.0000 |
| CENTRO DI COMPETENZA PER LA SICUREZZA E L OTTIMIZZAZIONE DELLE INFRASTRUTTURE STRATEGICHE START 4 0 | IT | C | 3 -> 3 | Y/Y | 0 |  | 0.0000 |
| ASOCIACION DE INVESTIGACION DE INDUSTRIAS CARNICAS DEL PRINCIPADO DE ASTURIAS | ES | C | 5 -> 5 | Y/Y | 0 |  | 0.0000 |
| STMICROELECTRONICS FRANCE | FR | C | 3 -> 3 | Y/Y | 0 |  | 0.0000 |
| AGREKA BUILD | GB | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| IRNOVA | SE | R | 12 -> 12 | n/n | 0 |  | 0.0000 |
| ARGYLL AND BUTE COUNCIL | GB | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| DIESELLAND OÜ | EE | R | 18 -> 18 | n/n | 0 |  | 0.0000 |
| RESITEC | NO | R | 21 -> 21 | n/n | 0 |  | 0.0000 |
| FICONTEC SERVICE GMBH | DE | C | 2 -> 2 | Y/Y | 0 |  | 0.0000 |
| Frontgrade Gaisler AB | SE | R | 22 -> 22 | n/n | 0 |  | 0.0000 |
| KONGSBERG MARITIME | NO | R | 9 -> 9 | n/n | 0 |  | 0.0000 |
| DMK DEUTSCHES MILCHKONTOR | DE | R | 10 -> 10 | n/n | 0 |  | 0.0000 |
| KODETRACER | NO | R | 11 -> 11 | n/n | 0 |  | 0.0000 |
| DOSCON | NO | R | 36 -> 36 | n/n | 0 |  | 0.0000 |
| CODASIP GMBH | DE | C | 4 -> 4 | Y/Y | 0 |  | 0.0000 |
| DEUTSCHE POST | DE | R | 7 -> 7 | n/n | 0 |  | 0.0000 |
| OSPEDALE SAN RAFFAELE SRL | IT | R | 25 -> 25 | n/n | 0 |  | 0.0000 |
| FORNYBARAKADEMIET | NO | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| ÅKP | NO | R | 20 -> 20 | n/n | 0 |  | 0.0000 |
| aiXscale Photonics GmbH | DE | R | 16 -> 16 | n/n | 0 |  | 0.0000 |
| NANOSCRIBE GMBH CO KG | DE | R | 26 -> 26 | n/n | 0 |  | 0.0000 |
| PHILIPS | DE | R | 30 -> 30 | n/n | 0 |  | 0.0000 |
| BEEFUTURES HOLDING | NO | C | 3 -> 3 | Y/Y | 0 |  | 0.0000 |
| INSTITUT GUSTAVE ROUSSY | FR | R | 20 -> 20 | n/n | 0 |  | 0.0000 |
| AEROSPACEHV | GB | C | 2 -> 2 | Y/Y | 0 |  | 0.0000 |
| CASINVENT PHARMA, A.S. | CZ | C | 5 -> 5 | Y/Y | 0 |  | 0.0000 |
| ADVANCED MARKER DISCOVERY SL | ES | R | 23 -> 23 | n/n | 0 |  | 0.0000 |
| GAS AND HEAT S.P.A. | IT | R | 15 -> 15 | n/n | 0 |  | 0.0000 |
| AI|FFINITY S.R.O. | CZ | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| KAROLINSKA INSTITUTET | SE | R | 35 -> 35 | n/n | 0 |  | 0.0000 |
| SCANIA CV | SE | R | 15 -> 15 | n/n | 0 |  | 0.0000 |
| ENERGY ROBOTICS GMBH | DE | C | 6 -> 6 | Y/Y | 0 |  | 0.0000 |
| SALT LOFOTEN | NO | R | 19 -> 19 | n/n | 0 |  | 0.0000 |
| BIRMINGHAM CHAMBER OF COMMERCE | GB | C | 2 -> 2 | Y/Y | 0 |  | 0.0000 |
| BEYONDER | NO | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| NABOLAGSHAGER | NO | R | 20 -> 20 | n/n | 0 |  | 0.0000 |
| CUBOGAS S.R.L. | IT | R | 29 -> 29 | n/n | 0 |  | 0.0000 |
| TERMIZO A.S. | CZ | R | 39 -> 39 | n/n | 0 |  | 0.0000 |
| KATAPULT IMPACT PLATFORM | NO | R | 20 -> 20 | n/n | 0 |  | 0.0000 |
| NORDIC BRAIN TECH | NO | R | 17 -> 17 | n/n | 0 |  | 0.0000 |
| AEP GROUP | FR | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| FLUIDECT GMBH | DE | R | 29 -> 29 | n/n | 0 |  | 0.0000 |
| SOPAC MEDICAL | FR | R | 18 -> 18 | n/n | 0 |  | 0.0000 |
| EXACT THERAPEUTICS | NO | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| Cordys Analytics B.V. | NL | R | 7 -> 7 | n/n | 0 |  | 0.0000 |
| MAN TRUCK BUS SE | DE | R | 8 -> 8 | n/n | 0 |  | 0.0000 |
| COLAS | GB | C | 4 -> 4 | Y/Y | 0 |  | 0.0000 |
| EGÚ BRNO, A.S. | CZ | R | 8 -> 8 | n/n | 0 |  | 0.0000 |
| SAFETEC NORDIC | NO | R | 35 -> 35 | n/n | 0 |  | 0.0000 |
| CARONTE TOURIST | IT | R | 18 -> 18 | n/n | 0 |  | 0.0000 |
| HYDROGENPRO | NO | C | 3 -> 3 | Y/Y | 0 |  | 0.0000 |
| REVERION GMBH | DE | R | 7 -> 7 | n/n | 0 |  | 0.0000 |
| AGENCE DU CLIMAT, LE GUICHET DES SOLUTIONS | FR | R | 31 -> 31 | n/n | 0 |  | 0.0000 |
| DUMAREY AUTOMOTIVE ITALIA | IT | R | 23 -> 23 | n/n | 0 |  | 0.0000 |
| ALSYMEX | FR | R | 9 -> 9 | n/n | 0 |  | 0.0000 |
| AIRBORNE COMPOSITES | GB | C | 4 -> 4 | Y/Y | 0 |  | 0.0000 |
| AINIA | ES | R | 19 -> 19 | n/n | 0 |  | 0.0000 |
| AGROSOFT TÁBOR, S.R.O. | CZ | R | 14 -> 14 | n/n | 0 |  | 0.0000 |
| EvoLogics GmbH | DE | R | 12 -> 12 | n/n | 0 |  | 0.0000 |
| TECHFEM | IT | R | 13 -> 13 | n/n | 0 |  | 0.0000 |
| GLUCOSET | NO | R | 27 -> 27 | n/n | 0 |  | 0.0000 |
| MEDSENSIO | NO | R | 20 -> 20 | n/n | 0 |  | 0.0000 |
| SOLARGE INTERNATIONAL | NL | R | 23 -> 23 | n/n | 0 |  | 0.0000 |
| ASSOCIATION FRANCAISE D AGROFORESTERIE | FR | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| C I R A CENTRO ITALIANO RICERCHE AEROSPAZIALI SCPA | IT | C | 3 -> 3 | Y/Y | 0 |  | 0.0000 |
| INVENTYA | GB | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| ITEC B.V. | NL | C | 2 -> 2 | Y/Y | 0 |  | 0.0000 |
| EGGA UTVIKLING | NO | R | 9 -> 9 | n/n | 0 |  | 0.0000 |
| INTERACTIVE FULLY ELECTRICAL VEHICLES SRL | IT | R | 15 -> 15 | n/n | 0 |  | 0.0000 |
| AERNNOVA AEROSPACE | ES | R | 19 -> 19 | n/n | 0 |  | 0.0000 |
| DIPS | NO | R | 12 -> 12 | n/n | 0 |  | 0.0000 |
| CERMAQ NORWAY | NO | C | 2 -> 2 | Y/Y | 0 |  | 0.0000 |
| ELKEM TESTVIRKSOMHET | NO | R | 18 -> 18 | n/n | 0 |  | 0.0000 |
| AIRFORESTRY AB | SE | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| TIOTECH | NO | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| LAYERONE | NO | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| LYBE SCIENTIFIC | NO | R | 25 -> 25 | n/n | 0 |  | 0.0000 |
| FINANCE INNOVATION | NO | C | 3 -> 3 | Y/Y | 0 |  | 0.0000 |
| ALTILIUM METALS | GB | C | 4 -> 4 | Y/Y | 0 |  | 0.0000 |
| COMING PLUS, A.S. | CZ | R | 22 -> 22 | n/n | 0 |  | 0.0000 |
| AXON CABLE | FR | C | 4 -> 4 | Y/Y | 0 |  | 0.0000 |
| NORTURA | NO | C | 2 -> 2 | Y/Y | 0 |  | 0.0000 |
| ARIANEGROUP | DE | C | 2 -> 2 | Y/Y | 0 |  | 0.0000 |
| ABB | GB | C | 4 -> 4 | Y/Y | 0 |  | 0.0000 |
| 1SPATIAL GROUP | GB | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| HAFENSTROM | NO | R | 23 -> 23 | n/n | 0 |  | 0.0000 |
| INGENIARS | IT | C | 5 -> 5 | Y/Y | 0 |  | 0.0000 |
| STICHTING HOGESCHOOL ROTTERDAM | NL | R | 27 -> 27 | n/n | 0 |  | 0.0000 |
| NORVENTO ENERXIA SL | ES | R | 13 -> 13 | n/n | 0 |  | 0.0000 |
| ALTERNATIVE TECHNOLOGY SOLUTIONS | GB | C | 4 -> 4 | Y/Y | 0 |  | 0.0000 |
| FORTIFIED TECHNOLOGIES | NO | C | 2 -> 2 | Y/Y | 0 |  | 0.0000 |
| BIOSYNTHIS | FR | R | 17 -> 17 | n/n | 0 |  | 0.0000 |
| FUTURE INNOVATIONS | NO | R | 19 -> 19 | n/n | 0 |  | 0.0000 |
| FREEN OÜ | EE | R | 28 -> 28 | n/n | 0 |  | 0.0000 |
| AKIRA SCIENCE AB | SE | R | 32 -> 32 | n/n | 0 |  | 0.0000 |
| EXCESS ENGINEERING | NO | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| CTD | NO | R | 30 -> 30 | n/n | 0 |  | 0.0000 |
| ALSA GRUPO SLU | ES | R | 30 -> 30 | n/n | 0 |  | 0.0000 |
| INAVENTA SOLAR | NO | R | 36 -> 36 | n/n | 0 |  | 0.0000 |
| EFESTOS HUB | GB | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| BOUYGUES IMMOBILIER | FR | R | 27 -> 27 | n/n | 0 |  | 0.0000 |
| TERRITOIRE D'ENERGIE SOMME | FR | R | 11 -> 11 | n/n | 0 |  | 0.0000 |
| AS TFTAK | EE | R | 7 -> 7 | n/n | 0 |  | 0.0000 |
| KLYV THERAPEUTICS | NO | C | 6 -> 6 | Y/Y | 0 |  | 0.0000 |
| CORVUS ENERGY FUEL CELL | NO | R | 22 -> 22 | n/n | 0 |  | 0.0000 |
| R2M SOLUTION SRL | IT | C | 3 -> 3 | Y/Y | 0 |  | 0.0000 |
| BIOMAR A S | NO | R | 18 -> 18 | n/n | 0 |  | 0.0000 |
| ERICSSON TELECOMUNICAZIONI | IT | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| ACHELOUS ENERGY | GB | C | 2 -> 2 | Y/Y | 0 |  | 0.0000 |
| BAYERISCHE AKADEMIE DER WISSENSCHAFTEN | DE | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| MER MEC ENGINEERING | IT | R | 24 -> 24 | n/n | 0 |  | 0.0000 |
| NJØS FRUKT OG BÆRSENTER | NO | R | 13 -> 13 | n/n | 0 |  | 0.0000 |
| ACTIONSENSE LTD | GB | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| Water Horizon | FR | R | 13 -> 13 | n/n | 0 |  | 0.0000 |
| TGS PREDIKTOR | NO | R | 29 -> 29 | n/n | 0 |  | 0.0000 |
| ARCONIC ARCHITECTURAL PRODUCTS SAS | FR | R | 19 -> 19 | n/n | 0 |  | 0.0000 |
| EUROPEAN MUD COMPANY | NO | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| ALL SEEING EYE LTD | GB | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| OIVI | NO | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| FACTIVERSE | NO | C | 6 -> 6 | Y/Y | 0 |  | 0.0000 |
| FLOWFOOD | NO | C | 1 -> 1 | Y/Y | 0 |  | 0.0000 |
| HQS QUANTUM SIMULATIONS GMBH | DE | R | 18 -> 18 | n/n | 0 |  | 0.0000 |
| TECHNISCHE HOCHSCHULE KOLN | DE | R | 38 -> 38 | n/n | 0 |  | 0.0000 |
