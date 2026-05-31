"""Idempotent migration runner.

Usage: python scripts/migrations/apply.py 004

Applies the migration only if its columns/indexes are not already present.
Logs applied migrations to schema_migrations table (auto-created).
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(__file__).parent.parent.parent / "db.sqlite"
MIG_DIR = Path(__file__).parent


def already_applied(conn: sqlite3.Connection, mig_id: str) -> bool:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        " id TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
    )
    row = conn.execute(
        "SELECT 1 FROM schema_migrations WHERE id = ?", (mig_id,)
    ).fetchone()
    return row is not None


def column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    cols = [r[1] for r in conn.execute(f"PRAGMA table_info({table})")]
    return column in cols


def apply_004(conn: sqlite3.Connection) -> None:
    """SATR columns + indexes on public_funding_events."""
    targets = [
        "satr_tm_id",
        "aid_instrument",
        "aid_objective",
        "granting_authority",
        "granting_authority_country",
    ]
    for col in targets:
        if not column_exists(conn, "public_funding_events", col):
            print(f"  ADD COLUMN {col}")
            conn.execute(f"ALTER TABLE public_funding_events ADD COLUMN {col} TEXT")
        else:
            print(f"  skip {col} (exists)")

    indexes = [
        ("idx_pfe_satr_tm_id",
         "CREATE INDEX IF NOT EXISTS idx_pfe_satr_tm_id ON public_funding_events(satr_tm_id) WHERE satr_tm_id IS NOT NULL"),
        ("idx_pfe_aid_instrument",
         "CREATE INDEX IF NOT EXISTS idx_pfe_aid_instrument ON public_funding_events(aid_instrument)"),
        ("idx_pfe_aid_objective",
         "CREATE INDEX IF NOT EXISTS idx_pfe_aid_objective ON public_funding_events(aid_objective)"),
        ("idx_pfe_granting_authority_country",
         "CREATE INDEX IF NOT EXISTS idx_pfe_granting_authority_country ON public_funding_events(granting_authority_country)"),
    ]
    for name, sql in indexes:
        print(f"  CREATE INDEX IF NOT EXISTS {name}")
        conn.execute(sql)


def apply_005(conn: sqlite3.Connection) -> None:
    """NDB-implementer columns + canonical ndb_distributor on public_funding_events."""
    targets = [
        "entrusted_entity",
        "financial_intermediaries",
        "ndb_distributor",
    ]
    for col in targets:
        if not column_exists(conn, "public_funding_events", col):
            print(f"  ADD COLUMN {col}")
            conn.execute(f"ALTER TABLE public_funding_events ADD COLUMN {col} TEXT")
        else:
            print(f"  skip {col} (exists)")
    indexes = [
        ("idx_pfe_entrusted_entity",
         "CREATE INDEX IF NOT EXISTS idx_pfe_entrusted_entity ON public_funding_events(entrusted_entity)"),
        ("idx_pfe_ndb_distributor",
         "CREATE INDEX IF NOT EXISTS idx_pfe_ndb_distributor ON public_funding_events(ndb_distributor) WHERE ndb_distributor IS NOT NULL"),
    ]
    for name, sql in indexes:
        print(f"  CREATE INDEX IF NOT EXISTS {name}")
        conn.execute(sql)


MIGRATIONS = {
    "004": apply_004,
    "005": apply_005,
}


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("Usage: python apply.py <migration_id>")
    mig_id = sys.argv[1]
    if mig_id not in MIGRATIONS:
        sys.exit(f"Unknown migration: {mig_id}. Available: {sorted(MIGRATIONS)}")

    conn = sqlite3.connect(DB_PATH)
    try:
        if already_applied(conn, mig_id):
            print(f"Migration {mig_id} already applied — re-running idempotently.")
        print(f"Applying migration {mig_id}...")
        MIGRATIONS[mig_id](conn)
        conn.execute(
            "INSERT OR REPLACE INTO schema_migrations(id) VALUES (?)",
            (mig_id,),
        )
        conn.commit()
        print(f"Migration {mig_id} applied.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
