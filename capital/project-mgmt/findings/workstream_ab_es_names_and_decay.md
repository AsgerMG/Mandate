# Workstream AB — Spain: the name a founder reads, and the clock the inventory runs on

Two defects left by a real win. Spain's offerable inventory went 15 → 93 and its
sibling class 2.3 → 1.6 when the BDNS open-call harvest landed. Both defects are
consequences of that harvest being right, not of it being wrong.

---

## 1. The rows were named after legal citations

### The claim under test

The harvesting agent recorded that **"nothing better exists in the payload"**.
Rule Zero says to treat that as unproven and check it against the official
source, because what a fund IS comes from the register, not from the columns we
happen to hold.

### What the official source actually publishes

`--verify-source` re-fetches the BDNS detail payload live per row. The register
publishes far more than the harvest read: `descripcionLeng` (the co-official
language title), `descripcionBasesReguladoras`, `organo.nivel1/2/3`,
`sedeElectronica`, `documentos[].nombreFic` (the filename of the official
convocatoria PDF), `anuncios[].titulo`, `fondos`, `reglamento`, `objetivos`.
Two of those turned out to carry a usable name where the title did not —
`sedeElectronica` names the administrative procedure verbatim on Aragón's rows
("procedimiento número 11810 *Ayudas para actuaciones en materia de certámenes
feriales en Aragón*"), and the document filenames name the programme on several
Catalan and Galician rows.

But the decisive finding is smaller and more general:

> **The fund's name is usually inside the citation's own object clause.**

A citation is a wrapper: `<act designation> [serial] [, date] [, body], por la
que se <verb> … ⇢ THE FUND ⇠`. The claim "nothing better exists in the payload"
was wrong in the exact way Rule Zero predicts — nothing better exists in a
*different field*, and something better sat inside the field already held.

Measured over Spain's 80 code-bearing offerable rows: **41 renamed from the
object clause of their own title, 0 needed the composed fallback.** The
fallback (`purpose + body + year`, with the recipe recorded in `name_basis`) is
built and never fired, which is itself the answer to the original claim.

### Why the decision is a model and not a rule

The enacting formula is a grammatical construction, not a vocabulary. It varies
across Spanish, Catalan, Galician and Basque; across `Resolución` / `Orden` /
`Extracto` / `Acuerdo` / `Bases reguladoras` / `PROYECTO DE ORDEN`; and across
bodies that omit it entirely. A banned-word list fails silently on the first act
type nobody enumerated — the standing failure mode.

So the judgement is a model call, and it is **constrained rather than trusted**:

    is_grounded() — every content word of a proposed name must already appear
    in the register's own text for that row.

The model chooses *which* of the register's words name the fund and cannot
introduce one of its own. A translation, a paraphrase, an expanded acronym and
an invented programme title all fail the same test. It fired once in 80:
`bdns_conv_880749` was rejected for adding "colaboradoras", and that row kept
its old name rather than gaining a fabricated one.

### The second guard: never make two funds indistinguishable

Shortening a citation to its programme name is right until two calls under one
programme differ only in the clause being cut. The first run collapsed four
Igape rows to two identical names — a worse defect than the one being fixed, and
invisible to `measure_country_offerable.ts`, which scores body/text/date and not
the name.

`drop_collisions()` makes the test **comparative, not absolute**: a proposed name
may collide only where the names it replaces already collided. Anything else
keeps its old name and is reported. A visible unfixed row beats a silently
merged pair.

### Provenance, without a schema rebuild

`name_source` was left alone deliberately. Its existing vocabulary already says
the true thing — migration 022's own header defines `deterministic` as "composed
by us" and `programme_feed` as "what the funding feed itself carries" — and
extraction is the latter, composition the former. Adding a fifth value means
rebuilding the SQLite table (SQLite cannot alter a CHECK) while several agents
hold it open; that is a bigger risk than the value solves.

Instead, one nullable `name_basis TEXT` column in both stores, mirroring
`capital_type_basis`, carrying the method and the source fields per row. It
flows to Postgres automatically: `migrate_to_postgres.copy_rows` derives its
column list from SQLite rather than hard-coding it.

### Result, verified in the browser

`npx tsx scripts/show_es_rows.ts <decisions.json> <out.html> [profile]` renders
the top five rows for a Spanish founder through the real memo path
(`buildInstrumentTable` → `assessAll` → dedupe), before and after. Rendered in a
real Chrome window over CDP and looked at.

| before | after |
|---|---|
| `Resolución do 16 de decembro de 2025 do Instituto energético de galicia por la que se establecen las bases reguladoras de las ayudas para proyectos de ahorro y eficiencia en las empresas gallegas MINIMIS` | **Ayudas para proyectos de ahorro y eficiencia en las empresas gallegas MINIMIS** |
| `RESOLUCIÓNpor la que se abre la convocatoria para la concesión de subvenciones en el ámbito del comercio y de los servicios para el año 2026` | **Subvenciones en el ámbito del comercio y de los servicios para el año 2026** |
| `Resolución del 7 de mayo de 2026,de la Presidencia del ICECYL por la que se aprueba la convocatoria para la concesión de incentivos a proyectos incluidos en el Programa de Incubación Aeroespacial…` | **Incentivos a proyectos incluidos en el Programa de Incubación Aeroespacial de Castilla y León ESA BIC CyL 2026** |
| `PROYECTO DE ORDEN QUE ESTABLECEN BBRR DE LA CONCESIÓN DE AYUDAS PARA PROVISIÓN CONJUNTO DE EQUIPAMIENTO ACTIVO…` | **Ayudas para provisión conjunto de equipamiento activo e infraestructura para dotar de comunicaciones móviles 5G en zonas sin señal 4G/5G** |

Three of five rows changed for a manufacturing founder, two of five for an R&D
founder (the other three are CDTI rows, which were already named after their
programmes).

**No floor moved.** Pool 93, ES sibling class 1.6 (body+text+date 1.2), measured
out of Postgres before and after.

### Left open, deliberately

- Rows already naming their programme but published in **block capitals**
  (`PRIMERA CONVOCATORIA DEL PROGRAMA DE INCENTIVOS…`) are untouched. Re-casing
  a name that already names the object is a typography change, and doing it
  safely means deciding which words are proper nouns — a claim this pass is not
  entitled to make.
- The collision guard tests exact equality. Two Galician energy rows are now
  *nearly* identical (`…ahorro y eficiencia…MINIMIS` vs `…ahorro y eficiencia
  energética…`). They remain distinguishable, but a near-collision measure would
  be strictly better.
- The 87 pre-existing `bdns_es_ayudas__*` leaves are covered only where they
  carry a `successor_scheme` code. Those without one have no reachable official
  record and were not guessed at.

---

## 2. Spain now decays on a clock, and nothing re-ran the harvest

### Why this source is different

Every other source in the corpus goes stale on a **release**: a register
publishes a new file, `source_state.py` sees the content hash move, `renew.py`
reloads. Spain's convocatorias go stale on a **calendar**. Each row carries a
real application deadline and correctly removes itself the day it passes.

That is the source working. It is also why:

> a corpus shrinking correctly and a corpus shrinking through neglect
> look identical from the inside.

Without a repeat job Spain drifts back toward 13 offerable funds, and no test
notices.

### `ETL/terms/refresh_open_calls.py` — the re-run

The existing four stages in order, each already idempotent, wired into the
weekly Railway cron (`0 3 * * 0`, `railway_cron.py`):

- **enumerate** dedupes against the candidate file it appends to. `--since`
  looks back **60 days** for a weekly job, on purpose: a window matching the
  cadence loses every convocatoria registered while a run is in flight, and a
  missed record is invisible — not a failure, just a fund the founder never
  sees.
- **detail** never re-fetches a cached `codigoBDNS`; capped at 2000/run so a
  first run after an outage cannot sit in a container for four hours. Hitting
  the cap is a PARTIAL, and the next run resumes from the same cache.
- **load** applies the **SATR-overlap gate** — the HARD RULE before any national
  load. A call under a scheme the corpus already holds is not loaded as a second
  row; it revives the existing fully-evidenced leaf through `successor_scheme`,
  and that pass also *retracts* a successor whose call has since shut. That
  retraction is what makes repeated running safe rather than merely harmless.
- **publish** is scoped to this source's tag; insert-or-update, never deletes.
- **name** runs the pass above, because a row loaded this week and named next
  week is a legal citation in front of a founder for a week — this workstream's
  own defect, reintroduced on a timer.

Exit codes match `renew.py`, which `railway_cron.py` already knows how to read:
0 complete, 3 partial (detail hit its cap, or no `ANTHROPIC_API_KEY` for the
naming stage), 1 the corpus did not move.

### `ETL/terms/check_offerable_decay.py` — the guard for the job itself

A weekly job that silently stops running produces exactly the decay it was added
to prevent. **A re-run job cannot detect its own absence.** Two limbs:

**Limb 1 — freshness, the leading indicator.** A source is *clock-decaying* if
any of its rows carries an end date whose basis is a call deadline. That is a
property derived at run time from the data: no source and no country is named in
the logic, so a second register that starts publishing deadlines is covered the
day it lands. Each such source must have been refreshed within 10 days (weekly
cadence, tolerating one skipped run, failing on two). **This fires the first
week the job breaks — before a single row has expired, and therefore before the
founder-visible harm exists.**

**Limb 2 — level, the confirming indicator.** Offerable count per country
against `data/reference/offerable_baseline.json` (committed; records the date,
so a stale baseline is visible rather than quietly permissive), using the ONE
liveness definition via `ETL/lib/liveness.py`. Never re-implemented.

The fall must be **unexplained**. A country whose total row count fell by the
same amount lost rows to a deliberate corpus change — a delete, a rescope, a
source retired — and that is somebody's decision. What the guard catches is the
other shape: **total holds, offerable falls.** The rows are still there; the
register has moved on and we have not.

Limb 1 without limb 2 misses decay from a job that runs and returns nothing.
Limb 2 without limb 1 only speaks after founders have been underserved.

Verified by making each limb fire:

| scenario | result |
|---|---|
| healthy | exit 0 |
| refresh job past its grace window | exit 1, `bdns_es_convocatorias_abiertas: last refreshed …, the re-run job is not running, or is failing silently` |
| ES offerable 146 → 92, rows still in corpus | exit 1, `54 offerable rows lost with no corresponding corpus change (37% > 15%)` |
| ES offerable 146 → 92, 53 rows deleted from corpus | exit 0, `53 explained by rows leaving the corpus, 1 unexplained` |

`railway_cron.py` tolerates exit 3 from both new steps (a fall inside tolerance
is worth saying, not worth failing the week over) and does **not** tolerate exit
1 from the guard — unexplained decay is a finding, not weather.

One incidental fix in `railway_cron.py`: the partial summary line reported
`python3` as the partial step for any two-element argv, which names nothing.

---

## Re-baselining

`data/reference/offerable_baseline.json` is a deliberate artefact. After a load
that legitimately changes scope, run:

    python3 ETL/terms/check_offerable_decay.py --baseline

and say why in the commit message. **Do not raise the tolerance** — that is how
a guard stops guarding.
