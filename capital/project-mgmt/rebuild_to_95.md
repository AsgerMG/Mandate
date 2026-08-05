# Getting to five correct funds: what to rebuild

Written 2026-08-06 from four parallel audits (`project-mgmt/research/`). The
goal is unchanged and is not negotiable down: **name the five specific funds a
founder should apply to.** Not the regime, not the agency — the fund, in the
memo, with the next step.

## Why every ranking attempt measured flat

Not because the target is impossible. Because gate 1 is ranking on broken
signals and gate 2 is choosing without the information that separates the
candidates. Both are fixable, and the fixes are known.

```
S8  in the pool but ranked 6…N        59.2%   <- the entire loss
    all filters combined               8.8%
    HIT: in the five                  32.1%
```

Median rank of the won fund is **7**. It is nearly always there; we order it
wrong.

---

## The information to pin the exact fund EXISTS

This is the finding that makes 95% credible. Across 35 sibling groups of >=3
(721 instruments):

| field | fully separates | partly |
|---|--:|--:|
| **`award_p50`** (typical cheque) | **25 groups** | 8 |
| `administering_body` | 4 | 23 |
| `capital_type` | — | 11 |

And separately: **80% of won funds are uniquely pinned within their sibling
group by fields already in the corpus**; `administering_body` alone does 22%.

So the answer is not "we cannot tell siblings apart". It is that nothing in the
pipeline currently asks.

---

## GATE 1 — three broken signals, all measured

### 1. `sectorFit` inverts its own question  (fit.ts:166)

`share = mix[sector] / total`, clipped at 0.25. That is P(sector | fund) — it
divides by the fund's OWN size, so a 12-award specialist outranks a 400-award
scheme funding four times as many companies in that sector. The ceiling then
flattens everything above 25% to an identical 1.0, so the score **ties on top in
58.7% of sibling comparisons** — precisely where it must discriminate.

Measured on 143k awards, leave-one-out, within sibling groups:

```
share clipped at 0.25 (today)   17.6% @1   <- BELOW the 29.6% popularity baseline
unclipped share                 24.9%
posterior P(fund | sector)      43.6%
posterior on subsector          48.2%
```

**Attempted and reverted 2026-08-06:** swapping in the posterior scored 30% vs
32% in the full pool. The +26pp is real *within a known sibling group* and does
not survive being applied across a 58-fund pool where it competes with
peer precedence. It belongs in gate 2, ranking inside the group — not in
gate 1's global sort. Record this so it is not retried blind.

### 2. The peer prior is blind to 227 instruments

`emit_peer_prior.py` joins `scheme_code = call_id`. The 227 programme-split
children have an EMPTY `scheme_code`, so they never join: the prior cannot see
ADEME (75), BDNS (87), Vinnova (49) or Innovate UK (16) children **at all**.
Also 34 scheme codes are shared by >1 instrument (SA.56245 by 18), so those
rows are credited to the wrong sibling.

### 3. `themeInformative` never switches

It tests spread on semantic scores, but `semantic.ts` normalises by percentile
rank, so the statistic is 0.998 for every query. `wTheme` is always 0.85 and
the peer-precedence branch always takes the "specific description" path.
Reconstructed: routing correctly is worth **40% vs 32%**.

---

## GATE 2 — it is choosing blind, not choosing badly

It picks at chance: keeps the winning fund **55%** of the time, a wrong one
**42%**. It replaced 98 of 200 slots, each worth 10.0% before and 4.1% after —
expected −14.4pp, observed −12.5pp. That one mechanism is the whole deficit.

The reason is visible in what it is handed: `name`, `administering_body`,
`channel`, `country`, and four truncated gate strings. **None of that is what
separates the siblings.** `award_p50` — which pins 25 of 35 groups — is not in
the prompt at all. Nor is capital type, nor the sector posterior.

Its questions are worth **0pp** because they are generic ("what is your TRL?").
They are generic because the model was never shown the axes on which these
particular 58 candidates actually differ.

Two live bugs compound it:
- the pick parser reads digits out of prose (`match(/\d+/g)`), and 37/40 replies
  open with a preamble — **40% of runs return fewer than five funds**;
- 58% of runs capture a markdown header as question 1, shifting every Q/A pair,
  so 35% of cases feed the selector answers paired with the wrong questions.

---

## The rebuild

**A. Fix gate 1's three signals.** Peer-prior join (227 invisible children,
34 mis-credited), `themeInformative` routing (+8pp), and leave `sectorFit`
alone in the global sort — its posterior belongs in gate 2.

**B. Give gate 2 the discriminating axes, computed per shortlist.** Before
writing any question, compute what actually VARIES among these 58: award size
spread, distinct administering bodies, capital types, sector posterior, region
gates present. Hand the model those axes explicitly. A question is worth a slot
only if the candidates disagree on it — that is the same information-gain
principle already proven in `openFieldsForShortlist`, applied to the LLM stage.

**C. Put the pinning fields in the prompt.** `award_p50` with its `award_n`,
capital type, and the sector posterior — not just name and body. The model
cannot weigh what it cannot see.

**D. Fix the two parser bugs.** Ask for JSON, parse JSON, reject a reply that
does not return five valid indices. 40% of runs currently return fewer than
five funds and that is pure loss.

**E. Ask the founder to describe what they are building, in their own words.**
With a real description, embedding retrieval alone reaches **79.4%** top-5 of
58; with the canned sector template, **17.2%**. This is the single largest
lever and it is an intake change, not an ML one.

**F. Fix the data model where it lies.** 119 SATR leaves share a scheme name at
mean cosine 0.947 — one notified scheme delivered by many regional bodies.
Keep them distinct (the founder does apply to a specific one) but mark the
delivery body as a ROUTING attribute so gate 2 can ask "which region are you
in?" instead of guessing between 14 identical texts.

**G. Take `eligibility_embeddings` out of retrieval.** Two boilerplate strings
are 21% of the index, each replicated across 497 instruments; 284 of 497 SATR
leaves have zero chunks unique to them. It actively misleads
("quantum computing control stack" -> hydrogen-electrolyser rules). Keep it for
citing a requirement once a fund is already chosen.

## How this is measured

`scripts/measure_pipeline.ts` only — both gates, same strided sample, one
table, per-case outcomes to `fixtures/pipeline_last_run.json`. Never compare a
gate-2 number to a gate-1 number from a different script or a different N; that
error produced a phantom "80% baseline" that was really 49%.

Every peer-prior rebuild must use `--exclude-recall-set`. The shipped artifact
had been built without it.

## Honest note on the harness

84% of holdout cases carry no founder description, so they collapse to 51
distinct queries with a median of 7 different correct answers each. That caps
what ANY method can score on this test set at ~64%. This does not mean the
product cannot reach 95% — it means the test set must gain real descriptions
alongside change (E), or it will keep reporting the intake's emptiness as a
ranking failure.
