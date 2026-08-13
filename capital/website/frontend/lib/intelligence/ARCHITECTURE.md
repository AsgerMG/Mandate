# The /brief architecture, in one place

Written 2026-08-11 (wsEH), because the owner asked whether "all the old
deterministic infrastructure" should be retired to avoid confusion. The answer
was: retire the dead **exploration**, keep the working **mechanism** — and write
down which is which, so the question does not have to be asked again.

Read this before you delete anything in `lib/intelligence/`, and before you open
any ranking question. Half of this document is a list of answers somebody
already paid for.

---

## 1. The architecture, and it is settled

> Our code selects the candidate subset. **An LLM ranks that subset.** We do not
> rank deterministically. The writer then writes the memo from the ranked rows.

```
  screen-one answers  (the founder's intake)
        │
        ▼
  ══ STAGE 1 — THE SUBSET BUILDER.  OURS.  THIS PART WORKS. ═══════════════
  shortlist.ts   selectInstrumentRows → materialiseInstrumentTable
  poolBlend.ts   the blended pool score
  relevance.ts   the semantic/theme term
  fit.ts         sectorFit / sectorFitScorer  ← the ONLY exports of fit.ts
  verdict.ts     encoded gates                   that rank the founder's table
        │
        │   pool: 18–185 rows, median 105.
        │   THE WON FUND IS IN IT 97% OF THE TIME.
        ▼
  accessiblePool()          conclusively blocked rows dropped (VER-BLOCKED)
        │
        │   ██ AND THIS IS WHERE IT IS LOST. The 97% above is the last
        │   ██ number anyone quoted, and it is measured ABOVE this filter.
        │   Mean 74 rows out. Measured on 820 held-out described founders,
        │   one per company: 97.2% in, 87.6% out. Every loss between them
        │   is an encoded eligibility verdict on a fund the founder in
        │   question ACTUALLY WON, so each one is a disagreement between
        │   two things we hold — a gate and a register record of that fund
        │   paying that company — and not a founder being correctly turned
        │   away. It was 74.8% until the ladder stopped counting two
        │   encodings of one field as two obstacles (wsGE, verdict.ts).
        │   On the 897-founder ladder (`npm run stages`) this stage reads
        │   83.17% and became 84.84% when a register BUCKET stopped
        │   handing conversation-ending rules to 453 children that never
        │   earned them (wsGR, mergeInheritedGates in corpus.ts).
        ▼
  .slice(0, VERDICT_POOL)   the cut. On the LATE seam (the default) it runs
        │                   BEFORE the ranker, so this IS the menu the model
        │                   is shown — pipeline.ts:1759.
        │
        │   ██ THE LARGEST SINGLE LOSS IN THE PRODUCT, and it was not on
        │   ██ this diagram at all. 79.5% of founders reach this line with
        │   ██ their won fund still present and 49.8% leave it with the fund
        │   ██ still present: -29.7 points, more than every stage above it
        │   ██ combined (`npm run stages`, 897 held-out founders).
        │   It is a plain prefix of an order that is already final, so it
        │   deletes nothing a wider cut would not keep — see caps.ts for
        │   where the number came from, which was never a recall or a cost
        │   figure, and for the ceiling it buys at each depth.
        ▼
  ══ STAGE 2 — THE RANKER.  AN LLM.  IT IS THE DEFAULT (wsGB). ════════════
  agentSelect.ts   agentSelectMemoPool → agentSelectRows → the model
        │          AGENT_SELECT=adviser, and `off` is the control arm
        │
        │   On ANY failure — arm off, timeout, empty reply, unparseable
        │   reply, missing key, a pool no longer than the seats — it returns
        │   `rows` UNCHANGED. The subset builder's order is the fallback, on
        │   every one of those paths.
        ▼
  memoCandidates.ts   orderMemoCandidates: NO SORT. The incoming order is
        │             carried through; one row per institution name
        │             (SEL-DUPE-NAME) demoted to the back; cut to the writer
        │             cap. The blocked drop happened upstream.
        ▼
  ══ STAGE 3 — THE WRITER. ════════════════════════════════════════════════
  pipeline.ts   synthesize() → the model writes whyEligible / nextStep only
```

The caps, all of them, live in `caps.ts` and `briefChecks.ts`, in this order:
`VERDICT_POOL` (the menu the model is shown) → `SELECT_DEPTH` (how deep the
selector may read into it) → `SELECT_COUNT` (how many published seats it fills)
→ `WRITER_CANDIDATE_CAP` → `institutionsMax`. Screen one cuts the same pool at
`DISPLAY_CAP`.

**The values are deliberately not written here.** They were, and moving one of
them meant editing a number in two places or leaving this page stating a cap the
code does not have — the second-copy defect this repo treats as the bug itself.
`caps.ts` is the definition, `check_contracts.ts` asserts the ordering, and
`caps.ts` asserts at module scope the half of it a swept lever can break. A
reader who needs a number reads the module; a reader who needs the shape reads
this line.

**The last step is not a selection.** `assembleBriefRows` publishes by CANDIDATE
ORDER, so with nothing watch-only the founder reads ranks 1..7 whatever
`WRITER_CANDIDATE_CAP` is. Its one spare seat is the BACKFILL BUDGET for the
watch-only demotion and nothing else: rank `7+k` publishes only where `k` rows
above it demoted. Read as a plain narrowing chain it looks like a cut that
decides the table, and the funnel billed it double-digit points of lost recall
on exactly that reading — measured at **0.12 points** end to end. The property,
the swept test and the price are on `WRITER_CANDIDATE_CAP` in `caps.ts`.

---

## 2. The deterministic score is not legacy. It has three live jobs.

This is the part that keeps getting misread, so it is stated plainly.

**Job 1 — it builds the subset.** Stage 1 above. Delete it and there is nothing
for the LLM to rank. The 97% figure is its work. **This is the half that was
NOT touched by wsGB and must not be**: the screens, the gates, the channel caps,
`accessiblePool` and the pool construction all stand exactly as they were.

**Job 2 — it is the fallback.** Every failure path in `agentSelectRows` returns
the incoming rows untouched. Delete the score's order and a model timeout means
no memo at all, rather than a slightly worse one.

**Job 3 — it is the control**, and on the only end-to-end metric we have it is
currently **winning**. The no-model control scored highest at every thinking
level measured (16.7% against 13.9 / 11.1 / 13.9 / 8.3, N=36). Delete the
control and we lose the ability to say whether the LLM is helping at all.

**And a fourth fact that WAS easy to miss, and is no longer true (wsGB,
2026-08-12):** `AGENT_SELECT` defaulted to `off`, so `agentSelectMemoPool`
returned its argument by reference and the order a founder read *was* the subset
builder's order. It now defaults to **`adviser`**. The shipped product IS
LLM-ranked; `off` is the control arm, reached by naming it.

Job 3 above is unchanged in substance and changed in direction: the score is
still the control, and on the only end-to-end metric we have it was still
winning when the owner decided to ship the ranker anyway. That decision makes
the head-to-head a **baseline** rather than a gate. It does not make the
control's number go away, and nothing here may be quoted as if it had.

### What it is NOT

It is not the thing that picks the founder's five, and as of wsGB it does not
exist as a composite at all. `fit.ts`'s own header had tabulated since
2026-08-09 that seven of `scoreFitControl`'s nine components — 0.72 of the
documented weight — never touched the founder's table, while it was computed for
every row of every pool on every memo request and read by nothing that shipped.
It is deleted, together with the weights table, `structureFit`, the shipped-memo-
order constant and its two control arms. `sectorFit` / `sectorFitScorer` stay:
they rank the founder's table. `scaleFit` / `livenessFit` / `eligibilityFit`
stay: they are columns `poolBlend.ts` was fitted on.

---

## 3. The names, and what they were changed from

wsEH renamed five identifiers so the code would say what it did — ORDER_ARM to a
shipped-order constant, MemoOrderArm to MemoOrderControl, MemoCandidateInput.
order to orderControl, MemoCandidate.fit to fitControl, scoreFit to
scoreFitControl. Every one of the five named the deterministic memo sort or the
composite behind it, and **wsGB deleted all five with the sort itself**. The row
that mattered — "it is the losing control arm plus a recorded breakdown" — is
now the reason none of them is in the tree, so the table is left out rather than
kept as a list of names a reader cannot find.

**Deliberately NOT renamed**, and each for a stated reason:

- `sectorFit` / `sectorFitScorer` — these genuinely DO rank the founder's table.
  Renaming them toward "control" would be the same lie in the other direction.
- `shortlist.ts` — the module name overclaims (it builds the pool, not a
  shortlist), and it should be renamed. It was not renamed here because it was
  being edited by another workstream at the time and a rename across ~40
  importers is not worth a merge conflict in the one file everything imports.
  **Open item.**
- the fit weights table and its two types — named by `measure_sibling_choice.ts`
  and by published findings, so renaming them would have broken citations for
  little gain. wsGB deleted them instead, and copied the nine weights verbatim
  into the block that replaced `scoreFitControl` in `fit.ts`, so the citation
  still resolves to the numbers it cites.
- `VERDICT_POOL` — it stopped being a second cut and now means "how deep the
  selector may read". Renaming it touches `pipeline.ts`, which was live. **Open
  item.**

---

## 4. Routes measured dead. Do not re-buy these.

Each of these was measured, at cost, and returned nothing. The standing rule is
the owner's: *"Forget all the other structures. Every single other effort has
been failing."*

| route | verdict |
|---|---|
| **Deterministic ranking signals** | Nothing beats the shipped ranker outside its half-width. N=600, holdout, leak-free |
| **Per-fund evidence** (state-aid case register, SATR fields) | +0.0, and structurally so. `scripts/archive/_wsdi_reach.ts` |
| **Stage-2 open questions** | Flat at every question budget. `scripts/archive/_wscd_diag.ts`, `_wscd_landscape.ts` |
| **Door-level rows** | 0 of 29 points. The leaf already IS the door |
| **Organisation type** | Buys nothing, and would have blocked SAP and Diehl Aerospace from schemes they actually received. `scripts/archive/_wsch_prefill.ts` |
| **Address / territory** | A perfect lookup is +0.4 tune, +0.0 holdout |
| **A designed question set** | Topic separates 98% of look-alikes and founders cannot state it |
| **Collapsing recurring calls** | They are genuinely different funds |
| **Seat allocation / per-row routing** | An oracle *holding the answer key* gains one case in six hundred |
| **Rebuilding the founder descriptions** | Delivered 1,898 pairs not ~6,300; feasibility estimate was wrong 8×; moved the number 27% → 26% |
| ~~**A longer menu / more depth**~~ **RETRACTED (wsGM)** | It measured the SEAM, not the depth. `SELECT_COUNT` was 6, so at most six rows could be promoted from below the score's cut: wsDR promoted 64 rows across 30 of 45 founders and none was an answer — depth moved and the seat budget did not. Its 22.2% → 17.8% is ONE discordant founder on n=45, inside a ranker that disagrees with itself on 18% of founders. And 51 of its 133 menu rows carried no sentence saying what the fund pays for; after wsDW's repair that figure is flat at ~87% at every depth. The pool cut is now 40 on a swept funnel, n=897: the ceiling moves 49.8% → 66.7% and every stage below it is identical to the founder at every depth up to the whole pool. What remains unmeasured is the model's pick rate on a longer menu — `project-mgmt/findings/widen_wsGM.md` |
| **Better screen-two questions** | Picks changed on 8 of 12 and the category errors survived the answer. The arm that measured it was a bench harness, not a shipped lever: no flag by that or any other name exists, and the row previously named one that does not (wsEN). The live descendant is `RANKER_ASKS`, which defaults off — a different design, in which the stage that picks writes the questions |
| **Re-sorting the memo on the fit score** | MEMO@6 24.0% against `verdict`'s 27.6%; wsCR measured it moving the won leaf OUT of the published six 49 times for 13 in. `scripts/archive/_wsct_order.ts` — archived by wsGB, which deleted the arms it swept |
| **The old LLM gate 2** | Every configuration that let the model REORDER measured at or below gate 1 on the same cases. Module deleted; the ladder is preserved in `project-mgmt/findings/dead_ranker_wsDO.md` §1 |

What is **open**: judgement at depth — now the model's pick rate on the 40-row
menu it is shown after wsGM, which is the one quantity in this table that no
free run can produce — and row legibility. wsDV found the
nine missed rows were not refused but *unreadable* — zero of nine won rows
carried a usable sentence saying what the fund pays for, against 39 of the 54
rows the model chose instead.

---

## 5. Every flag in here is a reproducibility arm, not a lever

`POOL_BLEND`, `SIBLING_SCOPE`, `CHANNEL_BACKFILL`, `SECTOR_NEUTRAL_ARM`,
`AGENT_SELECT*`, `OPEN_QUESTION_ARM`, `NEXT_PUBLIC_ORGANISATION_TYPE_ARM`. wsEH
re-checked all of them: **not one is set to a non-default value anywhere in the
repo's build, CI or deployment config.** That is still true and it now means
something different for `AGENT_SELECT`, whose DEFAULT changed: the ranker runs
in production because the default says so, not because a config file sets it. Every one is the arm that reproduces a
number somebody published, and none may be quoted as shipped behaviour. There
are no dead flags to delete — the sweep found exactly one set-but-unread
variable in the whole repo, `NEXT_TELEMETRY_DISABLED`, which Next.js itself
consumes.

## 6. Where the receipts are

- `scripts/archive/` — measurement scripts for routes now closed, one line each
  on what they bought. See its `README.md`.
- `project-mgmt/findings/dead_ranker_wsDO.md` — the previous pass. Its §4
  "order of operations" is still the plan for merging the screen and memo paths;
  steps 3 and 4 (moving the blocked-drop ahead of the fork, and the prefix check)
  are **not yet done** and both change behaviour, so they need their own
  workstream.
- `project-mgmt/fund_selection_state.md`, `project-mgmt/findings/*.md` — the
  numbered record. Where a finding and this file disagree about what exists in
  the tree, this file is newer; where they disagree about a measurement, the
  finding wins.

## 7. Free things to run before you spend anything

```bash
cd website/frontend
npm run check    # types, tests, every contract. No API calls, no spend.
npm run trace    # the real candidate pool for a profile
npm run board    # the 12-archetype scoreboard
```
