# Can the corpus tell funds apart, and can the ranker use it

**Workstream AO · 2026-08-08 · isolated worktree off `main` at `ef77f641`.**

Every figure came out of Postgres with `corpus=postgres instruments=1088`
printed on the run that produced it, `requireLiveCorpus` asserted. The baseline
reproduces `predictability_wsAM.md` case for case on all three seeds — pool
94/94/94, EXACT@5 25/29/31, REGIME@5 82/85/85 — so everything below is
comparable with the finding it is built on.

---

## 1. The headline

**The hypothesis holds. Gates do separate siblings, and the earlier verdict
that they do not was an artifact of the harness describing every founder
identically.**

Two things were wrong, and they are different kinds of wrong:

1. **The measurement instrument.** The replay handed all 300 founders the same
   `ticketBand`, `capitalSought`, `consortium`, `borrowerModel` and
   `useOfFunds`. Only country, sector and the description varied. Under those
   inputs gate fit is *constant across the whole sibling group* for 1,808 of
   1,996 graded pairs — and for **all 1,545 profile-mode rows, the population
   that is 84% of this product**. There was no signal to find, so "won fund 62%
   pass vs pool 63%" measured nothing.

2. **The region signal is not dropped.** It is scoped to a group that barely
   exists. `regionScorer` only compares leaves sharing a `schemeCode`, and 95
   of 807 publishable leaves do. It reaches 10% of graded pairs — 33 rows of
   the 300 the headline is computed on — which is why `REGION=any` prints
   bit-identical numbers while genuinely moving the tables it can reach.

---

## 2. Founders were all the same person

`measure_recall.ts` replayed every award through `computeVerdict` with these
answers, identical for every row:

```
activities ["none"] · borrowerModel "operating" · ticketBand "b500k_2m5"
consortium "yes" · useOfFunds [industrial_research, experimental_development]
capitalSought ["grant", "loan"]
```

A discriminator cannot discriminate between founders who are described
identically. Any signal keyed on what the founder *is* — gate fit, ticket fit,
capital preference — was being asked to separate rows that had nothing to
separate, and would measure flat however good it was. The row sort's own
comment records the same trap for ticket fit.

`ETL/terms/enrich_recall_answers.py` derives two answers per company from the
transparency register, with the same two provenances `repair_recall_attribution.py`
established for region:

| | derived | provenance |
|---|--:|---|
| `ticketBand` | median award this company actually received | `other_scheme` 19% · `own_award` 22% |
| `capitalSought` | the kinds of capital it has actually taken | `other_scheme` 19% · `own_award` 20% |

`useOfFunds` is **deliberately not derived**. It would come from the register's
`objectives_text`, which is a statement about the *scheme*, and `objectiveScorer`
ranks on exactly that field — deriving it would let the objective signal grade
itself, which is the shape of the project-title leak that read 90% recall and
was really 10%. `consortium` and `borrowerModel` are not in the register and
stay constant rather than being invented.

`ANSWERS=` never restricts the population: a founder we cannot derive an answer
for keeps the constant. The denominator is identical to the baseline, so the
difference is an effect and not a change of sample. Verified — `ANSWERS=off`
reproduces the baseline exactly at 75/300.

**The constants were badly wrong.** The real modal ask across the set is
`lt500k` (1,257 rows) against the `b500k_2m5` (589) every founder was given.
Most replayed founders were being handed an ask an order of magnitude above
their own, into a ranker that multiplies rows by ticket fit.

### What describing founders honestly does to the headline

Holdout, N=300, three seeds, no ranking change — only the answers:

| | pool | EXACT@5 | REGIME@5 |
|---|---|---|---|
| `off` (baseline) | 94 / 94 / 94 | 25 / 29 / 31 | 82 / 85 / 85 |
| `strict` (leak-free) | 92 / 90 / 92 | 25 / 27 / 33 | 80 / 83 / 84 |
| `real` (both provenances) | **91 / 89 / 91** | 28 / 30 / 32 | 81 / 84 / 83 |

EXACT@5 moves by less than its own interval — the answers alone are not a
ranking fix. **Pool is the row that matters here, and it falls 3–5 points on
every seed, which is outside noise.** The cause is `capitalSought`: the
constant `["grant", "loan"]` was generous, and a founder whose register history
shows only grants now asks only for grants, so `passesCapitalPreference` and
`instrumentServesCapital` drop instruments they went on to win.

Two readings, and the evidence does not yet separate them:

- **The filter is too strict.** Founders demonstrably win capital types they
  would not have named up front, and a hard capital filter costs real recall.
- **The derived answer overstates the preference.** Past awards are evidence of
  what a company *received*, not of what it would *ask for*. Someone who has
  only held grants may still want a loan.

Either way it is a live finding about the shipped selection path and it is
worth its own workstream. It is *not* a reason to prefer the old constants: a
harness that avoids the question by describing everyone identically was hiding
this, not avoiding it.

---

## 3. What gates can and cannot do, structurally

Answered off the corpus alone, before any replay, because it bounds everything
after it (`scripts/measure_gate_separation.ts`):

```
multi-leaf publishable regimes                 37 (515 leaves)
...whose leaves carry an IDENTICAL rule set    25 (68%)
gates on reachable leaves                      10,888
...inherited from the regime                   8,984 (83%)
...decidable filters (role=filter + valueSpec) 3,418
......of which the leaf's OWN, not inherited     761 (22%)
```

**83% of gates are inherited from the regime, and 68% of multi-leaf regimes
give every leaf an identical decidable rule set.** For those groups gate fit is
constant by construction and *no intake answer whatsoever can separate them*.
This is a ceiling on the whole approach and it is answer-independent.

---

## 4. What gates do once founders differ

Within-regime top-1 by gate fit, against the uniform baseline (1 / group size),
over 1,996 graded holdout pairs. A tie is credited as 1/|tie|, never as a win.

| answers | top-1 | uniform | lift | groups where fit varies at all |
|---|--:|--:|--:|--:|
| **off** — the old harness | 4.7% | 4.8% | **−0.1pp** | 188 / 1,996 |
| **strict** — leak-free only | 6.3% | 4.8% | **+1.5pp** | 531 / 1,996 |
| **real** — both provenances | 9.3% | 4.8% | **+4.5pp** | 1,044 / 1,996 |

The `off` row reproduces the original "gates do nothing" verdict exactly. The
same code, on the same pairs, with founders described individually, roughly
doubles top-1 over chance.

By the size of the group the chooser had to order, `ANSWERS=real`:

| group | top-1 | uniform | lift |
|---|--:|--:|--:|
| regime 2 | 41.4% | 50.0% | −8.6pp |
| regime 3–5 | 31.3% | 33.3% | −2.1pp |
| regime 6–20 | 14.8% | 11.4% | +3.4pp |
| regime 21–50 | 6.3% | 2.6% | +3.6pp |
| **regime 51+** | **7.5%** | **1.5%** | **+6.0pp** |

The lift is concentrated exactly where the leaf choice binds — the large
regimes, where wsAM measured REGIME@5 at 99% and EXACT@5 at 24%. On the small
groups gate fit is at or below chance, which is worth stating plainly rather
than averaging away.

### The null model that could have killed it

22% of decidable filters are a leaf's own and the rest are inherited, so the
leaves that differ from their siblings differ largely in **how much has been
encoded about them** — and the best-documented leaf of a regime is also the one
most companies win. "Gate fit" could therefore be a documentation-volume prior
in disguise, which is the objective-prior mistake that cost 21 points.

`FIT=` scores that null model directly:

| scorer | ANSWERS=real | ANSWERS=strict |
|---|--:|--:|
| `checked` — rules evaluable, ignoring pass/fail | **+0.5pp** | +0.5pp |
| `passrate` — share the founder clears | **+4.5pp** | +1.4pp |
| `full` — verdict tier, then passes | +4.5pp | +1.5pp |

**The lift is founders passing rules, not leaves having them.** `gateFitScorer`
therefore scores on pass rate alone and deliberately excludes the count of
rules checked, even though that count correlates with the answer.

### France gets nothing

| country | ANSWERS=strict lift | ANSWERS=real lift |
|---|--:|--:|
| NL | +7.6pp | +17.4pp |
| DE | +3.9pp | +12.2pp |
| IT | +1.8pp | +5.3pp |
| **FR** | **+0.1pp** | **+0.2pp** |
| SE | −0.1pp | −0.1pp |

France is 31% of graded holdout pairs and the worst-served market on every
seed. Gate fit does not help it. This is consistent with wsAM's finding that FR
is the one market where data, not ranking, is still binding — its ceiling is
66% against ~100% elsewhere, and its `eligibility_text` coverage is 55% of 105
publishable leaves. **A gate-based leaf chooser is not a French fix**, and
nothing in this workstream changes that.

---

## 5. Wiring it in: what the leaf chooser is actually worth

`gateFitScorer` joins objective, award and region in the existing sibling
reassignment. Holdout, N=300, three seeds, `ANSWERS=real`, the only difference
between arms being the scorer:

| seed | EXACT@5 without | with | Δ | pool | REGIME@5 |
|---|--:|--:|--:|---|---|
| 20260806 | 83 | **92** | **+9** | 272 → 272 | 242 → 242 |
| 7 | 89 | **96** | **+7** | 268 → 268 | 253 → 253 |
| 99 | 97 | **98** | **+1** | 273 → 273 | 250 → 250 |

**Pool and REGIME@5 are identical, pair for pair, on every seed.** That is the
design working exactly as intended: the reassignment is rank-preserving, so the
chooser can only change *which sibling holds a slot*, never which programme
does. It is a leaf chooser and nothing else — which is the one factor wsAM
measured as binding.

On the shipped path (`ANSWERS=off`, constant answers) it is inert — 74/88/93
against a baseline of 75/88/93, with pool and REGIME@5 unchanged. All floors
clear (pool 94 ≥ 93, EXACT@5 25/29/31 ≥ 22, REGIME@5 82/85/85 ≥ 80).

**`ANSWERS=off` is the unrealistic condition, not the realistic one.**
Production asks `ticketBand` on the first screen and `region` adaptively; it is
the *harness* that was inventing a founder who answers everything identically.
So the `real` column is the better estimate of what a founder gets, and the
`off` column is a no-regression check.

### Who it helps, and who it does not

Per-country EXACT@5, `ANSWERS=real`, without → with, across the three seeds:

| country | seed 20260806 | seed 7 | seed 99 |
|---|---|---|---|
| **DE** (n 54–77) | 35 → **48** | 40 → **48** | 39 → **41** |
| **NL** (n 16–21) | 50 → **60** | 43 → **48** | 50 → 50 |
| **FR** (n 87–98) | 17 → **16** | 14 → 14 | 17 → 17 |
| SE, IT, ES, GB, EE | unchanged | unchanged | unchanged |
| mode=profile | 28 → 32 | 31 → 34 | 32 → 33 |
| mode=project | 27 → 26 | 26 → 26 | 32 → 32 |

**This is a German and Dutch improvement and it does nothing for France.** FR
is 31% of graded holdout pairs, the worst-served market on every seed, and it
moves by at most one pair in the wrong direction. By the standard this
workstream was set — a change that helps the aggregate and not France has not
addressed the problem — **this does not address the problem.** It is floor-safe
and free (no market is harmed, REGIME@5 cannot move by construction), so it is
worth keeping, but it must not be reported as the fix.

The magnitude deserves the same honesty. wsAM put the recoverable gap at ~62
points and the arithmetic needs P(right leaf | regime in five) to go from 30%
to 50% for EXACT@5 to reach 40%. This moves the headline about **2 points**. It
is the first thing to make that factor move at all; it is not the thing that
closes it.

---

## 6. Where the region answer actually goes

`REGION=any` prints numbers bit-identical to no region at all, on every
headline, mode, regime bucket and country. The natural reading is that the
answer is dropped somewhere between the intake and the ranker. **It is not.**
Walking the real build path with and without the region
(`scripts/diagnose_region_drop.ts`), on the rows where the signal has anything
to say:

```
published TOP 6 differs             11/60
won fund ranked HIGHER with region  4      (lower: 0)
won fund in top 6, without / with   4 / 8
```

It works. It reaches almost nobody (`scripts/diagnose_region_reach.ts`):

```
publishable leaves                                807
  sitting in a multi-leaf SCHEME CODE group        95
  sitting in a multi-leaf REGIME                  515

holdout graded pairs                             2,150
  supplied a region                        991  (46%)
  can separate, scoped to SCHEME CODE      224  (10%)   <- what ships
  can separate, scoped to REGIME           927  (43%)

  seed 20260806 N=300:  scheme-scoped  33   regime-scoped 131
```

**33 rows of 300.** An effect of a few points on a tenth of the sample is
invisible against ±4.9, which is why a live, correctly-built, measured-at-66%
signal reads as a dead one.

### The obvious fix was measured, and it is worse

Widening the comparison from the notified scheme to the **regime** quadruples
the reach and looked like the answer. Holdout, N=300, three seeds,
`ANSWERS=real`, gate fit on, nothing else changed:

| scoping | EXACT@5 | DE |
|---|---|---|
| **scheme code** (ships) | **92 / 96 / 98** | 48 / 48 / 41 |
| regime | 85 / 92 / 96 | 42 / 43 / 35 |

Worse on every seed, and worst in exactly the market region was supposed to
serve. A regime can hold a hundred leaves, and at that width "which body has
paid most into this region" stops being geography and becomes a size prior —
the same failure that cost the objective prior 21 points and the sector
posterior 2. This is the third recorded attempt to widen a per-scheme signal
beyond its scheme and the third to lose points; the finding is now in the
comment beside the other two so it is not tried a fourth time.

**So there is no code fix here.** The narrow reach is a fact about the corpus,
not a defect in the function: only 95 of 807 publishable leaves carry a scheme
code they share with a sibling. The way to make the region answer matter more
is for more leaves to carry a resolvable notified scheme — collection work, not
ranking work.

The honest answer to "the intake asks for region and nothing changes" is
therefore: **it does change something, for the 10% of founders it can, and it
is correctly built.** What it cannot do is show up in a 300-row aggregate.

---

## 7. What was changed

- `ETL/terms/enrich_recall_answers.py` — derives per-founder `ticketBand` and
  `capitalSought` from the register, with provenance, reporting any
  aid-instrument wording it cannot place rather than swallowing it.
- `scripts/recallSet.ts` — `answersFor()`, one resolver shared by every
  harness so two of them cannot disagree about what a founder said.
- `scripts/measure_recall.ts` — `ANSWERS=off|real|strict`, and a line reporting
  how many founders actually got their own answers.
- `scripts/measure_gate_separation.ts` — the structural bound and the
  discrimination measurement, with `FIT=` for the null model.
- `scripts/diagnose_region_drop.ts`, `scripts/diagnose_region_reach.ts`.
- `lib/intelligence/shortlist.ts` — `gateFitScorer`, regime-scoped, pass-rate
  only, neutral where it cannot separate; joined into the existing sibling
  reassignment beside objective, award and region.

---

## 8. What this changes about what to do next

1. **The gate corpus is worth ranking on, and it is capped low.** 83% of gates
   are inherited and 68% of multi-leaf regimes give every leaf an identical
   rule set. The chooser can only ever act on the third of regimes where a leaf
   carries rules of its *own*. Encoding leaf-specific eligibility — not more
   gates in general — is what raises that ceiling.
2. **France still needs data, not ranking.** Two independent measurements now
   say so: gate fit lifts FR by +0.1pp where it lifts DE by +3.9pp, and the
   end-to-end run moves FR by at most one pair. wsAM's recommendation stands
   unchanged and this workstream does not substitute for it.
3. **The capital filter costs pool recall** once founders state a real
   preference (94% → 91% on every seed). That is a shipped-path question about
   `passesCapitalPreference` and it is untouched here.
4. **Stop measuring discriminators with constant answers.** Two conclusions
   have now been overturned by fixing the harness rather than the product.
   `ANSWERS=` should be on any run that claims a signal about the founder does
   or does not work.

## Reproducing this

```
cd website/frontend
SPLIT=holdout SEED=20260806 N=300 npx tsx scripts/measure_recall.ts
SPLIT=holdout ANSWERS=real   SEED=20260806 N=300 npx tsx scripts/measure_recall.ts
SPLIT=holdout ANSWERS=strict SEED=20260806 N=300 npx tsx scripts/measure_recall.ts
npx tsx scripts/measure_gate_separation.ts
ANSWERS=real npx tsx scripts/measure_gate_separation.ts
FIT=checked ANSWERS=real npx tsx scripts/measure_gate_separation.ts
npx tsx scripts/diagnose_region_reach.ts
python3 ETL/terms/enrich_recall_answers.py
```
