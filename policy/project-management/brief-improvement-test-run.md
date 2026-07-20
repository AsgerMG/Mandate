# Brief self-improvement run

Spent **$9.09** of a $9.00 cap across 49 calls. Stopped: `budget_exhausted`.

| Phase | Calls | $ | Input tok | Output tok | Cache read | Cache write |
|---|---|---|---|---|---|---|
| generation | 32 | 8.60 | 87074 | 251250 | 205714 | 1201444 |
| judge | 15 | 0.22 | 62030 | 2298 | 0 | 0 |
| candidate | 2 | 0.28 | 15566 | 15362 | 0 | 0 |

## Round-by-round

| Round | Aggregate | Δ vs. prior best | Accepted | Note |
|---|---|---|---|---|
| 0 (baseline) | 1.833 | — | yes | — |
| 1 | 1.75 | -0.083 | no | The lowest-scoring profile revealed that citations are often generic background documents rather than precise support for the specific claim, and obligations tied to a narrow status (e.g., GPAI supervision) get applied without confirming the company actually holds that status — so add an explicit citation-precision and scope-matching rule. |
| 2 | — | — | no | budget_exhausted |

## Outcome

No candidate beat the baseline (aggregate 1.833/5) by enough to accept. No change proposed.

## Recency coverage

Of documents ingested in the last 30 days, how many showed up in the panel's retrieved passages at any point:

- Round 0: 80/928 (8.6%)
- Round 1: 80/928 (8.6%)
