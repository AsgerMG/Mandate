# SATR overlap audit — Bpifrance (France)

Compares `public_funding_events.source LIKE 'bpifrance_%'` against `satr_staging` where `granting_country_iso2 = 'FR'`.

## Counts

| Metric | Value |
|---|---:|
| NDB rows total | 10 |
| NDB rows ≥ €100k (above SATR threshold) | 10 |
| NDB rows < €100k (likely below threshold; SATR-invisible) | 0 |
| SATR rows for FR (filtered: equity OR R&D) | 18,305 |
| **NDB rows matched in SATR (any match type)** | **0 (0.0%)** |
|   — strong (national ID) | 0 |
|   — exact name | 0 |
|   — fuzzy name | 0 |
| NDB rows unmatched | 10 (100.0%) |
| SATR rows unmatched in NDB | 18,305 |


## Decision matrix

**KEEP** — low SATR coverage. NDB scraper captures activity not classified as state aid by the granting Member State, OR our filter excludes the instrument type used. Investigate the SATR-side gap rather than retire.

Match table: [bpifrance_matched.csv](../../data/processed/satr_overlap/bpifrance_matched.csv)
