# SATR overlap audit — Coparion (Germany)

Compares `public_funding_events.source LIKE 'coparion_%'` against `satr_staging` where `granting_country_iso2 = 'DE'`.

## Counts

| Metric | Value |
|---|---:|
| NDB rows total | 52 |
| NDB rows ≥ €100k (above SATR threshold) | 52 |
| NDB rows < €100k (likely below threshold; SATR-invisible) | 0 |
| SATR rows for DE (filtered: equity OR R&D) | 29,948 |
| **NDB rows matched in SATR (any match type)** | **14 (26.9%)** |
|   — strong (national ID) | 0 |
|   — exact name | 14 |
|   — fuzzy name | 0 |
| NDB rows unmatched | 38 (73.1%) |
| SATR rows unmatched in NDB | 29,934 |


## Decision matrix

**KEEP** — low SATR coverage. NDB scraper captures activity not classified as state aid by the granting Member State, OR our filter excludes the instrument type used. Investigate the SATR-side gap rather than retire.

Match table: [coparion_matched.csv](../../data/processed/satr_overlap/coparion_matched.csv)
