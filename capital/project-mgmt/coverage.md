# Fund intelligence coverage

Generated from the live corpus: **798 instruments**, latest active award year 2026. Regenerate with `python3 ETL/terms/coverage_report.py --md project-mgmt/coverage.md`.

Six things an analyst needs before advising on a fund. Each is present or it is not — "partly" is what hides gaps.

| What we know | Instruments | Share |
|---|---:|---:|
| Eligibility we can evaluate (2+ filters) | 763 | 96% |
| What it has actually funded | 724 | 91% |
| Where it applies | 798 | 100% |
| What it typically awards | 716 | 90% |
| How to approach it | 648 | 81% |
| Award recency on record | 771 | 97% |
| **All six** | **583** | **73%** |

## By channel

| Channel | n | All six | Mean score | Eligibility | Funds | Amount | Route | Live |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| state_aid_satr | 465 | 451 | 5.96 | 465 | 465 | 462 | 451 | 465 |
| national_dev_banks | 275 | 97 | 4.81 | 248 | 202 | 211 | 139 | 249 |
| eit | 12 | 1 | 5.08 | 12 | 12 | 1 | 12 | 12 |
| ipcei | 11 | 7 | 5.64 | 10 | 10 | 9 | 11 | 11 |
| horizon_eu_pillar_ii | 9 | 9 | 6.0 | 9 | 9 | 9 | 9 | 9 |
| horizon_eu_partnership | 9 | 4 | 5.44 | 4 | 9 | 9 | 9 | 9 |
| innovation_fund | 8 | 7 | 5.88 | 8 | 8 | 7 | 8 | 8 |
| eic | 4 | 3 | 5.25 | 3 | 4 | 3 | 4 | 3 |
| edf | 2 | 2 | 6.0 | 2 | 2 | 2 | 2 | 2 |
| chips_ju | 2 | 1 | 5.5 | 1 | 2 | 2 | 2 | 2 |
| eib | 1 | 1 | 6.0 | 1 | 1 | 1 | 1 | 1 |

Per-instrument detail lives in the coverage dashboard (coverage.json), which carries every row.
