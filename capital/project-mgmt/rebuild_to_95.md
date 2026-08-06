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

**(F) DONE 2026-08-06 — and the reason it had always measured flat was the
answer key, not the signal.** `project-mgmt/research/region_routing.md`.
`scheme_code = call_id` credits an award to EVERY body delivering that notified
scheme, so inside a same-name group the shipped label names the right leaf 32%
of the time against 92% outside one. Against the register's own attribution the
identical scorer on the identical rows goes 24.9% → 66.2% @1. Shipped:
`regionPrior.generated.json`, `regionScorer` inside the rank-preserving sibling
reassignment, the region question offered from measured footprints rather than
from gates (the groups have none), and the real geographic split handed to gate
2's question writer. Within-group holdout **44.2% @1 / 91.1% @3 against 28.3%
popularity**; end to end, paired, 7.5% → 9.2% on those cases and nothing on the
headline — because a group occupies at most one or two of five slots however
well it is ordered internally. **The remaining loss is pool-to-table.**

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

---

## Update 2026-08-06 — (E) done, and the harness was worse than we thought

### The intake DID ask. It asked badly.

`panel.tsx` had a free-text field all along: a one-line `<input>` labelled
"What you do (one line)", optional, no minimum. It reaches the ranker intact
(panel → `/api/intelligence/verdict` → `computeVerdict` →
`semanticFundMatch` + `themeRelevance`), and both matchers discard anything
under 12 characters and return an empty map. So a founder could type four words
and silently switch off the entire thematic half of the ranking with no
indication that they had. Nothing in production substitutes a sector template —
that substitution is the TEST HARNESS's, at `measure_recall.ts:86`.

Now: a three-row textarea, "What are you building? (a sentence or two)", a live
prompt when the answer is too thin to separate anything, and — when they are
about to continue without one — the cost stated once and a "Continue without
it" they click themselves. Never a hard block. The three character bounds are
one set of constants in `types.ts`, read by the form and by both matchers; they
used to be a bare `12` written out twice with the form knowing neither.

### The paired number: what the description is actually worth

`scripts/measure_description_lift.ts` — the same companies, the same won fund,
the same intake answers, ranked twice. Nothing differs but the description.
n=301 holdout companies, leak-free rows only, both arms in one process.

| | in pool | EXACT@1 | **EXACT@5** | REGIME@5 |
|---|--:|--:|--:|--:|
| real description | 92.7% | 11.3% | **33.6%** | **75.4%** |
| canned sector sentence | 88.7% | 8.3% | **23.6%** | **65.4%** |

**+10.0pp EXACT@5, +10.0pp REGIME@5**, discordant 48 for / 18 against
(McNemar p < 0.001). It also recovers 4pp of *pool* misses.

Two earlier identical runs read +12.3pp and +8.0pp. Nothing in this workstream
changed between them; `shortlist.ts`, `corpus.ts` and `peerPrior.generated.json`
did, from parallel work on the same tree. **The lift is +8 to +12pp and the
absolute levels are not comparable across runs.** The paired design is what
survives that — both arms always see the same ranker — so the direction and the
discordant counts held in all three while the levels moved. Anyone quoting a
level from this document must re-measure.

The earlier "79.4% vs 17.2%" compared two different populations (EU programme
winners against national-scheme winners), not one population two ways. It is
not this number and should not be used as a target.

### Where the lift is, and where it is exactly zero

Broken out by where the description came from — and this is the finding that
should change the plan:

| population | n | EXACT@5 real vs template | REGIME@5 real vs template |
|---|--:|--:|--:|
| EU programme, own project text | 102 | 47.1% vs 20.6% = **+26.5pp** | 64.7% vs 37.3% = **+27.5pp** |
| national scheme, recovered text | 196 | 26.5% vs 25.0% = **+1.5pp** | 81.1% vs 80.1% = **+1.0pp** |

**For a national-scheme applicant, a real description is worth nothing — not
even at the regime level.** Both halves of that are explained and neither is a
defect in the description:

- the regime is *already* found without it (80.1% on the canned sentence),
  because country plus sector plus the peer prior pin it;
- the leaf cannot be found *with* it, because the 119 same-name SATR leaves sit
  at 0.947 mean cosine — one notified scheme delivered by fourteen regional
  bodies. No description tells anyone which branch office they apply to.

So (E) is a large win on the EU population and a null on the national one, and
the national gap is **entirely** (F): make the granting authority a routing
attribute resolved by the applicant's region. Until that lands, no amount of
intake quality will move the 84% of the corpus that is national schemes.
Sequencing (E) before (F) and expecting the headline to move was the wrong
read; (E) is now done and the headline will move when (F) does.

### The test set was leaking, and not where the guard was looking

`__recallSet.json` excluded pairs whose description appears in the won fund's
`sample_project_titles` — a SQLite column. Retrieval scores against
`instrument_profiles.profile_text`, a Postgres column built separately, capped
at 40 titles of its own choosing, rebuilt since. Checked against the real
target: **86 of the 188 holdout `project` rows (46%) have their description
sitting verbatim inside the profile of the fund they are supposed to find.**
Those rows were grading retrieval on a query copied out of the answer. Of the
319 described pairs in the shipped set, only 168 are honest.

### `__recallSetEnriched.json` — built, verified, not a replacement

`ETL/terms/enrich_recall_set.py`. Recovers a real description for a pair from
that company's funding record **under a different regime** — a Horizon project
summary for a company that won a German regional scheme. Six guards plus the
profile-text check; the whole file re-verified afterwards against Postgres at
exact, sibling and 8-gram containment: **0 leaks of any kind**.

| | shipped set | enriched |
|---|--:|--:|
| pairs | 1,988 | 1,988 |
| leak-free real descriptions | **168** | **524** |
| distinct queries | 313 | 531 |

`__recallSet.json` is untouched. Measured on the holdout, same day:

| run | n | in pool | EXACT@5 | REGIME@5 |
|---|--:|--:|--:|--:|
| shipped set, described only (46% leaky) | 188 | 91% | **44%** | 57% |
| enriched, leak-free described only | 301 | 93% | **34%** | 75% |
| enriched, full holdout | 250 | 88% | 32% | 83% |

The shipped set's 44% is the leak. On the same EU population de-leaked it is
38%, and the enriched set adds 145 national rows that are genuinely harder.

```
SET=__recallSetEnriched.json npx tsx scripts/measure_recall.ts
SET=__recallSetEnriched.json DESCRIBED=1 npx tsx scripts/measure_recall.ts
```

The ceiling is raised, not removed: 1,405 rows still have no recoverable text,
because the company appears in the record exactly once. Only ~20% of
national-scheme winners have a second, cross-regime award to borrow from. The
remaining path to an honest full-set number is production intake, which is now
asking properly — every real founder who fills the box is a test case the
corpus cannot supply.
