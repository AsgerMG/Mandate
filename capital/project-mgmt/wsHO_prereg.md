# wsHO — the pre-registration for the first INDICATIVE run under the EUR 4 policy

**Written and committed before the first paid token.** Nothing in this file may
be edited after the first call. A pre-registration revised once the numbers are
in is a narrative with a timestamp.

The standing policy this run is the first instance of, in the owner's words:
*"can we not just do indicative runs now and then once we have something that
looks like a final product then we do a full run to test? otherwise we just rack
up costs."*

---

## 0. THE BUDGET IS THE DESIGN, NOT A CONSTRAINT ON IT

**HARD CAP: EUR 4.00 across every paid call this workstream makes.** Enforced in
code by a rail checked against the API's own billed usage before each call, not
by an estimate and not by a promise. A founder the rail stops on is recorded
`called=false` and is excluded from every graded set: a spend limit must never
be able to turn itself into a result.

If the design does not fit, the SAMPLE shrinks. The design does not.

## 1. THE THREE QUESTIONS, IN PRIORITY ORDER

**Q1 — COST.** `findings/tokens_wsHI/` prices a full run at EUR 0.0217–0.0483
per call and the entire 2.2x spread is one unmeasured question: *does a
forty-row menu provoke longer thinking?* Thinking was 48% of wsGA's bill. This
run buys forty-row calls at the same effort wsGA used, so the output-token
distribution falls out as a **by-product** and the spread becomes a number.
Reported: **mean and p95 output tokens per API call, realised EUR per API call
and per founder**, and the eventual full run repriced from them.

**Q2 — TRUST.** wsHI raised `MAX_TOKENS_BY_EFFORT.medium` 12,288 -> 34,816 and
fixed a truncation counter whose denominator was wrong (calls counted per seam
invocation, truncations per API call). Both were verified offline only. **This
is the first live exercise of either.** Reported: the truncation count with its
correct denominator, `exits.threw`, and the slowest call against the clock.

**Q3 — DIRECTION.** Does the model's ordering of the forty beat our own six?
INDICATIVE ONLY. The owner's standing words: *"10 dollars should give a
direction, does not need to be statistically significant"*, and this run has
less than that. Every figure carries `n=`.

## 2. THE POPULATION, AND WHY IT IS THE STRICTER ONE

`__recallSetDescribed.json`, `split=holdout`, described, one row per company,
sorted by name — the draw `one_funnel/latest.md` and `door_separation_wsHA/`
are both computed on, fingerprint `13cb71cf3a1d1847`, **897 founders**.

**Paid calls are restricted to `descriptionSource` beginning `cross_regime`
(430 of the 897).** This is wsGA's stricter bar and not `one_funnel`'s, for the
reason `one_funnel/latest.md` itself states: that bar *"exists because a model
reads the query text and nothing here does"*. 378 of the 897 are described from
the company's own award text; a leak there would flatter the TREATMENT
specifically, which is the one direction of error this run cannot afford.

The 897 are still walked in full on the free arm, so both denominators are
reported and the reweighting is auditable.

## 3. THE STRATA — WHERE A EURO CAN BUY INFORMATION

On the `late` seam the model permutes rows the score already chose. Three
outcomes exist and only two of them can move. From `one_funnel/latest.md`:

| stratum | definition, per founder, computed FREE before either arm runs | of 897 |
|---|---|---:|
| **R — rescuable** | the won fund IS in the 40-row pool and is NOT in our six | 669-345 = **324** |
| **C — at risk (the CONTROL STRATUM)** | the won fund IS in our six | **345** |
| **D — dead** | the won fund is not in the 40-row pool at all | **228** |

**D IS NEVER CALLED.** Neither arm can win there and a call on it is a
concordant miss bought at full price.

**C IS CALLED, AND THAT IS THE POINT OF CARRYING IT.** A run that samples only R
can measure gain and can never measure harm, and the seam is two-sided: the
model can push a fund out of the six exactly as easily as it can pull one in. A
one-sided sample would report the numerator of a fraction.

Allocation is PROPORTIONAL: founders are walked in a seeded shuffle and every
one landing in R or C is called until the rail binds. R and C are within four
points of each other in the population, so proportional allocation is already
near-balanced, and it keeps the called set an unbiased sample of R u C — which a
quota would not.

## 4. THE ARMS, AND THE PAIRING

| | |
|---|---|
| **pool** | built ONCE per founder, free, and both arms are handed the SAME ARRAY. There is no "between" for the corpus to move in. |
| **CONTROL** | `orderMemoCandidates(pool)` -> first 6. Our own scoring. FREE. |
| **TREATMENT** | `agentSelectMemoPool(pool, req)` -> `orderMemoCandidates(...)` -> first 6. The model permutes the forty; `orderMemoCandidates` carries the incoming order through (wsGB). |
| **seam** | `late`, the shipped position. Pool MEMBERSHIP cannot move, so the two ceilings are equal by construction and any difference is a bug. |
| **effort** | `medium` — wsGA's rung and wsHK's, so the cost figure composes with the record and the ceiling exercised is the one wsHI raised. NOT the shipped default (`low`); this is stated because a cost quoted for the wrong rung is the wsGS failure repeated. |
| **menu** | `BRIEF_VERDICT_POOL=40`, the shipped value. `menu` is `min(SELECT_DEPTH, pool)`, so a founder with a short accessible pool legitimately sees fewer; **cost figures are quoted on the calls whose menu was exactly 40, with n stated, and the whole-run figure beside them.** |
| **samples** | `REPEAT=1`. wsGO measured multi-sampling dead and the null was already bought by wsGA (self-discordance 26% against 50% versus the control at EXACT@6). A second sample here would buy variance the budget cannot afford. |
| **`NO_PG`** | FORBIDDEN. It serves a snapshot AND drops the ranker to lexical — one flag, two defects, 5.3 points. The harness refuses to start if it is set. |
| **writes** | `GUARD_NO_PUBLISH=1`. No production write, no floor moved. |

## 5. WHAT COUNTS AS A DIRECTION, DECLARED BEFORE THE DATA

The estimand is the **population** change in EXACT@6, decomposed:

```
  delta  =  s_R * rescue  -  s_C * harm
```

- `rescue` = P(the won fund is in the model's six | stratum R)
- `harm`   = P(the won fund is NOT in the model's six | stratum C)
- `s_R`, `s_C` = the strata shares measured on this run's own free walk.

**A DIRECTION IS CLAIMED ONLY IF at least 15 founders were called in EACH
stratum.** Below that the finding is "the budget did not buy a direction",
which is a real result and is reported as one. No pooling of the strata to
manufacture an n.

The sign of `delta` is the direction. Its 95% interval is reported beside it and
is expected to span zero. **The phrase "indicative" appears beside every figure
and no figure from this run may reach the dashboard headline — that is
`one_funnel` and nothing else.**

Reported without exception beside any gain, because wsHE's +2.4 was +0.4 with
one agency removed: **CONCENTRATION** — how many distinct regimes the rescues
come from, and the largest one's share of them. Same for the harms.

Secondary, and it may not carry the headline: the won fund's POOL RANK under
each arm, Wilcoxon signed-rank. A more powerful test of a different quantity is
not a second chance at the same question.

## 6. VOID CONDITIONS

The run is void, with no post-hoc rescue, if any of these hold. Each is a field
the report prints, so a reader decides in one line rather than by inference.

1. **`exits.threw` is non-zero.** A ceiling the clock cannot reach never
   truncates — it times out, and a zero that lies is worse than a red one.
   wsHK's condition, honoured verbatim.
2. **The slowest call exceeds 80% of `TIMEOUT_BY_EFFORT.medium` (150,000ms).**
   Below the timeout is not clear of it. If this trips, the finding is "the
   clock binds before the ceiling does" — reported, never retried lower.
3. **`N/M CUT OFF at max_tokens` has a non-zero numerator**, M being the API
   call count. **This voids the DIRECTION result (Q3).** It does NOT void the
   token distribution (Q1) or the trust report (Q2): a censored observation is
   still an observation, and a ceiling that binds is precisely the thing those
   two questions exist to detect. Truncated calls are flagged in the
   distribution rather than dropped from it. *This carve-out is declared here,
   before the first call, and may not be widened afterwards.*
4. **The ranker attestation is not `ranker: all N request(s) on EMBEDDING`.**
   Three headline figures in this project have been retracted for missing
   provenance.
5. **Fallbacks exceed 5% of calls.** A fallback publishes the CONTROL's order
   under the TREATMENT's name.
6. **The control and treatment arms were not run on the same pool object for
   every graded founder**, asserted in code per founder, not promised here.
7. **`menuMax` is not 40.** A run whose menu the report cannot state licenses
   nothing — `check_maxtok_headroom.ts` property 4.

**Reporting rule.** The report quotes the arm tally line and the exit line
**verbatim and in full, before any analysis.** wsGA's did, which is the only
reason its breach was ever found.

## 7. WHAT THIS RUN DOES NOT SETTLE

- **Whether forty rows beats eighteen.** That is wsHK's question and this is not
  it. This run has one menu.
- **Anything at an effort other than `medium`.**
- **Significance.** It is indicative by construction and by budget.
- **The writer.** Every figure is the CODE-SIDE projection, `orderMemoCandidates`
  cut to six. `pipeline.ts`'s finished brief is downstream of it.
