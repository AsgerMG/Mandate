"""The capital store's schema runner: forward Postgres migrations, applied once each.

Usage:
  python3 ETL/events/load/migrations/apply.py all       bring the store up to date (cron step 1)
  python3 ETL/events/load/migrations/apply.py --check   what is pending (exit 1 if any)
  python3 ETL/events/load/migrations/apply.py --ids     are the migration files well-formed? (no store)
  python3 ETL/events/load/migrations/apply.py 034       one migration, by id

── The design, since 2026-11-05 ───────────────────────────────────────────
The store is schema `capital` of the Mandate Postgres. Its schema authority is:

  BASELINE    ETL/schema/corpus_schema.sql  (the corpus tables, translated from
              SQLite on the day of the move) and ETL/schema/postgres_schema.sql
              (the tables Postgres already served). Both describe the store as
              it stood on 2026-11-05. They are never re-run against it.
  FORWARD     ETL/schema/migrations/NNN_<what>.sql, numbered on from 033. Each
              one is plain Postgres SQL, run ONCE, in id order, in its OWN
              transaction together with its row in `schema_migrations`.

That last clause is what changed. Under SQLite a migration was a Python function
that tested for its own change first, because the DDL and its stamp were not
atomic, stamps were written by hand, and two stores could each hold half a
migration -- so `all` re-ran every one and trusted nothing. Postgres DDL is
transactional: a migration and its stamp commit together or not at all, and
there is one store. So the stamp is true by construction, and a pending
migration is simply one with no stamp.

  ids 004-032 are the SQLite lineage (the .sql files beside this script). Their
  effect is IN the baseline, and the store carries their stamps from the load.
  They are known ids -- never reported as unknown -- and never executed here.

`all` also VERIFIES: after applying, every table and column the committed DDL
declares (baseline + forward migrations, read by check_store_schema's parser)
must exist in the store, or the run fails. A pipeline that writes a week of
data into the wrong shape has made the problem bigger, so railway_cron.py runs
this first and stops if it fails. The opposite direction -- columns in the
store that no DDL declares -- is the `store_schema` guard's finding, not a
reason to stop the cron.

Writing a migration: next free id, `NNN_short_name.sql`, idempotent where cheap
(IF NOT EXISTS), never a statement that rewrites classification or encoding
values. Do not schema-qualify: the role's search_path is `capital, public`.
"""
from __future__ import annotations


# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        _sys.path.insert(0, str(_anc / "schema"))
        break
from etl_env import ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import re  # noqa: E402
import sys  # noqa: E402

#: The SQLite lineage: its files stay beside this script as history.
LINEAGE_DIR = _Path(__file__).resolve().parent
#: Forward Postgres migrations.
MIG_DIR = ROOT / "ETL" / "schema" / "migrations"
BASELINE = [ROOT / "ETL/schema/corpus_schema.sql", ROOT / "ETL/schema/postgres_schema.sql",
            ROOT / "ETL/schema/guard_verdicts.sql"]
FIRST_FORWARD = 33

_NAME = re.compile(r"^(\d{3})_[a-z0-9_]+\.sql$")

# Read by ETL/terms/publish_capital_type.py. The CHECK it mirrors is in
# corpus_schema.sql / postgres_schema.sql; kept here because that is where its
# one importer has always found it.
CAPITAL_TYPE_VALUES = (
    "grant", "loan", "guarantee", "counter_guarantee", "equity", "blended",
    "tax_credit", "recoverable_advance", "framework", "unknown",
    # Added by 026. See ETL/events/load/populate_funding_instruments.py.
    "non_financial", "undetermined",
)


def lineage_ids() -> set[str]:
    """004-032: a closed history. Not read from the files, because 026 was a
    Python-only DDL edit and never had one."""
    return {f"{n:03d}" for n in range(4, FIRST_FORWARD)}


def forward() -> dict[str, _Path]:
    """id -> file, for every forward migration on disk."""
    return {p.name[:3]: p for p in sorted(MIG_DIR.glob("*.sql"))}


def check_migration_ids() -> list[str]:
    """Every forward migration is well-named, unique, contiguous from 033, and
    does not reuse a lineage id. Reads committed files only (CI runs it)."""
    problems: list[str] = []
    files = sorted(MIG_DIR.glob("*.sql")) if MIG_DIR.exists() else []
    seen: dict[str, list[str]] = {}
    for p in files:
        m = _NAME.match(p.name)
        if not m:
            problems.append(f"{p.name}: not NNN_lower_snake.sql")
            continue
        seen.setdefault(m.group(1), []).append(p.name)
    for mig_id, names in sorted(seen.items()):
        if len(names) > 1:
            problems.append(f"id {mig_id} is used by {len(names)} files: {', '.join(names)}")
        if int(mig_id) < FIRST_FORWARD or mig_id in lineage_ids():
            problems.append(f"{names[0]}: id {mig_id} belongs to the SQLite lineage; "
                            f"forward migrations start at {FIRST_FORWARD:03d}")
    ids = sorted(int(i) for i in seen)
    gaps = [f"{n:03d}" for a, b in zip(ids, ids[1:]) for n in range(a + 1, b)]
    if ids and ids[0] != FIRST_FORWARD:
        gaps.insert(0, f"{FIRST_FORWARD:03d}..{ids[0] - 1:03d}")
    if gaps:
        problems.append(f"gap(s) in the forward sequence at: {', '.join(gaps)}")
    return problems


def applied_ids(con) -> set[str]:
    return {r[0] for r in con.execute("SELECT id FROM schema_migrations").fetchall()}


def status(con) -> tuple[list[str], list[str]]:
    """(pending, unknown). Read-only.

    `unknown` is an id the store has recorded that neither the lineage nor a
    forward file explains: DDL somebody stamped by hand, which no rebuilt store
    can reproduce."""
    have = applied_ids(con)
    fwd = forward()
    pending = [m for m in sorted(fwd) if m not in have]
    unknown = sorted(have - set(fwd) - lineage_ids())
    return pending, unknown


def apply_one(mig_id: str) -> None:
    """One migration and its stamp, in one transaction, under a lock so two
    runners cannot apply the same file concurrently."""
    from store import connect  # noqa: PLC0415
    path = forward()[mig_id]
    with connect() as con:
        con.execute("SELECT pg_advisory_xact_lock(hashtext('capital.schema_migrations'))")
        if mig_id in applied_ids(con):
            print(f"  skip {path.name} (applied while we waited)")
            return
        con.execute(path.read_text())
        con.execute("INSERT INTO schema_migrations (id) VALUES (%s)", (mig_id,))
    print(f"  applied {path.name}")


def missing_from_store(con) -> list[str]:
    """Every table/column the committed DDL declares that the store lacks."""
    from check_store_schema import declared_schema, postgres_schema  # noqa: PLC0415
    declared = declared_schema(BASELINE + sorted(MIG_DIR.glob("*.sql")))
    live = postgres_schema(con)
    out = []
    for t, cols in sorted(declared.items()):
        if t not in live:
            out.append(f"table {t}")
            continue
        out += [f"{t}.{c}" for c in sorted(cols - live[t])]
    return out


def apply_all() -> list[str]:
    from store import connect  # noqa: PLC0415
    with connect(readonly=True) as con:
        pending, unknown = status(con)
    if unknown:
        print(f"  WARNING: {len(unknown)} id(s) recorded here that no committed file "
              f"explains: {', '.join(unknown)}. Somebody applied DDL by hand.")
    for mig_id in pending:
        apply_one(mig_id)
    with connect(readonly=True) as con:
        missing = missing_from_store(con)
    if missing:
        print(f"SCHEMA INCOMPLETE: {len(missing)} declared table(s)/column(s) are not "
              f"in the store: {', '.join(missing[:20])}"
              + (" ..." if len(missing) > 20 else ""), file=sys.stderr)
        sys.exit(1)
    return pending


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("Usage: python apply.py <migration_id> | all | --check | --ids")
    arg = sys.argv[1]

    broken = check_migration_ids()
    if broken:
        for b in broken:
            print(f"MIGRATIONS BROKEN: {b}", file=sys.stderr)
        sys.exit(1)

    if arg == "--ids":
        print(f"{len(forward())} forward migration(s), well-formed and contiguous; "
              f"{len(lineage_ids())} SQLite-lineage ids absorbed into the baseline.")
        return

    from store import connect  # noqa: PLC0415
    if arg == "--check":
        with connect(readonly=True) as con:
            pending, unknown = status(con)
            n = len(applied_ids(con))
        print(f"  applied {n}, pending {len(pending)}"
              + (f": {', '.join(pending)}" if pending else ""))
        if unknown:
            print(f"  UNKNOWN (hand-applied, unreproducible elsewhere): {', '.join(unknown)}")
        sys.exit(1 if (pending or unknown) else 0)

    if arg == "all":
        applied = apply_all()
        print(f"Schema up to date ({len(applied)} applied this run"
              + (f": {', '.join(applied)}" if applied else "") + "); every declared "
              f"table and column is present.")
        return

    if arg not in forward():
        sys.exit(f"Unknown migration: {arg}. Forward migrations: {sorted(forward())}")
    apply_one(arg)


if __name__ == "__main__":
    main()
