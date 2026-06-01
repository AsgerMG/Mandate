# SATR overlap audit — CDTI (Spain)

Compares `public_funding_events.source LIKE 'cdti_%'` against `satr_staging` where `granting_country_iso2 = 'ES'`.

## Counts

| Metric | Value |
|---|---:|
| NDB rows total | 1,880 |
| NDB rows ≥ €100k (above SATR threshold) | 1,794 |
| NDB rows < €100k (likely below threshold; SATR-invisible) | 86 |
| SATR rows for ES (filtered: equity OR R&D) | 0 |
| **NDB rows matched in SATR (any match type)** | **0 (0.0%)** |
|   — strong (national ID) | 0 |
|   — exact name | 0 |
|   — fuzzy name | 0 |
| NDB rows unmatched | 1,880 (100.0%) |
| SATR rows unmatched in NDB | 0 |


## Decision matrix

**KEEP** — low SATR coverage. NDB scraper captures activity not classified as state aid by the granting Member State, OR our filter excludes the instrument type used. Investigate the SATR-side gap rather than retire.

Match table: [cdti_matched.csv](../../data/processed/satr_overlap/cdti_matched.csv)
