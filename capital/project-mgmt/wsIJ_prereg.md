# wsIJ — the pre-registration for confirmation abstention

**Written and committed before the first paid token, and before any run is
scheduled.** Nothing in this file may be edited once a call has been made
against it. If it turns out to be wrong, it gets an addendum, the way wsHO's
did — a pre-registration revised once the numbers are in is a narrative with a
timestamp.

---

## 0. THE ONE THING THAT MAKES THIS DIFFERENT FROM EVERY PRIOR ARM

**This arm costs nothing to add to a run. Not "little" — nothing.**

`AGENT_SELECT_ABSTAIN` is applied in `agentSelect.ts` **strictly after the
reply is parsed, tallied and recorded**, and it consumes no field the tape does
not already carry. So one call per founder yields **both** arms: today's order
is `[...picks, ...the rest]` and the abstention order is `picks[0] === 0 ?
ours : the same permutation`. Every figure in this file was computed that way,
offline, from tapes bought for a different question.

**Therefore: this arm must never be given a run of its own, and no budget line
may be opened for it.** It is a re-scoring of whatever the next paid run is,
whatever that run is for. The pre-registration exists so that the re-scoring is
declared *before* the tape exists rather than found in it.

---

## 1. THE CLAIM, STATED SO IT CAN FAIL

> **Publishing our own order whenever the model's first choice is the first row
> we offered it raises population EXACT@6 relative to publishing the model's
> order, and does not lower reciprocal rank.**

Two halves, and the second is not decoration. A rule that bought visibility by
destroying the ordering would be `freeze our top N`, which is already measured
and already rejected: it buys the same EXACT@6 and costs −0.066 reciprocal
rank, an interval excluding zero.

**Primary outcome: EXACT@6, in points of population, paired.**
**Guardrail: reciprocal rank, one-sided non-inferiority at −0.010.**

## 2. WHY THE PRIMARY IS *NOT* RECIPROCAL RANK — a declared departure

wsII's recommendation, adopted twice since, is that reciprocal rank is the
pre-registered primary because EXACT@6 cannot be powered. **That is correct for
the contrast wsII was pricing and wrong for this one, and the difference is
structural rather than a matter of taste.**

- wsII priced **model vs control** — two different orderings of the pool, which
  differ for nearly every founder. Its variance is dominated by
  founder-to-founder variance that no budget shrinks, so its EXACT@6 half-width
  floors near 4.1 points.
- This arm is **abstention vs today**, and the two agree exactly on the ~60% of
  founders where `picks[0] !== 0`. The contrast is **zero by construction on
  most of the population**, so its between-founder variance is a third of
  wsII's and its floor is **2.56 points, not 4.1**.

Measured on the same 76 founders, the same way wsII measured its own:

| measure | var of the contrast | retest r | between | within |
|---|---:|---:|---:|---:|
| EXACT@6 | 0.11764 | 0.704 | 0.08281 | 0.03482 |
| reciprocal rank | 0.01041 | 0.356 | 0.00371 | 0.00670 |

| budget | calls | founders | reps | MDE EXACT@6 in general | this draw | MDE recip in general |
|---|---:|---:|---:|---:|---:|---:|
| **EUR 28.76** | 665 | 665 | 1.0 | **3.03 pts** | 1.65 pts | 0.0090 |
| EUR 100 | 2,314 | 666 | 3.5 | 2.69 pts | 0.88 pts | 0.0066 |
| EUR 300 | 6,944 | 666 | 10.4 | **2.59 pts** | 0.51 pts | 0.0058 |

**Against an observed effect of +4.96 points, a census reads it with 1.6x of
margin in general and 3.0x on our own draw.** And the guardrail needs no power
at all: it is a non-inferiority test against a bound of −0.010, and the census
MDE of 0.0090 sits inside it.

**Pre-registering reciprocal rank as the primary here would pre-register a
null.** The measured effect on it is +0.0049 and the rule is designed to leave
it alone. Reporting it as primary would be reporting a wash and calling the arm
dead, on an arm whose whole point is the other measure.

## 3. FROZEN

`project-mgmt/wsHO_prereg.md` §§2–7 are adopted verbatim, exactly as wsHW
adopted them, and are not restated: population and fingerprint, strata R/C/D
with D never called, the pairing asserted per founder, the leak bar, the
estimand and its interval, concentration reported beside any direction, and the
seven void conditions.

**`NO_PG=1` is FORBIDDEN.** One flag, two defects, 5.3 points.

Additionally frozen, and this one is new:

**THE BASE-RATE SENTENCE IS PINNED, AND ITS PIN IS PART OF THE PRE-REGISTRATION.**
`poolRecall.ts:189` (`baseRateSentence`) composes a sentence telling the model
its own measured base rate, and it reads `poolRecallCurve.generated.json`, which
is re-cut on every corpus publish. It moved **twice between the last two
pre-registrations** — `a9fda025` then `b893cf58`, so wsHO's model was told "830
held-out companies … about 40%" and wsHW's was told "821 … about 45%" while both
runs declared the prompt template byte-identical. **It is a treatment, it was
undeclared in both runs, and this rule is a rule about the model's first pick —
which is exactly the behaviour a sentence about how often we are already right
would move.**

Declared state, and any run under this file must assert it before the first call:

```
website/frontend/lib/intelligence/poolRecallCurve.generated.json
sha256 1c618fe08d99d9c37846c12c5daf02b0ded2e76ac93ae52cf38b1a62f5a993d2
n = 821   generatedBy scripts/_wsdr_curve.ts   corpus postgres instruments=1088
last moved by b893cf58
```

If the corpus is published between the pre-registration and the run, **the run
is void, not adjusted.** The alternative — re-cutting the curve and carrying on
— is what produced two paid runs whose treatments differ in a way neither could
name.

## 4. THE PARAMETER IS NOT REFITTED. EVER.

The rule is `picks[0] === 0`. **`m = 1` is fixed by this file and no run may
choose it again.** It was selected by fitting on wsHO and reading it off wsHW,
and then the other way round; it was the only family whose best member was the
same constant under both directions and under both outcome measures. Freezing,
reciprocal-rank fusion and a fall-limit each chose a different constant on each
run, which is what a fitted threshold looks like when it is noise.

A run that reports `m = 2` or `m = 3` "also tested" has refitted on the
confirmation set and its primary is void.

## 5. VOID CONDITIONS, ON TOP OF wsHO's SEVEN

1. **The curve moved** (§3). Any difference in the sha256 voids the run.
2. **The reply rate `picks[0] === 0` falls outside 25–50%.** It was 39.7% and
   37.2% in the two tapes. This rule's whole leverage is how often it fires; a
   rate outside that band means the prompt or the model changed underneath it,
   and the effect measured here does not transfer.
3. **The lever was read as `off` when the run believed it was on.** The lever
   throws on any spelling other than `off`/`confirmed`, and the tally line
   prints `abstain=confirmed (n of m kept ours)` only when it is on — a run
   whose report has no such field did not run this arm.

## 6. WHAT IS BOUGHT FREE FROM THE SAME REPLIES

Everything in this file. Also, from the same tape and at no cost:

- **Whether abstention beats abstaining at random on the same number of
  founders.** It did, at p = 0.006 and p = 0.004 on reciprocal rank in the two
  tapes separately. If it stops beating the random null, the rule is not using
  its feature and should be dropped whatever the primary says.
- **Whether the conditional gradient is still an artefact.** Re-run
  `_wsij_conditional.ts` §1 against the new tape. If the uniform null stops
  reproducing the gradient, something about the pool's shape has changed and the
  whole diagnosis needs redoing.

## 7. LABELLING

**Every figure from a paid run carries `n=`.** No figure from this arm may reach
the dashboard headline; that is `one_funnel` and nothing else. EXACT@6 is the
only measure the dashboard may quote, and this arm moves it — which is a reason
for care, not for promotion.

**If it is a wash, say so plainly and delete the lever.** A candidate that
survives one free measurement and one paid census and is still inside its
interval is not a candidate, it is a maintenance cost.
