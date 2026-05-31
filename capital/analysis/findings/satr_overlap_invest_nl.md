# SATR overlap audit — Invest-NL (Netherlands)

Compares `public_funding_events.source LIKE 'invest_nl_%'` against `satr_staging` where `granting_country_iso2 = 'NL'`.

## Counts

| Metric | Value |
|---|---:|
| NDB rows total | 13 |
| NDB rows ≥ €100k (above SATR threshold) | 13 |
| NDB rows < €100k (likely below threshold; SATR-invisible) | 0 |
| SATR rows for NL (filtered: equity OR R&D) | 6,766 |
| **NDB rows matched in SATR (any match type)** | **1 (7.7%)** |
|   — strong (national ID) | 0 |
|   — exact name | 1 |
|   — fuzzy name | 0 |
| NDB rows unmatched | 12 (92.3%) |
| SATR rows unmatched in NDB | 6,765 |


## Decision matrix

**KEEP** — low SATR coverage. NDB scraper captures activity not classified as state aid by the granting Member State, OR our filter excludes the instrument type used. Investigate the SATR-side gap rather than retire.

Match table: [invest_nl_matched.csv](../../data/processed/satr_overlap/invest_nl_matched.csv)
