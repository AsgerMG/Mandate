# Archived fixtures

Moved here by E2 on 2026-11-06, out of `web/fixtures/`.

| file | what it was | evidence it is unreached |
|---|---|---|
| `gate1_holdout.json` (11 MB) | the gate-1 candidate lists for the holdout split, frozen so gate 2 (the LLM ranker) could be measured offline | read only by `scripts/archive/diag_gate2.ts` and `measure_gate2.ts`, both archived; built by `scripts/archive/build_gate1_fixture.ts` |
| `gate2_history.jsonl` | the run log `measure_gate2.ts` appended to | read and written only by `measure_gate2.ts` |
| `pipeline_history.jsonl`, `pipeline_last_run*.json` | outputs of a pipeline bench from before the memo route | named by no tracked file |

The three gate scripts were repointed at `archive/fixtures/`, so they still run
by hand from `web/`.
