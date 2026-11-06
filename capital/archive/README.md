# capital/archive

Records that are not ETL code. Nothing the product, the checks, the cron or CI
reads is here; restore is `git mv`.

## corpus-ledger/ (archived 2026-11-06, E2)

The committed JSON-lines copy of the authored instrument corpus (funding
instruments, their sources, 7,471 eligibility gates, clauses, application
routes, plus `operational/brief_records.jsonl`), exported from the SQLite store
by `ETL/archive/events/load/instrument_ledger.py` with a checksum MANIFEST. It
was the only committed copy while the corpus lived in SQLite files. Since
2026-11-05 the corpus is schema `capital` in the Mandate Postgres, loaded row
for row and verified (`ETL/archive/schema/consolidate/`), with dated backups
(`make backup`, and `~/Mandate-backups/2026-11-05` with its MANIFEST.json).
The ledger is a snapshot of that moment; it is not kept current and nothing
reads it. Its CI step (`instrument_ledger.py checksums`) was removed with it.
