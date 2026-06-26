# SATR overlap audit — Enterprise Ireland

Compares `public_funding_events.source LIKE 'enterprise_ireland_%'` against `satr_staging` where `granting_country_iso2 = 'IE'`.

## Counts

| Metric | Value |
|---|---:|
| NDB rows total | 6 |
| NDB rows ≥ €100k (above SATR threshold) | 6 |
| NDB rows < €100k (likely below threshold; SATR-invisible) | 0 |
| SATR rows for IE (filtered: equity OR R&D) | 1,480 |
| **NDB rows matched in SATR (any match type)** | **0 (0.0%)** |
|   — strong (national ID) | 0 |
|   — exact name | 0 |
|   — fuzzy name | 0 |
| NDB rows unmatched | 6 (100.0%) |
| SATR rows unmatched in NDB | 1,480 |


## Decision matrix

**KEEP** — low SATR coverage. NDB scraper captures activity not classified as state aid by the granting Member State, OR our filter excludes the instrument type used. Investigate the SATR-side gap rather than retire.

Match table: [enterprise_ireland_matched.csv](../../data/processed/satr_overlap/enterprise_ireland_matched.csv)
