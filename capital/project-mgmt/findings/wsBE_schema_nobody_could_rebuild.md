# The four columns nobody created — and the schema that could not be rebuilt

Workstream BE, task 1. Closes the open half of workstream AG.

## What was already known and fixed elsewhere

The census failure that started this — `coverage: OperationalError: no such
column: tier` — was migration 019 never reaching the Railway volume. The volume
had run 9 of 23 migrations because `railway_cron.py` applied none and `apply.py`
accepted one id at a time. Workstream AS fixed the cron and added
`check_store_schema.py`; workstream AG made `ETL/lib/schema_state.py` the one
definition of "does this store have migration N", judged from the store's own
schema rather than from a `schema_migrations` table that travels with an
uploaded file. Both stand. Nothing here re-litigates them.

## The open half: AG's last message

> a second, independent drift: four columns exist only because someone ALTERed
> by hand.

They are, and this is the whole of them:

    funding_instruments.scheme_code
    funding_instruments.application_url
    funding_instruments.sector_mix
    funding_instruments.scheme_operators

No committed statement anywhere in this repository creates them. Not a
migration, not a `CREATE TABLE`, not one of the self-healing `ALTER TABLE ... IF
NOT EXISTS` blocks that several ETL scripts run on themselves. They exist
because somebody typed ALTER at a sqlite3 prompt against a live database.

They are load-bearing. Read out of Railway Postgres today: 759 of 1,088
instruments carry a `scheme_code` — the SA number that joins the corpus to the
state aid case register — and 969 carry a `sector_mix`.

They were invisible to the schema checks because migrations 021 and 022 do not
ALTER `funding_instruments`, they REBUILD it: `CREATE TABLE
funding_instruments_new (... scheme_code TEXT ...)`, copy, drop, rename. So a
reader of the committed DDL sees the columns declared, while the migration that
declares them can only run on a database that already has them. Every store
built from source dies at 021 with `no such column: scheme_code`.

## Verified, not assumed: it was fifteen columns, not four

Replaying `schema.sql` + every migration into an empty database was the test
that found them, and it failed three times:

| stop | error | cause |
|---|---|---|
| 012 | `no such column: c.parent_group` | `data/views.sql` selects it; 012 rebuilds the views |
| 021 | `no such column: scheme_code` | the rebuild SELECTs the four hand-ALTERed columns |
| end | no error, ten columns short | 021/022 DELETE any column not in the rebuild's list |

Eleven more columns were created only by an ETL script ALTERing itself a column
on first run — `route_status`/`_source`/`_note` (mark_offer_route.py),
`description` and the four `eligibility_*` (migrate_to_postgres.py),
`name_basis` (name_applicable_object.py), `companies.parent_group` and
`sector_rule`. Those self-heals are not wrong and they stay; what was wrong is
that they were the only thing that created the column, so "does this store have
`route_status`" was really "has anyone run mark_offer_route.py against it yet".

`route_status` is the one that reaches a founder: `corpus.ts` filters the pool
on it, so a store rebuilt from source does not serve a smaller pool, it serves a
wrong one.

## What changed

- **028** and **029** add all fifteen columns. Two migrations, not one, because
  021/022 delete anything not in their rebuild list: what arrived before the
  rebuilds must be added before them and what arrived after, after.
- **028 runs out of numeric order**, between 011 and 012. `_RUN_BEFORE` in
  apply.py is the exception list: an id records when a migration was *written*
  and its position records when it must *run*.
- **008** finally has a `.sql` file. It was the one migration that existed only
  as Python inside `apply.py`, which is why `via_fund` and `instrument_class`
  read as unexplained hand-ALTERs to everything that asks what committed DDL
  creates. The DDL now lives in the file only; `apply_008` executes it.
- **`run_sql`** in apply.py executes a migration statement by statement and
  tolerates exactly one error, `duplicate column name`. `executescript` aborts
  the whole file on the first error, so a store holding *some* of a migration's
  columns — precisely what a hand ALTER leaves behind — could never be finished
  by the runner.
- **`ETL/schema/check_schema_replay.py`**, wired into CI: builds a store from
  committed DDL alone and fails if the replay does not complete, or if it
  completes with a migration's own effect missing. It needs no corpus and no
  credentials — it builds the database it checks — so it runs in CI, where
  `check_store_schema.py` cannot.

After this the replay differs from the live corpus by exactly:

- three tables: `company_sector_llm`, `satr_staging`, `instrument_application`.

## Three tables deliberately left out

Each is created by `CREATE TABLE IF NOT EXISTS` in the single script that both
creates and consumes it. Its DDL *is* committed and there is exactly one copy of
it. Restating a twenty-nine-column staging table in a migration would produce a
second definition of the same table — the "keep these in sync" comment this repo
has been bitten by three times. A TEXT column costs nothing to state twice; a
table does. If they should move, the move is to make the *checker* read the
owning script, not to copy the DDL.

## Two things observed and not fixed here

**`check_store_schema.py`'s declared-schema reader has a false negative.** It
counts a rebuild migration's `CREATE TABLE ... _new` as declaring a column, so
the four hand-ALTERed columns never appeared in `schema_debt.json`. The debt list
recorded 17 entries and the true figure was 21. 028/029/030 and 008's new .sql
clear fourteen of them, and `schema_debt.json` falls from 17 to 3 — the three
tables above, deliberately. The false negative is left standing and recorded in
that file: replaying the DDL is what catches it, which is what
`check_schema_replay.py` does.

**AG's `ETL/lib/schema_state.py` is deleted, not merged.** Main solved the same
problem first, and differently: `apply.py` gained `all`, `--ids` and a
source-reading id guard, and `publish_corpus_census.py` imports `apply.status()`
directly. A third definition of "does this store have migration N" is the defect
that file was written to stop.

**`check_corpus_census` is red on SILENT, and the threshold is degenerate.** It
infers the expected cadence from the censuses themselves, and six censuses were
taken on one afternoon by hand, so the observed cadence is 0.0d and the limit is
0.1d. Anything older than two hours now fails. This is the same shape as the
source-window bug in task 2 — a rule inferring its own threshold from data that
the failure mode corrupts — and it should be measured over *scheduled* runs
only (`produced_by = 'etl-pipeline'`), not over every row. Not changed here:
the check's own message routes to a human, and it was outside this task.
