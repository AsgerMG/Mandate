# data — the database, its backups, and the read-side SQL

Everything data-at-rest lives here. The DB itself and the caches are generated build
artifacts (gitignored); the SQL and the scope config are version-controlled.

```
db.sqlite              the built database (+ -wal/-shm sidecars) — gitignored, ~500MB
backups/               point-in-time DB snapshots — gitignored
views.sql              the v_* read views (v_events, v_company_breadth, …)
queries/               ad-hoc analytical SQL (e.g. q09_state_aid.sql)
raw/                   per-source API/HTML caches — gitignored, reproducible by ETL/extract
processed/             derived intermediates (CSV/JSONL) — gitignored
europe_scope.json      the 40-country corpus scope (the one tracked config here)
```

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
