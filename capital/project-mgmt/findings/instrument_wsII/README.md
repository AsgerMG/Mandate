# wsII — the churn is the model, not the corpus; the outcome measure is what is broken; and the free funnel resolves 0.11 points

**FOR THE OWNER, VERBATIM.** You said *don't buy it, fix the instrument first.* The
instrument is fixed and it cost nothing. **Three things, and the middle one is the
whole answer.**

**One: the noise is not drift.** Of the 76 founders both paid runs called, the
nine whose menu was identical in order and membership flipped at **22%**; the
fifty-nine whose menu membership actually changed flipped at **12%**. The churn
is *highest where nothing changed*. It is the model disagreeing with itself, it
sits on top of the 18% already recorded against an identical prompt, and no
amount of corpus pinning touches it.

**Two: we have been scoring the paid runs with the wrong ruler, and the right one
was already on the tapes.** "Is the won fund in the top six" throws away where it
landed. Scored as **reciprocal rank** instead — same tapes, same founders, same
stratum weights that reproduce the published +1.68 and −3.10 exactly — the two
runs read **+0.0739 [+0.0284, +0.1193]** and **+0.0716 [+0.0103, +0.1329]**.
**Both exclude zero. The estimate moved 0.06 of its own standard error where
EXACT@6 moved 0.81 and crossed the sign.** It stays positive in **60 of 60**
leave-one-regime-out subsets; EXACT@6 stays positive in 29 of 60. **The model's
ordering is not a wash. It was never a wash. The measure could not see it.**

**Three: the free funnel is sharper than the paid one by twenty times.** Six
replicate groups in the committed run history, corpus and gates pinned: the
headline `top_6` **repeats exactly in five of six, and the sixth moved by one
founder — 0.11 points.** The stated ±2.86 is a binomial superpopulation interval,
which is a legitimate thing to publish and is *not* a run-to-run band, and it is
being used as one. **For "did our change move this population", the free
instrument resolves 0.11 points and the EUR 28.76 run resolves 2.2.**

**RECOMMENDATION: buy nothing.** Not "not yet" — nothing, for this question. The
sign of the ranker's effect is already established twice at p<0.05 on calls we
have already paid for. The remaining EUR 28.76 would buy a tighter interval
around a number whose sign we now know. **When you do buy, buy an ARM and not an
n** — and pre-register reciprocal rank as primary, because at EUR 30 it detects
an effect one third the size of the real one and EXACT@6 detects one twice as
large as the real one.

Everything below is free and offline: `npx tsx scripts/_wsii_noise.ts`.
No paid call was made. No production write. No Railway.

---

## 1. THE TEN FLIPS, DECOMPOSED

First, the thing that makes the obvious test worthless. **No two prompts in these
tapes are byte-identical and none ever can be.** `untrusted.ts:80` fences the
founder's description in a `Math.random().toString(36)` nonce — deliberately, as
an injection defence — so a textual diff scores **76 of 76** founders as
"changed" and measures nothing. wsHR then renamed rows to their register titles
between the runs, so a *title*-keyed diff scores a rename as a swap and reports
65 of 76 menus changed, which is also wrong. The identity used here is the row's
own **source text** (`funds:` / `who may apply:` / `demands:`), which a rename
does not touch.

| the menu the model was shown | founders | flipped | rate |
|---|---:|---:|---:|
| **identical in order AND membership** | 9 | 2 | **22%** |
| same membership, our own ranker reordered it | 8 | 1 | 13% |
| **membership changed (corpus drift)** | 59 | 7 | **12%** |

> **Corpus drift explains none of the churn.** Seven of the ten flips are on
> founders whose menu changed — but that is a *count*, and the count is an
> artefact of 59 of 76 menus having changed. The *rate* is the statistic, and it
> runs the other way. **Restricting the next run to a pinned corpus would not
> have prevented a single flip.**

| company | stratum | | our rank | model rank | menu |
|---|---|---|---|---|---|
| CELLUGY | C | worse | 2 → 2 | 2 → 8 | reordered |
| ADDITIVE MANUFACTURING SOLUTIONS | C | worse | 3 → 2 | 3 → 8 | drifted |
| AEROTEX | C | worse | 4 → 3 | 1 → 7 | drifted |
| BRISTOL BATH REGIONAL CAPITAL | C | worse | 2 → 2 | 2 → 9 | drifted |
| **CELLEVATE AB** | C | better | 6 → 6 | 10 → 5 | **identical** |
| AQDOT | C | worse | 4 → 3 | 2 → 9 | drifted |
| UNIVERSITA COMMERCIALE LUIGI BOCCONI | R | better | 14 → 14 | 16 → 5 | drifted |
| AVA OCEAN | R | better | 14 → 11 | 17 → 6 | drifted |
| **SCANDINAVIAN REAL HEART AB** | R | worse | 18 → 18 | 5 → 19 | **identical** |
| LE BIO MARAIS | R | better | 12 → 11 | 16 → 2 | drifted |

**Our own six flipped on 0 of the 76.** The control is deterministic; the whole
13% is on the model side.

### The boundary hypothesis is dead

> "A founder whose won fund sits at rank 6 or 7 flips on nothing."

Not these founders. **Zero of the ten moved by one place.** The changes in the
model's rank are `[5, 5, 6, 6, 7, 7, 11, 11, 14, 14]` — **median seven places.**
Only two landed at rank 6 or 7 in either run. And the flip rate is *highest*
where our own rank is nowhere near the cut:

| our own rank for the won fund | founders | flipped |
|---|---:|---:|
| **inside, 1–4** | 25 | **20%** |
| at the cut, 5–8 | 12 | 8% |
| outside, 9+ | 39 | 10% |

**Blocking or excluding boundary founders would remove none of the churn.** The
model is taking funds we had at rank 2 and putting them at rank 8 or 9.

### A seventh model-facing change, undeclared

wsHW attributed to six changes and stated *"`git diff … agentSelect.ts` is empty.
The selector's prompt template is byte-identical to wsHO's."* True of the
template, **false of the rendered prompt.** `poolRecall.ts:189` composes a
sentence telling the model its own base rate, and the curve it reads was re-cut
**twice between the two preregistrations** (`a9fda025` 21:30, `b893cf58` 23:53;
wsHO's prereg 08:37, wsHW's 00:39). So the model was told:

```
- Measured on 830 held-out companies … in the first 7 rows about 40% of the time
+ Measured on 821 held-out companies … in the first 7 rows about 45% of the time
```

**The instrument's prompt is a function of the corpus statistic it is measuring**,
so the treatment silently changes on every corpus publish. It cannot be pinned
without pinning the curve, and neither run did.

### The recorded prior holds, on a different arm

`project_llm_ranker_is_the_strategy` recorded the won fund as the *less* stable
row: swing 2.04 against rivals' 1.49. On the 17 founders here whose menu
membership held, across every row present in both runs:

| | n | mean cross-run rank swing |
|---|---:|---:|
| **the won fund** | 17 | **2.00** |
| every other row | 649 | 1.57 |

**Reproduced, on a different arm and a different pair of runs.** Do not treat it
as historical.

---

## 2. THE OUTCOME MEASURE — the finding, and it is free

`poolRankControl` and `poolRankTreatment` are on every tape line. Both runs
already printed a Wilcoxon on them and **both read it as a null** — because the
raw rank difference weights a 30 → 20 move, worth nothing to a founder, the same
as a 2 → 1 move, worth everything. Reciprocal rank weights them the way the
product does.

Scored under the **same stratum estimator** that reproduces the published binary
figures to four decimals:

| run | measure | estimate | 95% interval | |
|---|---|---:|---|---|
| wsHO | EXACT@6, points | +1.6768 | [−5.94, +9.30] | spans zero |
| wsHO | **reciprocal rank** | **+0.0739** | **[+0.0284, +0.1193]** | **excludes zero** |
| wsHW | EXACT@6, points | −3.0986 | [−11.78, +5.59] | spans zero |
| wsHW | **reciprocal rank** | **+0.0716** | **[+0.0103, +0.1329]** | **excludes zero** |

| | run-to-run movement | leave-one-regime-out |
|---|---|---|
| EXACT@6 | **0.81 SE**, and it crossed the sign | positive in **29 of 60** |
| reciprocal rank | **0.06 SE** | positive in **60 of 60** |

### It is not an artefact — the two nulls

A measure that rewards *any* reordering would be worthless. Both nulls were
simulated on the tapes, using the reconstruction of treatment rank from `picks`
that is **exact on all 156 calls**:

| what picks the seven rows | reciprocal rank |
|---|---:|
| our own top seven, unchanged | **+0.0000** (must be, and is) |
| seven rows at random, 4,000 draws | **−0.0812 / −0.0901** |
| **the model** | **+0.0739 / +0.0716** |

The measure has no mechanical offset, and random picking scores far *worse* than
our order. The model's score is real.

> **What this does and does not say.** It says the model reliably pulls the won
> fund toward the top. It does **not** say EXACT@6 improves — and the reason the
> two disagree is itself the product finding: the model **harms** founders whose
> won fund we already had visible (mean −0.88 ranks at control rank 1–6) and
> **helps** the ones we had buried (**+6.08** at rank 25+). It is a good deep
> re-ranker and a bad top-of-list preserver, which is exactly wsHW's
> `innovate_uk` result arrived at from the other end.
>
> **EXACT@6 stays the business metric and the only thing the dashboard may
> quote.** Reciprocal rank is a *sensitivity* instrument: what an arm is judged
> on before anyone pays to confirm it against the metric that ships.

---

## 3. WHAT A BUDGET BUYS — and the population runs out at EUR 28.76

Variance split from the 76 founders measured twice. `r` is depressed by corpus
drift as well as model noise, so the model term is an **upper** bound and every
figure here is conservative.

| measure | total var | retest r | between-founder | within (model) |
|---|---:|---:|---:|---:|
| EXACT@6 | 0.2766 | 0.770 | 0.2130 | 0.0636 |
| reciprocal rank | 0.0654 | 0.463 | 0.0303 | 0.0351 |

**Only 666 founders can be reached by a paid call at all** (R 316 + C 350; the
153 in D have the won fund outside the pool, so no ordering can move them and
they enter the denominator as deterministic zeros). At EUR 0.0432 each, **the
whole population costs EUR 28.76.** Past that, money buys repeats, not founders.

| budget | calls | founders | reps | MDE EXACT@6, in general | MDE EXACT@6, this draw | MDE recip, in general |
|---|---:|---:|---:|---:|---:|---:|
| **EUR 29** | 666 | 665 | 1.0 | **4.65 pts** | 2.23 pts | **0.0226** |
| EUR 30 | 694 | 666 | 1.0 | 4.62 pts | 2.18 pts | 0.0223 |
| EUR 100 | 2,315 | 666 | 3.5 | 4.25 pts | 1.19 pts | 0.0177 |
| EUR 300 | 6,944 | 666 | 10.4 | **4.13 pts** | 0.69 pts | 0.0162 |
| EUR 1,000 | 23,148 | 666 | 34.8 | **4.09 pts** | 0.38 pts | 0.0156 |

*in general* = would it hold for founders at large. *this draw* = does it improve
the score on our held-out 897, where a census has no sampling error left.

> **THE ANSWER TO "WHAT n SEES 3 POINTS": on EXACT@6, in general, none.** The
> founder-to-founder variance does not shrink when the founders run out, so the
> half-width **floors at about 4.1 points at roughly EUR 100 and never goes
> below it at any price.** A 3-point claim about founders at large is not
> purchasable. It is not a question of design — paired, blocked, or repeated,
> the same 666 people are all there are.
>
> **On the same money the rank measure is decisive.** EUR 30 buys MDE 0.0226
> against a real effect of 0.072 — **a factor of three of margin.** EXACT@6 at
> the same price buys an MDE **twice as large as the effect it is looking for.**
> That is the whole difference between a run worth buying and a coin flip, and
> it is a choice of ruler, not a choice of budget.

---

## 4. THE FREE FUNNEL — reproducible, and 26x sharper than its own stated band

`npm run stages` → `scripts/measure_funnel.ts`. **`npm run trace` exists;
`npm run shadow` does not exist** — confirmed in `package.json`, as briefed.

The instrument is engineered for determinism: the API key is **deleted** at
`measure_funnel.ts:116`, `NO_PG` **throws** rather than skipping (`:117-133`),
the shuffle is a seeded mulberry32 and is not even called on the reference run
(`:755`), and both SQL orderings on the path are total with no `LIMIT`. **No
model, no writer, no `agentSelect` on the measured path** — the `model` and
`watch_only` rows are structurally `null`.

It is still not bit-exact, for three reasons, all real:

1. **The ranker is a live call.** `semantic.ts:291-318` re-embeds every founder
   description through Voyage on every run — the only cache is in-process — and
   `:429-436` normalises by **rank**, not value, over ~322 profiles. One adjacent
   swap moves a score by ~0.003, three orders above the `1e-6` tie-rounding the
   row sorts use. That perturbation lands on `pool_cut`, which is a rank cut.
2. **Wall clock.** `corpus.ts:1556` takes `today()` for publishability, so
   deadline crossings move `publishable` with the corpus byte-identical.
3. `memoCandidates.ts:600` reads the current year for the staleness demotion.

**So: how much does it actually move?** Six replicate groups in the committed run
history, with draw, levers **and** the deterministic stages (`publishable`,
`founder_screen`, `gates_pass`) all pinned — so anything moving below them is the
instrument and not the corpus:

| stage | groups | exact | max drift | in points |
|---|---:|---:|---:|---:|
| `pool_cut` | 6 | 3/6 | 7 founders | 0.78 |
| `writer_cap` | 6 | 5/6 | 1 | 0.11 |
| `published` | 6 | 5/6 | 1 | 0.11 |
| **`top_6` (the headline)** | 6 | **5/6** | **1 founder** | **0.11** |
| `top_5` | 6 | 4/6 | 1 | 0.11 |

The single 7-founder `pool_cut` move is the one group spanning four days rather
than one session; every same-session pair moves 0 or 1.

### Is the ±2.86 honest?

Yes — **and it is answering a different question from the one it is being used
for.** `recallSample.ts:73-74`:

```ts
export const halfWidth = (hits: number, n: number): number =>
  100 * 1.96 * Math.sqrt(((hits / n) * (1 - hits / n)) / n);
```

That is a Wald binomial interval treating the 897 as an i.i.d. draw from a
superpopulation of founders. As a *generalisation* statement it is correct and
should stay exactly as it is. **But the 897 are not a sample** — `latest.json`
records `"sampled": false, "populationSize": 897`, and `measure_funnel.ts:754`
takes the whole population when `N=0`, which is the default. So the draw
contributes **zero** sampling variance to a re-run, and using ±2.86 as a
run-to-run band (as `RESUME_HERE.md:11-17` does — *"moved −0.22 against ±2.86"*)
compares a movement against an interval that does not describe it.

> **Nothing here moves that half-width and nothing should.** The measured
> repeatability is a *separate, additional* number: **at `top_6` the funnel
> repeats to 0.11 points.** Against the question we actually ask it — *did our
> corpus work move this population* — it is roughly **twenty-six times sharper
> than the band we have been judging it by, and twenty times sharper than the
> EUR 28.76 paid run on the same question.** A −0.22 move is real and we have
> been calling it noise.

**Caveat, and it is the reason to keep both numbers.** `latest.md` carries its own
banner: `NOT THE SHIPPED ORDER — AWARD_TERM=oneside`. The latest committed run is
an arm measurement, not the product.

---

## 5. WHAT TO BUY

**Nothing, now.** The two questions on the table are both already answered by
artefacts we own:

- *Did the week of corpus work help?* — the free funnel, to 0.11 points.
- *Does the model's ordering help?* — yes, +0.072 reciprocal rank, twice,
  interval excluding zero both times, 60 of 60 leave-one-out subsets. The
  EUR 28.76 would tighten an interval around a sign we already have.

**When there is an arm to price, the arm to price is `atMost`** — both paid runs
named `SELECT_COUNT_MODE=exactly` as the clearest mechanism, and it is the one
thing that could stop the model displacing a fund we already had at rank 2.
**EUR 28.76, the full 666 as a paired census, pre-registered with reciprocal rank
primary and EXACT@6 secondary.** At that price the rank measure has three times
the margin it needs and EXACT@6 has half of it — which is why the pre-registration
matters more than the money.

**Two things to fix first, both free, both in the way of any future run:**

1. **Pin `poolRecallCurve.generated.json` for the duration of a paid run**, or
   record it in the lever block. Today the prompt changes whenever the corpus is
   published, and neither run declared it.
2. **Report the funnel's repeatability beside its half-width.** They answer
   different questions and only one of them is currently printed.

---

## Verification

`npx tsc --noEmit`, `npx tsx scripts/check_contracts.ts`,
`npx tsx scripts/check_answer_not_reachable.ts`, `npx vitest run` — all green.
`npx tsx scripts/_wsii_noise.ts` reproduces every figure in §1–§4 offline.

## What this does NOT settle

- **Whether the model's rank gain is worth money to a founder.** Reciprocal rank
  says the ordering improves; it does not say a founder applies more often.
- **How much of the 22% is the base-rate sentence** rather than sampling. The
  two are confounded in these tapes and separating them needs a paid run with the
  curve pinned. It is not worth buying on its own.
- **Anything above effort `low`, or the writer.** Unchanged from both runs.
- **`atMost`.** Named, priced, not measured.
