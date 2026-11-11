-- The dead weight's exit (mandate/ops/archive_dead_weight.sh; data_audit.md slimming 2 and 4).
-- Each table was exported to the bucket as archive/2026-11/<table>.csv.gz, verified by
-- read-back (sha256 and row count), and recorded in mandate/ops/archives.json
-- before this ran. Restore: download, gunzip, COPY FROM into the DDL in git history.
DROP TABLE IF EXISTS "classify_audit";
DROP TABLE IF EXISTS "company_sector_llm";
DROP TABLE IF EXISTS "_reconcile_20261105_sqlite_gates";
DROP TABLE IF EXISTS "brief_records";
