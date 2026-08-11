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
        ▼
  ══ STAGE 2 — THE RANKER.  AN LLM.  THIS IS THE ONLY OPEN WORK. ══════════
  agentSelect.ts   agentSelectMemoPool → agentSelectRows → the model
        │
        │   On ANY failure — arm off, timeout, empty reply, unparseable
        │   reply, missing key — it returns `rows` UNCHANGED. The subset
        │   builder's order is the fallback, on every one of those paths.
        ▼
  memoCandidates.ts   orderMemoCandidates: verdict band first, incoming
        │             order inside each band; blocked dropped; one row per
        │             institution name (SEL-DUPE-NAME); cut to the writer cap
        ▼
  ══ STAGE 3 — THE WRITER. ════════════════════════════════════════════════
  pipeline.ts   synthesize() → the model writes whyEligible / nextStep only
```

The caps, all of them, live in `caps.ts` and `briefChecks.ts`:
`VERDICT_POOL = 18` → `SELECT_DEPTH = 40` (how deep the selector reads) →
`WRITER_CANDIDATE_CAP = 8` → `institutionsMax = 7`. Screen one cuts the same
pool at `DISPLAY_CAP = 6`.

---

## 2. The deterministic score is not legacy. It has three live jobs.

This is the part that keeps getting misread, so it is stated plainly.

**Job 1 — it builds the subset.** Stage 1 above. Delete it and there is nothing
for the LLM to rank. The 97% figure is its work.

**Job 2 — it is the fallback.** Every failure path in `agentSelectRows` returns
the incoming rows untouched. Delete the score's order and a model timeout means
no memo at all, rather than a slightly worse one.

**Job 3 — it is the control**, and on the only end-to-end metric we have it is
currently **winning**. The no-model control scored highest at every thinking
level measured (16.7% against 13.9 / 11.1 / 13.9 / 8.3, N=36). Delete the
control and we lose the ability to say whether the LLM is helping at all.

**And a fourth fact that is easy to miss:** `AGENT_SELECT` defaults to `off`. On
the shipped path today, `agentSelectMemoPool` returns its argument by reference,
so the order a founder actually reads *is* the subset builder's order. The LLM
ranker is the strategy; it is not yet the default. Do not describe the shipped
product as LLM-ranked.

### What it is NOT

It is not the thing that picks the founder's five. `fit.ts`'s own header has
tabulated since 2026-08-09 that seven of its nine components — 0.72 of the
documented weight — never touch the founder's table. `scoreFitControl` is called
on every memo request and its number is read by nothing that ships.

---

## 3. The names, and what they were changed from

Renamed by wsEH so the code says what it does. Behaviour identical; these are
identifier renames only.

| was | is | why |
|---|---|---|
| ORDER_ARM (no longer a name in the tree) | `SHIPPED_MEMO_ORDER` | it is not an arm. It is a constant, and it is the order that ships |
| `MemoOrderArm` | `MemoOrderControl` | the other two values are the controls it beat, not options to pick from |
| `MemoCandidateInput.order` | `orderControl` | passing it runs a control arm. Nothing in production passes it |
| `MemoCandidate.fit` | `fitControl` | read by the `fit` control arm and by nothing else |
| `scoreFit` | `scoreFitControl` | "score the fit" reads like the founder-facing ranker. It is the losing control arm plus a recorded breakdown |

**Deliberately NOT renamed**, and each for a stated reason:

- `sectorFit` / `sectorFitScorer` — these genuinely DO rank the founder's table.
  Renaming them toward "control" would be the same lie in the other direction.
- `shortlist.ts` — the module name overclaims (it builds the pool, not a
  shortlist), and it should be renamed. It was not renamed here because it was
  being edited by another workstream at the time and a rename across ~40
  importers is not worth a merge conflict in the one file everything imports.
  **Open item.**
- `FIT_WEIGHTS`, `FitScore`, `FitComponent` — named by `measure_sibling_choice.ts`
  and by published findings; renaming them breaks citations for little gain.
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
| **A longer menu / more depth** | 33 rows instead of 18 changes membership by nothing. EXACT@5 went 22.2% → 17.8%. On 9 founders the won fund sat at rank 19–40 and the model picked it **0 of 9**. `scripts/archive/_wsdq_seam.ts` — and note wsDQ's "depth is binding" inference is itself retracted |
| **Better screen-two questions** | Picks changed on 8 of 12 and the category errors survived the answer. The arm that measured it was a bench harness, not a shipped lever: no flag by that or any other name exists, and the row previously named one that does not (wsEN). The live descendant is `RANKER_ASKS`, which defaults off — a different design, in which the stage that picks writes the questions |
| **Re-sorting the memo on the fit score** | MEMO@6 24.0% against `verdict`'s 27.6%; wsCR measured it moving the won leaf OUT of the published six 49 times for 13 in. `scripts/_wsct_order.ts` |
| **The old LLM gate 2** | Every configuration that let the model REORDER measured at or below gate 1 on the same cases. Module deleted; the ladder is preserved in `project-mgmt/findings/dead_ranker_wsDO.md` §1 |

What is **open**: judgement at depth 18–40, and row legibility. wsDV found the
nine missed rows were not refused but *unreadable* — zero of nine won rows
carried a usable sentence saying what the fund pays for, against 39 of the 54
rows the model chose instead.

---

## 5. Every flag in here is a reproducibility arm, not a lever

`POOL_BLEND`, `SIBLING_SCOPE`, `CHANNEL_BACKFILL`, `SECTOR_NEUTRAL_ARM`,
`AGENT_SELECT*`, `OPEN_QUESTION_ARM`, `NEXT_PUBLIC_ORGANISATION_TYPE_ARM`. wsEH
re-checked all of them: **not one is set to a non-default value anywhere in the
repo's build, CI or deployment config.** Every one is the arm that reproduces a
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
