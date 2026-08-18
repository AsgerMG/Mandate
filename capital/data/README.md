# data — the database, its backups, and the read-side SQL

Everything data-at-rest lives here, and **only** that. This directory is the CORPUS:
generated, matched whole by `.gitignore` (a bare `data` at line 57), and mounted from a
Railway volume at `/app/data` in the ETL image. Nothing under it reaches the container by
being committed — `railway up` applies `.gitignore` to the upload, so a file placed here
travels only if a human copies it onto the volume.

Committed input that CODE reads therefore lives in **`reference/`** at the repo root, not
here. Putting one here stopped the weekly ETL for three days on 2026-08-16; see
`reference/README.md` and `project-mgmt/findings/wsHU_etl_stopped/`.

```
db.sqlite              the built database (+ -wal/-shm sidecars) — gitignored, ~500MB
backups/               point-in-time DB snapshots — gitignored
views.sql              the v_* read views (v_events, v_company_breadth, …)
queries/               ad-hoc analytical SQL (e.g. q09_state_aid.sql)
raw/                   per-source API/HTML caches — gitignored, reproducible by ETL/extract
processed/             derived intermediates (CSV/JSONL) — gitignored
```

Some files here are force-added past the ignore rule — the read-side SQL, the authored
`instrument_terms/` YAML, and the caches the pipeline itself writes and re-reads. They all
belong to this store. None of them is read by a module the weekly cron imports, which is
the line `ETL/schema/check_cron_image_inputs.py` enforces.

## Read side vs write side

This folder is the **read side** of the database: `views.sql` and `queries/` query the DB,
they don't define or migrate it.

The **write side** — `schema.sql` and the numbered `migrations/` (including
`007_perf_indexes.sql`, the performance indexing) — lives in **`ETL/load/`**. Those are DDL
applied *by* the load stage and are wired into the ETL path bootstrap
(`ETL/events/load/migrations/apply.py` discovers `ETL/lib/etl_env.py` by walking up its ancestors),
so they stay with the loaders that run them.

## Common operations

```bash
# Reinstall the read views after a schema/source change (also done by `make data`):
sqlite3 data/db.sqlite < data/views.sql        # = make views

# Apply a migration (idempotent):
python3 ETL/events/load/migrations/apply.py 007

# Back up the DB + caches to local + iCloud:
make backup                                     # = python3 ETL/events/load/backup.py
```

`db.sqlite` is never committed (exceeds GitHub's 100MB limit); it is rebuilt by the ETL
pipeline from `raw/` and backed up separately. Paths are defined once in
`ETL/lib/etl_env.py` (`DB`, `DATA`, …) and `website/build/lib/web_env.py` (`DB`, `VIEWS_SQL`) —
never hardcode `data/db.sqlite` in a script; import it.
