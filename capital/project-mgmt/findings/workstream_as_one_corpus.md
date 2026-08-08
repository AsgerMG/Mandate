# Workstream AS — one corpus, and the machinery that stops it splitting again

Branch `workstream-as-volume-sync`, off `main` at `425119ed`. Every store figure
below was read at the moment it was acted on, not carried over from an earlier
reading — which is the whole point, because the last time these numbers were
compared across a gap of an hour the difference was reported as growth.

**The volume now holds the merged corpus.** 1,088 instruments, verified by
readback, with the pre-push volume kept as a backup that was opened and counted
before anything was written.

---

## 1. What was actually true at 11:04 UTC on 2026-08-08

`push_db_verified.py` proved this from the two files as they stood, table by
table and key by key, before it uploaded anything:

| table | laptop | volume | rows the volume had and the laptop did not |
|---|---:|---:|---:|
| classify_audit | 420,416 | 420,416 | 0 |
| companies | 163,538 | 162,982 | 0 |
| company_sector_llm | 156,100 | 156,100 | 0 |
| eligibility_clauses | 893 | 893 | 0 |
| eligibility_gates | 6,401 | 4,018 | 0 |
| funding_instrument_sources | 980 | 885 | 0 |
| funding_instruments | **1,088** | **322** | 0 |
| private_funding_events | 0 | 0 | 0 |
| public_equity_stakes | 5,570 | 5,570 | 0 |
| public_funding_events | 311,355 | 311,355 | 0 |
| satr_staging | 122,814 | 122,814 | 0 |
| schema_migrations | 23 | 9 | 0 |

Two things worth reading twice. `public_funding_events` is now equal on both
sides — the union that brought the volume's 1,457 events into the laptop had
held, and the merge did not have to be repeated. And `schema_migrations`
**9 against 23**: the volume was fourteen migrations behind, which is section 3.

Pre-push backup, downloaded, `quick_check`ed and counted before the upload:
`~/Wincent-backups-20260808/volume-db-pre-push-20260808T110427Z.sqlite`,
542,175,232 bytes, 322 instruments. The readback afterwards was compared against
the uploaded file on every table and then deleted.

The cron schedule was restored and **confirmed by reading Railway back**, not by
trusting the write.

---

## 2. Why an overwrite was not the answer, in either direction

`push_local.py` ends in a bare `railway volume files upload --overwrite`, and
`pull_db.py` is the same command pointed the other way. Both are correct only
while one store is strictly ahead of the other, and nothing anywhere established
that. On 2026-08-07 neither was: a pull would have replaced 1,088 instruments
with 322, a push before the union would have destroyed 1,457 events worth
EUR 55.71B.

`ETL/events/extract/push_db_verified.py` is the same transfer with the proof in
front of it and a readback behind it:

1. wake the service, download the volume to a **dated backup**, and verify that
   backup opens and counts — a backup nobody has read back is a plan
2. prove superset: tables only the volume has, columns only the volume has that
   hold any non-NULL value, and rows whose primary key is absent locally (whole-row
   `EXCEPT` where a table has no key) — **any of them refuses the push**
3. upload
4. download again and re-run the same proof against what actually landed,
   because an upload's exit code says the bytes were sent
5. restore the cron and confirm it from Railway

When it refuses, the repair is `merge_volume_into_local.py`, a union. Nothing in
the path can make two stores agree by deleting from one.

`make push-db` is this on its own — no sources, no LLM spend.

---

## 3. Why the volume fell behind: nothing ever applied its migrations

`railway_cron.py` ran renew → classify → sanity → gaps. It never ran
`ETL/events/load/migrations/apply.py`. And it could not have in one step, because
`apply.py` only ever accepted **one migration id at a time** — bringing a
database up to date meant naming 23 migrations by hand, so on the volume nobody
ever did.

The consequence is the half-day already spent: the volume's `funding_instruments`
had no `tier` column, the census's coverage block reads `tier`, and so a missing
**column** was reported and investigated as a coverage **loss**. A missing column
is not a smaller corpus, but it reads exactly like one.

Fixed in three parts:

- `apply.py all` applies every migration in order, idempotently.
- `railway_cron.py` runs it **first, and fatally**. Every step after it writes
  into that schema; a pipeline that writes a week of data into the wrong shape
  has made the problem bigger. On an up-to-date corpus it prints a column of
  skips.
- **Two migrations were both numbered 025.** Because the second `def apply_025`
  is defined below the first, Python replaced it: `MIGRATIONS["025"]` pointed at
  `declared_catchment` and `scheme_end_date_basis` was unreachable through the
  runner on any database that had not already had it applied by hand. The live
  corpus records both `025` and `026` in `schema_migrations`, so it was applied
  out of band. Renumbered to 026, which is the id it already had.

---

## 4. The guards

### `ETL/schema/check_store_of_record.py` — one authoritative store, enforced

`ETL/schema/store_of_record.json` names the owning store for all 18 tables any
committed DDL creates. Three rules:

- **Declared.** A table with no declared owner fails. That is the moment to
  decide who owns a table, rather than a year later.
- **Ratchet.** The count still owned by SQLite may only fall. It is 11 today.
  That number *is* the migration, counted, and it cannot grow quietly.
- **Enforced.** No module that opens a SQLite connection may empty and refill a
  Postgres-owned table. This is what stops the declaration being an aspiration:
  flipping `funding_instruments` to `postgres` fails immediately, naming
  `populate_funding_instruments.py` as the write path that has not moved. Tested.

Emptying is the test, not writing. `publish_corpus_census.py` reads SQLite and
INSERTs one row per weekly run — an observation *about* a store, appended, and
Postgres is the only place it exists. Flagging it would have said the census was
the reason Postgres was not authoritative, which is backwards: the census is how
anyone can see that it is.

Separately, the ability to replace a whole store is a declared capability, with
whether the module proves first. Four hold it: `push_db_verified` proves,
`pull_db_side` refuses to target the corpus, `pull_db` and `push_local` do
neither. A module acquiring it without being listed fails.

The first version of this detector matched the strings `volume files` and
`--overwrite` in raw source. It found *itself* — its own docstring names them —
and **missed `push_local.py` and `pull_db.py`**, whose argv is a list where those
two words are never adjacent. It now strips docstrings and comments before
scanning and matches on `@railway/cli`. Prose is not a capability.

### `ETL/schema/check_store_schema.py` — no two stores disagree about a table

Two questions, because they fail differently.

**Between stores**, no baseline and no tolerance: any table two stores both hold
must have the same columns in both. This is the one that bit. It runs on the
weekly cron as the `store_schema` guard, inside the container, so the corpus it
reads is the one the cron actually writes, and it publishes a verdict the
frontend asserts on without credentials.

**Against committed DDL**: every column must be creatable from source. It runs
with no store and no credentials, which is what CI has.

Its first run found **an unresolved git conflict marker committed inside
`ETL/schema/postgres_schema.sql`** — on a branch already merged to main. CI
checks that file with `test -f`, so nothing had ever read it. Regenerating it
also recovered `funding_instruments.source_window_policy` and the whole
`guard_verdicts` table, both of which the stale snapshot had lost.

The `store_schema` verdict is published and green: verdict #32, 2026-08-08 11:25
UTC, code `629c7d5d49aeb722`.

### Found while registering it, and not this workstream's to fix

**The guard feed is 404 in production.** `website/frontend/app/api/guards/route.ts`
is on `main` (commit `61878e0a`) and `https://euro-inv-tracker.vercel.app/api/guards`
returns 404 while the site itself returns 200 — Vercel has not deployed `main`
since that commit. `check_verdicts.ts` therefore fails for every branch, at
feed-read time, before it examines a single guard:

> This is the only channel between the guards that hold credentials and anything
> that does not.

So every verdict published by every guard — the census, the three cron guards,
the four frontend ones, and now `store_schema` — is currently unreadable by
anything without `DATABASE_URL`. This predates and is independent of this
workstream (the failure happens before the registry is consulted, so it is
identical with and without the new guard), but it means the enforcement channel
this repo has built is dark until the site is deployed.

---

## 5. The finding that outlives this workstream: no store is rebuildable

`apply.py all` against an empty database seeded from `schema.sql` **dies at
migration 012**: `data/views.sql` references `companies.parent_group`, a column
no committed migration creates. Production cannot be rebuilt from source.

17 items are in that position — 14 columns and 3 tables — recorded in
`ETL/schema/schema_debt.json` with a budget that may only shrink. Clearing one
means writing its migration and lowering the budget by one; the check fails both
if the list grows and if an entry stops being true without the budget moving.

This is why "the volume is behind" was invisible. There was no definition of what
a correct store looks like, so there was nothing for a store to be behind *of*.

---

## 6. Postgres as the single source of truth: the map, and the sequence

The instruction — *"keep the cloud one as the source of truth moving forward"* —
is further away than the framing suggested, and in a specific direction worth
stating plainly.

**Postgres does not hold the corpus.** It holds 12 tables: the five product
tables (`funding_instruments`, `funding_instrument_sources`, `eligibility_gates`,
`eligibility_clauses`, `instrument_application`), two derived pgvector indexes,
and five product/telemetry tables. `companies` and `public_funding_events` — 163k
and 311k rows, the actual corpus — **do not exist in Postgres at all.**

And for the five it does hold, `migrate_to_postgres.py` `TRUNCATE`s them and
reloads from the laptop's SQLite on every publish. So the laptop is the store of
record for them *in fact*, whatever anyone intends, and Postgres is a replica
that one publish from a stale laptop rolls back.

### What converts cleanly, and what does not

Cheap, mechanical: `INSERT OR IGNORE` → `ON CONFLICT DO NOTHING` (24 sites),
`INSERT OR REPLACE` (4), `AUTOINCREMENT` → `IDENTITY` (17 DDL sites),
`GROUP_CONCAT` → `string_agg` (47 sites — but `GROUP_CONCAT(DISTINCT x)` takes no
separator in SQLite and does in Postgres, and `classify.py:753` documents a
dependency on result ORDER, which is undefined in both and must become an
explicit `ORDER BY`).

Expensive, and the real cost:

- **Connection sprawl.** 140 of 195 ETL modules call `sqlite3.connect` directly.
  There is no data-access layer. A connection factory in `etl_env.py` and
  `web_env.py` is the prerequisite for everything else.
- **Postgres has no schema history.** SQLite has 23 numbered migrations and a
  runner; Postgres has ~30 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements
  inside `migrate_to_postgres.py` that run on every publish, plus a generated
  snapshot. A real Postgres migration runner has to exist before Postgres can be
  authoritative for anything.
- **`migrate_to_postgres.py` regex-parses SQLite's `CREATE TABLE` text** to
  reconstruct CHECK constraints. Deleting SQLite deletes the source of truth for
  those enums.
- **`data/views.sql`, 9 views**, read by `corpus_kpis.py`, the site builders and
  several checks, all SQLite-only SQL (`strftime`, `julianday`).
- **Integer booleans.** Only `is_framework` is coerced today. Every KPI predicate
  is `= 0` / `= 1` (`is_duplicate`, `step_flagged`, `ipcei_linked`, `in_corpus`)
  and every one of them mis-types silently against a real `BOOLEAN`. This is the
  quietest breakage in the list.
- **`npm run build` → `prebuild` → `build_site_data.py` → `data/db.sqlite`.** The
  site cannot build without the SQLite file.

### The sequence, with a rollback at every stage

This is a multi-day job and should not be attempted as a cutover. Each stage
lands on its own, is independently useful, and reverts by reverting its commit.

- **Stage 0 — done, this workstream.** One corpus on the volume; the cron applies
  its migrations; both guards; the ratchet at 11.
  *Rollback:* the pre-push backup restores the volume exactly.

- **Stage 1 — clear the schema debt to zero.** Write the 17 missing migrations
  and make `apply.py all` succeed against an empty database. Nothing can be
  migrated to a store whose correct shape is undefined. Half a day.
  *Rollback:* migrations are additive and idempotent.

- **Stage 2 — a Postgres migration runner**, and delete the self-healing `ALTER`
  block from `migrate_to_postgres.py`. Move the CHECK-constraint enums out of
  regex-parsed SQLite DDL into a declarative file both engines read. One day.
  *Rollback:* the runner is additive until the ALTER block is deleted; delete it
  in a separate commit.

- **Stage 3 — the five product tables move.** Repoint `ETL/terms/*` writes at
  Postgres, delete the TRUNCATE-and-reload publish, flip the five declarations
  and drop the budget 11 → 6. The guard enforces the flip: it fails until the
  write paths have actually moved. Two to three days, and the highest-value
  stage — it is what makes the product's own store authoritative.
  *Rollback:* SQLite still holds the same rows throughout; revert the commit and
  the old publish path works unchanged.

- **Stage 4 — the events corpus.** A connection factory, dual-dialect SQL behind
  it (the `closedSql({sqlite})` pattern in `liveness.ts` is the precedent),
  `data/views.sql` ported, booleans made real, `corpus_kpis.py` repointed — it
  takes a connection already, so it is among the cheapest files here. Then the 43
  extractors, in batches. Budget 6 → 0. Several days, and it should be sequenced
  behind stage 3 rather than with it.
  *Rollback:* per-batch; the factory serves both engines throughout, so any
  batch reverts alone.

Until stage 4, `store_of_record.json` says `sqlite` for eleven tables. That is
the honest value, and the ratchet is what moves it. An entry saying `postgres`
before its write path moved would be a lie the checker enforces against the code.
