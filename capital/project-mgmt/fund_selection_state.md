# Fund selection: where it stands, and how to measure it

The single reference for the two-gate pipeline. Written 2026-08-06. Every
number here came from `scripts/measure_pipeline.ts`, which measured BOTH gates
on the SAME cases in the same run — see "How to measure" before quoting
anything.

> **SUPERSEDED IN PART, 2026-08-11 (wsDO).** The gate-2 module this measured
> (`lib/intelligence/fundSelection.ts`) and its harness are DELETED. They never
> had a production caller and every arm that let the model reorder measured at
> or below gate 1. The numbers below stand as history and the whole measurement
> log, with the caveats that bound it — chiefly that 33 of the 40 fixture
> companies carried no description at all — is preserved in
> `findings/dead_ranker_wsDO.md`. **The commands in "How to measure" no longer
> run.** Gate 2 is now the LLM selector (`lib/intelligence/agentSelect.ts`), on
> a subset of 18-185 funds with the won fund present 97% of the time, and it is
> measured by `scripts/check_recall_floor.ts` and `scripts/measure_recall.ts`.

---

## The architecture

```
  screen one (6 fixed questions)
      -> GATE 1: candidate subset, ~58 funds, ranked
      -> GATE 2: LLM reads them, asks 6-8 follow-ups, narrows to five
      -> memo
```

## Current numbers

Holdout, n=40 strided, `gate1@32f28f2`, haiku-4-5:

| | |
|---|---:|
| GATE 1 — right fund is in the candidate subset | **95%** |
| GATE 1 — its own deterministic top-5, exact | 50% |
| GATE 1 — its own deterministic top-5, **regime** | **95%** |
| GATE 2 — LLM's five contain the right fund | 25% |
| GATE 2 — LLM's five contain the right regime | 90% |

**Gate 1 is at target on both counts that matter.** The right fund reaches
gate 2 95% of the time, and gate 1's own five already contain the right regime
95% of the time.

**Gate 2 is currently a net negative** — it halves exact accuracy (25% vs 50%)
and costs 5 points of regime. It does not ship as the selector in this state.

---

## What got gate 1 there

1. **Peer precedence** (`ETL/terms/emit_peer_prior.py`). From 627,957 traced
   (company -> instrument) award pairs across 153,636 companies: which funds do
   companies in this country and sector actually win. Nearly orthogonal to the
   text/sector ranker — measured union 45% against 24%/27% alone — so combining
   beat four rounds of tuning either. Live effect: EXACT 23% -> 40%,
   REGIME 77% -> 92%.
   The **cap of 40 companies per instrument is the trick**: uncapped popularity
   scores 16% because it hands everyone the biggest funds.
2. **Stop truncating the handover.** The subset was capped at 40 while the pool
   averages 58, losing 20 of 80 cases before the model saw anything. The whole
   pool is ~7,500 tokens. Reachability 75% -> 95%.
3. **Peer precedence steps aside when the founder's own words discriminate.**
   Applied flat it took national-scheme founders to 94% regime but dropped
   EU-project founders to 47%. Now gated on `themeInformative`.

## What is wrong with gate 2

Measured, in order of how much each mattered:

- **Re-picking from scratch instead of refining** cost the most. Gate 1's order
  is an empirical prior; eligibility text alone cannot separate siblings (258
  siblings resolve to 114 objective signatures, 2.3 sharing each). Telling the
  model to refine rather than rebuild took it 13% -> 47% on a fixed sample.
- **The menu was empty.** It showed `funding_instruments.description`, which is
  populated only for the 241 fetched SATR schemes — so the model chose between
  "Horizon EU CL3" and "CL4" with no text for either. Now reads
  `instrument_profiles`, which exists for all 1,014.
- **The vector index was unused.** `eligibility_embeddings` holds 4,720 chunks
  across 634 instruments and was queried by nothing. Now the founder's answers
  are embedded and used to retrieve the clauses that bear on them, scoped to the
  candidates. 47% -> 53% on that sample.
- **Still reshuffles more than the evidence justifies.** This is the open item.
  The fix is to let gate 2 only DEMOTE on an explicit disqualification, so it
  can improve on gate 1's order but never trade against it.

---

## How to measure (read this before quoting a number)

**Use `scripts/measure_pipeline.ts`.** One script, one strided sample, both
gates, one table, per-case outcomes written to
`fixtures/pipeline_last_run.json`.

```
npx tsx scripts/build_gate1_fixture.ts     # once, when gate 1 changes
N=40 npx tsx scripts/measure_pipeline.ts   # both gates, comparable
```

### The trap this replaced

Gate 1 and gate 2 were measured by different scripts on different samples and
the results compared as if commensurable. The fixture is not shuffled and its
first cases are easier:

```
first 15 cases   gate 1 top-5 = 80%
first 20                        60%
first 40                        52%
first 80                        49%
```

Gate 2 was being judged against the 80%. It is a harness flaw, not a bad run,
so it is fixed structurally: `measure_pipeline.ts` strides the fixture and
reports both gates from the same cases. **Never compare a gate-2 number to a
gate-1 number produced by a different script or a different N.**

### Traceability

- `fixtures/gate1_holdout.json` — the cached gate-1 output, stamped with the
  gate-1 git SHA it was built at.
- `fixtures/pipeline_history.jsonl` — append-only, one line per run.
- `fixtures/pipeline_last_run.json` — per-case outcomes, so any aggregate can
  be re-derived rather than trusted.
- `contracts/selection/fund-selection.md` — the selection rules as a diffable
  contract.

### No leakage

The question-writer never sees the founder. The founder-simulator never sees
the candidate list. Neither ever sees the fund the company actually won.
Retrieval is scoped to the candidate instruments, so it cannot surface a fund
the screen excluded.

---

## What is settled, so it is not re-litigated

Measured flat and **not worth retrying** for exact-scheme ranking:

- corpus enrichment / scheme text (23% -> 23%) — real value for the memo, zero
  for ranking
- the old adaptive round (0 promoted at any question limit)
- gate-fit ranking on uniform intake answers (won fund 62% pass vs pool 63%)
- sub-national region (no leak-free ground-truth founder region exists)

Also settled: **exact-scheme 95% is not reachable by ranking.** Even scoring the
entire ~58-fund pool tops out at 88%, and the pool ceiling is 94%. ~~The target
that is both reachable and honest is **regime-level**, and gate 1 is already at
95% there.~~

⚠ **The regime-level recommendation in the struck sentence was OVERRULED by the
owner on 2026-08-03 and must not be re-proposed. The target remains EXACT
scheme in the top five.** The conclusion above it — that 95% is unreachable —
survives, but the reason recorded here is the weaker one. The current reason is
wsCC (`findings/rich_intake_wsCC.md`, 2026-08-09): under FULL founder
information the honest maximum is **65.9% EXACT@5**, bound by pool reach (−7)
and by 29 points of funds that stay genuinely indistinguishable after
everything a founder can say. That is a property of the corpus, not of the
ranker, so "not reachable by ranking" understates it: it is not reachable by
asking the founder more either.

## Next

1. Constrain gate 2 to demote-only, so it cannot fall below gate 1's ordering.
2. Re-measure with `measure_pipeline.ts` at N>=40.
3. If gate 2 still does not beat gate 1's own five, ship gate 1's five and use
   the LLM for the memo rather than the selection.
