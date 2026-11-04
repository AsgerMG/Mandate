# wsEC — the ordering of the eighteen is closed, and the defect is what the rows SAY

The won fund is somewhere in the accessible pool on **77.5%** of held-out
founders and inside the eighteen rows the selector is shown on **44.2%**. wsDR
closed the obvious response: more rows changes nothing and costs EXACT@5. So the
question was which eighteen.

**The answer is a negative on the ordering and a positive somewhere else.** No
permutation of the pool tested here buys the shown-eighteen recall without
paying for it at the published depth, and the one that looked like a win on
holdout does not replicate on tune and costs EXACT@5 three points. What DOES
move is a clause we render on every row, which the model applies as a filter and
which is a coin flip on the right answer.

Everything here is free. One Voyage embed and one Postgres read per founder, the
same the pool-recall curve already pays for; no model call was made by this
workstream.

---

## 1. What puts a row in the eighteen, in order of influence

Read off the code, not inferred. Each step can only remove or reorder what the
one above handed it.

| # | step | where | what it does |
|---|---|---|---|
| 1 | **channel selection** | `selectInstrumentRows` | at most `MIN_CHANNELS_CONSIDERED` = **7** channels reach leaf selection at all. Thematic top-ups lead; the rest are ordered by `blendedFit`; a free slot is backfilled on the same measure |
| 2 | leaf selection | `selectLeafInstruments` | per channel: exact country first, then `THEME_WEIGHT`-blended semantic × sector share × objective, capped at `POOL_LEAVES_PER_CHANNEL` = 250 |
| 3 | row sort | `materialiseInstrumentTable` | two BOOLEAN tiers ABOVE the score — `usedInField`, then `fitDemoted` — then `rowRelevance`, then `INSTRUMENT_PRIORITY`, then id |
| 4 | name collision | `nameCollision.ts` | rows sharing a display label are demoted to the back |
| 5 | **peer precedence** | `applyPeerPrecedence` | **the score keeps 1 seat (3 where the description discriminates) and EVERY row the `(country, sector)` peer prior has ever seen goes ahead of every row it has not** |
| 6 | scheme repeats | same | a second row of one notified scheme goes to the back |
| 7 | accessibility | `accessiblePool` | conclusively blocked rows drop out, in order |
| 8 | the cut | `pipeline.ts` | `.slice(0, VERDICT_POOL)` — **18** |

**Step 5 decides the list.** Steps 1-4 produce an order that step 5 keeps one
row of.

---

## 2. The composition, measured

`scripts/_wsec_pool.ts` cuts a tape of the accessible pool per founder — the
shipped order, the score order (`tableTrace`'s `collapsed` stage, the exact
array peer precedence is handed) and the peer prior's rank on every row.
`scripts/_wsec_compose.ts` is offline arithmetic over it, and every candidate
order is asserted to be a PERMUTATION so no counterfactual can buy recall by
quietly widening the pool.

846 held-out described founders, one per company. The tape reproduces the
published curve to the decimal — in-pool 77.5%, at eighteen 44.2% — so it is
describing the same list.

```
peer-prior seats of 18          mean 14.1
distinct channels               mean  3.4
distinct families/schemes       mean  6.4
largest single-family block     mean  9.6
largest single-BODY block       mean  5.7
distinct `mostly X` themes      mean  5.5
branch: flat 401, specific 445
```

**Fourteen of the eighteen seats are held by rows the peer prior has seen.** The
prior is keyed on `(country, sector)` and nothing else, so those fourteen are
the same fourteen for every founder in the cell.

### Three quarters of the list is not about this founder

Over the 89 cells holding two or more founders (6,913 pairs):

| | mean overlap of two founders' eighteen |
|---|---|
| **shipped order** | **76.1%** |
| score order, which reads the description | 49.3% |

### Channels spending seats they do not earn

| channel | share of the 18's seats | share of the answers |
|---|---|---|
| national_dev_banks | 39.6% | 56.3% |
| state_aid_satr | 29.5% | 24.8% |
| **horizon_eu_pillar_ii** | **15.1%** | **7.2%** |
| horizon_eu_partnership | 6.6% | 5.0% |
| eic | 4.8% | 3.2% |
| eit | 0.9% | 0.2% |

---

## 3. Where the won fund is when it is not in the eighteen

282 of the 656 in-pool founders have it below the cut:

```
  19- 25    48   17.0%
  26- 40   118   41.8%
  41- 60    51   18.1%
  61-100    50   17.7%
  101+      15    5.3%
```

**58.8% of the misses are at rank 40 or better**, in the top half of a pool
whose mean length is 77. That is what made an ordering change worth measuring.

---

## 4. What displaces it, concretely

Shipped eighteen against the eighteen the score alone would have given:

* won fund in the score's 18 and NOT in the shipped 18: **112**
* won fund in the shipped 18 and NOT in the score's 18: **134**
* net **+22** founders — the prior is a net positive at this depth

On the 112 it displaced, the seats went to a mean of 3.5 distinct families, and
**every** displacing row is peer-placed. The recurring ones are one agency's
programme list and one country's framework aid regimes:

```
  23x  Régime cadre exempté de notification relatif ...   state_aid_satr
  19x  Innovativa startups - programnivå                  national_dev_banks
  18x  Strategiska satsningar relaterade till ekosy...    national_dev_banks
  18x  Framväxande arbetssätt                             national_dev_banks
  16x  Inkubatorprogrammet                                national_dev_banks
  16x  Resebidrag och planeringsbidrag                    national_dev_banks
  16x  Kompetensförsörjning                               national_dev_banks
  13x  Innovation Fund LSP / SSP                          innovation_fund
```

Those are not wrong rows. They are the cell's most-won funds, which is what the
prior is for.

---

## 5. THE NEGATIVE: the ordering axis at depth eighteen is closed

The hypothesis was that the two near-orthogonal predictors — score 24%, peer
prior 27%, union 45% — are resolved by PRECEDENCE, and that the constant behind
that was swept by wsCW against the PUBLISHED five, where five seats cannot hold
two lists. At eighteen both fit, so an alternation should be strictly better.
`POOL_ORDER=interleave` is that alternation, off by default, and it is in the
tree with its tests.

**It is not better.** Three measurements, each on the split it belongs on:

| ordering, same pool | @7 | @18 | @40 |
|---|---|---|---|
| **holdout, n=846** | | | |
| shipped | 30.0% | 44.2% | 63.8% |
| interleave, off the tape | 31.1% | **50.6%** | 65.4% |
| interleave, the ARM ACTUALLY RUN | 31.0% | **48.6%** | **60.9%** |
| **tune, n=599** | | | |
| shipped | 31.2% | 47.7% | 66.3% |
| interleave, off the tape | 30.1% | **48.7%** | 68.1% |

The gain at eighteen is +4.4 on holdout when the arm is actually run, +6.4 when
simulated off the tape, and **+1.0 on tune**. At seven it is up on one split and
down on the other. A result that changes sign with the split was never there.

The third row is the arm run end to end against live Postgres, not simulated:
it lands within two points of the offline prediction at eighteen, which
validates the tape, and it is **worse at forty** — 60.9% against 63.8%. The
alternation front-loads the list and pays for it in the tail, which is not what
a strictly-better ordering does.

And the metric the project actually ships on says the same thing, measured
through the whole pipeline rather than off a tape — `measure_recall.ts`,
`SPLIT=tune N=250`, both arms free, 0 live calls:

| | shipped | interleave |
|---|---|---|
| in pool | 96% | 96% |
| **EXACT@5** | **26%** (64/250) | **23%** (58/250) |
| EXACT@6 | 29% | 27% |
| REGIME@5 | 71% | 69% |
| CHANNEL@5 | 92% | 92% |

That reproduces wsCW's independent result for `alternate` (23.5 against 25.7 on
tune, n=600) from a different direction, and it is why the arm ships OFF.

Every other permutation is worse still — `family-first` 43.3% at eighteen and
23.2% at seven, `peer only` 42.9%, `score only` 41.6%. And the whole-pool column
is 77.5% under every single arm, because that is a property of the pool and not
of its order.

**So: showing the model different eighteen rows out of the same pool does not
close the gap, in the same way wsDR showed that showing it more rows does not.
Two of the three obvious levers on gate 1 are now measured dead.**

---

## 6. THE POSITIVE: the row's sector clause is a coin flip written as a fact

wsDY scored the twelve bench menus against the two disqualifiers the prompt
states and found a mean of 2.1 rows of 18 surviving. On 846 founders the same
scorer gives **6.9 of 18**, and **55.1% of founders have fewer survivors than
the seven rows we publish**. The finding replicates. What it means does not.

| | the WON fund | every other pool row |
|---|---|---|
| survives both, holdout n=541 | 45.5% | 29.0% |
| **descriptor names another sector** | **47.7%** | 66.7% |
| median an order of magnitude low | 13.9% | 13.4% |
| *the same, tune n=404* | | |
| survives both | 43.3% | 28.4% |
| descriptor names another sector | 49.3% | 67.3% |
| median an order of magnitude low | 13.1% | 13.2% |

Two independent readings. The **money** disqualifier — the one the prompt states
verbatim — **does not discriminate at all**: 13.9% against a 13.4% base rate,
13.1% against 13.2%. The **sector** clause discriminates, weakly, and rules out
the right answer on nearly half the founders it is applied to. Acting on either
as an order is measurably worse than doing nothing: `qualified-first` takes the
shown-eighteen recall from 44.2% to 39.2% on holdout and 47.7% to 41.9% on tune.

### The clause is a plurality dressed as a category

`scripts/_wsec_descriptor.ts`, live Postgres:

```
publishable 837, of which 743 carry a sector mix
top-sector share  p10 0.28  p25 0.35  median 0.47  p75 0.67  p90 0.95
clause fires (share >= FOCUS_SHARE 0.25):  709/743  95.4%
the top sector is an actual MAJORITY:      341/743  45.9%
```

`mostly X` appears on **95.4%** of rows and is a true statement about **45.9%**
of them. A clause on every row cannot separate rows; one that overstates on more
than half of them separates them wrongly. The model reads it as a tag and says
so in its own reasoning — *"only #2 and #4 explicitly match the software and AI
sector"* — and `check_sector_evidence` already reports the extreme version: funds
that paid 100% of their awards to motion-picture production render as
`software & AI`, which is wsDY's CNC row exactly.

With the clause not rendered, the rows of the eighteen that survive the model's
own stated tests go from **6.9 to 15.3**, and **no** founder is left below the
seven rows we publish (from 55.1%).

---

## 7. The one change

**The property.** A fact rendered on a candidate row is a fact the selector
selects on. It must DISCRIMINATE — be at least as true of the fund this founder
should be shown as of the funds they should not — and where the measurement
behind it is a PLURALITY, the row states the share. A category word claims a
majority the reader cannot check and cannot recover the share from.

The test for a case nobody has seen is direct and needs no model: take the
clause, count how often it holds of the fund a company actually won and how
often it holds of every other row in that company's pool. If the two are the
same number, it is not a fact worth a row's characters. If it is stated
categorically and the measurement behind it is a plurality, it is worse than
useless — it is a filter the reader will apply.

**`ROW_DESCRIPTOR=share`**, off by default, is that change: `47% health & life
sciences` where the row says `mostly health & life sciences`. Both spellings
fire on exactly the same rows — the firing rule stays `FOCUS_SHARE` — so the arm
changes the sentence and never the selection.

**RANKING-NEUTRAL BY CONSTRUCTION.** `row.descriptor` is read in exactly two
places, the panel that renders it and the selector prompt that shows it, and by
no scorer. `sectorMix` itself does rank, through `sectorFitScorer`, and is
untouched. So no offline recall figure can move and the shipped ranker cannot
regress — which is the difference between this and §5, where every gain had a
price.

**Predicted effect.** The slot-filling artefact wsDY measured disappears as a
GROUND: the mean number of rows the model can disqualify on the page goes from
6.9 of 18 to 15.3 of 18, and the 55.1% of founders for whom the eighteen do not
contain the seven we publish goes to zero. On the twelve bench companies at
`effort=low`, the prediction stated in advance is that none of the three named
category errors recurs for the stated reason and that no reply's reasoning
contains a variant of "only #N explicitly match the sector". If they recur
anyway, the clause was not the ground and the hypothesis is dead.

**What it costs to test.** The free half is done and is above. The paid half is
one selector run over the twelve bench companies against wsDS's control on disk:
**about EUR 0.25 at `effort=low`, about EUR 1.00 at `high`**, one lever, no other
change.

---

## 8. What is NOT the answer, now with numbers

* **more rows** — wsDR, and confirmed here: the whole-pool figure is 77.5% under
  every ordering
* **a different ordering of the same pool** — §5, six permutations and a swept
  constant, on both splits and on EXACT@5
* **the prompt's own disqualifiers, applied as an order** — 44.2% to 39.2%
* **removing the peer prior** — 44.2% to 41.6% at eighteen and 63.8% to 57.3% at
  forty
* **collapsing near-duplicate rows** — `family-first` 44.2% to 43.3% at eighteen
  and 30.0% to 23.2% at seven, which is the third independent time this
  particular idea has measured negative

The 27 points still sitting between 50.6% and 77.5% are not reachable by any
arithmetic over the two signals we have. Closing them needs a third signal.
