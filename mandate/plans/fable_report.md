# Fable mission report: the senior-judgement loop

Branch `fable-judgement-loop` (worktree, never merged to main). Kept current as the work
goes; a later session resumes from "Next step" below. Mission: `fable_mission.md`.

## Executive summary (12 Nov 2026, in progress)

1. A judge now grades a brain's answer the owner's way, on the bench, no API spend:
   each must met / partly / not met, each must_not avoided / borderline / hit, every
   ungrounded fact, every data gap, a 1-5 grade from ONE rule (`grade_scale.json`).
2. On the only owner-graded run (fintech round 1, "none of that"), the judge gave 1
   (holistic 2) and caught all four owner flags: Germany and Italy musts not met, the
   partner-bank and park-Italy must_nots hit. Agreement is n=1: not calibrated yet;
   the gradings that would calibrate it are listed below (eight runs, ten minutes each).
3. Baseline, judged as the runs were: fintech round 3 = 4, italycore = 4, robotics = 3
   (one must_not hit: the local level skipped), ai_kids draft = 4. Round 1 = 1.
4. The senior reasoning scaffold is in `method.md` ("Before answering": eight checks,
   no country or company names), read by both brains and shown to the judge.
5. A case library exists: five owner-grounded war stories (`mandate/eval/cases/*.yaml`)
   rendered into `mandate/playbooks/cases/<brain>.md`, which the brains read first;
   lexical retrieval for when it outgrows one read. Regina has no owner-graded case yet.
6. The loop is a CLI (`mandate/eval/loop.py`): run -> judge -> table -> diagnose ->
   propose one change (interviewer) -> decide keep/revert by measured effect, logged.
7. Six held-out cases are written (3 per brain), from the method only; not yet run.
8. Not yet done: the "after" runs of the four known cases, the held-out runs, one loop
   iteration, the data-gap miner, the bench (TS) wiring of the judge into Re-test.
9. Budget note: brain runs are the expensive step (10-20 tool calls plus web each);
   everything measured so far cost five judge calls.

## Next step (for whoever resumes)

1. `PYTHONPATH=. python3 -m mandate.eval.loop run fintech_guarantees robotics_deployment_it edtech_ai_kids ai_kids_regulatory --tag after_scaffold --parallel 4`
   (four brain runs + four judge calls; ~15 min wall). Then `loop table`.
2. `loop diagnose --tag after_scaffold`, `loop propose --tag after_scaffold --apply`,
   re-run the affected cases with `--tag iter1`, `loop decide --proposal 1 --before after_scaffold --after iter1`.
3. Held-out: `loop run heldout_credit_fund_guarantees_de heldout_deeptech_fr_series_a heldout_uk_scaleup_eu_plant --tag heldout`
   then the three Regina ones. Bar: grade >= 4, no must_not hit.
4. Data-gap miner (`mandate/eval/data_gaps.py`, not written): mine `(unverified)`,
   `[wN]` official hosts, "none found", empty tool results and judge `data_gaps` across
   runs/bench, runs/loop, judgements and `web/.bench/tool_calls.jsonl`; rank by answers
   and owner cases improved; a Train view in the bench. The judgement records already
   carry `data_gaps` per run (7 to 14 each), so the miner is an aggregation.
5. Bench wiring: the Re-test score step should start the `judge` agent (not the
   interviewer) with `rubric.build_judge_prompt`, parse the JUDGE line, and grade via
   `grade_scale.json` read from the repo root; add "keep / revert" against the previous
   re-test of the same case.

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
| tests | `mandate/tests/test_judgement.py`, `test_case_library.py`, `test_loop.py` |

## The grade rule

Base from the must share (partly = half): >= 0.9 -> 5, >= 0.75 -> 4, >= 0.5 -> 3,
>= 0.25 -> 2, else 1. Minus one per must_not hit, and any hit caps at 3. A borderline
must_not caps at 4 (light edits). Three or more ungrounded facts cap at 4. The judge's
own holistic grade is recorded beside the rule grade; a gap above 1 flags the run for
the owner.

## Score table (judge, rule grade; h = judge's holistic grade)

| case | brain | before (saved runs) | after scaffold | held-out |
|---|---|---|---|---|
| fintech_guarantees | Wincent | round 1: **1** (h2; 5+4p/11; hit 2) · round 3: **4** (h4; 9+2p/11; hit 0) · italycore: **4** (h4; 8+3p/11; hit 0) | not run yet | |
| robotics_deployment_it | Wincent | **3** (h4; 7+3p/10; hit 1: local level skipped) | not run yet | |
| edtech_ai_kids | Wincent | no saved run | not run yet | |
| ai_kids_regulatory (draft checkpoints) | Regina | **4** (h4; 10+2p/12; hit 0) | not run yet | |
| 6 held-out cases | 3 + 3 | | | not run yet |

Judge vs owner: n = 1 owner grade (words, range 1-2); judge 1, holistic 2: within
tolerance; owner flags caught 4/4. Not a calibration claim.

## Owner gradings that would calibrate the judge (in this order)

Grade in the bench (Train, Grade runs); ten minutes each; the number matters more than
the prose:
1. `2026-11-10_fintech_guarantees_round3.md` (judge 4): is this a 4 or a 5?
2. `2026-11-11_robotics_deployment_it.md` (judge 3, holistic 4: the one disagreement).
3. `2026-11-11_fintech_guarantees_italycore.md` (judge 4).
4. `2026-11-11_ai_kids_regulatory_DRAFT.md` (expert, module 7; also confirms the draft checkpoints).
5. `2026-11-10_fintech_guarantees.md`: a number for "none of that" (1 or 2).
6-8. The three Wincent held-out runs once they exist (also confirms their checkpoints).
With these the agreement figure has n = 8 and the rule's thresholds can be tuned once.

## Accepted changes and their measured effect

None measured yet. The scaffold and the case library are in place but their effect is
the "after scaffold" column, not yet run.

## Remaining METHOD gaps (from the baseline judgements)

- The local level (chambers of commerce, municipal vouchers) is skipped on entry cases
  (robotics must_not_4 hit).
- Named people: every run names functions only; the actors register is empty (a DATA
  gap the judge records on every run).
- One sentence per run that transfers a rule across countries or states a fact unlabelled
  (borderline must_not_7 on three fintech runs): an execution habit, candidate for the
  first loop proposal.

## Data asks (first reading from the judge's `data_gaps`, before the miner)

Across the five judged runs the judge recorded 54 gap signals. Recurring: the German
reform on non-bank access to guarantees (every fintech run); EIF intermediary precedents
and the InvestEU signature list; TUB 106 and the current Fondo di Garanzia rules (now
grounded, per italycore); Bpifrance guarantee conditions and CMF L511; named officials
(BMWE unit, EIF product heads, Banca d'Italia); the AI Act Omnibus text and the GDPR
itself in Regina's corpus; national AI laws (IT, DE). The ranked list with kinds, sources
and counts is the miner's job (next step 4).
