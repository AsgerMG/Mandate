# SATR overlap audit — Bpifrance (France)

Compares `public_funding_events.source LIKE 'bpifrance_%'` against `satr_staging` where `granting_country_iso2 = 'FR'`.

## Counts

| Metric | Value |
|---|---:|
| NDB rows total | 1,003 |
| NDB rows ≥ €100k (above SATR threshold) | 1,002 |
| NDB rows < €100k (likely below threshold; SATR-invisible) | 1 |
| SATR rows for FR (filtered: equity OR R&D) | 17,778 |
| **NDB rows matched in SATR (any match type)** | **474 (47.3%)** |
|   — strong (national ID) | 0 |
|   — exact name | 474 |
|   — fuzzy name | 0 |
| NDB rows unmatched | 529 (52.7%) |
| SATR rows unmatched in NDB | 17,344 |


## Decision matrix

**KEEP** — partial overlap. NDB likely captures sub-threshold or non-state-aid activity that SATR misses.

Match table: [bpifrance_matched.csv](../../data/processed/satr_overlap/bpifrance_matched.csv)
