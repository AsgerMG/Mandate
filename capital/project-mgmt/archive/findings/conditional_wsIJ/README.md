# wsIJ — the gradient was arithmetic, the ruler was still wrong, and the rule that survives is one line

**FOR THE OWNER.** You asked me to check the conditional effect before designing
anything on it, and said that if it turned out to be regression to the mean the
finding was worth more than the policy. **It is an artefact — a stronger one than
you feared — and there is still a policy, but it is not the one the artefact
pointed at.** Three things.

**One: a model that picks seven rows at random reproduces wsII's gradient, with
a steeper slope.** wsII bucketed the won fund's rank change by our own control
rank and read a rising line: the model harms where we already had the fund
visible, helps where we had it buried. That line is drawn before any model is
involved. A row we have at rank 1 cannot move up; a row at rank 30 cannot move
down much. Seven indices drawn uniformly from the same menu score **−5.67 ranks
at control rank 1–3 and +3.04 at 25+**. It knows nothing. **Against that null the
model is positive in every bucket by a roughly constant amount — the gradient is
gone.**

**Two: and the gradient was scored with the ruler wsII had just condemned.** The
conditional split was computed in raw ranks — the measure wsII proved weights
30 → 20, worth nothing, the same as 2 → 1, worth everything. Re-scored in
reciprocal rank, **the gradient runs the other way**: +0.267 at control rank 4–6
falling to +0.047 at 25+. The model's value added is **largest at the top of our
list**. "A good deep re-ranker and a bad top-of-list preserver" is exactly
backwards; it is a good top-of-list re-ranker whose losses at the top are
visible in a measure that cannot see its gains there.

**Three: there is still something to fix at the top, and it is not a threshold.**
EXACT@6 is not scored in ranks and it does show a real cost: at control rank 2–6
the model loses seats. The rule that survives being fitted on one run and read
off the other is not a cutoff at all — it is a single observable fact about the
reply:

> **The model's ordering is published only when the model's own first choice is
> not the first row we offered it. When it confirms our first row, we publish our
> own order unchanged.**

Measured free on both tapes, against today's behaviour, paired on the same call:
**EXACT@6 +4.96 points, positive in 60 of 60 leave-one-regime-out folds.
Reciprocal rank +0.0049 — a wash, and that is the design.** It is the mirror
image of wsII: the model improves the ordering and costs visibility; this
recovers the visibility without touching the ordering.

**The EXACT@6 interval still touches zero on 76 founders. So it ships behind
`AGENT_SELECT_ABSTAIN`, defaulting to today's behaviour, with a pre-registration
in `project-mgmt/wsIJ_prereg.md` — and it needs no budget, because both arms come
off one call.**

Everything below is free and offline: `npx tsx scripts/_wsij_conditional.ts`.
No paid call. No production write. No Railway.

---

## 1. THE REGRESSION-TO-THE-MEAN TEST, WHICH IS THE WHOLE BRIEF

Two nulls, both simulated on the same 156 calls. **Null A** picks seven rows
uniformly from the same menu. **Null B** is stronger: it transfers the *depth
profile* of the real model's picks — as quantiles of the menu, so menu sizes do
not confound — from a randomly chosen donor founder, reproducing how deep the
model reaches while destroying which row it reaches for.

| our rank | n | model Δrank | null A | null B | model − B | model Δrecip | null A | null B | model − B |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **1–3** | 40 | **−1.57** | **−5.67** | −2.84 | +1.27 | **+0.0295** | −0.3598 | −0.1316 | **+0.1611** |
| **4–6** | 28 | +1.04 | −4.89 | −2.48 | +3.52 | **+0.2668** | −0.0691 | +0.0205 | **+0.2463** |
| 7–12 | 23 | 0.00 | −3.50 | −1.78 | +1.78 | +0.0532 | +0.0136 | +0.0127 | +0.0405 |
| 13–18 | 16 | +1.81 | −0.86 | −0.22 | +2.03 | +0.0565 | +0.0491 | +0.0232 | +0.0333 |
| 19–24 | 16 | +3.00 | +0.61 | +1.39 | +1.61 | +0.0432 | +0.0538 | +0.0287 | +0.0145 |
| **25+** | 33 | **+5.52** | **+3.04** | +1.37 | +4.15 | +0.0473 | +0.0564 | +0.0145 | +0.0328 |

**Read the null A column first.** It is the shape of wsII's finding, produced by
a procedure with no information in it. The gradient is the arithmetic of a
bounded rank conditioned on one of its own endpoints.

**Then read the last column.** Model minus the depth-matched null in reciprocal
rank: **+0.161, +0.246, +0.041, +0.033, +0.015, +0.033.** Monotone *decreasing*.
The model's discriminative contribution is concentrated exactly where wsII said
it did harm.

### Where −0.88 and +6.08 came from

Reproduced exactly, and the provenance is worth recording: **both are wsHW's
shared founders alone** — 33 and 13 of them. On wsHO the same top bucket reads
**−0.18**. The published pair is one run's two smallest cells, and the harm did
not replicate on the other run.

### The one thing the artefact does not dissolve

Conditioning on control rank is legitimate *for a decision*, because our control
order is deterministic — wsII measured it flipping on 0 of 76 founders — and it
is observable before anything is published. So a policy is allowed to depend on
it even where a causal claim is not. **That is why this workstream did not stop
at the artefact.** But EXACT@6 conditions on it with total mechanical force: a
row at control rank ≤ 6 can only lose a seat and a row at rank > 6 can only gain
one, for *any* reordering whatever. **There is no other possible shape**, so no
bucketed EXACT@6 table is evidence of anything without its null beside it.

## 2. EVERY CANDIDATE, BOTH MEASURES, BOTH TAPES

vs today's behaviour, paired on the same call. EXACT@6 in points; recip absolute.

| policy | wsHO EX | wsHO recip | wsHW EX | wsHW recip |
|---|---:|---:|---:|---:|
| **abstain if 1st pick is ours** | **+2.94** | −0.0007 | **+6.93** | **+0.0110** |
| capfall D=2 | −0.70 | −0.0065 | +7.81 | +0.0066 |
| capfall D=3 | −0.98 | −0.0025 | +6.07 | +0.0013 |
| rrf k=3 | −2.52 | −0.0099 | +6.95 | −0.0045 |
| rrf k=20 | −1.61 | +0.0014 | +5.23 | −0.0141 |
| freeze our top 4 | −0.70 | **−0.0700** | +7.81 | **−0.0638** |
| control (never reorder) | −1.68 | **−0.0739** | +3.10 | **−0.0716** |

> **`freeze our top N` is the policy the brief named first, and it is the one to
> reject.** It buys the same EXACT@6 as a fall-limit and pays the model's entire
> reciprocal-rank gain for it — the one effect in this whole area whose interval
> excludes zero, twice. Note also that freezing the top six *is* the control on
> EXACT@6, exactly and always: the model cannot rescue anybody into seats it is
> not allowed to touch.

**And `freeze` is not a new idea here.** `SELECT_KEEP` / the `assist` arm is the
same instinct, measured live and recorded in `agentSelect.ts` at **EXACT@6 17%
against the shipped 27%**. It is not the same treatment — `assist` never SHOWS
the model the frozen rows, so it cannot be simulated from these tapes and its
loss has a second cause. The simulation above is the *better-informed* version
of it, applied post hoc to a model that saw everything, and it still does not
pay for itself.

## 3. THE THRESHOLD, FITTED ON ONE RUN AND READ OFF THE OTHER

Held out — the parameter chosen on the *other* run:

| family | fit wsHO → test wsHW | fit wsHW → test wsHO | same constant? |
|---|---|---|---|
| freeze | N=1 → EX −5.25 | N=1 → EX +0.77 | yes, and it loses |
| capfall | **D=6** → EX −3.10 | **D=2** → EX +0.98 | **no** |
| rrf | **k=20** → EX +2.13 | **k=3** → EX −0.84 | **no** |
| **abstain** | **m=1 → EX +3.83, recip +0.0826** | **m=1 → EX +4.62, recip +0.0732** | **yes** |
| today | — → EX −3.10 | — → EX +1.68 | |

**Abstention is the only family whose best member is the same constant in both
directions and under both selection criteria.** Capfall and RRF each move their
constant between the runs, which is what a fitted threshold looks like when it is
fitted to noise. **There is no honest control-rank cutoff. There is an honest
rule, and it is not a cutoff.**

## 4. IS IT JUST "REORDER LESS OFTEN"?

The rule declines to reorder ~38% of founders. A policy that abstained on 38% of
founders at random would also reduce churn. So: abstain on the *same number*,
chosen at random, 4,000 draws per run.

| | observed | random abstention | p |
|---|---:|---:|---:|
| wsHO EXACT@6 | +2.94 | −0.66 | 0.066 |
| wsHO recip | −0.0007 | −0.0294 | **0.006** |
| wsHW EXACT@6 | +6.93 | +1.12 | **0.011** |
| wsHW recip | +0.0110 | −0.0265 | **0.004** |

**The feature carries information, in two runs independently.** Random
abstention costs 0.027–0.029 of reciprocal rank — it throws away the model's
gain in proportion to how often it fires. This rule fires the same number of
times and throws away none of it.

## 5. THE HEADLINE, AND WHAT IT DOES NOT SAY

76 founders, each measured in both runs; effect is the policy **minus today**:

| measure | effect | 95% | leave-one-regime-out |
|---|---:|---|---|
| **EXACT@6** | **+4.96 pts** | [−0.76, +10.68] | **positive in 60 of 60** |
| reciprocal rank | +0.0049 | [−0.0116, +0.0215] | 35 of 60 |

Bootstrap over founders, 6,000 draws: **P(EXACT@6 > 0) = 0.961**, P(recip > 0) =
0.718.

> **SAY THE UNFLATTERING NUMBER FIRST.** The primary interval touches zero. The
> reciprocal-rank effect is a wash and reporting it as a gain would be exactly
> the error wsII corrected in the other direction. **What is established is the
> sign and its stability, not the size.**
>
> And the flattering-number rule cuts both ways here. wsII's headline moved
> reciprocal rank and **not** EXACT@6 — by its own §2 that is a result that "has
> not yet helped anybody". This one moves EXACT@6 and not reciprocal rank. **The
> two are complements: take the model's ordering, and stop it spending a seat
> when it has told us nothing.**

## 6. WHAT THIS COSTS TO CONFIRM

**Nothing, and that is a property of where the lever sits.** It is applied after
the reply is parsed, tallied and recorded, so one call per founder yields both
arms and any tape can be re-scored either way. `project-mgmt/wsIJ_prereg.md` is
written on that basis and states the departure from wsII's standing advice:
**reciprocal rank is the wrong primary for this arm.** wsII's 4.1-point EXACT@6
floor belongs to the model-vs-control contrast; this contrast is zero by
construction on ~60% of founders, its floor is **2.56 points**, and a census
reads a 4.96-point effect with 1.6x of margin.

**wsII's seventh confound is pinned by hash**, not by intention:
`poolRecallCurve.generated.json` sha256 `1c618fe0…`, n=821, last moved by
`b893cf58`. A corpus publish between the pre-registration and the run **voids the
run**.

## 7. WHERE THE BRIEF WAS WRONG

1. **"The −0.88 / +6.08 split."** Both halves are one run's two smallest cells,
   and the whole shape is reproduced by picking at random. It was also scored in
   the ruler wsII had just retired.
2. **"Find the honest threshold — at what control rank does it stop hurting."**
   There isn't one. Every control-rank family moves its own constant between the
   two runs. The thing that is stable is not a rank at all.
3. **"Reciprocal rank must be the pre-registered primary."** True of the contrast
   wsII priced, false of this one, and the reason is in §6. Following it here
   would have pre-registered a null on the only arm that moves the shipping
   metric.
4. **"EXACT@6's half-width floors near 4.1 points at any affordable price."**
   That floor is a property of a between-orderings contrast. A within-call paired
   contrast floors at 2.56.
5. **`npm run shadow` does not exist** — as briefed, and confirmed again;
   `npm run trace` does. **`scripts/agent-worktree.sh` is as documented.** Both
   checked rather than assumed.

## Verification

`npx tsc --noEmit`, `npx vitest run` (68 files, 918 tests), `npx tsx
scripts/check_contracts.ts`, `npx tsx scripts/check_answer_not_reachable.ts` —
all green. `npx tsx scripts/_wsij_conditional.ts` reproduces every figure above
offline, with a seeded PRNG, in about two seconds.

## What this does NOT settle

- **Whether the +4.96 is real.** The interval touches zero. It is a candidate.
- **Why the rule works.** "The reply told us nothing" is the mechanism I can
  state; it is not the mechanism I have measured. The alternative — that a model
  which agrees on first place is a model on an easy founder our score already
  handled — predicts the same table.
- **Anything about the writer, or any effort above `low`.** Unchanged from wsII.
- **`atMost`.** Still named, still priced, still not measured. It remains the arm
  to buy; this rule does not replace it and the two do not conflict.
