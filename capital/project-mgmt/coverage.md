# Fund intelligence coverage

Generated from the live corpus: **724 instruments**, latest active award year 2026. Regenerate with `python3 ETL/terms/coverage_report.py --md project-mgmt/coverage.md`.

Six things an analyst needs before advising on a fund. Each is present or it is not — "partly" is what hides gaps.

| What we know | Instruments | Share |
|---|---:|---:|
| Eligibility we can evaluate (2+ filters) | 689 | 95% |
| What it has actually funded | 558 | 77% |
| Where it applies | 724 | 100% |
| What it typically awards | 642 | 89% |
| How to approach it | 468 | 65% |
| Still awarding | 508 | 70% |
| **All six** | **307** | **42%** |

## By channel

| Channel | n | All six | Mean score | Eligibility | Funds | Amount | Route | Live |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| state_aid_satr | 465 | 262 | 5.5 | 465 | 465 | 462 | 349 | 353 |
| national_dev_banks | 201 | 15 | 3.6 | 174 | 39 | 137 | 61 | 111 |
| eit | 12 | 1 | 4.42 | 12 | 9 | 1 | 12 | 7 |
| ipcei | 11 | 2 | 5.0 | 10 | 10 | 9 | 11 | 4 |
| horizon_eu_pillar_ii | 9 | 9 | 6.0 | 9 | 9 | 9 | 9 | 9 |
| horizon_eu_partnership | 9 | 4 | 5.44 | 4 | 9 | 9 | 9 | 9 |
| innovation_fund | 8 | 7 | 5.88 | 8 | 8 | 7 | 8 | 8 |
| eic | 4 | 3 | 5.25 | 3 | 4 | 3 | 4 | 3 |
| edf | 2 | 2 | 6.0 | 2 | 2 | 2 | 2 | 2 |
| chips_ju | 2 | 1 | 5.0 | 1 | 2 | 2 | 2 | 1 |
| eib | 1 | 1 | 6.0 | 1 | 1 | 1 | 1 | 1 |

Per-instrument detail lives in the coverage dashboard (coverage.json), which carries every row.
