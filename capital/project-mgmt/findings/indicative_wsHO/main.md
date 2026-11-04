# wsHO — the forty-row call, priced; the ceiling, exercised; the ordering, pointed

```
started            2026-08-18T06:46:41.827Z
finished           2026-08-18T07:07:21.962Z
corpus             postgres instruments=1088 at 2026-08-18T06:46:42.279Z
ranker: all 828 request(s) on EMBEDDING
agent-select: menu=19-40 rows arm=adviser depth=40 count=7 effort=low maxtok=2048 unsure=declare lookups=17 (7 brief(s) retrieved) model=claude-sonnet-5 — 78/78 chose, 0 FELL BACK to the shipped order (0 empty reply, 0 unparseable), 0 short reply, 0 unusable id(s), 0 seat(s) on a row already picked under the SAME TITLE (a floor) across 0 brief(s), 0 SELECT-rule violation(s) on 0 reply(ies), 85 API call(s) over 78 brief(s), thought on 21/85 API call(s) (14444 thinking token(s) billed, 20059 readable char(s)), 0/85 CUT OFF at max_tokens, slowest call 26217ms of 40000ms (65.5% of the clock), EUR 3.5792 total, EUR 0.0459 per brief
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
WRITER_CANDIDATE_CAP 8   published_cap 7   shown 6
AGENT_SELECT_EFFORT low      maxtok 2048   clock 40000ms
```

**ONE lever is deliberately NOT the shipped default, and it is the only one.**
`AGENT_SELECT_EFFORT` ships as `low` (max_tokens 2,048, 40s clock). This run is
at `medium`, because BOTH of its first two jobs are questions about `medium` and
neither can be answered at `low`: `tokens_wsHI`'s EUR 0.0217-0.0483 spread is a
`medium` price, and the ceiling wsHI raised to 34,816 — the one this run exists
to exercise live for the first time — is `medium`'s. It is also wsGA's rung and
wsHK's, so the cost figure composes with the only record that exists. Quoting a
cost for the wrong rung is the wsGS failure and it is named here so it cannot
happen quietly. What `low` costs at forty rows is NOT measured by this run.

```
leak bar           cross_regime ONLY on paid calls (wsGA's stricter bar)
strata called      C,R  (D is never called by pre-registration)
rail               EUR 3.55; 188 founder(s) turned away by it
spend              EUR 3.5792 over 78 seam call(s) = EUR 0.0459 per founder
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
| 2. slowest call <= 80% of the clock | ok | 26217ms of 40000ms = 65.5% |
| 3. no call cut off at max_tokens (VOIDS Q3 ONLY) | ok | 0/85 API call(s) |
| 4. ranker attestation clean | ok | ranker: all 828 request(s) on EMBEDDING |
| 5. fell back on <= 5% of calls | ok | 0 of 78 (0.0%) |
| 6. both arms handed the same pool array, every called founder | ok | 78 of 78 |
| 7. `menuMax` is 40 | ok | menuMax=40 |

## Q1 — what a forty-row call actually costs

Read from the API's own `usage` on every turn, not from a projection.
One founder is one SEAM call and one or two API calls: round two fires only
where the model itself declared it could not separate two funds.

| | n | mean | median | p95 | max |
|---|---:|---:|---:|---:|---:|
| output tokens / API call, ALL menus | 85 | 201 | 30 | 999 | 1891 |
| output tokens / API call, menu=40 only | 70 | 215 | 30 | 1017 | 1891 |
| of which THINKING | 85 | 170 | 0 | 965 | 1857 |
| input tokens / API call | 85 | 21882 | 22195 | 27537 | 30558 |

| | |
|---|---:|
| API calls | 85 over 78 founder(s) = 1.09 per founder |
| **EUR per API call** | **0.0421** |
| **EUR per founder** | **0.0459** |
| thinking share of output tokens | 84.7% |
| ceiling in force (`MAX_TOKENS_BY_EFFORT.low`) | 2048 |
| largest single reply as a share of it | 92.3% |

### What the eventual full run costs, now that the spread is measured

`findings/tokens_wsHI/` priced a call at EUR 0.0217 (no menu scaling) to
EUR 0.0483 (linear, the pessimistic end). The realised figure above replaces
both. A full run is the whole gradable population under `ONLY_IN_POOL`:

| run | founders | API calls | EUR |
|---|---:|---:|---:|
| this one | 78 | 85 | 3.58 |
| in-pool population (669/897 walked -> 669 of 897) | 669 | 729 | **30.70** |
| whole population, both strata and the dead one | 897 | 977 | **41.16** |

After the 2026-08-31 price change, multiply by 1.5 — the ratio
`tokens_wsHI/README.md` carries in its own scaling table.

## Q2 — can the run be trusted

```
agent-select: menu=19-40 rows arm=adviser depth=40 count=7 effort=low maxtok=2048 unsure=declare lookups=17 (7 brief(s) retrieved) model=claude-sonnet-5 — 78/78 chose, 0 FELL BACK to the shipped order (0 empty reply, 0 unparseable), 0 short reply, 0 unusable id(s), 0 seat(s) on a row already picked under the SAME TITLE (a floor) across 0 brief(s), 0 SELECT-rule violation(s) on 0 reply(ies), 85 API call(s) over 78 brief(s), thought on 21/85 API call(s) (14444 thinking token(s) billed, 20059 readable char(s)), 0/85 CUT OFF at max_tokens, slowest call 26217ms of 40000ms (65.5% of the clock), EUR 3.5792 total, EUR 0.0459 per brief
agent-select exits (78 call(s) to the seam): 78 the model chose
{"armOff":0,"reversed":0,"poolNotLongerThanCount":0,"menuNotLongerThanWant":0,"dryPriced":0,"noUsablePick":0,"threw":0,"chose":78}
```

- **truncation: 0 of 85 API call(s)** — the denominator is
  `apiCalls`, incremented on the line that builds the request, not `calls`,
  which counts seam invocations. wsGA's published line divided the second by
  the first and printed `thought on 210/148 call(s)`. This is the first LIVE
  exercise of the fix `lib/intelligence/tallyDenominator.test.ts` pins.
- **`exits.threw`: 0** — a ceiling the clock cannot reach never
  truncates, it times out, and a timeout lands here rather than in `truncated`.
  A zero on the line above is only evidence when this one is zero too.
- **slowest call: 26217ms of 40000ms = 65.5% of the clock**
  — the first recorded duration for this seam in this repo.

## Q3 — which way the model's ordering points (INDICATIVE)

### The strata, measured on this run's own walk

| stratum | what the model can do | walked | share of gradable | CALLED |
|---|---|---:|---:|---:|
| **R** | RESCUE — won fund in the forty, not in our six | 324 | 39.1% | 43 |
| **C** | HARM only — won fund already in our six | 345 | 41.7% | 35 |
| **D** | nothing — won fund not in the forty at all | 159 | 19.2% | 0 |
| U | not gradable — the won fund is not publishable | 69 | — | 0 |

### The two rates, and the population estimate

| | n | count | rate |
|---|---:|---:|---:|
| **rescue** — won fund enters the six under the model | 43 | 11 | 25.6% +/-1304.1 |
| **harm** — won fund LEAVES the six under the model | 35 | 7 | 20.0% +/-1325.2 |

```
delta = s_R * rescue  -  s_C * harm
      = 0.391 * 0.256  -  0.417 * 0.200
      = +1.68 points of population EXACT@6
        95% interval  -5.84 to 9.20
```

The pre-registration's bar for claiming a direction — 15 called in each
stratum — is met (R 43, C 35). The direction is **TOWARDS the model**, and it is
INDICATIVE: the interval spans zero and this run was never powered to close it.

### The paired test on the called set

```
EXACT@6 (n=78 called, R+C)  McNemar(signed) z = +0.94  on 18 discordant (model 11, our score 7; both 28, neither 32)  exact p = 0.481  -- only 18 discordants, READ THE EXACT p, not the z
```

This pools the two strata and is reported for comparability with wsGA, which
did the same. It is NOT the estimand: pooling weights the strata by how the
budget happened to fall rather than by how the population is composed.

### Concentration — because wsHE's +2.4 was +0.4 with one agency removed

- **RESCUES: 11** across **6** regime(s); largest `satr_fr_rnd` with 4 = 36% of them
  - `satr_fr_rnd` 4
  - `horizon_eu_partnership` 2
  - `satr_de_rnd` 2
  - `nfr_energix` 1
  - `satr_it_rnd` 1
  - `satr_se_rnd` 1
- **HARMS: 7** across **5** regime(s); largest `innovate_uk` with 3 = 43% of them
  - `innovate_uk` 3
  - `innovationsfonden_innoexplorer` 1
  - `satr_it_rnd` 1
  - `cdti_perte_aerosalud` 1
  - `vinnova_grant` 1

### Secondary — the won fund's POOL RANK, Wilcoxon signed-rank

```
POOL rank (of 40)
  n=63 non-tied pairs (0 dropped)
  mean rank shift -1.44 (NEGATIVE favours the model — a lower rank is better)
  z = -0.15   p = 0.883
```

SECONDARY BY PRE-REGISTRATION. A more powerful test of a different quantity is
not a second chance at the same question.

## Composition of the CALLED set

| country | calls | share |
|---|---:|---:|
| FR | 14 | 17.9% |
| NO | 13 | 16.7% |
| DE | 13 | 16.7% |
| GB | 12 | 15.4% |
| IT | 9 | 11.5% |
| SE | 6 | 7.7% |
| CZ | 3 | 3.8% |
| DK | 3 | 3.8% |
| ES | 3 | 3.8% |
| NL | 2 | 2.6% |

## Per called founder

| founder | country | stratum | won @ pool | six control/model | menu | out tokens | EUR |
|---|---|---|---:|---|---:|---|---:|
| ENANTIS S.R.O. | CZ | R | 18 -> 19 | n/n | 40 | 30 | 0.0405 |
| TOUL ENERGIE | FR | R | 10 -> 6 | n/Y | 40 | 30 | 0.0418 |
| AF OFFSHORE DECOM | NO | C | 4 -> 1 | Y/Y | 40 | 30 | 0.0315 |
| CU SERVICES LIMITED | GB | C | 5 -> 10 | Y/n | 24 | 30 | 0.0302 |
| BRISTOL CITY COUNCIL | GB | C | 5 -> 10 | Y/n | 30 | 30 | 0.0351 |
| RATIER-FIGEAC | FR | R | 11 -> 3 | n/Y | 40 | 30 | 0.0417 |
| APTUNION INDUSTRIE | FR | C | 5 -> 2 | Y/Y | 40 | 687+30 | 0.0897 |
| UNIVERSITA COMMERCIALE LUIGI BOCCONI | IT | R | 14 -> 16 | n/n | 40 | 617+452 | 0.1033 |
| MARITIME ROBOTICS | NO | C | 1 -> 1 | Y/Y | 40 | 30 | 0.0297 |
| BIO ME | NO | R | 24 -> 26 | n/n | 40 | 30 | 0.0304 |
| Bouyer Leroux | FR | C | 3 -> 1 | Y/Y | 40 | 1154+1891 | 0.1151 |
| AIXTRON SE | DE | R | 32 -> 3 | n/Y | 40 | 30 | 0.0520 |
| Aktiv | DK | C | 3 -> 8 | Y/n | 32 | 30 | 0.0331 |
| JANSEN RECYCLING GROUP B V | NL | R | 28 -> 7 | n/n | 40 | 30 | 0.0441 |
| ADVANCED MANUFACTURING SHEFFIELD | GB | C | 1 -> 1 | Y/Y | 30 | 30 | 0.0350 |
| DESTINUS SPAIN | ES | C | 4 -> 3 | Y/Y | 40 | 30 | 0.0406 |
| TELECOM ITALIA SPA O TIM | IT | R | 22 -> 23 | n/n | 40 | 718 | 0.0540 |
| 3T ADDITIVE MANUFACTURING | GB | C | 4 -> 10 | Y/n | 30 | 30 | 0.0351 |
| CELLFION AB | SE | C | 3 -> 1 | Y/Y | 40 | 30 | 0.0399 |
| EURNEX E V | DE | R | 7 -> 3 | n/Y | 40 | 30 | 0.0550 |
| WISE SRL | IT | C | 3 -> 9 | Y/n | 40 | 30 | 0.0485 |
| CELLUGY | DK | C | 2 -> 2 | Y/Y | 37 | 30 | 0.0388 |
| CEALTECH | NO | R | 21 -> 4 | n/Y | 40 | 30 | 0.0316 |
| NELLIE TECHNOLOGIES | GB | R | 17 -> 17 | n/n | 24 | 30 | 0.0296 |
| SWERIM | SE | R | 8 -> 14 | n/n | 40 | 30 | 0.0391 |
| AERNNOVA COMPOSITES ILLESCAS SA | ES | C | 2 -> 8 | Y/n | 40 | 30 | 0.0400 |
| CRCAM NORD MIDI PYRENEES | FR | R | 19 -> 6 | n/Y | 40 | 30 | 0.0425 |
| ADDITIVE MANUFACTURING SOLUTIONS LTD | GB | C | 3 -> 3 | Y/Y | 24 | 728 | 0.0367 |
| ALCOA NORWAY | NO | C | 4 -> 2 | Y/Y | 40 | 30 | 0.0316 |
| AEROTEX | GB | C | 4 -> 1 | Y/Y | 31 | 30 | 0.0345 |
| FSTECHNOLOGY | IT | R | 13 -> 15 | n/n | 40 | 30 | 0.0452 |
| BP EUROPA SE | DE | R | 9 -> 13 | n/n | 40 | 30 | 0.0503 |
| AVA OCEAN | NO | R | 14 -> 17 | n/n | 40 | 30 | 0.0271 |
| CIGNUS INSTRUMENTS | NO | C | 1 -> 1 | Y/Y | 40 | 30 | 0.0283 |
| CARIAD SE | DE | R | 38 -> 38 | n/n | 40 | 378 | 0.0532 |
| HENNLICH S.R.O. | CZ | R | 26 -> 27 | n/n | 40 | 30 | 0.0411 |
| RISE RESEARCH INSTITUTES OF SWEDEN AB | SE | R | 23 -> 24 | n/n | 40 | 30 | 0.0390 |
| 3D REPO | GB | C | 2 -> 2 | Y/Y | 25 | 30 | 0.0292 |
| HOPROD | FR | R | 25 -> 5 | n/Y | 40 | 711+30 | 0.0889 |
| UNIVERSITA' DEGLI STUDI DI MILANO-BICOCCA | IT | R | 21 -> 25 | n/n | 40 | 663+30 | 0.1058 |
| TALGA GROUP LTD | SE | R | 7 -> 12 | n/n | 40 | 30 | 0.0395 |
| ANDERSEN MEK VERKSTED | NO | R | 32 -> 32 | n/n | 40 | 30 | 0.0296 |
| AALBORG KOMMUNE | DK | C | 4 -> 3 | Y/Y | 37 | 484 | 0.0431 |
| CACTUX S.R.O. | CZ | R | 26 -> 27 | n/n | 40 | 30 | 0.0391 |
| CEMONITE | NO | R | 30 -> 32 | n/n | 40 | 560 | 0.0343 |
| ARISTON | IT | R | 28 -> 3 | n/Y | 40 | 30 | 0.0479 |
| MECACHROME FRANCE | FR | C | 6 -> 2 | Y/Y | 40 | 30 | 0.0411 |
| Heimann Sensor GmbH | DE | C | 6 -> 2 | Y/Y | 40 | 30 | 0.0565 |
| SCANDINAVIAN REAL HEART AB | SE | R | 18 -> 5 | n/Y | 40 | 30 | 0.0382 |
| FEV EUROPE | DE | C | 2 -> 4 | Y/Y | 40 | 30 | 0.0504 |
| SHIFT MATERIALS | NO | R | 29 -> 29 | n/n | 40 | 30 | 0.0304 |
| MARTEL INNOVATE BV | NL | R | 31 -> 31 | n/n | 40 | 30 | 0.0443 |
| MEYER WERFT | DE | C | 6 -> 1 | Y/Y | 40 | 30 | 0.0556 |
| AEROSPACE VALLEY | FR | R | 25 -> 26 | n/n | 40 | 30 | 0.0411 |
| FORGES D'ALBERT | FR | R | 25 -> 5 | n/Y | 40 | 1017 | 0.0511 |
| BRISTOL BATH REGIONAL CAPITAL | GB | C | 2 -> 2 | Y/Y | 24 | 30 | 0.0301 |
| UNIVERSITA DEGLI STUDI DI NAPOLI PARTHENOPE | IT | R | 26 -> 29 | n/n | 40 | 347 | 0.0507 |
| KLOSSER INNOVASJON | NO | R | 37 -> 38 | n/n | 40 | 334 | 0.0330 |
| SITAEL | IT | C | 3 -> 4 | Y/Y | 40 | 30 | 0.0462 |
| BERNHARD NOCHT INSTITUT FUER TROPENMEDIZIN | DE | C | 2 -> 1 | Y/Y | 40 | 30 | 0.0507 |
| CELLEVATE AB | SE | C | 6 -> 10 | Y/n | 40 | 30 | 0.0375 |
| OHB System AG | DE | C | 5 -> 3 | Y/Y | 40 | 30 | 0.0484 |
| GREENERWAVE | FR | R | 13 -> 17 | n/n | 40 | 30 | 0.0434 |
| ACTA MOBILIER | FR | R | 14 -> 17 | n/n | 40 | 30 | 0.0417 |
| CENTRE FOR PROCESS INNOVATION LIMITED LBG | GB | C | 3 -> 5 | Y/Y | 19 | 409 | 0.0292 |
| AUGMENTCITY | NO | R | 29 -> 31 | n/n | 40 | 382 | 0.0350 |
| VALEO EAUTOMOTIVE GERMANY | DE | C | 4 -> 2 | Y/Y | 40 | 30 | 0.0509 |
| X FAB DRESDEN | DE | R | 9 -> 4 | n/Y | 40 | 30 | 0.0500 |
| CHOMARAT TEXTILES INDUSTRIES | FR | R | 12 -> 16 | n/n | 40 | 1379+30 | 0.0992 |
| ASOCIACION DE INVESTIGACION DE LA INDUSTRIA DEL JUGUETE CONEXAS Y AFINES | ES | C | 2 -> 3 | Y/Y | 40 | 539 | 0.0443 |
| NEXTWORKS | IT | R | 22 -> 23 | n/n | 40 | 30 | 0.0460 |
| UNIVERSITE DE BORDEAUX | FR | R | 29 -> 29 | n/n | 40 | 30 | 0.0426 |
| NC SPECTRUM | NO | R | 8 -> 12 | n/n | 40 | 30 | 0.0277 |
| AQDOT | GB | C | 4 -> 2 | Y/Y | 31 | 30 | 0.0351 |
| LE BIO MARAIS | FR | R | 12 -> 16 | n/n | 40 | 999+677 | 0.1002 |
| QUANTUNE TECHNOLOGIES GMBH | DE | R | 30 -> 30 | n/n | 40 | 30 | 0.0509 |
| ALIVE LABS | GB | C | 1 -> 1 | Y/Y | 30 | 30 | 0.0350 |
| Scienion GmbH | DE | C | 2 -> 1 | Y/Y | 40 | 30 | 0.0505 |
