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

## 5. Where the region answer actually goes

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

The scope is the defect, not the wiring. `regionScorer` compares within a
`schemeCode` because that group is provably one scheme delivered by many
bodies. That reasoning is sound and the code's recorded caution is real — a
previous widening to "same display name in the same country" measured *worse*
(44.2% → 40.1% @1). But that widening merged two separate registrations. The
**regime** is the corpus's own family unit, the unit REGIME@5 is measured on,
and the unit `gateFitScorer` uses. Widening to it is a different change from
the one that failed, and it multiplies the addressable population by four.

---

## 6. What was changed

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
