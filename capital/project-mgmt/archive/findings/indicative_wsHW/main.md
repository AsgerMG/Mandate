# wsHO — the forty-row call, priced; the ceiling, exercised; the ordering, pointed

```
started            2026-08-18T22:41:32.802Z
finished           2026-08-18T22:58:45.823Z
corpus             postgres instruments=1088 at 2026-08-18T22:41:33.202Z
ranker: all 819 request(s) on EMBEDDING
agent-select: menu=23-40 rows arm=adviser depth=40 count=7 effort=low maxtok=8192 unsure=declare lookups=10 (5 brief(s) retrieved) model=claude-sonnet-5 — 78/78 chose, 0 FELL BACK to the shipped order (0 empty reply, 0 unparseable), 0 short reply, 0 unusable id(s), 0 seat(s) on a row already picked under the SAME TITLE (a floor) across 0 brief(s), 0 SELECT-rule violation(s) on 0 reply(ies), 83 API call(s) over 78 brief(s), thought on 6/83 API call(s) (6574 thinking token(s) billed, 8235 readable char(s)), 0/83 CUT OFF at max_tokens, slowest call 22487ms of 40000ms (56.2% of the clock), EUR 3.3681 total, EUR 0.0432 per brief
agent-select exits (78 call(s) to the seam): 78 the model chose
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
arm                adviser          seam late
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
rail               EUR 3.55; 190 founder(s) turned away by it
spend              EUR 3.3681 over 78 seam call(s) = EUR 0.0432 per founder
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
| 2. slowest call <= 80% of the clock | ok | 22487ms of 40000ms = 56.2% |
| 3. no call cut off at max_tokens (VOIDS Q3 ONLY) | ok | 0/83 API call(s) |
| 4. ranker attestation clean | ok | ranker: all 819 request(s) on EMBEDDING |
| 5. fell back on <= 5% of calls | ok | 0 of 78 (0.0%) |
| 6. both arms handed the same pool array, every called founder | ok | 78 of 78 |
| 7. `menuMax` is 40 | ok | menuMax=40 |

## Q1 — what a forty-row call actually costs

Read from the API's own `usage` on every turn, not from a projection.
One founder is one SEAM call and one or two API calls: round two fires only
where the model itself declared it could not separate two funds.

| | n | mean | median | p95 | max |
|---|---:|---:|---:|---:|---:|
| output tokens / API call, ALL menus | 83 | 109 | 30 | 834 | 1533 |
| output tokens / API call, menu=40 only | 69 | 105 | 30 | 834 | 1533 |
| of which THINKING | 83 | 79 | 0 | 798 | 1499 |
| input tokens / API call | 83 | 21507 | 22004 | 27532 | 30553 |

| | |
|---|---:|
| API calls | 83 over 78 founder(s) = 1.06 per founder |
| **EUR per API call** | **0.0406** |
| **EUR per founder** | **0.0432** |
| thinking share of output tokens | 72.4% |
| ceiling in force (`MAX_TOKENS_BY_EFFORT.low`) | 8192 |
| largest single reply as a share of it | 18.7% |

### What the eventual full run costs, now that the spread is measured

`findings/tokens_wsHI/` priced a call at EUR 0.0217 (no menu scaling) to
EUR 0.0483 (linear, the pessimistic end). The realised figure above replaces
both. A full run is the whole gradable population under `ONLY_IN_POOL`:

| run | founders | API calls | EUR |
|---|---:|---:|---:|
| this one | 78 | 83 | 3.37 |
| in-pool population (666/897 walked -> 666 of 897) | 666 | 709 | **28.76** |
| whole population, both strata and the dead one | 897 | 955 | **38.73** |

After the 2026-08-31 price change, multiply by 1.5 — the ratio
`tokens_wsHI/README.md` carries in its own scaling table.

## Q2 — can the run be trusted

```
agent-select: menu=23-40 rows arm=adviser depth=40 count=7 effort=low maxtok=8192 unsure=declare lookups=10 (5 brief(s) retrieved) model=claude-sonnet-5 — 78/78 chose, 0 FELL BACK to the shipped order (0 empty reply, 0 unparseable), 0 short reply, 0 unusable id(s), 0 seat(s) on a row already picked under the SAME TITLE (a floor) across 0 brief(s), 0 SELECT-rule violation(s) on 0 reply(ies), 83 API call(s) over 78 brief(s), thought on 6/83 API call(s) (6574 thinking token(s) billed, 8235 readable char(s)), 0/83 CUT OFF at max_tokens, slowest call 22487ms of 40000ms (56.2% of the clock), EUR 3.3681 total, EUR 0.0432 per brief
agent-select exits (78 call(s) to the seam): 78 the model chose
{"armOff":0,"reversed":0,"poolNotLongerThanCount":0,"menuNotLongerThanWant":0,"dryPriced":0,"noUsablePick":0,"threw":0,"chose":78}
```

- **truncation: 0 of 83 API call(s)** — the denominator is
  `apiCalls`, incremented on the line that builds the request, not `calls`,
  which counts seam invocations. wsGA's published line divided the second by
  the first and printed `thought on 210/148 call(s)`. This is the first LIVE
  exercise of the fix `lib/intelligence/tallyDenominator.test.ts` pins.
- **`exits.threw`: 0** — a ceiling the clock cannot reach never
  truncates, it times out, and a timeout lands here rather than in `truncated`.
  A zero on the line above is only evidence when this one is zero too.
- **slowest call: 22487ms of 40000ms = 56.2% of the clock**
  — the first recorded duration for this seam in this repo.

## Q3 — which way the model's ordering points (INDICATIVE)

### The strata, measured on this run's own walk

| stratum | what the model can do | walked | share of gradable | CALLED |
|---|---|---:|---:|---:|
| **R** | RESCUE — won fund in the forty, not in our six | 316 | 38.6% | 45 |
| **C** | HARM only — won fund already in our six | 350 | 42.7% | 33 |
| **D** | nothing — won fund not in the forty at all | 153 | 18.7% | 0 |
| U | not gradable — the won fund is not publishable | 78 | — | 0 |

### The two rates, and the population estimate

| | n | count | rate |
|---|---:|---:|---:|
| **rescue** — won fund enters the six under the model | 45 | 13 | 28.9% +/-13.2 |
| **harm** — won fund LEAVES the six under the model | 33 | 11 | 33.3% +/-16.1 |

```
delta = s_R * rescue  -  s_C * harm
      = 0.386 * 0.289  -  0.427 * 0.333
      = -3.10 points of population EXACT@6
        95% interval  -11.66 to 5.47
```

The pre-registration's bar for claiming a direction — 15 called in each
stratum — is met (R 45, C 33). The direction is **AWAY from the model**, and it is
INDICATIVE: the interval spans zero and this run was never powered to close it.

### The paired test on the called set

```
EXACT@6 (n=78 called, R+C)  McNemar(signed) z = +0.41  on 24 discordant (model 13, our score 11; both 22, neither 32)  exact p = 0.839  -- only 24 discordants, READ THE EXACT p, not the z
```

This pools the two strata and is reported for comparability with wsGA, which
did the same. It is NOT the estimand: pooling weights the strata by how the
budget happened to fall rather than by how the population is composed.

### Concentration — because wsHE's +2.4 was +0.4 with one agency removed

- **RESCUES: 13** across **6** regime(s); largest `satr_fr_rnd` with 5 = 38% of them
  - `satr_fr_rnd` 5
  - `horizon_eu_partnership` 2
  - `satr_it_rnd` 2
  - `satr_de_rnd` 2
  - `nfr_energix` 1
  - `nfr_gr_nnform` 1
- **HARMS: 11** across **5** regime(s); largest `innovate_uk` with 7 = 64% of them
  - `innovate_uk` 7
  - `innovationsfonden_innoexplorer` 1
  - `satr_it_rnd` 1
  - `innovationsfonden_global_research` 1
  - `cdti_perte_aerosalud` 1

### Secondary — the won fund's POOL RANK, Wilcoxon signed-rank

```
POOL rank (of 40)
  n=65 non-tied pairs (0 dropped)
  mean rank shift -1.45 (NEGATIVE favours the model — a lower rank is better)
  z = -0.36   p = 0.722
```

SECONDARY BY PRE-REGISTRATION. A more powerful test of a different quantity is
not a second chance at the same question.

## Composition of the CALLED set

| country | calls | share |
|---|---:|---:|
| NO | 15 | 19.2% |
| FR | 14 | 17.9% |
| DE | 12 | 15.4% |
| GB | 11 | 14.1% |
| IT | 9 | 11.5% |
| SE | 6 | 7.7% |
| CZ | 3 | 3.8% |
| DK | 3 | 3.8% |
| ES | 3 | 3.8% |
| NL | 2 | 2.6% |

## Per called founder

| founder | country | stratum | won @ pool | six control/model | menu | out tokens | EUR |
|---|---|---|---:|---|---:|---|---:|
| ENANTIS S.R.O. | CZ | R | 18 -> 21 | n/n | 40 | 30 | 0.0402 |
| TOUL ENERGIE | FR | R | 9 -> 4 | n/Y | 40 | 30 | 0.0413 |
| AF OFFSHORE DECOM | NO | C | 4 -> 2 | Y/Y | 40 | 30 | 0.0303 |
| CU SERVICES LIMITED | GB | C | 4 -> 8 | Y/n | 23 | 30 | 0.0295 |
| BRISTOL CITY COUNCIL | GB | C | 4 -> 9 | Y/n | 29 | 30 | 0.0344 |
| RATIER-FIGEAC | FR | R | 9 -> 4 | n/Y | 40 | 30 | 0.0415 |
| APTUNION INDUSTRIE | FR | C | 5 -> 6 | Y/Y | 40 | 30 | 0.0416 |
| UNIVERSITA COMMERCIALE LUIGI BOCCONI | IT | R | 14 -> 5 | n/Y | 40 | 527+30 | 0.0986 |
| MARITIME ROBOTICS | NO | C | 1 -> 1 | Y/Y | 40 | 30 | 0.0291 |
| BIO ME | NO | R | 19 -> 21 | n/n | 40 | 30 | 0.0310 |
| Bouyer Leroux | FR | C | 3 -> 1 | Y/Y | 40 | 30 | 0.0431 |
| AIXTRON SE | DE | R | 32 -> 6 | n/Y | 40 | 30 | 0.0522 |
| Aktiv | DK | C | 3 -> 8 | Y/n | 32 | 30 | 0.0332 |
| JANSEN RECYCLING GROUP B V | NL | R | 28 -> 7 | n/n | 40 | 30 | 0.0441 |
| ADVANCED MANUFACTURING SHEFFIELD | GB | C | 1 -> 1 | Y/Y | 29 | 30 | 0.0343 |
| DESTINUS SPAIN | ES | C | 3 -> 3 | Y/Y | 40 | 30 | 0.0404 |
| TELECOM ITALIA SPA O TIM | IT | R | 21 -> 22 | n/n | 40 | 30 | 0.0492 |
| 3T ADDITIVE MANUFACTURING | GB | C | 3 -> 9 | Y/n | 29 | 30 | 0.0344 |
| CELLFION AB | SE | C | 3 -> 1 | Y/Y | 40 | 30 | 0.0399 |
| EURNEX E V | DE | R | 7 -> 3 | n/Y | 40 | 30 | 0.0551 |
| WISE SRL | IT | C | 3 -> 9 | Y/n | 40 | 1533+30 | 0.1118 |
| CELLUGY | DK | C | 2 -> 8 | Y/n | 37 | 30 | 0.0388 |
| CEALTECH | NO | R | 18 -> 3 | n/Y | 40 | 30 | 0.0320 |
| NELLIE TECHNOLOGIES | GB | R | 16 -> 16 | n/n | 23 | 30 | 0.0289 |
| SWERIM | SE | R | 8 -> 14 | n/n | 40 | 30 | 0.0391 |
| AERNNOVA COMPOSITES ILLESCAS SA | ES | C | 2 -> 8 | Y/n | 40 | 30 | 0.0404 |
| CRCAM NORD MIDI PYRENEES | FR | R | 18 -> 2 | n/Y | 40 | 1529 | 0.0558 |
| INFUTURE | NO | R | 36 -> 37 | n/n | 40 | 30 | 0.0274 |
| ADDITIVE MANUFACTURING SOLUTIONS LTD | GB | C | 2 -> 8 | Y/n | 23 | 30 | 0.0296 |
| ALCOA NORWAY | NO | C | 4 -> 1 | Y/Y | 40 | 30 | 0.0306 |
| AEROTEX | GB | C | 3 -> 7 | Y/n | 30 | 30 | 0.0338 |
| FSTECHNOLOGY | IT | R | 13 -> 14 | n/n | 40 | 30 | 0.0451 |
| BP EUROPA SE | DE | R | 8 -> 12 | n/n | 40 | 30 | 0.0504 |
| AVA OCEAN | NO | R | 11 -> 6 | n/Y | 40 | 30 | 0.0261 |
| CIGNUS INSTRUMENTS | NO | C | 1 -> 5 | Y/Y | 40 | 30 | 0.0285 |
| CARIAD SE | DE | R | 37 -> 37 | n/n | 40 | 30 | 0.0500 |
| HENNLICH S.R.O. | CZ | R | 26 -> 26 | n/n | 40 | 30 | 0.0408 |
| RISE RESEARCH INSTITUTES OF SWEDEN AB | SE | R | 23 -> 26 | n/n | 40 | 30 | 0.0390 |
| 3D REPO | GB | C | 1 -> 1 | Y/Y | 24 | 30 | 0.0285 |
| HOPROD | FR | R | 22 -> 4 | n/Y | 40 | 834+30 | 0.0901 |
| UNIVERSITA' DEGLI STUDI DI MILANO-BICOCCA | IT | R | 18 -> 22 | n/n | 40 | 30 | 0.0492 |
| TALGA GROUP LTD | SE | R | 7 -> 10 | n/n | 40 | 30 | 0.0395 |
| ANDERSEN MEK VERKSTED | NO | R | 27 -> 27 | n/n | 40 | 30 | 0.0293 |
| AALBORG KOMMUNE | DK | C | 4 -> 1 | Y/Y | 37 | 30 | 0.0390 |
| CACTUX S.R.O. | CZ | R | 26 -> 26 | n/n | 40 | 30 | 0.0389 |
| CEMONITE | NO | R | 26 -> 7 | n/n | 40 | 30 | 0.0281 |
| ARISTON | IT | R | 25 -> 4 | n/Y | 40 | 30 | 0.0480 |
| MECACHROME FRANCE | FR | C | 6 -> 2 | Y/Y | 40 | 30 | 0.0408 |
| Heimann Sensor GmbH | DE | C | 6 -> 2 | Y/Y | 40 | 30 | 0.0565 |
| SCANDINAVIAN REAL HEART AB | SE | R | 18 -> 19 | n/n | 40 | 30 | 0.0382 |
| FEV EUROPE | DE | C | 2 -> 1 | Y/Y | 40 | 30 | 0.0505 |
| SHIFT MATERIALS | NO | R | 24 -> 24 | n/n | 40 | 30 | 0.0292 |
| MARTEL INNOVATE BV | NL | R | 31 -> 32 | n/n | 40 | 30 | 0.0443 |
| MEYER WERFT | DE | C | 6 -> 1 | Y/Y | 40 | 30 | 0.0561 |
| AEROSPACE VALLEY | FR | R | 24 -> 26 | n/n | 40 | 30 | 0.0412 |
| FORGES D'ALBERT | FR | R | 22 -> 4 | n/Y | 40 | 881+30 | 0.0920 |
| BRISTOL BATH REGIONAL CAPITAL | GB | C | 2 -> 9 | Y/n | 23 | 30 | 0.0294 |
| UNIVERSITA DEGLI STUDI DI NAPOLI PARTHENOPE | IT | R | 25 -> 28 | n/n | 40 | 30 | 0.0475 |
| KLOSSER INNOVASJON | NO | R | 32 -> 35 | n/n | 40 | 30 | 0.0305 |
| SITAEL | IT | C | 3 -> 2 | Y/Y | 40 | 30 | 0.0462 |
| BERNHARD NOCHT INSTITUT FUER TROPENMEDIZIN | DE | C | 2 -> 1 | Y/Y | 40 | 30 | 0.0507 |
| CELLEVATE AB | SE | C | 6 -> 5 | Y/Y | 40 | 30 | 0.0375 |
| OHB System AG | DE | C | 5 -> 2 | Y/Y | 40 | 30 | 0.0485 |
| GREENERWAVE | FR | R | 12 -> 16 | n/n | 40 | 30 | 0.0434 |
| ACTA MOBILIER | FR | R | 12 -> 15 | n/n | 40 | 30 | 0.0414 |
| CENTRE FOR PROCESS INNOVATION LIMITED LBG | GB | C | 3 -> 1 | Y/Y | 24 | 1467 | 0.0425 |
| AUGMENTCITY | NO | R | 24 -> 25 | n/n | 40 | 30 | 0.0319 |
| VALEO EAUTOMOTIVE GERMANY | DE | C | 4 -> 2 | Y/Y | 40 | 30 | 0.0509 |
| X FAB DRESDEN | DE | R | 9 -> 5 | n/Y | 40 | 30 | 0.0500 |
| CHOMARAT TEXTILES INDUSTRIES | FR | R | 12 -> 15 | n/n | 40 | 30 | 0.0426 |
| ASOCIACION DE INVESTIGACION DE LA INDUSTRIA DEL JUGUETE CONEXAS Y AFINES | ES | C | 2 -> 1 | Y/Y | 40 | 30 | 0.0400 |
| NEXTWORKS | IT | R | 21 -> 21 | n/n | 40 | 30 | 0.0478 |
| UNIVERSITE DE BORDEAUX | FR | R | 28 -> 29 | n/n | 40 | 30 | 0.0430 |
| NC SPECTRUM | NO | R | 8 -> 11 | n/n | 40 | 30 | 0.0266 |
| CIOL | NO | R | 40 -> 40 | n/n | 40 | 33+30 | 0.0598 |
| AQDOT | GB | C | 3 -> 9 | Y/n | 30 | 30 | 0.0344 |
| LE BIO MARAIS | FR | R | 11 -> 2 | n/Y | 40 | 30 | 0.0419 |
| QUANTUNE TECHNOLOGIES GMBH | DE | R | 30 -> 30 | n/n | 40 | 30 | 0.0509 |
