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

### Result: 87/87 matched, 0 not-found, 0 errors — and 82 of 87 are CLOSED

```
open=5  closed=82  nomatch=0  error=0
```

A 100% match rate. The register knows every single leaf, because every leaf
*is* one of its convocatorias.

### The text is NOT regime boilerplate — it is the best discriminator on the project

Scored on the fetched records before loading anything, over all 87 leaves:

```
                              mean class   uniquely IDs   distinct values
full composed text                  1.9         71%            69 / 87
  same, with the dates stripped     1.9         71%
organo.nivel3 (admin body)          6.8         17%            32 / 87
fechaFinSolicitud (end date)        6.2         59%
"Beneficiarios:" line alone        45.3          2%             6 / 87
baseline (nothing recorded)        88.0          0%             1 / 87
```

**88.0 -> 1.9.** Better than Germany's 3.8. And it is not an artefact of the
per-vintage dates: strip the `Plazo de solicitud` sentence and it is still 1.9.

The one part that IS boilerplate is the beneficiary enumeration — 6 distinct
values across 87 leaves, mean class 45.3, i.e. it separates almost nothing.
The fetcher already refuses to count it toward confidence, and that judgement
is now measured rather than asserted.

**So for Spain the source is right and the recipe works.** Report to the other
registers: a national call register that serves per-call structured JSON is the
correct source, and the discriminating fields are purpose / sector / budget /
window / regulatory basis — *not* the beneficiary-type enumeration, which every
call in the register shares.

### The blocker is not text. It is that 82 of the 87 leaves are expired calls.

This is the corpus-composition finding the fetcher's own docstring predicted.
`bdns_es_ayudas` was split by convocatoria title, and a convocatoria is one
annual call with a submission window of a few weeks. The standing active-only
rule therefore forbids loading 82 of the 87 texts, and it is right to: those
rules expired, some of them four years ago.

Loading text alone would have moved ES coverage 3% -> 8% and left the class at
~80. **The lever is not the text column.**

### The lever: `scheme_end_date`, which is NULL on all 88 ES leaves

The corpus already has the mechanism for this and Spain is simply not using it.
Migration `023_scheme_lifetime.sql` exists because "payments continue for years
after a scheme closes to new applicants", and `emit_peer_prior.py` /
`extend_recall_set.py` both drop rows `WHERE scheme_end_date < date('now')`
from what a brief may PROPOSE.

That filter is derived from SATR's `caseMeasureEndDate`, keyed on
`scheme_code` — and every ES BDNS leaf has `scheme_code = ''`, so **not one of
them ever got an end date, and the product currently believes all 88 expired
calls are live and proposable.**

BDNS `fechaFinSolicitud` is the same claim in the same words: the last date an
application may be submitted. Writing it is a fact the register states, not an
inference.

### What is NOT obtainable, so nobody else should go looking

- **`delivery_region` cannot be populated for ES, by either route.**
  (a) The register's `regiones` is a *different claim* — where an applicant may
  be, not where observed recipients are — and it is not a NUTS id, which is
  what the column holds (`nuts_regions.delivery_region`).
  (b) The measured route is closed too: `delivery_region` is derived from
  `satr_staging` keyed `(sa_number, granting_authority)`, ES leaves have no
  `scheme_code`, and `public_funding_events` **has no region column at all**, so
  there is no per-leaf region mix to measure. Left NULL.
- **No join key to the register exists in our own data.** `scheme_code` is the
  empty string on all 87, and `data/raw/bdns/bdns_ayudas.jsonl` carries no
  `codigoBDNS`. Title matching is the only join, and it happens to be perfect.
