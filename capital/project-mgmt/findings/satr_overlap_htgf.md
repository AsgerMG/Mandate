# SATR overlap audit — HTGF (Germany)

Compares `public_funding_events.source LIKE 'htgf_%'` against `satr_staging` where `granting_country_iso2 = 'DE'`.

## Counts

| Metric | Value |
|---|---:|
| NDB rows total | 857 |
| NDB rows ≥ €100k (above SATR threshold) | 857 |
| NDB rows < €100k (likely below threshold; SATR-invisible) | 0 |
| SATR rows for DE (filtered: equity OR R&D) | 29,948 |
| **NDB rows matched in SATR (any match type)** | **185 (21.6%)** |
|   — strong (national ID) | 0 |
|   — exact name | 185 |
|   — fuzzy name | 0 |
| NDB rows unmatched | 672 (78.4%) |
| SATR rows unmatched in NDB | 29,819 |


## Decision matrix

**KEEP** — low SATR coverage. NDB scraper captures activity not classified as state aid by the granting Member State, OR our filter excludes the instrument type used. Investigate the SATR-side gap rather than retire.

Match table: [htgf_matched.csv](../../data/processed/satr_overlap/htgf_matched.csv)
