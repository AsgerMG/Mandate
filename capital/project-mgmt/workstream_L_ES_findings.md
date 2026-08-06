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

## Batch 2 — a defect caught in the shared loader, for every register with no `scheme_code`

While this ran, the workstream that owns Italy changed `load_scheme_text.py`'s
liveness gate from "trust the fetch record's free-text `status`" to "ask the
corpus: `scheme_end_date` against today, with the successor redirect". That is
the right test and their reasoning holds — but it is a question **the corpus
cannot answer for any register whose rows have no `scheme_code`**, because
`scheme_end_date` is derived from SATR's `caseMeasureEndDate` keyed on exactly
that. A NULL end date reads as "not expired".

Measured on Spain, with the new gate and before any fix:

```
$ python3 ETL/terms/load_scheme_text.py --country ES
loadable: 90 instruments
   ES  90   (85 of them the fetch record called closed, while the register's
             end date is still in the future)
skipped: ... 0 closed or not publishable per the register
```

**Zero refused.** It would have published the expired rules of 82
convocatorias, some shut since 2021, as current guidance — the precise outcome
the active-only rule exists to prevent, arrived at through a change that made
the gate *more* principled. Not the IT workstream's bug; a gap that only shows
where the keying assumption fails, and Spain is where it fails hardest.

**Anyone loading a register that is not SATR-keyed should check this before
`--write`.** Cheap test: `--country XX` and read the "closed or not
publishable" count. If it is 0 and your fetch records say otherwise, your end
dates are NULL and the gate is open.

### The fix: an ordered lifetime pass

`load_scheme_text.py` gains `lifetime_facts()`, a first pass that writes
`administering_body` and `scheme_end_date` through COALESCE and is deliberately
**not** gated on liveness — the inversion is the point. The active-only rule
says a closed scheme's RULES must not be shown; it does not say we must stay
ignorant that it closed. `scheme_end_date` is the column that *removes* a dead
scheme from what a brief may propose, so withholding it on a closed record is
what keeps the dead scheme in front of the founder.

It is in the same script rather than its own because correctness depends on
order — the gate cannot judge a row until the facts it judges on exist — and a
"run A then B" instruction in two files is the kind of thing that gets
forgotten once. Report-only runs overlay the pending dates so they judge on the
same facts a `--write` run would, and the Postgres mirror carries the lifetime
rows alongside the prose.

---

# L-ES2 (2026-08-06, second agent) — none of the above had reached Postgres

## The first thing measured, and it invalidates the previous section's headline

`load_scheme_text.py` writes SQLite. `measure_sibling_coverage.ts`, the product,
and every read path use Postgres. Nothing keeps them in sync, and the L-ES run
above was never mirrored. Counted on both stores, same moment, same ids:

```
                      SQLite    Postgres
ES eligibility_text      29           3
ES administering_body    85          24
ES scheme_end_date       66           0
```

So the claim "the register answers 87/87 and its text cuts the class 88.0 -> 1.9"
was true about the fetch and about SQLite, and **false about the product**, which
still had Spain at 3/94 and — the part that matters — still believed all 88
expired convocatorias were live. Reproduced against Postgres, not restated:

```
$ npx tsx website/frontend/scripts/measure_sibling_coverage.ts
  ES     3/  94  3%
```

**Rule for anyone following: a `--write` run is not a shipped run.** The only
number worth reporting is one read back out of Postgres.

## Why re-publishing was safe here, checked rather than assumed

The scoped publisher does a blind `UPDATE ... SET col = %s`, not COALESCE, so it
can overwrite a Postgres value with a SQLite NULL. Diffed all 94 ES rows across
both stores before running it:

```
                       would-CLOBBER   would-GAIN
eligibility_text                   0           26
administering_body                 0           61
scheme_end_date                    0           66
delivery_region                    0            0
```

Zero clobber on every column: for ES, SQLite is a strict superset. That is a
property of this country at this moment, not of the publisher, and the next
person should re-run the diff rather than trust this line.

## The defect that would have shipped half the fix

`publish_scheme_text_scoped.py` is the ONLY path that reaches rows a previous
load already wrote (the `--postgres` mirror in `load_scheme_text.py` only carries
ids that the same invocation just changed, so a re-run that finds everything
already loaded mirrors nothing). Its `COLUMNS` tuple listed the prose and
provenance columns, `administering_body` and `delivery_region` — and **not
`scheme_end_date`**.

For Spain that is not a rounding error, it is the entire result. 64 of the 87
BDNS leaves are convocatorias whose application window has closed; the column
that removes them from what a brief may propose is `scheme_end_date`, and it was
the one column the publisher could not carry. Running it as it stood would have
published the text and left all 64 dead calls proposable — the same failure the
`lifetime_facts()` pass was written to prevent, one layer further out.

Fixed by adding `scheme_end_date` to `COLUMNS`. The tuple's comment says it is
"deliberately short" because a wide UPDATE republishes a neighbour's work; that
reasoning is right and is why the column belongs there specifically — this
workstream writes it, in `lifetime_facts()`, so it is ours to publish.

## The join key existed, and it was in the register all along

The section above concludes "no join key to the register exists in our own
data", and that is true and was the wrong place to look. `scheme_code` is `''`
on all 87 leaves and our raw BDNS award extract carries no `codigoBDNS` — but
the convocatoria detail payload the text is already composed from carries
`ayudaEstado`, the notified aid measure the call is made under.

```
leaves carrying ayudaEstado:   85 of 87   (64 distinct SA numbers)
already held in cases.json:     0 of 64
```

`fetch_bdns_convocatorias.py` had declared `sa_number` in every record from the
start and never filled it. It fills it now. The fetcher was re-run and diffed
field by field against the previous vintage: zero changes to `status`,
`eligibility_text`, `scheme_end_date`, `confidence` or `administering_body`.

`fetch_state_aid_cases.py` could not reach these, because it selects SA numbers
from `scheme_code` on SATR children only. It now also reads `sa_number` out of
the fetch records, which is general — any national register that states the aid
measure behind its calls now reaches the case register, with no country or
scheme id in the logic. 64 Spanish cases fetched, 64 titled.

### What the case register can and cannot say about a call

```
leaves whose measure has a registered end date:   83 of 85
of the 18 undated closed calls, now datable:      17
   ... and the measure had already ended:         15
```

**Only a PAST measure end date is written, and the asymmetry is the whole
rule.** A measure that has ended proves the call has ended — a call cannot
outlive the measure authorising it. A measure still running proves nothing
about the call, because calls under it open and shut on their own schedules, so
writing its future date would state a deadline this call does not have on a row
a founder is shown.

13 leaves have a BDNS call date LATER than their measure's registered end date.
Not acted on: the call window is the more specific claim and COALESCE keeps it.
Recorded because it means the two registers disagree at the edges, and anyone
treating `caseMeasureEndDate` as exact should know that.

## Result, read out of Postgres

```
                          before      after
ES eligibility_text          3          11
ES administering_body       24          85
ES scheme_end_date           0          82   (80 of them in the past)
publishable instruments    721         635
```

Publishable-only sibling class, ES (`measure_sibling_by_country.ts`):

```
              leaves   nothing   admin_body   elig_text   all three
before            87      88.0         48.3        88.0        48.3
after              7       7.0          1.0         1.9         1.0
```

**Spain's sibling problem is closed, and almost none of it was a text problem.**
80 of its 93 leaves are convocatorias whose application window shut — the
product was proposing every one of them as live, because `scheme_end_date` is
derived from SATR keyed on a `scheme_code` these rows do not have. The 7 that
survive are separated completely by `administering_body` alone.

That is the transferable finding, and it inverts the workstream's premise. Spain
was not the corpus's worst text-coverage country. It was the corpus's worst
LIVENESS-coverage country, and text coverage was the symptom: 3% of Spanish rows
had eligibility text because 86% of Spanish rows are expired calls that should
never have been offered text in the first place. **Before fetching prose for a
country whose sibling class is huge, check what fraction of its leaves the
corpus can even date.** A register keyed on something the rows do not carry
gives NULL, and NULL reads as live.

## What is still not right, and is not being papered over

- **3 leaves are calls the register flags shut, gives no dates for, and whose
  measure is still open.** We know they are closed and cannot say when. Their
  text stays withheld and they stay publishable. There is no honest date to
  write and none was invented. They are also plausibly the opposite — a window
  the register has not published yet ("HUBS 2024-2026", "proyectos estratégicos
  de I+D 2025-2028") — which is exactly why nothing is asserted.
- **`has_text()` accepts a `description` alone**, so a record whose prose is
  withheld still counts as loadable on the strength of a title over 40 chars.
  It writes no rules, so nothing incorrect reaches a founder, but the loader's
  "loadable" count overstates. Left alone: it is shared machinery and every
  other country's numbers are quoted against the current behaviour.
- **`delivery_region` remains unpopulated and the earlier section is right**
  about why. But `Ámbito regional` in the composed text is a NUTS id on every
  live leaf (`ES22`, `ES51`, `ES11`), and the corpus has `catchment_region` /
  `catchment_regions` / `catchment_source` — the DECLARED catchment, which is
  exactly the claim `regiones` makes. That is the right home for it and it is
  the obvious next Spanish move; it belongs to whoever owns the region
  workstream, not to this one.
