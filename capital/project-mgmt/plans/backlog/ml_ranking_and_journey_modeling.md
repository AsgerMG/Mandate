# ML/RL on the funding corpus — idea capture for future reference

> **Status: BACKLOG — idea capture, not yet scoped.** Captured from a design
> discussion (2026-07-21) about whether the corpus (303k+ funding events, real
> company→instrument outcomes) could train a model to strengthen
> company-to-funding matching. Conclusion: not as a live prediction feature
> today, for reasons below — but there's a real, narrower version worth
> reviving once the enrichment prerequisite (below) is done.

## The original idea, and why the two obvious framings don't work

**Supervised acceptance prediction** ("will this company get funded by X"):
the corpus is built entirely from public disclosure of *awarded* aid — there
is no visibility into who applied and was rejected. Without a negative class,
you can only describe the awarded population, not predict acceptance
probability. Presenting that as an eligibility signal would misrepresent
survivorship bias as merit.

**RL** (recommend an instrument, observe outcome, learn a policy): there is no
reward signal. We don't capture applications or post-recommendation outcomes
at all — building that loop is a telemetry project on its own, not a modeling
choice, and nowhere near ready.

## The refined framing that actually avoids the data problem

Reframe as **offline supervised learning-to-rank, backtested against known
outcomes** (not RL — no reward loop needed, just a train/test split): given a
company that is *already known* to have received funding from instrument X,
does a model ranking candidate instruments by fit put X near the top? This
sidesteps the missing-rejections problem because the task is "which
instrument," not "accepted or not."

**Still two real problems with this, before building it:**

1. **Circularity.** Most of the signal such a model would find — country →
   national scheme, ticket size → instrument band, capital type — is already
   the deterministic filtering logic in `buildInstrumentTable()`
   (`website/frontend/lib/intelligence/pipeline.ts`), built with exact rules
   and citations. A model trained on "who got what" would likely just be a
   fuzzy, unexplainable re-derivation of rules we can already state exactly.
   It would also absorb *propensity to apply* (who had a grant writer, who
   heard about a call) as if it were *eligibility* — eligibility is a legal
   fact, not a popularity signal, and blending the two would quietly
   contradict the tiered-honesty design the eligibility system leans on
   (`inventory_inferred` < `llm_classified` < `llm_2pass` < `human_verified`,
   never asserting past what's grounded — see migration 011 / `eligibility.ts`).

2. **Missing ground truth for the fields that would matter most.** Walking
   the current intake fields against what the corpus actually holds per
   historical event:
   - **Reconstructable today:** sector/subsector (NACE-backed), country,
     ticket size (real grant amounts), capital type, even consortium
     (derivable — multiple companies sharing a `call_id` under a
     coordinator-based programme).
   - **Zero historical ground truth:** `fteBand`, `turnoverBand`,
     `developmentStage`, `foundedYear`. `companies` has no size data at all
     (no incorporation date, no headcount/turnover field — confirmed during
     the Phase 3 intake-field reach analysis this session).

   This means we can't even test whether the two *highest-reach* fields
   (`fteBand` 79%, `developmentStage` 65% per
   `ETL/terms/aggregate_intake_usage.py`) are predictive — there's nothing to
   check them against. Training now would only ever validate the
   already-reconstructable (and already-deterministic) half of the field set.

## The prerequisite, if this gets revived

**Cheaper option, worth trying first (2026-07-21 refinement): a recent-window
backtest instead of full historical backfill.** Rather than reconstructing
ground truth across the whole corpus, pull only awards from the last 2-3
months (roughly 8-12k events at the corpus's overall ingestion rate, several
thousand distinct companies after `parent_group` dedup) and look up *current*
size/stage for just that slice — for an award that recent, current headcount
and stage is a reasonable proxy for headcount/stage at award time, and the
lookup reuses the same web-search infra already proven in
`discoverAndResearch()` rather than needing a new enrichment pipeline. Turns
"backfill the whole historical corpus" into a bounded, one-off task.

Two honest limits on this shortcut, not fatal but worth remembering before
trusting the result: (1) **instrument-coverage skew** — a short window skews
toward high-frequency instruments (SATR, ADEME, Innovate UK); lumpy
programmes (IPCEI waves, annual EDF calls) may have zero events in any given
quarter, so the diagnostic would only validate field-sufficiency for whatever
instruments actually appear in the window, not the full 320-instrument
inventory; (2) **still an approximation** — a company that closed a round and
tripled headcount mid-window would poison that one data point; the proxy is
"probably close," not ground truth.

**Full-corpus alternative, if the recent-window sample proves too thin or too
skewed:**
1. `companies.dealroom_id` / `companies.crunchbase_url` already exist as
   columns, mostly unpopulated — real external size/stage data if enriched
   for a subset of companies.
2. An LLM pass over `project_summary`/`project_title` (reuse the
   `classify_gates_bulk.py`-style Message Batches infra already proven this
   session — Sonnet 5, batch pricing, ~$1 for 312 instruments) to infer
   approximate development-stage-at-time-of-award, historically, per event.

**Then** backtest a ranking model with vs. without the enriched fields and
measure the accuracy delta. That delta is a measured answer to "do we need a
stronger LLM layer for company profiling," not a guess — and it's cheap to
run once the enrichment exists, since it's a straightforward train/test split
with a recall@k metric, no RL/policy infrastructure required.

## Where this would add real, non-redundant value (worth doing on its own merits)

**Funding *journeys* / sequence modeling**, not eligibility ranking: "companies
with this profile who used EIC Pathfinder went on to draw national NDB
co-investment within ~2 years." This is a genuinely new signal — it doesn't
re-derive anything the deterministic gates already state, it's descriptive of
real historical patterns, and it's exactly backtestable the way this
discussion proposed (train on pre-cutoff journeys, backtest on later ones,
check hit rate). If surfaced to founders at all, it must be framed as "what
similar companies did next" — descriptive pattern, never an eligibility claim
— consistent with the rest of the product's trust model.

## Revival trigger

- The enrichment prerequisite (dealroom/crunchbase backfill or LLM
  development-stage inference) gets scoped and run for an unrelated reason
  (e.g. as part of future Tier 2 research), making the ground-truth data
  already available "for free."
- Or: the founder-facing product reaches a maturity point where a
  "what similar companies did next" journey feature is worth the build on
  its own, independent of any ranking/matching motivation.
