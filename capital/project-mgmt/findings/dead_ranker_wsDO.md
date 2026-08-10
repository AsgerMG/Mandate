# wsDO — the old ranker's leftovers, and the single path that replaces them

Written 2026-08-11. Companion to `adviser_design.md` and `fund_selection_state.md`.

The architecture is fixed by the owner:

> A founder types into the first screen. Our code builds a subset — 18 to 185
> funds, median 105, the won fund in it 97% of the time. **An LLM with the
> embedded database, a body of instructions, and the founder's answers ranks
> that subset and shapes the memo.**

Stage 1 stays ours. Stage 2 stops being ours. This document is the record of
what the *old* stage 2 left in the tree, what each deletion cost, and the design
of the one path that replaces two.

---

## 1. The gate-2 measurement log, preserved

`lib/intelligence/fundSelection.ts` is deleted. It was ~740 lines of LLM
selection apparatus whose only importer was `scripts/measure_pipeline.ts` — a
fact `contracts.ts` `UNROUTED_STAGES` stated in writing. **The module is gone;
the measurement is not.** Everything below was written in its header and is
reproduced verbatim in substance, because it is the most valuable thing it held
and it is the reason the new architecture is shaped the way it is.

### The ladder

N=40, same strided cases, `gate1@32f28f2`, `claude-haiku-4-5`:

| arm | exact | regime |
|---|---:|---:|
| gate 1's own deterministic five | **20/40 (50%)** | 38/40 |
| legacy gate 2, as shipped | 14/40 (35%) | 37/40 |
| + JSON parsing, id-paired Q/A only | 13/40 (33%) | 31/40 |
| + pinning fields, family-grouped menu, axis-driven questions | 12/40 (30%) | 35/40 |
| + answer confined to gate 1's families and their slot counts | 15/40 (38%) | 38/40 |
| VETO ONLY, enforced in code | 20/40 (50%) | 38/40 |

### The findings, in the order they matter

1. **Every configuration that lets the model REORDER has measured at or below
   gate 1 on the same cases.** Legacy 14/40, parser-fixed 13/40, full
   information with a family-grouped menu 12/40, bounded-to-families 15/40 —
   against gate 1's own 20/40. Only removing the model's permission to choose
   reaches gate 1, and then it exactly ties.

2. **The information hypothesis is wrong.** Giving the model `award_p50`,
   capital type, the delivery body, the within-family sector share and a menu
   where the siblings are adjacent scored 30% — *below* the 35% it managed
   knowing none of that.

3. **A deterministic check confirms it from the other side.** No threshold on
   the within-family sector posterior — the signal that ranks the right sibling
   first 43.6% of the time inside a known group — beats gate 1's own ordering on
   these cases; every variant scored 19 or 20 out of 40. Gate 1 already reads
   `sector_mix`. There was no unexploited signal there for gate 2 to find.

4. **The caveat that voids the conclusion for the new architecture, and it is
   the admission this whole document exists to carry forward: 33 of these 40
   fixture companies had NO DESCRIPTION AT ALL.** The founder simulator answered
   "not sure" and there was nothing for judgement to bite on. The veto arm issued
   real vetoes on 16 of 40 cases and rescued zero while breaking zero — net
   neutral, which is what a floor looks like when the interview has nothing to
   say. **The upside is untested here, not disproven.** Embedding retrieval alone
   reaches 79.4% top-5 with a real description against 17.2% with the canned
   template; a measurement run on a fixture that is 82% blank bounds *that
   fixture*, not the product.

   This is the same class of error as measuring a ceiling on today's intake
   questions and reading it as a ceiling on the target.

5. **The prompt sentence that was deleted and must not come back.** The veto
   prompt used to end "the order is not yours to change and it is better than
   your guess." The first half is a mechanical fact and stays. The second half
   was a conclusion drawn from the instrumentation failure in (4): a model told
   its judgement is worse than a prior, on evidence that its judgement was never
   given anything to work with, is being taught to defer by an artifact of the
   harness. The shape that replaces it — state the BASE RATE, then the condition
   under which the model's own reading overrides it — is the shape any new
   selector prompt should use.

6. **Two correctness bugs, which DID land unambiguously.** The old picks parser
   read `match(/\d+/g)` out of prose that began with a preamble 93% of the time,
   so **40% of runs shipped fewer than five funds**; and the question list
   captured a markdown header as question 1 in 58% of runs, shifting every Q/A
   pair so **35% of cases fed the selector answers paired with the wrong
   questions**. Both were fixed by making every reply JSON and every answer carry
   its question's id. Any new selector inherits this: parse structured output,
   pair by id, never by position.

7. **Prompt-level constraints leak; code-level constraints do not.** "You may
   only demote", asked in the prompt, kept 70% of gate 1's five when told to keep
   all of them. The veto arm enforced the same constraint in code and it held
   exactly. A rule the selector must obey belongs in the caller, not the prompt.

8. **Rendering economy, measured.** 66% of candidate rows shared their entire
   `requires:` block byte-for-byte with a sibling; the two largest gate keys in
   the corpus (`framework_undertaking_in_difficulty`,
   `framework_excluded_activity`) sit on 584 instruments each, and one exclusion
   sentence appeared on 2,316 of 4,626 rendered rows. Printing a universal
   exclusion 58 times spends a third of the prompt saying something identical
   about every option. `distinctiveRequirements` existed to drop anything shared
   by more than ~35% of the subset.

9. **What separates siblings on a rendered row, measured over the 80-case
   fixture.** Of the sibling pairs whose rows otherwise say substantively the
   same thing, the *what it funds, in the scheme's own words* line separates
   **83%**. Nothing else measured did: the eligibility clauses, the application
   quote and the signals digest each separated none of them, and the whole
   `eligibility_text` column separated fewer at seven times the cost.

Deleted with it, because nothing else imported them:

- `lib/intelligence/fundSelection.test.ts`
- `lib/intelligence/shortlistAxes.ts` (the axis computation existed only to
  write gate 2's questions)
- `scripts/measure_pipeline.ts` (the harness for the ladder above)
- `scripts/_wsdi_menu.ts` (measured `renderMenu`'s output — a prompt that no
  longer exists)

The prose reference `project-mgmt/fund_selection_state.md` is untouched and still
holds the same numbers at doc level.

---

## 2. `scoreFit`, `rankByFit` and the fit score

### `rankByFit` — DELETED

Its own docstring said: *"NO PRODUCTION CALLER. The only caller in the tree is
`scripts/shadow_fit.ts` … If shadow_fit.ts is ever deleted, delete this with
it."* Both are deleted, together, as instructed. The `npm run shadow` script goes
with them.

**The finding preserved from `rankByFit`:** the display-name collapse it carried
is real and is *not* deleted with it — a shadow run put the same national agency
in three of five rows, which is a scarce row spent on nothing (contract rule
FUND-3). That collapse lives in production in `orderMemoCandidates`
(`SEL-DUPE-NAME`) and in `nameCollision.ts`, which is where it belongs: whether
two rows LOOK like one fund is a property of what gets published.

**The finding preserved from `shadow_fit.ts`:** the exit condition it was written
to test — *"the scored ordering must publish at least as many accessible funds
per archetype, and every fund it drops that the rules kept has to be
explainable"* — was answered against the fit score by `_wsct_order.ts` on a
larger and fairer population (below). The shadow harness is superseded, not
abandoned.

### `scoreFit` — MARKED, NOT YET DELETED

`scoreFit` is called in production at `memoCandidates.ts:310` and **orders
nothing**: `ORDER_ARM = "verdict"`, so the `fit` branch never executes. Its own
header tabulates that seven of nine components, **0.72 of the weight**, never
touch the founder's table. It is computed for every pool row on every memo
request and read by nothing.

It is not deleted here **only** because `memoCandidates.ts` is wsDL's file this
sprint and two agents editing one file is the defect this coordination exists to
prevent. What removes it is stated in §4.

The measurement that closed it (`scripts/_wsct_order.ts`, one replay, one pool,
tune n=250, seed 20260806, `ranker: all 245 request(s) on EMBEDDING`):

| | fit | pool | verdict |
|---|---:|---:|---:|
| MEMO@6 | 24.0% | 28.8% | 27.6% |
| off-country rows in the published six | 0 | 0 | 0 |
| published rows that are `open` | 100% | 95.4% | **100%** |

`pool` scores highest and does not ship: it buys its last 1.2 points by
publishing rows carrying an obstacle or no assessable verdict at all (4.6% of
published rows), and a wrongly-shown row costs more here than a missing one.
Earlier, wsCR measured the fit re-sort moving the won leaf **out** of the
published six 49 times for 13 in.

What survives from fit.ts either way, and must not be swept up with it:

- `sectorFit` / `sectorFitScorer` — **the one export of that file that ranks the
  founder's table**, read by `selectLeafInstruments` and by `rowRelevance`.
- `scaleFit`, `livenessFit`, `eligibilityFit`, `proximityFit` — the columns
  `poolBlend.ts` was fitted on. Deleting a component for want of a production
  caller would delete the column a published weight refers to.
- `FALLBACK_UNKNOWN` and the missing-data-neutral property, guarded by
  `check_missing_data_neutral.ts`.

---

## 3. The closed-question arms: which survived, and the test

The test applied to each: **is this the reproducibility arm for a published
number, or is it dead?** Three flags were deleted here already on exactly this
test (`SECTOR_CLIP_ARM`, `ROW_IDENTITY_ARM`, `PEER_FILL`), so the bar is known.

| flag | default | verdict | why |
|---|---|---|---|
| `POOL_BLEND` (`off`/`on`/`pure`) | `off` | **KEEP** | `pure` is the arm wsCU actually measured (EXACT@5 29.2% vs 23.2%, paired +6.0 ±3.3, McNemar z=3.5); `on` is the arm wsCV published in `findings/ship_blend_wsCV/`. Deleting either makes two published numbers unreproducible. |
| `SIBLING_SCOPE` (`channel`/`regime`) | `channel` | **KEEP** | `regime` is the published arm of `findings/gap_autopsy_wsCI.md` §178, and the flag was explicitly verified to reach the module before the run. |
| `CHANNEL_BACKFILL` (`on`/`off`) | `on` | **KEEP** | Inverted case: the *default* is the change and `=off` is the before-arm that reproduces every number published before `findings/pool_window_wsCO.md`. |
| `SECTOR_NEUTRAL_ARM` (`constant`/`mean`/`median`) | `median` | **KEEP** | The three-arm measurement of `findings/standalone_selection_wsBB2.md`; `constant` is pre-WS-BB behaviour, `mean` is what WS-BB shipped. |
| `OPEN_QUESTION_ARM`, `OPEN_QUESTION_BUDGET` | `off`, 3 | **KEEP** | Live measurement surface for the round-2 funnel; not a ranking arm. |
| `ORGANISATION_TYPE_ARM` | `off` | **KEEP** | Staged intake arm, declared in `types.ts` `armEnv`. |
| `ORDER_ARM` (`pool`/`fit`/`verdict`) | `verdict` | **KEEP the constant, DROP the `fit` branch** — see §4. `pool` and `verdict` are both published in the table above; `fit` is the arm that lost and is the only reason `scoreFit` is still called. |
| `PEER_FILL` | — | already deleted | Five arms, all measured, none wins. Only its comment survives, and it should: the *routing* headroom it names (36.2% under a perfect per-founder chooser against the shipped 25.7%) is still open and is one of the strongest arguments for the new architecture. |

**None of these is dead. All eight are the reproducibility arm for a number
somebody published.** `findings/adviser_audit.md` §132 already stated the
standing rule they live under and it stands: *legitimate — but every one is a
path that does not run in production, and none may be quoted as shipped
behaviour.*

---

## 4. THE SINGLE PATH

### The defect, stated

Two paths build a fund table and cut it differently:

```
  buildInstrumentTableHydrated  (shared: pool, hydration, gates)
      |
      +-- computeVerdict ........ fast, model-free ......... cut at DISPLAY_CAP = 6
      |
      +-- runIntelligence -> synthesize ... the memo ....... VERDICT_POOL = 18
                                                            -> orderMemoCandidates
                                                            -> WRITER_CANDIDATE_CAP = 8
                                                            -> institutionsMax = 7
```

They diverge *after* the shared builder, and they rank differently: the screen
shows the pool's own order cut at 6; the memo re-sorts on `ORDER_ARM`, drops
blocked rows, collapses display names, and cuts twice more. **Two paths that rank
differently is the defect that let a ranker's output be discarded before the
memo** — a founder can read a table on screen one and a differently-ordered table
in the brief, built from the same request.

### The design

**One ranker, one order, two views of it.**

```
  screen one answers
      |
  buildInstrumentTableHydrated ......... the pool. OURS. 18-185 rows, median
      |                                  105, won fund present 97%.
      |
  accessiblePool() ..................... conclusively blocked rows dropped
      |                                  (VER-BLOCKED). A shut door is not advice
      |                                  on either surface, so this is shared.
      |
  displayName collapse ................. one row per institution (SEL-DUPE-NAME).
      |                                  A display property, so it belongs to
      |                                  what is published, not to who ranks.
      |
  === THE ONE RANKER ===================================================
  agentSelect(pool, founder, instructions) -> ordered ids
      |                                  the LLM reads the funds, the founder's
      |                                  answers and the embedded demands, and
      |                                  returns ONE order. On any failure it
      |                                  returns the pool's order unchanged.
      |
      +---------------------------+
      |                           |
  screen one                    the memo
  .slice(0, DISPLAY_CAP)        .slice(0, WRITER_CANDIDATE_CAP) -> writer
                                -> institutionsMax
```

**What merges.** The ordering. There is exactly one sort in the product after
this, and it is the selector's. `ORDER_ARM`'s `fit` branch, `scoreFit`'s call
site and the per-row fit breakdown attached to every `MemoCandidate` all go with
it, because their only purpose was to express a *second* opinion about order.
`accessiblePool` and the display-name collapse move ahead of the fork and are
computed once.

**What each surface keeps.** Only its cut and its rendering.
- Screen one keeps `DISPLAY_CAP = 6` and the row renderer.
- The memo keeps `WRITER_CANDIDATE_CAP = 8`, `institutionsMax = 7`, the ease
  line, the assessment, the staleness flag and the writer contracts.
- Neither keeps a sort. `VERDICT_POOL = 18` stops being a second cut and becomes
  what it always meant: how deep the selector is allowed to read.

**What this makes checkable.** With one order there is one thing to measure. The
prefix property — *screen one's six are the first six of the memo's order* —
becomes a check rather than a hope, and a check that fails loudly is exactly what
was missing when the two paths drifted.

**The floors are untouched by construction.** The selector is a pure reorder of
rows the shipped path already built and already cleared: it adds nothing, removes
nothing, re-gates nothing. `check_winner_not_gated` (207), `check_winner_not_blocked`
(15), `check_answer_not_reachable` and `check_recall_leaks` cannot move, because
none of them reads an order.

### What wsDL's change unlocks

wsDL is routing the selector's order into the memo. The moment that lands:

1. **`ORDER_ARM`'s `fit` branch has no reason to exist** — the memo's order comes
   from the selector, not from a sort key. Delete the branch and the arm collapses
   to `pool | verdict`, both of which are published numbers.
2. **`scoreFit`'s call site dies with it** — the loop at `memoCandidates.ts:299-333`
   is the only production caller. Deleting it removes nine component computations
   per pool row per memo request that nothing reads, and takes `FIT_WEIGHTS`,
   `structureFit`, and `MemoCandidate.fit` with it.
3. **The two paths can be merged**, because the thing that made them different —
   a second ordering opinion applied on only one of them — is gone.

Until then, `scoreFit` stays called and stays useless, and that is a deliberate,
recorded state rather than an oversight.

---

## 5. Dead fields and dead rules removed

**Rule ids declared and never recorded** (`lib/intelligence/rules.ts`). Verified
by cross-referencing every `log.record("…")` call site against the register:

- `SEL-FIT-CONSORTIUM` — a channel-level consortium declaration. Its disposition
  (`fit-score`) was carried out: partner requirements are scored per instrument
  by `structureFit`, never declared per channel. The entry outlived the rule, so
  the register whose whole job is to state what the funnel may remove a fund for
  advertised a channel-level consortium filter the code had stopped applying.
  Preserved: the reason it was wrong — *declared once per channel in a curated
  brief, so instruments with materially different partner requirements inherit
  one verdict.*
- `WRT-NOT-WORTH` — the writer's disqualification flag. Preserved: *the flag
  required ~40 lines of prompt guardrails to stop it deleting well-matched funds,
  and it let ordering decide publication.* That sentence is the argument for
  "the score selects, the writer writes" and it is why the writer may no longer
  delete a row.

Same class as the `SEL-BAND` entry deleted before them: **a rule nothing can emit
is a false claim about the product.**

**Fields set and read by nothing** (`lib/intelligence/types.ts`):

| field | where it was set | why it is dead |
|---|---|---|
| `speed` | `FundSnapshot` ← curated "Speed" line; copied onto `InstrumentRow` | never rendered, never scored |
| `giveUp` | `FundSnapshot` ← curated "You give up" line | never rendered, never scored |
| `bestFor` | `FundSnapshot` ← curated "Best for" line | never rendered, never scored |
| `applicationTimeline` | `shortlist.ts` ← `r.timeline` | superseded by `applicationChannel` / `applicationRouteUnknown` |
| `profileNote` | `shortlist.ts`, for `DEPTH_SENSITIVE_CHANNELS` | never rendered; the divergence it recorded is not shown anywhere |
| `deliveryRegionShare` | `corpus.ts` ← `delivery_region_share` | `deliveryRegion` is the routing attribute; the share was never read |

Three of these — `speed`, `giveUp`, `bestFor` — are the last live consumers of
the curated fund-brief "At a glance" block, which is why the parse in `corpus.ts`
goes with them. `deliveryRegion` itself stays: it is the routing attribute for
same-name siblings and is read.
