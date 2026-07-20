# Brief self-improvement run

Spent **$9.78** of a $30.00 cap across 47 calls. Stopped: `completed_all_rounds`.

| Phase | Calls | $ | Input tok | Output tok | Cache read | Cache write |
|---|---|---|---|---|---|---|
| generation | 40 | 9.12 | 1463187 | 294499 | 253728 | 63432 |
| judge | 4 | 0.25 | 69018 | 2738 | 0 | 0 |
| candidate | 3 | 0.41 | 23289 | 22993 | 0 | 0 |

## Round-by-round

| Round | Aggregate | Δ vs. prior best | Accepted | Note |
|---|---|---|---|---|
| 0 (baseline) | 2.0 | — | yes | — |
| 1 | 1.933 | -0.067 | no | The AI Act Prio-1 profile shows a verdict/hinge contradiction (In Scope in the table but classification treated as open later); the Monitor-hinge rule needs to explicitly cover sectoral/Annex classification questions and require verdict consistency across the whole brief. |
| 2 | 1.8 | -0.2 | no | Briefs are asserting a definitive In Scope/Prio1 verdict for a classification-dependent instrument (e.g. AI Act high-risk status) while elsewhere still treating that same classification as unresolved, so the hinge rule needs an explicit internal-consistency clause. |
| 3 | 1.867 | -0.133 | no | The AI Act high-risk classification (Annex I / medical-device carve-out) is exactly the kind of unresolved role/activity hinge the Monitor exception already covers, but the prompt doesn't explicitly forbid giving a flat In Scope verdict while still narrating that classification as open elsewhere in the brief — so add an explicit internal-consistency guard to the deterministic-exception paragraph. |

## Outcome

No candidate beat the baseline (aggregate 2.0/5) by enough to accept. No change proposed.

## Recency coverage

Of documents ingested in the last 30 days, how many showed up in the panel's retrieved passages at any point:

- Round 0: 77/928 (8.3%)
- Round 1: 77/928 (8.3%)
- Round 2: 77/928 (8.3%)
- Round 3: 77/928 (8.3%)
