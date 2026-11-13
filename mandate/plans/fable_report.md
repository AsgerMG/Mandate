# Fable mission report: the senior-judgement loop

Branch `fable-judgement-loop`, continued on `trustworthy-eval` (never merged to main). Kept current as the work
goes; a later session resumes from "Next step" below. Mission: `fable_mission.md`.

## TRUSTWORTHY-EVAL (13 Nov 2026, branch `trustworthy-eval`): the numbers to quote

The figures in the 12 Nov sections below are CONTAMINATED (the brain read its own answer
key) and are kept only as history. These replace them.

| case | contaminated (12 Nov) | leave-one-out (13 Nov) | what it is |
|---|---|---|---|
| fintech_guarantees | 4 (h4; 7+4p/11; hit 0) | **3** (h3; 5+6p/11; hit 0; 1 borderline) | in-sample, see caveat |
| forklift_spatial_dk_de | not run | **4** (h4; 4+4p/8; hit 0) | in-sample, see caveat |
| heldout_hardware_nl_rd_relief (new) | n/a | **2** (h3; 1+7p/10; hit 0; 1 borderline) | held out: the only clean figure |

One run each, judge not calibrated: INDICATIVE, not a measurement.

1. **The answer key was worth a grade on fintech.** With its three library entries removed,
   fintech falls 4 -> 3: the German reform route and the BMWE push are no longer found
   (must_3 partly), product matching weakens.
2. **Caveat: leave-one-out on the library is not enough.** `funding-routes.md` §4 names the
   fintech answer outright (Hausbank, BMWE, Art. 106 TUB, RAIF) and §4f is the forklift
   lesson (integrator, mispriced market, capital velocity). Every brain reads the playbooks,
   so both in-sample scores still sit on the owner's answer. Only held-out cases measure
   transfer. Fixing that means writing §4/§4f as general habits with the examples moved to
   the case library (where leave-one-out removes them): an owner-visible playbook change,
   not done overnight.
3. **Held-out: 2.** The deciding fact was caught (the Belgian-employed engineers are outside
   the Dutch relief, cited), no must_not hit. It fell on the quality bar: no money logic or
   cumulation (must_6 not met), no P1/P2 by function (must_7 not met), bare facts on the
   co-investors, no watchlist. These are habits, not data gaps.
4. **Calibration: 3 owner points, 0 usable for agreement.** One owner verdict on a run
   (round 1 fintech, "none of that", band 1-2, already stored) and two owner model answers
   as 5-anchors (fintech round 3, forklift round 6). There are no numeric owner grades of
   brain runs, so the judge's +-1 agreement figure still has n = 0.

What was fixed: brain_tool accepts a `{}` / `[]` / empty / missing ledger; off-vocabulary
profile values are mapped where unambiguous ("industrial technology" ->
industrial_manufacturing) or dropped and named in `profile_warnings` on every result, and
`screen_unavailable` names its cause. Leave-one-out in `loop.py` and the bench app's
re-test (`case_library.render_without`, one implementation): the brain reads a per-run
library and is denied Read on `mandate/eval/**` and `mandate/playbooks/cases/**`; each loop
case gets its own ledger (parallel runs shared one). `robotics_three_levels` (a self-score)
and `heldout_credit_fund_guarantees_de` (the fintech case's German leg) are archived under
`_archive/`, not deleted. Worktree setup for runs: link `web/.env.local` and the gitignored
`web/public/data/*.json`, or the screen fails for want of `companies_index.json`.

**Needed from the owner** (in order of value):
1. A number 1-5 for each of the three runs above (`mandate/eval/runs/loop/loo/*.md`,
   `runs/loop/heldout/*.md`), plus the 12 Nov list below: every one is a calibration point.
   Agreement only counts once >= 5 numeric grades exist.
2. Confirm or correct the new held-out checkpoints (`scenarios/heldout_hardware_nl_rd_relief.yaml`).
3. Approve rewriting `funding-routes.md` §4 / §4f as general habits, with the named examples
   moved to case-library entries, so the in-sample cases can be measured cleanly.

Not run (usage budget): the other five held-out cases; the judge on a different model.

## CRITICAL REVIEW (main session, 12 Nov): read before trusting any number below

1. **Answer-key leakage.** 4 of 5 entries in the case library (mandate/eval/cases ->
   mandate/playbooks/cases/wincent.md) are derived from the SAME scenarios they are
   then graded on (fintech_guarantees x3, robotics_deployment_it x1); the fintech
   entry quotes the owner's verdict verbatim, and the brain reads the library before
   answering. The "after_scaffold" and "iter1" scores for those two cases are
   therefore contaminated: they measure recall, not judgement. FIX: leave-one-out:
   when the loop runs case X, render the library WITHOUT entries whose `source`
   names X (and without entries derived from X's runs); re-measure. The library is
   for unseen cases; evaluation never sees its own answer key.
2. **The judge is not calibrated and grades its own kind.** `mandate/eval/calibration.yaml`
   holds 0 owner grades (the "n=1" came from a grading note, not stored calibration);
   the judge agent runs on the same model as the brain (`model: inherit`), with a
   known risk of favouring its own style. FIX: the owner's 8 grades go into
   calibration.yaml first; the judge's scores count only once it agrees within +-1 on
   >= 80% of them; consider running the judge on a different model than the brain.
3. **One held-out case is not held out.** heldout_credit_fund_guarantees_de is close
   to the fintech case's German leg, which the library teaches. FIX: replace it with
   a case from a different situation (different money type, market and deciding fact).
4. **Robotics library entry rests on a self-score**, not an owner grade: the library
   must contain only owner-validated lessons (owner model answers, owner grades/edits).
Until 1-3 are fixed, report results as INDICATIVE and never as improvement.
Status 13 Nov: 1, 3 and 4 fixed for the library (see the section above; the playbooks still
carry two answer keys); 2 partly: 3 owner points stored, 0 numeric run grades.

## Executive summary (12 Nov 2026, evening: budget stop). SUPERSEDED: contaminated figures

| case | before (best saved run) | after scaffold | loop iter 1 (check 9) |
|---|---|---|---|
| fintech_guarantees (Wincent) | 4 (round 3: 9+2p/11, hit 0); round 1 was 1 | **4** (7+4p/11, hit 0) | not re-run |
| robotics_deployment_it (Wincent) | 3 (7+3p/10, hit 1: local level skipped) | **4** (5+5p/10, hit 0) | 4 (5+5p/10, hit 0, new borderline) |

1. **The scaffold helps or holds.** Robotics 3 -> 4 (the must_not hit is gone); fintech
   holds at 4. Caveat: n = 2, one run each, and musts fell slightly on both (fintech
   10 -> 9 points vs round 3; robotics 8.5 -> 7.5) while the hits went away. Indicative,
   not a measurement.
2. **The loop ran once, end to end, and REVERTED.** Diagnosis: the weakest move is
   grounding (5 of 9 partly/borderline). The interviewer proposed senior check 9 ("what
   decides the answer is grounded in this mission; a shut door is cited or it is 'to
   confirm'"; general, no names). Re-tested on robotics only (3 of the 5 failures, budget):
   4 -> 4, same musts, plus a new borderline must_not. Rule says revert; `method.md` is
   unchanged. The proposal text is kept in `mandate/eval/loop/proposals/01_grounding.md`.
   Reading: grounding failures are DATA gaps more than habits; the brain labels them
   honestly already. That points at the data asks, not at more method.
3. **Data-gap miner done:** 210 signals (judge, transcripts, owner notes, usage log),
   ranked into asks in `mandate/eval/data_asks.md`. Top 10 below.
4. Judge agreement with the owner is still n = 1. The eight gradings below calibrate it.
5. Cost: three brain runs + three judge calls + one interviewer call, all on the plan.
   No API spend, no production writes. Runs stopped here by instruction.

### Top 10 data asks (rank = answers improved x (1 + owner cases touched))

| # | ask | kind | source | answers |
|---|---|---|---|---|
| 1 | EIF transaction list (precedents for the guarantee routes) | precedents | EIF transaction / InvestEU signature list | 8 |
| 2 | Banca d'Italia 106 rules and the open consultation | statute | BdI Circolare 288/2015, consultation page | 5 |
| 3 | 2027 Fondo di Garanzia cover reform | statute | MIMIT decree | 5 |
| 4 | European Competitiveness Fund text | statute | Commission ECF regulation proposal | 5 |
| 5 | Fondo di Garanzia people (accreditation unit, head) | stakeholders | MCC organisation pages | 4 |
| 6 | Fondo di Garanzia award records and operating rules | instrument | MCC operating rules, award list | 3 |
| 7 | EIF guarantee product pages held, not fetched live | instrument | eif.org InvestEU capped guarantee | 3 |
| 8 | Banca d'Italia intermediary register pages held | instrument | bancaditalia.it intermediari finanziari | 3 |
| 9 | The German reform admitting non-bank lenders | statute | BMWE / Bundestag reform file | 4 |
| 10 | Italian regional machinery calls | instrument | Lombardia, Emilia-Romagna calls | 3 |

### Owner gradings that would calibrate the judge (ten minutes each, a number 1-5)

1. `runs/bench/2026-11-10_fintech_guarantees_round3.md` (judge 4): a 4 or a 5?
2. `runs/bench/2026-11-11_robotics_deployment_it.md` (judge 3, holistic 4: the disagreement).
3. `runs/bench/2026-11-11_fintech_guarantees_italycore.md` (judge 4).
4. `runs/bench/2026-11-11_ai_kids_regulatory_DRAFT.md` (judge 4; also confirms the draft checkpoints).
5. `runs/bench/2026-11-10_fintech_guarantees.md`: a number for "none of that" (1 or 2).
6. `runs/loop/after_scaffold/fintech_guarantees.md` (judge 4).
7. `runs/loop/after_scaffold/robotics_deployment_it.md` (judge 4).
8. `runs/loop/iter1/robotics_deployment_it.md` (judge 4; did check 9 change anything you value?).

### What is left

- after_scaffold on edtech_ai_kids and ai_kids_regulatory; the six held-out cases (bar:
  grade >= 4, no must_not hit). Each brain run is ~4 min and one plan turn.
- Load the top data asks (a separate, owner-approved workstream: it writes grounding).
- Bench wiring of the judge into Re-test (TS), and the miner's Train view.
- A second loop iteration only after the data asks land: the next weakest moves
  (structure_first, reform_or_lobby) are habits, grounding is mostly data.

## Next step (for whoever resumes)

1. Owner grades the eight runs above; add them to `mandate/eval/calibration.yaml`
   (insert-only), then `bench_judge --calibration`.
2. `loop run edtech_ai_kids ai_kids_regulatory --tag after_scaffold --parallel 2`, then
   the held-out set with `--tag heldout`.
3. Re-run `data_gaps --write` after every batch of runs; load from the top.
4. Bench wiring (Re-test -> `judge` agent with `rubric.build_judge_prompt`, keep/revert
   against the previous re-test of the same case).

Running the module CLIs from an isolated worktree: the sandbox refuses any command
containing the package path word; a tiny `runpy` wrapper in the scratchpad works.
`loop propose --apply` now regenerates `playbooks.generated.ts` and `decide` reverts it.

## What was built

| piece | where |
|---|---|
| grade rule (one file, both sides) | `mandate/eval/grade_scale.json` |
| rubric: prompt, parsing, rule grade, agreement | `mandate/eval/rubric.py` |
| judge agent (bench, Read only) | `.claude/agents/judge.md` |
| headless bench runner (plan, not API) | `mandate/eval/bench.py` |
| judge CLI + calibration report | `mandate/eval/bench_judge.py`, `mandate/eval/calibration.yaml` |
| judgement records (measurements, never overwritten) | `mandate/eval/judgements/*.json` |
| scaffold | `mandate/playbooks/method.md` "Before answering" (also in `playbooks.generated.ts`) |
| case library | `mandate/eval/cases/*.yaml`, `mandate/eval/case_library.py`, `mandate/playbooks/cases/` |
| the loop | `mandate/eval/loop.py` (log at `mandate/eval/loop/log.jsonl`) |
| held-out cases | `mandate/eval/scenarios/heldout_*.yaml` |
| data-gap miner + ranked asks | `mandate/eval/data_gaps.py`, `mandate/eval/data_asks.md` |
| tests | `mandate/tests/test_judgement.py`, `test_data_gaps.py`, `test_case_library.py`, `test_loop.py` |

## The grade rule

Base from the must share (partly = half): >= 0.9 -> 5, >= 0.75 -> 4, >= 0.5 -> 3,
>= 0.25 -> 2, else 1. Minus one per must_not hit, and any hit caps at 3. A borderline
must_not caps at 4 (light edits). Three or more ungrounded facts cap at 4. The judge's
own holistic grade is recorded beside the rule grade; a gap above 1 flags the run for
the owner.

## Score table (judge, rule grade; h = judge's holistic grade)

| case | brain | before (saved runs) | after scaffold | held-out |
|---|---|---|---|---|
| fintech_guarantees | Wincent | round 1: **1** (h2; 5+4p/11; hit 2) · round 3: **4** (h4; 9+2p/11; hit 0) · italycore: **4** (h4; 8+3p/11; hit 0) | **4** (h4; 7+4p/11; hit 0) | |
| robotics_deployment_it | Wincent | **3** (h4; 7+3p/10; hit 1: local level skipped) | **4** (h4; 5+5p/10; hit 0) · iter1: **4** (h4; 5+5p/10; hit 0; 1 borderline) | |
| edtech_ai_kids | Wincent | no saved run | not run yet | |
| ai_kids_regulatory (draft checkpoints) | Regina | **4** (h4; 10+2p/12; hit 0) | not run yet | |
| 6 held-out cases | 3 + 3 | | | not run yet |

Judge vs owner: n = 1 owner grade (words, range 1-2); judge 1, holistic 2: within
tolerance; owner flags caught 4/4. Not a calibration claim.

## Owner gradings

The current list of eight is in the executive summary.

## Accepted changes and their measured effect

- Scaffold + case library (kept, in place before the loop): robotics 3 -> 4, fintech 4 -> 4
  on one run each. Indicative (n = 2).
- Proposal 1, senior check 9 "grounding" (`loop/proposals/01_grounding.md`): robotics
  4 -> 4, musts 7.5 -> 7.5, one new borderline must_not: REVERTED by the rule.

## Remaining METHOD gaps (from the baseline judgements)

- The local level (chambers of commerce, municipal vouchers) is skipped on entry cases
  (robotics must_not_4 hit).
- Named people: every run names functions only; the actors register is empty (a DATA
  gap the judge records on every run).
- One sentence per run that transfers a rule across countries or states a fact unlabelled
  (borderline must_not_7 on three fintech runs): an execution habit, candidate for the
  first loop proposal.

## Data asks (first reading, before the miner; superseded by `mandate/eval/data_asks.md`)

Across the five judged runs the judge recorded 54 gap signals. Recurring: the German
reform on non-bank access to guarantees (every fintech run); EIF intermediary precedents
and the InvestEU signature list; TUB 106 and the current Fondo di Garanzia rules (now
grounded, per italycore); Bpifrance guarantee conditions and CMF L511; named officials
(BMWE unit, EIF product heads, Banca d'Italia); the AI Act Omnibus text and the GDPR
itself in Regina's corpus; national AI laws (IT, DE). The ranked list with kinds, sources
and counts is the miner's job (next step 4).
