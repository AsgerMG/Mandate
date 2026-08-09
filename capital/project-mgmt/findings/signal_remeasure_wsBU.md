# Which signals pick the right FUND, re-measured on a key that can see 28 countries

Workstream BU, 2026-08-09. Every number below is `__recallSetDoors.json`,
**holdout**, N=600, seed 20260806, live Postgres, 1,088 instruments, median pool
99 candidates, won fund in pool 93%. Reproduce with:

```
cd website/frontend
N=600 SPLIT=holdout FEATURES_OUT=/tmp/holdout.json npx tsx scripts/measure_signal_power.ts
N=600 SPLIT=tune    FEATURES_OUT=/tmp/tune.json    npx tsx scripts/measure_signal_power.ts
TUNE=/tmp/tune.json HOLDOUT=/tmp/holdout.json      npx tsx scripts/fit_signal_blend.ts
```

Raw terminal output is committed beside this file as
`signal_remeasure_wsBU_{tune,holdout,blend}.txt`.

## What was being re-tested

An earlier holdout study scored each signal alone — sector share 41%,
collaborative prior 31%, event count 23%, recency 22%, a logistic blend of eight
36%, against a 6% random baseline — and concluded that **instrument metadata
cannot pick 1 of 50**. That was measured against `__recallSetComposed.json`,
which named 390 of the 895 funds the product may offer, in 9 countries, and
could not name a childless family at all. The active key names 611 funds in 28
countries over 7,095 pairs, and 1,180 of its holdout pairs are the childless
families the old key was blind to.

REGIME@5 is not comparable across that switch and no REGIME figure appears here.
See `REGIME_AT_5_NOT_COMPARABLE` in `scripts/recallSet.ts`. Everything below is
EXACT@5.

## How a signal is scored, and why the baseline is computed rather than quoted

One expensive pass builds the POOL from the real `computeVerdict` — the funds
the product actually ranks. Every arm is then scored over that same pool
offline, so no two arms differ in draw, denominator or candidate set.

Ties are resolved by **expectation**, not by an id sort: a pair's score is the
probability the won fund lands in the five under uniform random tie-breaking.
`recency` takes nine values over a pool of ninety-nine and `proximity` takes
three; sorting those and slicing five would grade the alphabet. The rule makes a
three-valued signal comparable with a ninety-valued one, and it makes the random
baseline fall out as the CONSTANT signal on these pools — 5.6%, computed, not
remembered from another population.

Every figure carries a 95% half-width. **A gap smaller than the half-widths
either side of it is not a difference, and is not reported as one.**

## Every signal, alone, on holdout

| signal | overall | original join | childless family | exact attribution |
|---|--:|--:|--:|--:|
| **random baseline** | **5.6 ±0.4** | 5.0 ±0.4 | 7.4 ±0.7 | 4.9 ±0.6 |
| collaborative prior (peer) | **21.2 ±3.3** | 17.7 ±5.9 | 22.8 ±6.5 | 22.4 ±4.9 |
| *SHIPPED — the product's own five* | *21.2 ±3.3* | *21.3 ±6.3* | *22.4 ±6.6* | *20.4 ±4.7* |
| sector share, unclipped | 18.1 ±3.1 | 16.8 ±5.7 | 16.9 ±5.8 | 19.5 ±4.6 |
| semantic (founder's own text) | 16.2 ±2.9 | 17.1 ±5.8 | 18.6 ±6.1 | 14.3 ±4.1 |
| sector share (shipped, clipped) | 15.7 ±2.0 | 16.6 ±3.9 | 18.2 ±4.2 | 13.8 ±2.7 |
| shipped pool score (theme+sector) | 15.6 ±2.9 | 18.0 ±5.9 | 17.9 ±6.0 | 12.9 ±3.9 |
| shipped score, siblings by sector count | 13.8 ±2.8 | 18.3 ±5.9 | 17.9 ±6.0 | 8.9 ±3.3 |
| proximity (home country) | 10.4 ±1.6 | 6.1 ±0.8 | 13.1 ±2.7 | 11.5 ±2.9 |
| encoded gate count | 8.5 ±2.0 | 9.4 ±4.1 | 5.8 ±3.7 | 9.6 ±3.0 |
| sector count (posterior over pool) | 6.2 ±1.9 | 7.9 ±4.1 | 2.6 ±2.5 | 7.1 ±3.0 |
| recency (last award year) | 6.0 ±0.5 | 5.9 ±0.7 | 6.6 ±1.1 | 5.7 ±0.8 |
| award scale fit | 4.2 ±1.6 | 0.6 ±1.2 | 8.3 ±4.4 | 3.9 ±2.3 |
| total EUR | 4.2 ±1.6 | 1.8 ±2.1 | 1.9 ±2.2 | 6.8 ±3.0 |
| event count | 4.0 ±1.6 | 2.4 ±2.4 | 0.6 ±1.3 | 6.8 ±3.0 |
| company count | 4.0 ±1.6 | 2.4 ±2.4 | 0.6 ±1.3 | 6.8 ±3.0 |
| award median | 3.5 ±1.5 | 2.4 ±2.4 | 8.3 ±4.4 | 1.4 ±1.4 |
| eligibility (encoded gates) | 1.3 ±0.4 | 3.0 ±1.1 | 1.9 ±1.2 | 0.0 ±0.0 |

n: original join 164, childless family 156, exact attribution 280.

### Blended, fitted on tune and reported on holdout once

Conditional logit over all fourteen, within-pool percentile ranks, L2. Fitted on
600 tune pairs; the script refuses to fit and report on one split.

```
EXACT@5 on tune (FITTED THERE — not a result)   29.5 ±3.7
EXACT@5 on holdout (the reported number)        22.7 ±3.4
random baseline on the same pools                5.6 ±0.4

by population   original join  22.6 ±6.4   childless family  23.1 ±6.6   exact attribution  22.5 ±4.9
```

## The conclusion SURVIVES, and it survives harder

**"Instrument metadata cannot pick 1 of 50" holds on a 28-country key — and the
pool is 99, not 50.**

- Metadata is emphatically not noise: the best signals run at 3-4x the random
  baseline. That was true before and it is true now.
- But **nothing beats the ranker that ships.** The best single signal
  (collaborative prior, 21.2 ±3.3) equals SHIPPED (21.2 ±3.3) to the tenth, and
  a fourteen-feature blend given a free fit on 600 tune pairs reaches 22.7 ±3.4
  on holdout. The blend's margin over SHIPPED is 1.5 points against half-widths
  of ±3.4 and ±3.3. **That is not a difference, and it must not be ranked as
  one.** The 6.8-point drop from its own fitted split (29.5 → 22.7) is what the
  extra capacity actually bought.
- The one honest reading of "collaborative prior ties SHIPPED" is that peer
  precedence IS largely what orders the table today (`applyPeerPrecedence`), so
  the two arms are close to the same mechanism. It is not an untapped lever.

The absolute levels are LOWER than the prior study's (sector share 41% → 15.7%,
collaborative prior 31% → 21.2%) at a near-identical baseline, and that is
expected rather than alarming: the population now includes 28 countries and the
pools are twice the size. The prior study's conclusion was drawn on an easier
question and it still holds on the harder one.

## The half of the table that is not a signal at all

Seven arms sit at or below the computed baseline, and they are the ones that
keep being proposed:

- **Everything about a fund's SIZE runs backwards.** event count 4.0, company
  count 4.0, total EUR 4.2, award median 3.5 — all below a 5.6 baseline. Ranking
  by how big a fund is puts the answer further away than shuffling does.
- **`sector count (posterior over pool)` is 6.2 ±1.9, i.e. baseline.** This is
  the reading `project-mgmt/research/corpus_signal_map.md` recommends — rank on
  the raw count of a fund's awards in the founder's sector, which is P(fund |
  sector) up to a constant. Inside a sibling group that is a real result. Over
  the whole 99-fund pool the constant is no longer constant across regimes and
  the count is popularity wearing a posterior's clothes, which is why it lands
  exactly where the size columns do.
- **`recency` 6.0 ±0.5 against 5.6 ±0.4 is not a signal.** The prior study had it
  at 22%; here it is indistinguishable from a shuffle.
- **`eligibility (encoded gates)` 1.3 ±0.4 is FAR below baseline**, and 0.0 on
  the exact-attribution population. Ordering by how open a fund's encoded rules
  look is worse than random, because "open" is a statement about what we have
  ENCODED, not about fit: the won fund reliably sits below five funds whose gates
  we simply know less about. This is the same shape as the finding that a gap in
  our data must never be read as evidence, one level up.

## The new population, and the lever it kills

The 221 previously-invisible funds live in `traced:childless_family`, and the
most interesting available result was whether a signal works only there.

**No signal does.** The blend reads 23.1 ±6.6 on childless families, 22.5 ±4.9
on exact attribution and 22.6 ±6.4 on the original join — one number three times.
Childless families are not a harder or an easier population; their baseline is
higher (7.4 vs 4.9) only because those founders draw smaller pools.

What DOES change on them is a lever, and it changes structurally:

> **A rank-preserving within-regime permutation cannot touch a childless
> family, because a family with no children is its own regime and permuting a
> group of one is the identity.**

The `shipped score, siblings by sector count` row is that lever — the
construction `corpus_signal_map.md` recommends and the one the region
reassignment already uses. Read it across the row: **17.9 vs 17.9 on childless
families, identical to the score it permutes, exactly as the sentence above
predicts** — and **8.9 ±3.3 against 12.9 ±3.9 on exact attribution**, where it
has siblings to move and loses with them.

So the sibling-choice programme now addresses at most 280 of 600 holdout pairs
instead of all of them, and on those 280 the recommended permutation measures
worse than doing nothing. That is the finding that changed on the switch, and it
is a fact about the shape of the offer rather than about the ranker: 233 of the
funds the product offers have no siblings for a sibling-choice lever to choose
between.

## The most promising lever, and what acting on it costs

Ranked by measured effect, not by appeal.

**1. Un-clipping `sectorFit`. Cost: NOTHING — one constant, no ETL, no new
question.** `sectorFit` reads `min(1, share / 0.25)`, which makes a fund with 90%
of its awards in the founder's sector indistinguishable from one with 26%. The
raw share scores 18.1 ±3.1 against the clipped 15.7 ±2.0 on holdout and 18.8
±3.1 against 16.3 ±2.0 on tune — **the same direction on both splits, and inside
the half-widths on both.** The blend agrees more sharply than the standalone
arms do: given both forms as features it puts weight 2.08 on the unclipped share
and 0.52 on the clipped one.

Shipped as an ARM rather than as a change: `SECTOR_CLIP_ARM=off` in `fit.ts`,
defaulting to today's behaviour. End-to-end on the product's own ranking, N=600
holdout, seed 20260806:

```
                          clipped (ships)   unclipped (SECTOR_CLIP_ARM=off)
in pool                    555/600  93%       555/600  93%
EXACT@5                    127/600  21 ±3.3   131/600  22 ±3.3
REGIME@5                   438/600  73 ±3.6   400/600  67 ±3.8
CHANNEL@5                  553/600  92 ±2.2   514/600  86 ±2.8

EXACT@5 by population      clipped              unclipped
  original join                 21%                 20%
  childless family              22%                 24%
  exact attribution             20%                 21%
REGIME@5, exact attribution     98%                 83%
```

**Measured effect on EXACT@5: +4 cases in 600, +0.7 points against a ±3.3
half-width. It is not a difference and it does not ship.** And the run says
plainly why it should not: un-clipping costs **6 points of REGIME@5 (73 → 67)
and 6 of CHANNEL@5 (92 → 86)**, and on the exact-attribution population REGIME@5
falls **98% → 83%**. The clip is doing the job its docstring claims — stopping a
narrow fund from beating a broad one ACROSS channels — and removing it buys a
point of exact recall by scattering the table off the right regime entirely.
That trade is the same one `objectiveScorer` was moved out of the row sort to
avoid.

So the most promising lever on the table is worth nothing, and this is the
useful part of the result: it was the cheapest change available, it pointed the
right way on both splits and in the blend's weights, and end to end it is inside
the noise on the metric it targets while clearly negative on two others. The arm
stays in `fit.ts` so the next person can re-ask at a larger N without editing a
constant back and forth.


**2. Nothing else on this table is worth an intake question.** Every candidate
that would need one — award scale (a ticket question, already asked), recency,
fund size, eligibility posture — measures at or below a shuffle. Four signals
(event count, company count, total EUR, award median) would cost an ETL pass to
sharpen and are pointing the wrong way, so sharpening them would cost points.

**3. What this does NOT say.** The two strongest arms — collaborative prior and
the founder's own semantic text — are both already in the shipped path. The
ceiling here is not a ranking ceiling; it is that 99 candidates share a country,
a sector and a capital type, and the intake collects nothing else that separates
them. That is the same finding `screen_one_discrimination_plan.md` reached, now
re-established on a key that can see three times as many funds.

## Leak status — which numbers are leak-free

**All of them.**

- `npx tsx scripts/check_recall_leaks.ts` on the active set: *ok — 1,366
  described rows, 0 leaks at exact / 8-gram / sibling, 222 squash probes agree*,
  against a 1,088-instrument profile index.
- Of 7,095 pairs, 1,366 carry a description and every one is leak-free; the 58
  rows flagged `own_project_title_leaks` carry an EMPTY description, so no
  leaking string is ever handed to the ranker even without `DESCRIBED=1`. The
  remaining 5,671 rows fall back to one of 11 canned per-sector self-descriptions
  — a constant per sector, which cannot carry information about which fund won.
- The second documented leak is closed in this set: **0 of 1,366 descriptions
  begin with the instrument's own name** (it was 1,573 of 1,920), and 8 mention
  it anywhere, all of which clear the exact / 8-gram / sibling test.
- The collaborative prior is the one arm built from award history, and
  `emit_peer_prior.py` drops every company in EVERY `__recallSet*.json` by
  default — not behind a flag, and not by enumerating set names. Its 21.2% is
  out-of-sample.
- Only the `semantic` arm reads the founder's text at all. Every other arm is
  instrument-side metadata and cannot leak a description it never sees.
