# Workstream AL — the corpus has no owner

WIP. Started 2026-08-07.

## Confirmed before doing anything

`corpus_census` in Postgres, all five rows, read directly:

| # | taken | produced_by | companies | events | capital | instruments | gates | frameworks | outcome |
|---|-------|-------------|-----------|--------|---------|-------------|-------|-----------|---------|
| 1 | 16:08 | local | 151,426 | 297,933 | €352.85B | 1,076 | 6,368 | 8 | unknown |
| 2 | 16:26 | local | 151,426 | 297,933 | €352.85B | 1,084 | 6,368 | 8 | ok |
| 3 | 16:52 | image-equivalent | 151,426 | 297,933 | €352.85B | 1,084 | 6,368 | 8 | ok |
| 4 | 17:51 | **etl-pipeline** | 150,868 | 299,384 | **€408.43B** | **322** | **4,018** | **10** | failed at refresh_open_calls.py |
| 5 | 18:52 | proof-local | 151,426 | 297,933 | €352.85B | 1,086 | 6,368 | 8 | unknown |

Row #4 is the only one produced inside the Railway container, against the volume's
SQLite. Every other row is the laptop's `data/db.sqlite`. The premise holds.

Row #4 also carries `coverage: OperationalError: no such column: tier` — migration
020 never reached the volume.

Note the volume has MORE frameworks (10 vs 8) as well as fewer instruments, so the
instrument divergence is not purely one-directional either. To be verified.

