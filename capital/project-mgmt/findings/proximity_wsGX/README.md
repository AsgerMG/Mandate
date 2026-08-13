# The blend's largest weight is PROXIMITY, and `rowRelevance` has no home-country term. Putting one there COSTS reach at the pool cut, and the reason generalises.

**Workstream GX · 2026-08-13 · isolated worktree off `main` at `7c6e97bd`.**

**Verdict: it does not pay, in either form, at either cut.** The fitted blend on
the production path is **−1.9 points of `pool_cut`** (McNemar z = 2.87, so the
loss is real and not noise) and **−1.4 at the writer cap**. It is not a null and
it is not a wash: **20 of its 26 pool-cut losses are pan-European programmes**,
and the mechanism that produces them is a rule this codebase has already
shipped, measured at a 25-point cost, and reverted.

Nothing is proposed for default-on. The isolated arm ships **default off**, as
the reproduction path for this number.

---

## 0. The prior, established first, because it decides whether this was worth running

The standing memo records **"address / territory — a perfect lookup is +0.4
tune, +0.0 holdout"**, and the brief asks whether that closed the same thing.
**It did not.** `address_door_wsCJ.md` measured a different mechanism at a
different scope:

| | wsCJ (closed) | `proximity` (this study) |
|---|---|---|
| what it chooses between | SIBLING LEAVES of one notified scheme, delivered by different territorial bodies | every row in the pool |
| the key | the founder's registered ADDRESS against a body's remit (NUTS, *Finanzamt*, *Bezirksregierung*) | the fund's COUNTRY against the founder's |
| how much of the corpus it can touch | **76 of 1,088 instruments (7.0%)** are territorial at all | every instrument has a country |
| what it does to the ORDER | nothing — a within-family tie-break at the leaf | a term in the score the whole table sorts on |
| where it acts | below the pool cut | **above** the pool cut |

wsCJ's null is a fact about the corpus: three quarters of what looks like "fifty
doors of one programme" is one body's back catalogue, so there is no door to
derive. That says nothing about whether a national-vs-EU-wide ordering term
helps a 40-row cut. **Different mechanism, different scope; the prior does not
transfer, and this workstream ran for that reason.**

## 1. What `proximity` actually is, read from the code before it was measured

`proximityFit` (`lib/intelligence/poolBlend.ts`) returns 1 for a fund in one of
the founder's own countries, `EU_WIDE_PROXIMITY = 0.45` for an EU-wide one, and
0 for anything else.

**The third value is unreachable inside a founder's table.** The establishment
screen runs first — `selectInstrumentRows` filters on
`instrumentServesCountry(i.country, founderCountries)` (`shortlist.ts:1569`),
which admits `EU` and the founder's own countries and nothing else. Every row
the blend scores is therefore already one or the other, so inside the pool

> **`proximity` is not a geography signal. It is a BINARY NATIONAL-vs-EU-WIDE
> PRIOR**, and the blend's largest fitted weight — 4.062, more than the next two
> columns combined — is on that one bit.

(The single path that reaches the 0 branch is the empty-channel fallback,
`if (!candidates.length && !NATIONAL_CHANNELS.has(channel)) candidates = offered`,
which by construction never applies to a national channel.)

## 2. The product is NOT blind to country, and home-above-EU is not an untried rule

The brief's premise — `rowRelevance` is `wTheme·theme + (1−wTheme)·sectorFit`
with no home-country term — is true of `rowRelevance`. It is not true of the
product. `selectLeafInstruments` sorts each channel's leaves with a country tier
ABOVE theme and above ticket fit (`shortlist.ts:1680`):

```ts
const isExactCountry = (i: DbInstrument) =>
  founderCountries.length > 0 &&
  (founderCountries.some((c) => toIso2(c) === i.country) || i.country === "EU");
```

Note what that predicate puts in ONE class. The comment above it records why,
and it is the precedent this workstream had to answer:

> This tested `toIso2(c) === i.country`, and an EU-wide instrument carries
> country "EU", which never equals "IT". So every national scheme outranked
> every EU programme, and the leaf cap cut before Horizon was reached. Measured
> on 80 real recipients replayed through the pipeline: **the fund a company
> ACTUALLY won was missing from the pool 25% of the time**, and the misses were
> overwhelmingly Horizon clusters, EIC and Joint Undertakings — the programmes
> that fund the most companies in Europe.

**So the prediction was made before the numbers:** a large positive weight on a
binary home flag is that reverted rule returning as a soft one. It should gain
founders whose won fund is national — most of them, because the answer key is
built from national registers — and lose the founders whose won fund is
pan-European, at exactly the stage where reach is priced.

## 3. The funnel, before and after, whole

`cd website/frontend && npm run stages` — n=897, holdout, `__recallSetDescribed`,
draw fingerprint `13cb71cf3a1d1847`, one population, free. One arm per process,
because `POOL_BLEND` and `ROW_PROXIMITY` are read once at module scope.

**Every run below attests `ranker: all 828 request(s) on EMBEDDING`.** No run
that failed to attest appears here; `requireCleanRanker` refuses to write one.

| stage | mechanism | `off` (shipped) | `on` (the blend) | delta |
|---|---|---:|---:|---:|
| the answer key names a fund the company won | | 897 · 100.0% | 897 · 100.0% | — |
| ... the corpus still holds it | `loadDbInstruments` | 897 · 100.0% | 897 · 100.0% | 0 |
| ... publishable on the corpus's own facts | `publishableInstruments` | 828 · 92.3% | 828 · 92.3% | 0 |
| ... its openness could be CONFIRMED | `unconfirmedOpen` | 828 · 92.3% | 828 · 92.3% | 0 |
| ... this founder's screen keeps it | `buildInstrumentTableHydrated` | 806 · 89.9% | 806 · 89.9% | 0 |
| ... encoded gates do not conclusively fail | `accessiblePool` | 774 · 86.3% | 774 · 86.3% | 0 |
| **... survives the cut to VERDICT_POOL (40)** | `.slice(0, VERDICT_POOL)` | **642 · 71.6%** | **625 · 69.7%** | **−17 (−1.9 pts)** |
| **... survives the cut to the writer's 8** | `orderMemoCandidates().toWriter` | **362 · 40.4%** | **349 · 38.9%** | **−13 (−1.4 pts)** |
| ... one of the 7 rows the brief publishes | `order.slice(0, institutionsMax)` | 347 · 38.7% | 329 · 36.7% | −18 (−2.0 pts) |
| **... in the first 6** | same order | **321 · 35.8%** | **312 · 34.8%** | **−9 (−1.0 pt)** |
| ... in the first 5 | same order | 297 · 33.1% | 287 · 32.0% | −10 (−1.1 pts) |

The five corpus and screen stages are identical to the founder, which is the
control: a re-ordering may not change what is in the pool, only where in it
things sit, and it did not.

`pool_cut` given `liveness_confirmed` — the figure comparable to
`poolRecallCurve` at K=40 — falls **77.5% → 75.5%**.

## 4. Paired, because two marginal counts cannot answer this

Four counts printed side by side answer *could these populations differ*. The
question is whether the SAME founders moved, and the two runs share a draw
fingerprint, so they can be paired founder for founder. That is what
`scripts/_wsgx_pairs.ts` does, over the `FUNNEL_TRACE` dumps.

**The arm ARRIVED.** The won fund's accessible rank differs for **416 of 828
founders (50%), median shift 2 rows**. This is not a flag that failed to reach
the module, which is the shape of every false null in this repo.

| stage | base | arm | paired | discordant (arm only / base only) | McNemar z |
|---|--:|--:|--:|--:|--:|
| `pool_cut` | 642 | 625 | **−17 = −1.9 pts** | 35 (9 / 26) | **2.87** |
| `writer_cap` | 362 | 349 | −13 = −1.4 pts | 59 (23 / 36) | 1.69 |
| `top_6` | 321 | 312 | −9 = −1.0 pt | 65 (28 / 37) | 1.12 |
| `top_5` | 297 | 287 | −10 = −1.1 pts | 74 (32 / 42) | 1.16 |

**At the pool cut the loss excludes zero.** Below it the sign is the same every
time and the interval no longer does — which is itself the finding's shape: a
re-ordering that removes a fund from the forty has removed it from everything
below, and the extra churn at the lower cuts is the same 40 rows being shuffled.

## 5. The concentration, and it is the mechanism in one line

The standing rule asks whether a move is SPREAD or is one market. This one is
not spread, and the direction is the point:

```
pool_cut  GAINS   9 founder(s) across 7 regime(s), largest 22%
                  vinnova_grant:2  nfr_forsterk:2  nfr_polarprog:1
                  nfr_innoffarena:1  satr_de_rnd:1  nfr_climit:1
          LOSSES 26 founder(s) across 8 regime(s), largest 50%
                  horizon_eu_pillar_ii:13  horizon_eu_partnership:7
                  satr_it_rnd:1  satr_de_rnd:1  bpifrance_pmup_idf:1  tacr_tp:1
```

**Every one of the nine gains is a national scheme. Twenty of the twenty-six
losses — 77% — are Horizon Pillar II or a Horizon partnership.** At `top_5` the
same shape holds with EIC joining them: `horizon_eu_pillar_ii:16`,
`horizon_eu_partnership:3`, `eic:4`, against gains led by `vinnova_grant:9` and
the national R&D tax credits.

That is the pre-registered prediction, measured. The blend's proximity weight
buys a handful of national schemes and pays for them with the pan-European
programmes, at a price of roughly three to one.

## 6. Why the answer generalises past this arm

> **A binary prior on a bit the screen has already used cannot add information;
> it can only re-sort the pool by the base rate of its two classes.**

Inside a founder's table, country has already done its work — `instrumentServesCountry`
removed every fund the founder cannot draw on. What is left of `proximity` is
one bit that is TRUE for most rows and most winners and FALSE for a minority
that contains Europe's largest funders. Weighting that bit does not tell the
score anything it did not know; it applies a POPULATION statistic ("most winners
won a national scheme") to a table whose whole purpose is to weigh THIS
founder's evidence.

`shortlist.ts` already carries the general form of this, about the channel
prior, forty lines from where the blend is computed: *"It trades one population
for the other every time, because the prior is a population statistic and the
row sort is the one place a specific founder's evidence should win."* The
proximity term is that same trade with a different column, and it lands in the
same place — **`A_POPULATION_PRIOR_IS_NOT_A_ROW_SIGNAL`**.

The test for unseen cases follows from it, and it is cheap: **before weighting a
signal in the row sort, ask how many distinct values it takes inside a pool that
has already been screened on it.** A signal that collapses to a boolean there is
a base rate, not evidence, and its fitted weight is measuring the answer key's
composition rather than the founder's fit.

## 7. What this does NOT say, and the bound the writer-cap number carries

- **It does not retract wsCU's +5.7.** That figure is a PURE POOL RE-ORDERING —
  no channel cap, no scheme dedupe, no peer precedence — and it is correct as
  measured. What this shows is that the ceiling does not survive contact with
  the stages beneath it, and now WHY: the re-ordering's gain is concentrated in
  the founders the machinery already serves, while its loss lands on the rows
  the caps and the dedupe were built to protect.
- **The writer-cap and row-cut numbers are bounded, and I want this read
  narrowly.** The free ladder has no model in it. In production the AI re-orders
  the pool ABOVE the writer cap, so a delta measured here at rank 8 is a delta
  against a baseline the product does not run. The honest claim is: *this much
  of that step is OUR ordering, on a path with no model in it.* How much of it
  the model already recovers is unmeasured here and cannot be inferred from
  here.
- **`pool_cut` carries no such caveat**, and that is why it is the row this
  workstream leads with. The model is a PERMUTATION of the forty; it cannot
  reach a fund the cut removed. A point lost at `pool_cut` is lost at every
  price.

## 8. Reproduce

```
cd website/frontend

# the funnel, one arm per process, sequential — free, ~15 min each
bash project-mgmt/findings/proximity_wsGX/run.sh off on pure
bash project-mgmt/findings/proximity_wsGX/run.sh off2 prox

# the pairing, over the FUNNEL_TRACE dumps (free, reads two files)
S=<scratchpad>/wsgx
for st in pool_cut writer_cap top_6 top_5; do
  BASE=$S/trace_off.jsonl ARM=$S/trace_on.jsonl STAGE=$st npx tsx scripts/_wsgx_pairs.ts
done

# the REGIME@5 / CHANNEL@5 trade, which the funnel deliberately cannot carry
bash project-mgmt/findings/proximity_wsGX/run_recall.sh off on
```

Terminal output for every run is committed beside this file. `PAIRS_*.txt`
carries the pairings; `FUNNEL_*.md` is each arm's own `latest.md`.

## What was changed

- `lib/intelligence/poolBlend.ts` — `homeFirstScores` and `ROW_PROXIMITY`
  (`off` | `first`), **default off**, plus `assertOneOrdering`, which refuses a
  run that sets both ordering flags rather than letting one win silently.
- `lib/intelligence/shortlist.ts` — `shippedBase`, ONE definition of the
  two-signal base score. The comment said "ONE definition" and there were two
  copies of the expression; the new arm would have made a third, and three
  copies of a sort key is how a re-ordering gets measured against a base score
  that is not the one it replaced. `blend` is renamed `poolScore`, for the slot
  rather than for one of its occupants.
- `scripts/measure_funnel.ts` — `row_order=<arm>` on the levers line, a
  `██ NOT THE SHIPPED ORDER` banner in `latest.md` for any non-shipped arm, and
  `rowOrder` in `latest.json`'s levers. An arm run and a baseline run previously
  wrote byte-comparable headers and differed only in the numbers.
- `scripts/measure_funnel.ts` — `FUNNEL_TRACE=<path outside the repo>`, one line
  per founder, so two runs can be PAIRED. `latest.json` is aggregate only, which
  made "is the gain spread or is it one market" unanswerable without
  re-implementing the ladder in a scratch script. **Refused anywhere inside the
  working tree**: a regime is a `parentId`, and for a standalone fund that IS
  the won fund's own id.
- `scripts/_wsgx_pairs.ts` — the pairing, with the arm-arrived line printed
  BEFORE the outcome and independently of it.

**A guard proved able to fail by running it:** `homeFirstScores` first used a
stratum term of `+1`, and its own unit test caught that an EU-wide row with base
exactly 1.0 TIES a home row with base exactly 0.0 — a stratification that is
strict except at the boundary, which is where the arm's entire effect lives. The
term is 2, and the bound on the base score is asserted rather than assumed.
