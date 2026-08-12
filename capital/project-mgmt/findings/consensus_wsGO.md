# wsGO — sampling the ranker N times and keeping what the samples agree on

**Nothing in this workstream spent a cent.** Every figure below is recomputed
from `findings/headtohead_wsGA/adviser_medium_n773_x2.json`, the tape of a run
already paid for (draw fingerprint `37e0879c895d4d6a`). The replay is
`website/frontend/scripts/_wsgo_consensus.ts`, which imports two node builtins,
deletes every API key in the environment, and replaces `fetch`, `XMLHttpRequest`
and `WebSocket` with throwing stubs — so a future edit that reaches for the
network dies rather than spends. That guard is tested, not asserted: it throws,
and the keys are gone.

---

## The answer, first

**A 2-sample consensus would have made the product worse at the cut that
matters, and no rule over two samples could have made it much better.**

| arm | RAW@5 | RAW@6 | RAW@7 |
|---|---:|---:|---:|
| **sample A only — what ships today** | **21/50 (42.0%)** | 26/50 (52.0%) | 29/50 (58.0%) |
| sample B only | 20/50 (40.0%) | 23/50 (46.0%) | 29/50 (58.0%) |
| pool order (the control, free) | 21/50 (42.0%) | 23/50 (46.0%) | 26/50 (52.0%) |
| **CONSENSUS — Borda over both** | **18/50 (36.0%)** | 23/50 (46.0%) | 31/50 (62.0%) |
| CONSENSUS — frequency in top 7 | 18/50 (36.0%) | 23/50 (46.0%) | 29/50 (58.0%) |
| CONSENSUS — frequency in top 5 | 17/50 (34.0%) | 25/50 (50.0%) | 32/50 (64.0%) |

Point estimate **−6.0pp at @5**; bootstrap 95% interval **[−16.0pp, +4.0pp]**
over 20,000 resamples; P(consensus better) = 0.083. McNemar exact on the
discordant pairs: 7 discordant, 2 to consensus and 5 to the single sample,
p = 0.453. It is not a significant loss. It is emphatically not a gain, and the
interval rules out anything like the gain that would be needed to justify the
bill.

**RAW@k** is the won fund at position ≤ k in the arm's own order of the pool.
It is the space the ranker acts in and the only one the tape determines exactly:
`orderMemoCandidates` sits between the ranker and the page, it is a function of
the pool objects (it demotes a row whose institution name is already shown), and
it cannot be replayed for an order that was never fired. The two spaces track —
on these same 50 founders the tape's own published EXACT@5 is 22/50 for sample A
against RAW's 21/50, and 21/50 for sample B.

**The replay is falsifiable and was falsified against.** It reconstructs sample
A's full order from `picks` and checks it against `poolRankRanker`, the rank the
paid harness recorded, on every founder. 50/50 agree. Any disagreement exits 2.

### The ceiling, which is the number that ends the discussion

| | RAW@5 |
|---|---:|
| won fund in **both** samples' top 5 | 16/50 |
| in exactly **one** — the entire swing set | **9/50** |
| in **neither** | 25/50 |
| one sample, in expectation | 20.5/50 = 41.0% |
| **an ORACLE always taking the better of the two** | **25/50 = 50.0%** |
| an adversary always taking the worse | 16/50 = 32.0% |

Nine founders in fifty are in play. The entire band any two-sample rule can move
within is **±9.0pp, and the upper edge requires the answer key.** The 95%
interval on 50 founders is about ±13.7pp. The best conceivable version of this
idea is smaller than the noise of the measurement that would have to detect it.

### Why it fails, which is more useful than that it fails

A consensus rule has exactly one lever: agreement between samples. It can only
find the won fund if the won fund is **more stable across samples than the rows
displacing it.** It is not.

```
mean |rank(A) - rank(B)|    WON fund 2.04 (n=50)    its RIVALS 1.49 (n=229)
```

The won fund is the *less* stable row. A rule that rewards agreement therefore
demotes it systematically, and that is the mechanism behind −6.0pp — not
sampling luck. **This is a property, and it is the test to apply to any future
consensus proposal on any arm: measure the won item's cross-sample spread
against its rivals' before designing the combiner.** If the target is not the
more stable object, no combiner over any number of samples can prefer it, and
the sample count is spend with no mechanism behind it.

The swing set makes it concrete. Of the 9 founders in play, only 2 have both
ranks inside the top 7:

```
GREENERWAVE        A rank  5   B rank 17      ASS VAL'HOR   A rank 17   B rank 5
EGÚ BRNO           A rank  4   B rank 12      WELL ID       A rank 18   B rank 5
CASINVENT PHARMA   A rank  9   B rank  5      NORTURA       A rank  8   B rank 5
```

A fund at 5 in one sample and 17 in the other averages to 11. Consensus does not
recover a lottery ticket; it discards it.

---

## Variance is not error — settling it from the tape

The 2.0% identical-list figure is compatible with two readings, and the tape
separates them into a mixture whose proportions I can state.

| | of 50 |
|---|---:|
| same **set** of 7, different order — a pure near-tie | 8 |
| same set **and** same order | 1 |
| **different set** of 7 | 41 |

Seat by seat, **284 of 350 seats (81.1%) are held by the same fund in both
samples.** So the headline 2.0% overstates the churn badly: it is a
whole-list-exact-order statistic over 18 rows, and most of what it counts is
ordering among rows the model agrees belong. That part is the "genuinely
comparable funds" reading and consensus buys nothing on it.

But the 66 seats that *do* change occupant are not near-ties. **A row in A's top
7 that is missing from B's top 7 sits at B-rank 12 of 18 (median)** — thrown out
of the top half, not nudged across a boundary. Only 26% of them land in B's top
half at all. That is a real lottery on about a fifth of the seats.

So: **both readings are true of different parts of the list, and the won fund
sits in the lottery part rather than the stable part.** That is the finding.
Consensus is well-matched to the 81% where it is not needed and mismatched to
the 19% where it would be.

---

## The design, stated as properties rather than as an implementation

Had it shipped, the combiner would be **mean position over the samples' full
orders, ties broken by the row's own position in the pool.** Positional voting,
not frequency of appearance. Three properties, each of which is a test a
replacement rule must pass, not a description of this one:

1. **Identity at N=1.** One sample in, that sample out, byte for byte. The
   sample count is a lever whose default is today's behaviour, so nothing
   changes until someone decides it does. Test: for every input, the combiner
   over a single sample equals that sample.
2. **Permutation invariance.** `combine([a,b]) === combine([b,a])`, for every
   input, at every N. **A rule that fails this is not a consensus — it is sample
   one winning with extra steps.** Every "on a tie, keep the first list's order"
   rule silently fails it, which is why the tie rule cannot be "pick the first
   one".
3. **The tie-break is sample-independent.** At N=2 there is no majority, only
   agreement or disagreement, so the tie rule does the real work. Here it is
   **the pool's own order — the deterministic score, computed before any call
   was made.** When the samples carry no joint information about which of two
   funds ranks higher, the honest fallback is the arm we already trust, not a
   coin dressed as a decision.

**Why positional rather than frequency.** The model returns an ordered 7 from a
pool of 18. At N=2, frequency-of-appearance takes three values {0,1,2} over 18
rows — typically about five rows at 2 and four at 1 — and cannot order seven
seats on its own. Its tie-break would be doing nearly all the work, so
"frequency" at low N is a positional rule wearing a different name. Positional
voting uses the within-list order, which is nearly all the information there is
at N=2. Both are measured in the table above and they land in the same place,
which is what that argument predicts.

**What I said in advance would fail, and did.** Every unpicked row falls back to
the pool order *and* the tie-break is the pool order, so the rule is structurally
biased toward the control. The ranker beats the control, so a rule that reverts
toward the control on disagreement gives part of that edge back. Prediction:
consensus lands between control and single sample rather than above both.
Observed at @5: control 42.0%, single 42.0%, consensus 36.0% — it landed *below*
both, so the bias is real and larger than predicted, because the won fund's
instability compounds it.

---

## The price, from recorded figures

Ranker call at the shipped depth: **EUR 0.0626** (wsGA, EUR 9.2660 / 148 calls).
Full brief at the shipped depth: **~EUR 0.29** (`findings/widen_wsGD.md`). So the
brief is EUR 0.2274 of everything else plus one ranker call.

| samples | ranker spend | brief | vs today |
|---:|---:|---:|---:|
| **1 (ships)** | EUR 0.0626 | **EUR 0.290** | — |
| 2 | EUR 0.1252 | EUR 0.353 | **+21.6%** |
| 3 | EUR 0.1878 | EUR 0.415 | **+43.2%** |
| 5 | EUR 0.3130 | EUR 0.540 | +86.4% |

Note the framing correction: three samples is **3x the ranker and +43% the
brief**, not 3x the brief. It is still forever.

**And the denominator moves on 2026-08-31.** `cost.ts` records that Sonnet 5 is
on introductory pricing that ends that day, after which input goes 2 → 3 and
output 10 → 15 per million. That is +50% on the ranker call, to about
EUR 0.094. A three-sample brief bought after 31 August costs roughly **EUR 0.62**
— more than double today's whole brief. Any decision on this should be dated.

**A full measurement run.** Observed discordance between the consensus and the
single sample is 14% of founders. For 80% power at α = 0.05 two-sided to detect
consensus winning 70% of discordant pairs, McNemar needs 47 discordant pairs, so
333 founders with the won fund in the pool, at three calls each:

| | founders | calls | today | after 2026-08-31 |
|---|---:|---:|---:|---:|
| power to detect a 70/30 split on discordant pairs | 333 | 1,002 | **EUR 63** | EUR 94 |
| power to detect a 65/35 split | 606 | 1,818 | EUR 114 | EUR 171 |
| power to detect a 60/40 split | 1,385 | 4,155 | EUR 260 | EUR 390 |

wsGA reached 98 called founders out of the 284 in-pool in its 773-founder draw,
so 333 also needs a larger draw and the per-country call cap lifted. **This run
is not recommended** — see the threshold — but it is priced so the choice is a
choice.

---

## The threshold, set from arithmetic that does not touch the tape

**A consensus at N=3 must beat a single sample by at least +5.0pp EXACT@5
in-pool, with McNemar exact p < 0.05, or it does not ship.**

Why +5.0pp, from two independently recorded numbers:

- The ranker's *entire* measured edge over free arithmetic is **+5.1pp**
  (EXACT@5 51.0% against the control's 45.9%, wsGA). Paying 43% more per brief
  forever to buy less than the model bought over the score in the first place is
  not a gain, it is a rounding error with a subscription.
- The same money spent on **depth** is already measured and buys more. wsGD:
  going from the shipped 18 rows to the whole pool moves "the answer is on the
  list" from 36.7% to **78.3%** for **+EUR 0.0427 a call** — a third of the
  price of two extra samples, for 21.6pp of ceiling. Any spend on sampling is
  competing with that, and losing before it starts.

Measured band of any two-sample rule: ±9.0pp, upper edge requiring the answer
key. **The best case of the cheap version of this idea barely clears the
threshold and cannot be realised.**

---

## The pre-registered test, for a run that has not happened

Written before any paid run. If someone approves the EUR 63:

**Primary.** EXACT@5 on the in-pool sub-population, McNemar exact, signed:
`consensus(N=3, mean-position, pool-order tie-break)` against sample 1 of the
same three. Sample 1 is the single-sample arm — it must not be a separate call,
or the comparison acquires a second source of variance.

- **Consensus helps** if consensus wins the discordant pairs with exact
  p < 0.05 **and** the point estimate is ≥ +5.0pp. Both, not either.
- **Consensus does not help** if the 95% interval on the difference excludes
  +5.0pp. This is the expected outcome and it is a complete result: it closes
  the route rather than leaving it open for someone to re-propose.
- **Secondary, and it may not carry the headline:** the won fund's pool rank,
  Wilcoxon signed-rank. A more powerful test of a different quantity is not a
  second chance at the same question.

**The run is VOID, and the primary result discarded, if any of these hold:**

1. The replay's reconstruction of sample 1 does not reproduce the run's own
   recorded `poolRankRanker` on every founder.
2. **The samples are not independent.** Pairwise self-discordance among the
   three samples must be in the neighbourhood of wsGA's 18% at @5. If it
   collapses toward zero, something is caching the reply and the run is one
   sample billed three times — the exact failure that would make consensus look
   free and perfect.
3. The fallback rate materially exceeds wsGA's 3/148. A sample that fell back is
   the pool order, so a run with many of them is measuring the control's
   agreement with itself.
4. The draw fingerprint differs from the one declared before the run.

---

## What only a fresh paid run can settle, and one cheaper thing to try first

**Only a paid run can settle:**

- **Whether a true majority helps.** N=2 has no majority. Everything above is
  structurally blind to a three-sample rule; all the tape bounds is the
  two-sample band at ±9.0pp.
- **The published projection.** `orderMemoCandidates` cannot be replayed on an
  order that was never fired, so the consensus figures are RAW. The two spaces
  track on single samples, but that is evidence, not proof.

**And one cheaper thing that should be tried before any of it.** wsGA recorded
**4 of 148 calls CUT OFF at `max_tokens`** (6144) and 488,444 thinking tokens
billed. A truncated reply is a degraded reply and a mechanical source of exactly
the variance this workstream was asked to average away. Output tokens are billed
only when used, so raising `max_tokens` costs nothing on the calls that do not
need it. **Reducing variance at the source is free; averaging it away costs 43%
of every brief forever.** That is the order to try them in.
