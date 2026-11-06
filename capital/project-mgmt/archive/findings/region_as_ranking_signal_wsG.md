# Region as a ranking signal, and the one-row-per-regime collapse

**Workstream G. Closed 2026-08-08 by workstream BG. Nothing here ships.**

The code lived on `wsG-region` (tip `dd55afbe`) and `wsG-scorer-width`
(`ce56b654`). `ce56b654` is in `main`'s history via the J merge and shipped
nothing; `dd55afbe` is archived as tag `archive/wsG-region`. Both branches are
deleted. The numbers are repeated in the comment on `regionScorer` in
`lib/intelligence/shortlist.ts`, which is where someone would go to retry this.

---

## 1. The result, in one line

Widening `regionScorer` past the notified scheme loses points every time it is
tried, and at regime width region does not beat popularity at all.

```
group width        n     region @1   popularity @1    @3
name, 6+ members  139       24.5%        12.9%       83.5%
regime, 6+        626       13.7%        13.7%       27.8%
```

`WIDTH=regime npx tsx scripts/measure_region_routing.ts` reproduces this. The
flag is merged; it is the cheapest way to re-check the premise before anyone
spends a week on it again.

**The 44.2% / 65.5% @1 that region is justified on is a property of the
7.4-member same-name group.** It is not a property of region. Carried to the
76-member regime the signal is worth nothing over a size prior, which is the
same failure mode that cost the objective prior 21 points and the sector
posterior 2.

That is now **three** independent widenings measured and lost:

| attempt | widened to | result |
|---|---|---|
| pre-existing | same display name + country | @1 44.2% -> 40.1%; 65.5% -> 43.1% on the groups it moved |
| wsAO | regime (`parent_id`), N=300 x 3 seeds | EXACT@5 92/96/98 -> 85/92/96 |
| wsG / wsJ `ce56b654` | regime (`parent_id`), n=200 | EXACT@5 34% -> 35%, against 36% for not answering region at all |

The third one *improves* on the shipped scoping and still loses to leaving the
question unasked. That is the shape to remember: the debate is not
scheme-vs-regime, it is whether to ask region at all.

## 2. The collapse, and the two things that make it look better than it is

`wsG-region` also built one-row-per-regime as a **reorder, never a filter**, and
measured it end to end:

```
arm                          pool  REGIME@5  EXACT@5   oracle
baseline (shipped)            97%      89%      36%       --
collapse, unconditional       97%      94%    24% / 26%    93%
collapse, evidence-gated      97%      89%    36% / 30%    88%
```

Nothing beats the baseline on EXACT@5. Two sub-findings are worth more than the
arms, because both are traps a re-attempt walks into:

- **A first version DROPPED the non-representative rows and emptied the pool,
  in-pool 97% -> 16%.** `computeVerdict` derives `candidateInstrumentIds` from
  this same array. Anything that touches row order here must be a reorder.
- **Rank preservation.** The representative was taking its own former position,
  so choosing a sibling that sat at rank 60 dragged its whole regime to rank 60
  (REGIME@5 95% -> 90%, and 92% -> 79% on the population region can act on). A
  representative must take its REGIME's rank. Region may answer *which door*,
  never *whether the programme deserves a slot*.
- **`parent_id` is corpus structure, not a claim of interchangeability.** Of the
  53 multi-member regimes, 38 (72%) are heterogeneous — 20 differ on capital
  type, 30 on award magnitude, 16 on registered legal basis — and the four
  regimes with 51+ members hold a median of 7 distinct offers each. No recall
  number shows the options a collapse hides.

## 3. Why this is closed rather than parked

The arithmetic in `research/target_arithmetic.md` prices the collapse
independently: it buys about six points of regime@5, so collapsed EXACT@5 tops
out near `0.96 x 0.93 x 0.388 = 35%` against today's 28% +/-6 — and only if the
oracle is real. At any realistic fraction of the oracle it loses. Two harnesses,
one arithmetic argument and a rendered page (workstream M) all land in the same
place.
