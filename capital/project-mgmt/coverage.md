# Fund intelligence coverage

Generated from the live corpus: **861 instruments**, latest active award year 2026. Regenerate with `python3 ETL/terms/coverage_report.py --md project-mgmt/coverage.md`.

Six things an analyst needs before advising on a fund. Each is present or it is not — "partly" is what hides gaps.

| What we know | Instruments | Share |
|---|---:|---:|
| Eligibility we can evaluate (2+ filters) | 826 | 96% |
| What it has actually funded | 858 | 100% |
| Where it applies | 861 | 100% |
| What it typically awards | 779 | 90% |
| How to approach it | 711 | 83% |
| Award recency on record | 841 | 98% |
| **All six** | **676** | **79%** |

## By channel

| Channel | n | All six | Mean score | Eligibility | Funds | Amount | Route | Live |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| state_aid_satr | 465 | 451 | 5.96 | 465 | 465 | 462 | 451 | 465 |
| national_dev_banks | 338 | 189 | 5.26 | 311 | 335 | 274 | 202 | 319 |
| eit | 12 | 1 | 5.08 | 12 | 12 | 1 | 12 | 12 |
| ipcei | 11 | 8 | 5.73 | 10 | 11 | 9 | 11 | 11 |
| horizon_eu_pillar_ii | 9 | 9 | 6.0 | 9 | 9 | 9 | 9 | 9 |
| horizon_eu_partnership | 9 | 4 | 5.44 | 4 | 9 | 9 | 9 | 9 |
| innovation_fund | 8 | 7 | 5.88 | 8 | 8 | 7 | 8 | 8 |
| eic | 4 | 3 | 5.25 | 3 | 4 | 3 | 4 | 3 |
| edf | 2 | 2 | 6.0 | 2 | 2 | 2 | 2 | 2 |
| chips_ju | 2 | 1 | 5.5 | 1 | 2 | 2 | 2 | 2 |
| eib | 1 | 1 | 6.0 | 1 | 1 | 1 | 1 | 1 |

Per-instrument detail lives in the coverage dashboard (coverage.json), which carries every row.
