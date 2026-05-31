# SATR overlap audit — Tesi (Finland)

Compares `public_funding_events.source LIKE 'tesi_%'` against `satr_staging` where `granting_country_iso2 = 'FI'`.

## Counts

| Metric | Value |
|---|---:|
| NDB rows total | 99 |
| NDB rows ≥ €100k (above SATR threshold) | 99 |
| NDB rows < €100k (likely below threshold; SATR-invisible) | 0 |
| SATR rows for FI (filtered: equity OR R&D) | 2,806 |
| **NDB rows matched in SATR (any match type)** | **53 (53.5%)** |
|   — strong (national ID) | 0 |
|   — exact name | 53 |
|   — fuzzy name | 0 |
| NDB rows unmatched | 46 (46.5%) |
| SATR rows unmatched in NDB | 2,753 |


## Decision matrix

**KEEP** — partial overlap. NDB likely captures sub-threshold or non-state-aid activity that SATR misses.

Match table: [tesi_matched.csv](../../data/processed/satr_overlap/tesi_matched.csv)
