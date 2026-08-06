# Workstream L-ES — per-leaf eligibility coverage for Spain

Running log. Written as findings land, not at the end.

## Baseline (2026-08-06, before any change)

Repo scoreboard `website/frontend/scripts/measure_sibling_coverage.ts` (Postgres):

```
multi-leaf regimes 53, holding 797 leaves
eligibility_text          mean class 28.7   present 29%
ALL THREE J OMITTED       mean class 18.0   uniquely IDs 36%
eligibility_text > 40 chars: 240 of 1014 instruments
  ES 3/94  3%
```

ES-only, measured on SQLite (the authoring source of truth):

```
ES  eligibility_text   leaves 88  covered 0 (0%)  mean class 88.0  uniquely IDs 0%
ES  all three          leaves 88  covered 0 (0%)  mean class 48.3  uniquely IDs 3%
```

## The shape of the Spanish corpus — read this before proposing a fix

Spain is 94 instruments, and they are not 94 comparable things:

| | leaves | covered |
|---|---|---|
| `bdns_es_ayudas` — one regime | 1 parent + **87 leaves** | 0 |
| `cdti_*` — six single-leaf regimes | 6 | 3 |

So **the entire Spanish sibling problem is one regime**, and the six CDTI rows
are single-leaf regimes that never enter a sibling class at all. Anything that
does not move `bdns_es_ayudas` does not move Spain.

Those 87 leaves were split out of the BDNS award stream by `programme_name`,
which `ETL/events/extract/extract_bdns.py` sets to the award's `convocatoria`
title. **A BDNS convocatoria is one annual CALL, not a standing programme.**
That is the single most important fact about this workstream and it is
structural, not a collection gap:

```
last_year of the 87 leaves:  2026:23  2025:30  2024:17  2023:5  2022:9  2021:3
```

Recent award years, because a call resolved in 2024 keeps paying out for years
— but the *application window* of each of those calls is a fixed few weeks.

## What the leaves already record

Of the 87 BDNS leaves: `administering_body` 24, `delivery_region` 0,
`scheme_end_date` 0, `successor_scheme` 0, `application_url` 0,
`description` 0, `scheme_code` present but **empty string on all 87** (so it is
not a usable BDNS code — title matching is the only join available).

`data/raw/bdns/bdns_ayudas.jsonl` is a pre-fix vintage of the raw extract
(still keyed `satr_sa_number`, no `programme_name`, no `region`) and carries
**no `codigoBDNS`/`numeroConvocatoria`** on the award record. Checked first per
the standing "see what the register already holds" rule — it holds no join key.

## Batch 1 — BDNS transparency API, all 87 leaves

`ETL/terms/fetch_bdns_convocatorias.py` (existed untracked in the working tree
from an earlier session, never run — no output file on disk). Committed as-is
before running so the run is reproducible.

Path: `GET /convocatorias/busqueda?descripcion=<leaf name>` -> `numeroConvocatoria`,
then `GET /convocatorias?numConv=<code>` -> structured facts. Host is the
WAF-free `infosubvenciones.es` mirror `extract_bdns.py` already uses. No
scraping, no LLM, no 403, no CAPTCHA.

**The register answers, and answers richly.** Detail payload carries
`tiposBeneficiarios`, `regiones`, `sectores`, `descripcionFinalidad`,
`instrumentos`, `presupuestoTotal`, `fechaInicioSolicitud`,
`fechaFinSolicitud`, `abierto`, `organo`, `descripcionBasesReguladoras`,
`urlBasesReguladoras`. Composed text runs 400+ chars at `confidence: high`
(6 discriminating facts) on the leaves sampled.

**And it says the calls are shut.** (running — result below)
