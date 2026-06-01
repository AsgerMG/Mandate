# SATR overlap audit — Almi Invest (Sweden)

Compares `public_funding_events.source LIKE 'almi_%'` against `satr_staging` where `granting_country_iso2 = 'SE'`.

## Counts

| Metric | Value |
|---|---:|
| NDB rows total | 323 |
| NDB rows ≥ €100k (above SATR threshold) | 323 |
| NDB rows < €100k (likely below threshold; SATR-invisible) | 0 |
| SATR rows for SE (filtered: equity OR R&D) | 3,589 |
| **NDB rows matched in SATR (any match type)** | **40 (12.4%)** |
|   — strong (national ID) | 0 |
|   — exact name | 40 |
|   — fuzzy name | 0 |
| NDB rows unmatched | 283 (87.6%) |
| SATR rows unmatched in NDB | 3,549 |


## Decision matrix

**KEEP** — low SATR coverage. NDB scraper captures activity not classified as state aid by the granting Member State, OR our filter excludes the instrument type used. Investigate the SATR-side gap rather than retire.

Match table: [almi_matched.csv](../../data/processed/satr_overlap/almi_matched.csv)
