"""The store must be rebuildable from committed DDL alone.

── The failure this exists to stop ────────────────────────────────────────
Under SQLite, replaying schema.sql plus every migration into an empty database
did not produce this project's schema: it died on `no such column: scheme_code`
and, silently, came out fifteen columns short. A schema nobody can rebuild is
not a schema; it is an artefact of the order in which scripts ran against one
file.

The same was true of Postgres the day it became the only store. Its committed
DDL, ETL/schema/postgres_schema.sql, was generated from information_schema and
spelled an array column `ARRAY`, a pgvector column `USER-DEFINED`, and declared
funding_instruments.source_window_policy twice. It had been committed for three
months and could not rebuild a single one of the tables it described, because
nothing had ever replayed it.

── What it does ───────────────────────────────────────────────────────────
Builds an empty schema in a THROWAWAY Postgres, applies the baseline
(corpus_schema.sql, postgres_schema.sql, guard_verdicts.sql) and then every
forward migration in id order, exactly as a new store would get them, and
fails if any statement fails or if the result is missing a table or column the
DDL declares. Then drops the schema.

    CAPITAL_TEST_DATABASE_URL=postgres://... python3 ETL/schema/check_schema_replay.py

It never touches the configured DATABASE_URL: it refuses if pointed at it.
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        _sys.path.insert(0, str(_anc / "schema"))
        _sys.path.insert(0, str(_anc / "events" / "load" / "migrations"))
        break

import os  # noqa: E402
import uuid  # noqa: E402

import etl_env  # noqa: E402,F401


def main() -> int:
    import psycopg  # noqa: PLC0415

    import apply as runner  # noqa: PLC0415
    from check_store_schema import declared_schema, postgres_schema  # noqa: PLC0415

    url = (os.environ.get("CAPITAL_TEST_DATABASE_URL") or "").strip()
    if not url:
        print("FAILED: CAPITAL_TEST_DATABASE_URL is not set. This check builds a "
              "store, so it needs a throwaway Postgres (CI provides one).")
        return 1
    if url in {(os.environ.get(k) or "").strip() for k in
               ("DATABASE_URL", "CAPITAL_RO_DATABASE_URL")}:
        print("FAILED: CAPITAL_TEST_DATABASE_URL is the configured store.")
        return 1

    broken = runner.check_migration_ids()
    if broken:
        for b in broken:
            print(f"FAILED: {b}")
        return 1

    files = runner.BASELINE + [runner.forward()[i] for i in sorted(runner.forward())]
    schema = f"replay_{uuid.uuid4().hex[:8]}"
    fail = 0
    with psycopg.connect(url, autocommit=True) as con:
        con.execute("CREATE EXTENSION IF NOT EXISTS vector")
        con.execute(f"CREATE SCHEMA {schema}")
        try:
            con.execute(f"SET search_path = {schema}, public")
            for f in files:
                try:
                    con.execute(f.read_text())
                    print(f"  replayed {f.relative_to(runner.ROOT)}")
                except psycopg.Error as exc:
                    print(f"  FAILED   {f.relative_to(runner.ROOT)}: "
                          f"{str(exc).splitlines()[0]}")
                    return 1
            declared = declared_schema(runner.BASELINE + sorted(runner.MIG_DIR.glob("*.sql")))
            built = postgres_schema(con)
            for t, cols in sorted(declared.items()):
                if t not in built:
                    print(f"  declared table {t} was not built")
                    fail = 1
                    continue
                for c in sorted(cols - built[t]):
                    print(f"  declared column {t}.{c} was not built")
                    fail = 1
            print(f"\nreplay: {len(built)} tables built from {len(files)} files"
                  + ("" if fail else "; every declared table and column is present"))
        finally:
            con.execute(f"DROP SCHEMA {schema} CASCADE")
    return fail


if __name__ == "__main__":
    raise SystemExit(main())
