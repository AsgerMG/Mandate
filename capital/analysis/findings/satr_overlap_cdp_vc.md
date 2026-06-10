# SATR overlap audit — CDP VC (Italy)

Compares `public_funding_events.source LIKE 'cdp_vc_%'` against `satr_staging` where `granting_country_iso2 = 'IT'`.

## Counts

| Metric | Value |
|---|---:|
| NDB rows total | 82 |
| NDB rows ≥ €100k (above SATR threshold) | 82 |
| NDB rows < €100k (likely below threshold; SATR-invisible) | 0 |
| SATR rows for IT (filtered: equity OR R&D) | 28,520 |
| **NDB rows matched in SATR (any match type)** | **18 (22.0%)** |
|   — strong (national ID) | 0 |
|   — exact name | 18 |
|   — fuzzy name | 0 |
| NDB rows unmatched | 64 (78.0%) |
| SATR rows unmatched in NDB | 28,502 |


## Decision matrix

**KEEP** — low SATR coverage. NDB scraper captures activity not classified as state aid by the granting Member State, OR our filter excludes the instrument type used. Investigate the SATR-side gap rather than retire.

Match table: [cdp_vc_matched.csv](../../data/processed/satr_overlap/cdp_vc_matched.csv)
