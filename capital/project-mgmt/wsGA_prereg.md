# wsGA — the pre-registered analysis for the ranker head-to-head

**Written before the run. Nothing in this file may be edited after the first
paid call is made.** The whole value of a pre-registration is that the answer
could not be chosen after seeing the data; a document revised once the numbers
are in is a narrative with a timestamp.

Harness: `website/frontend/scripts/_wsga_headtohead.ts`
Statistics: `website/frontend/scripts/_wsga_stats.ts`, which imports
`scripts/mcnemar.ts` and does not re-implement it.
Pricing and power: `website/frontend/scripts/_wsga_plan.ts` (free, reproducible).

---

## 1. The question

Does the model in the selection seat put the fund a company actually won into
the published table more often than our own scoring does, on the same founders,
at the same moment, on the same corpus?

Not "is the model good at ranking". Not "does thinking help". One arm, one
lever, one number.

## 2. The design

| | |
|---|---|
| **arms** | CONTROL = `AGENT_SELECT=off`, the empirical score's own order. TREATMENT = `AGENT_SELECT=adviser`, the model permuting that order. |
| **seam** | `late` — the default and the shipped position. The model permutes the eighteen rows the score chose; it cannot add, drop or re-gate one. |
| **pairing** | Both arms are handed the SAME `InstrumentRow[]` inside one loop iteration of one process. There is no "between" for the corpus, the index or the answer key to move in. |
| **population** | `__recallSetDescribed.json`, `split=tune`, graded (the won fund is still offerable), `descriptionSource` starting `cross_regime` — prose recovered from an award under a DIFFERENT regime than the fund being predicted, the only provenance `check_recall_leaks` clears at the sibling level. |
| **draw** | Seeded Fisher-Yates at `SEED=20260806`, then a per-country cap of 15% of the sample. |
| **conditioning** | `ONLY_IN_POOL=1`. A paid call is made only where the won fund is in the pool the model is about to permute. |
| **founder** | `founderIntake` with `own-history=withheld`. The company's own award channels are never handed to tier 1 of the sort. |
| **company name** | OFF in the ranker prompt. Standing decision, not a variable. |

### 2.1 Why the pairing is stronger than a frozen snapshot

The standing hazard is that **the seed pins the DRAW, not the POPULATION**.
Publishing 53 closed Spanish calls once shrank the graded key so the same seed
drew a different 300 pairs, and 48% of the exam was replaced.

A frozen corpus snapshot does not fix that. `partitionByOfferable` is a function
of `today()` and of `publishableInstruments()`, so the graded population moves
whenever liveness moves — snapshot or no snapshot. What fixes it is that the two
arms are graded **inside one loop iteration on one array**: whatever the corpus
is, both arms saw exactly it.

Comparability with a LATER run is a separate problem and is handled separately:
every run prints a `draw fingerprint`, a sha256 over the drawn `company::fund`
pairs. Two runs quoting different fingerprints graded different founders,
whatever seed they name, and no comparison between them is valid.

### 2.2 Why the draw is conditioned on the ceiling

On the `late` seam a founder whose won fund is not in the eighteen rows is a
**concordant miss by construction** — neither arm can win, and McNemar sees
nothing. wsDR's entire 45-founder run produced **three** discordant pairs at
EXACT@5.

The conditioning variable is computed by the free pool build both arms already
need, is fixed before either arm runs, and is identical for both. It is
therefore a change of ESTIMAND, not a choice made after seeing data: the run
measures *given the score put the answer in front of the model, does the model
find it more often than the score does*. The population figure is recovered by
multiplying by the in-pool rate, which the same run measures free at full n.

`ONLY_IN_POOL=0` measures the population directly and needs about 1.6x the
effect size to see it.

## 3. The primary outcome and the primary test

**PRIMARY OUTCOME: EXACT@5** — the won fund inside the first five rows of the
published projection (`orderMemoCandidates(...).toWriter`, cut to
`BRIEF_LIMITS.institutionsMax`).

**PRIMARY TEST: McNemar's exact test, signed, two-sided, alpha = 0.05**, through
`scripts/mcnemar.ts`. Concordant pairs are excluded by the test, not by a filter.

**EXACT@6 is reported on the same footing** and enters the decision rule below
as a consistency requirement, not as a second chance.

## 4. THE DECISION RULE

Fixed here, before the run.

### THE RANKER WINS — turn it on

All three:

1. EXACT@5: McNemar exact **p <= 0.05** with **z > 0** (the ranker's way);
2. EXACT@6: the point estimate is **also non-negative** (`ab >= ba`);
3. the run is adequately powered — see §5 — i.e. discordant pairs
   **m >= M_MIN**, declared below.

Condition 2 is not decoration. wsDR measured +2.2 points at @5 and **-2.2 points
at @6** on the same 45 founders. A sign flip between two adjacent windows over
one ordering is noise wearing a decimal point, and a rule that lets @5 alone
declare a win would have declared one there.

### THE RANKER LOSES — leave it off, permanently, at this seam and effort

EXACT@5: McNemar exact **p <= 0.05** with **z < 0**.

### THE RANKER IS NOT WORTH PAYING FOR — a positive finding, not a shrug

The run is adequately powered (m >= M_MIN) **and** p > 0.05 **and** the point
estimate of the paired gain is **below `WORTH_SHIPPING`**.

This is the conclusion that closes the question, and it is the most likely one
on the evidence to date. It is stated as its own outcome so that "we could not
tell" and "we could tell, and it is not worth it" are never conflated.

> **`WORTH_SHIPPING` IS THE OWNER'S NUMBER AND MUST BE SET BEFORE THE RUN.**
> The proposed default is **+3.0 points of POPULATION EXACT@5**. The reasoning:
> the arm roughly triples the cost of a brief (EUR 0.012 free -> EUR 0.036 at
> effort `medium`), and +3 points is the smallest move this project's own floor
> convention treats as a move rather than as noise. A different number is
> legitimate; choosing it after the run is not.

### INCONCLUSIVE — the run failed to answer

Anything else. In particular, and stated explicitly so it cannot be
re-described afterwards:

- **m < M_MIN.** The run is UNDERPOWERED and is reported as underpowered
  whatever its p-value. A p of 0.04 on nine discordant pairs is not a finding.
- p > 0.05 with a point estimate at or above `WORTH_SHIPPING`. The effect may be
  real and the run could not see it. The response is a bigger exam, not a
  bigger claim.

### THE RUN IS VOID — no conclusion of any kind

Any one of these. Checked and printed by the harness itself.

| condition | why |
|---|---|
| the ranker line is not exactly `ranker: all N request(s) on EMBEDDING` | the run averaged two ranking systems, or ranked nothing. Three headline figures in this project have been retracted for this. The harness marks the report NOT EVIDENCE and exits non-zero. |
| `FELL BACK` on more than 5% of calls | a fallback publishes the CONTROL's order under the treatment's name. |
| `CUT OFF at max_tokens` on any call | a truncated reply is indistinguishable downstream from a model that declined. `MAX_TOKENS_BY_EFFORT` is meant to make this impossible; a non-zero here means the pairing is wrong. |
| `corpusProvenance().instruments` differs from the free control run made the same day | the exam changed under the run. |
| `exits.chose` < 95% of `tally.calls` | most calls did not reach a decision, so most of the sample is the control. |

## 5. POWER — declared before, not computed after

`M_MIN` is the number of discordant pairs at which the run can see an effect the
size of `WORTH_SHIPPING` with 80% power, computed by
`mdePowered()` in `_wsga_stats.ts`.

Run `npx tsx scripts/_wsga_plan.ts` to reproduce the table. At the proposed
settings (effort `medium`, conditioned draw, in-pool discordance 21.4% measured
on wsDR):

- **the population is the binding constraint, not the budget.** The graded tune
  population with a cross-regime description is **324 founders**. At the
  measured in-pool rate that is roughly **90-110 paid calls**, and roughly
  **20-24 discordant pairs**. The budget would have bought 250 calls.
- at m = 22, the smallest gain detectable at 80% power is about **+7.5 points on
  the in-pool sub-population**, which is about **+2.3 points of population
  EXACT@5**.
- **`M_MIN` = 22.**

The in-pool discordance rate of 21.4% is itself measured on **fourteen**
founders (3 discordant of 14 in wsDR). Its own 95% interval runs from roughly
5% to 51%. That uncertainty is in the plan and is not hidden: if the true rate
is at the low end, this run produces single-figure discordant pairs and is
inconclusive by rule, whatever it costs.

## 6. Secondary analyses — what they may and may not do

**Wilcoxon signed-rank on the won fund's RANK.** Reported every run. It uses
every pair on which the fund is rankable rather than only the pairs that
straddle the cut, so it is several times more powerful — *on a different
quantity*. A more powerful test of a different quantity is not a second chance
at the same question.

- it MAY qualify a primary result ("the ranker wins at @5 and also moves the
  fund up generally", or "the ranker wins at @5 while moving the fund DOWN on
  average, which is a warning");
- it MAY NOT declare a win, a loss, or a worth-shipping verdict on its own.

**Per-country breakdown.** Reported every run. Descriptive only. No country's
sub-result may be quoted as a finding: at 15% of a ~100-call sample the largest
stratum is fifteen founders and two or three discordant pairs.

**The `reverse` arm's discordance rate.** A free upper bound on how much any
permutation of these eighteen rows can move EXACT@5 at all. If the maximal
permutation moves few pairs across the line, no considered one will move more,
and that is a reason to stop before spending rather than a result.

## 7. What is NOT under test

- the seam position (`early` vs `late`) — wsDR measured that;
- the thinking effort — wsDS measured that, on n=36, and found the lever moves
  while the metric does not;
- the company name in the prompt — a standing decision, OFF;
- the writer. `EXACT@k` here is the CODE-SIDE projection. `pipeline.ts` reads
  the order of the writer's notes as the ranking, so the rows a founder actually
  reads are in the order the writer chose to mention them. This run bounds what
  the cut throws away; it is not a claim about the finished brief.

## 8. The order of operations

1. `npx tsx scripts/_wsga_plan.ts` — free. Re-read the power table.
2. `AGENT_SELECT=off ... _wsga_headtohead.ts` — free. Measures the CEILING at
   full n on today's corpus, and fixes `corpusProvenance().instruments` for the
   void check.
3. `AGENT_SELECT=reverse ... _wsga_headtohead.ts` — free. Proves the harness end
   to end with a real permutation and no model, and bounds the discordance rate.
4. **The owner sets `WORTH_SHIPPING`.**
5. If step 2 says the ceiling puts `M_MIN` out of reach, **STOP**. Report that
   the exam is too short and do not spend.
6. Otherwise: `AGENT_SELECT=adviser AGENT_SELECT_EFFORT=medium ...` — one run,
   once.
