# wsHO — the forty-row call, priced; the ceiling, exercised; the ordering, pointed

```
started            2026-08-18T06:43:28.310Z
finished           2026-08-18T06:43:39.980Z
corpus             postgres instruments=1088 at 2026-08-18T06:43:28.709Z
ranker: all 12 request(s) on EMBEDDING
agent-select: menu=40 rows arm=adviser depth=40 count=7 effort=medium maxtok=34816 unsure=declare lookups=0 (0 brief(s) retrieved) model=claude-sonnet-5 — 0/2 chose, 2 FELL BACK to the shipped order (0 empty reply, 0 unparseable), 0 short reply, 0 unusable id(s), 0 seat(s) on a row already picked under the SAME TITLE (a floor) across 0 brief(s), 0 SELECT-rule violation(s) on 0 reply(ies), 2 API call(s) over 2 brief(s), thought on 0/2 API call(s) (0 thinking token(s) billed, 0 readable char(s)), 0/2 CUT OFF at max_tokens, slowest call 0ms of 150000ms (0.0% of the clock), EUR 0.0000 total, EUR 0.0000 per brief
agent-select exits (2 call(s) to the seam): 2 the call threw, shipped order kept
set                __recallSetDescribed.json  split=holdout  seed=20260806
population         897 founder(s), fingerprint 13cb71cf3a1d1847
walked             12 of 897 in seeded-shuffle order
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
AGENT_SELECT_EFFORT medium      maxtok 34816   clock 150000ms
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
rail               EUR 0.50; 1 founder(s) turned away by it
spend              EUR 0.0000 over 2 seam call(s) = EUR 0.0000 per founder
```

**INDICATIVE. Not a measurement.** Every figure below carries its own `n=`.
No figure from this run may reach the dashboard headline — that is `one_funnel`
and nothing else. Pre-registered in `project-mgmt/wsHO_prereg.md`, committed
before the first paid token.

## The void conditions, checked rather than promised

Quoted from `wsHO_prereg.md` §6. Every one is a field printed above.

| condition | | observed |
|---|---|---|
| 1. `exits.threw` is zero | **VOID** | 2 |
| 2. slowest call <= 80% of the clock | ok | 0ms of 150000ms = 0.0% |
| 3. no call cut off at max_tokens (VOIDS Q3 ONLY) | ok | 0/2 API call(s) |
| 4. ranker attestation clean | ok | ranker: all 12 request(s) on EMBEDDING |
| 5. fell back on <= 5% of calls | **VOID** | 2 of 2 (100.0%) |
| 6. both arms handed the same pool array, every called founder | ok | 2 of 2 |
| 7. `menuMax` is 40 | ok | menuMax=40 |

## Q1 — what a forty-row call actually costs

No paid call was made on this run, so there is no distribution to report.

## Q2 — can the run be trusted

```
agent-select: menu=40 rows arm=adviser depth=40 count=7 effort=medium maxtok=34816 unsure=declare lookups=0 (0 brief(s) retrieved) model=claude-sonnet-5 — 0/2 chose, 2 FELL BACK to the shipped order (0 empty reply, 0 unparseable), 0 short reply, 0 unusable id(s), 0 seat(s) on a row already picked under the SAME TITLE (a floor) across 0 brief(s), 0 SELECT-rule violation(s) on 0 reply(ies), 2 API call(s) over 2 brief(s), thought on 0/2 API call(s) (0 thinking token(s) billed, 0 readable char(s)), 0/2 CUT OFF at max_tokens, slowest call 0ms of 150000ms (0.0% of the clock), EUR 0.0000 total, EUR 0.0000 per brief
agent-select exits (2 call(s) to the seam): 2 the call threw, shipped order kept
{"armOff":0,"reversed":0,"poolNotLongerThanCount":0,"menuNotLongerThanWant":0,"dryPriced":0,"noUsablePick":0,"threw":2,"chose":0}
```

- **truncation: 0 of 2 API call(s)** — the denominator is
  `apiCalls`, incremented on the line that builds the request, not `calls`,
  which counts seam invocations. wsGA's published line divided the second by
  the first and printed `thought on 210/148 call(s)`. This is the first LIVE
  exercise of the fix `lib/intelligence/tallyDenominator.test.ts` pins.
- **`exits.threw`: 2** — a ceiling the clock cannot reach never
  truncates, it times out, and a timeout lands here rather than in `truncated`.
  A zero on the line above is only evidence when this one is zero too.
- **slowest call: 0ms of 150000ms = 0.0% of the clock**
  — the first recorded duration for this seam in this repo.

## Q3 — which way the model's ordering points (INDICATIVE)

### The strata, measured on this run's own walk

| stratum | what the model can do | walked | share of gradable | CALLED |
|---|---|---:|---:|---:|
| **R** | RESCUE — won fund in the forty, not in our six | 6 | 50.0% | 2 |
| **C** | HARM only — won fund already in our six | 4 | 33.3% | 0 |
| **D** | nothing — won fund not in the forty at all | 2 | 16.7% | 0 |
| U | not gradable — the won fund is not publishable | 0 | — | 0 |

### The two rates, and the population estimate

| | n | count | rate |
|---|---:|---:|---:|
| **rescue** — won fund enters the six under the model | 2 | 0 | 0.0% +/-0.0 |
| **harm** — won fund LEAVES the six under the model | 0 | 0 | 0.0% +/-0.0 |

```
delta = s_R * rescue  -  s_C * harm
      = 0.500 * 0.000  -  0.333 * 0.000
      = +0.00 points of population EXACT@6
        95% interval  0.00 to 0.00
```

██ **NO DIRECTION IS CLAIMED.** The pre-registration requires at least 15
founders called in EACH stratum and this run called 2 in R and 0 in C.
"The budget did not buy a direction" is the result, and it is reported as one
rather than rescued by pooling the strata.

### The paired test on the called set

```
EXACT@6 (n=2 called, R+C)  McNemar(signed) z = +0.00  on 0 discordant (model 0, our score 0; both 0, neither 2)  exact p = 1.000  -- NO discordant pairs: the arms are identical on these cases, not tied on evidence
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
| CZ | 1 | 50.0% |
| FR | 1 | 50.0% |

## Per called founder

| founder | country | stratum | won @ pool | six control/model | menu | out tokens | EUR |
|---|---|---|---:|---|---:|---|---:|
| ENANTIS S.R.O. | CZ | R | 18 -> 18 | n/n | 40 |  | 0.0000 |
| TOUL ENERGIE | FR | R | 10 -> 10 | n/n | 40 |  | 0.0000 |
