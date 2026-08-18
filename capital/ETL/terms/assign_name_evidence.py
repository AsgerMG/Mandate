"""Write `name_source` for families whose name is a mechanical re-casing of
their own id, from the declarations in reference/family_name_evidence.json.

── Why a script and not just the rebuild ─────────────────────────────────
populate_funding_instruments.py writes this column on every run, and it FAILS
the load when a family is undeclared. But that rebuild does

    DELETE FROM eligibility_gates WHERE instrument_id NOT IN (... is_framework=1)

so correcting one derived column on a corpus that already exists would cost the
encoded value_specs and the gate_role triage. This is the same trade
recompute_capital_types.py makes: reuse the rebuild's own decision function --
`declaration_for()` in ETL/lib/name_evidence.py -- and write only the column it
owns, in BOTH stores.

Both stores, always. SQLite is where the ETL works and Postgres is what the
product reads; a judgement that lands in one of them is a row the founder may or
may not see.

Usage:
  python3 ETL/terms/assign_name_evidence.py --dry-run
  python3 ETL/terms/assign_name_evidence.py --write
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402

_sys.path.insert(0, str(ROOT / "ETL" / "events" / "load"))

from name_evidence import (  # noqa: E402
    NAME_SOURCE_PARTITION_KEY, NAMES_PARTITION_KEY, declaration_for,
    undeclared_error)
from populate_funding_instruments import (  # noqa: E402
    OVERRIDE_NAMES, named_by_institution_registry, prettify)


def _load_env() -> None:
    path = ROOT / ".env.local"
    if path.exists():
        for line in path.read_text().splitlines():
            m = re.match(r"^([A-Z_]+)=(.*)$", line)
            if m:
                os.environ.setdefault(m.group(1), m.group(2).strip("\"'"))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if args.write == args.dry_run:
        raise SystemExit("choose exactly one of --write / --dry-run")

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    rows = [dict(r) for r in conn.execute(
        "SELECT id, name, name_source, parent_id, is_framework, country "
        "FROM funding_instruments")]

    # A family row is one whose id IS a family key. Children carry a `__`
    # separator and are named from the granting authority or the case register,
    # which already points at a source field.
    undeclared: set[str] = set()
    verdicts: dict[str, str] = {}
    for r in rows:
        fam = r["id"]
        if r["is_framework"] or "__" in fam or fam in OVERRIDE_NAMES:
            continue
        if named_by_institution_registry(fam):
            continue
        if r["name"] != prettify(fam):
            continue  # a later pass gave this row a real name
        d = declaration_for(fam)
        if d is None:
            undeclared.add(fam)
            continue
        verdicts[fam] = (NAME_SOURCE_PARTITION_KEY
                         if d["names"] == NAMES_PARTITION_KEY
                         else "deterministic")

    if undeclared:
        raise SystemExit(undeclared_error(sorted(undeclared)))

    buckets = sorted(i for i, v in verdicts.items()
                     if v == NAME_SOURCE_PARTITION_KEY)
    changed = [(i, v) for i, v in verdicts.items()
               if next(r["name_source"] for r in rows if r["id"] == i) != v]
    by_id = {r["id"]: r for r in rows}

    print(f"{len(rows)} instruments, {len(verdicts)} whose name is a mechanical "
          f"re-casing of their id and therefore declared")
    print(f"  named by a source field or an official publication: "
          f"{len(verdicts) - len(buckets)}")
    print(f"  partition keys -- NOT FUNDS: {len(buckets)}")
    for i in buckets:
        r = by_id[i]
        print(f"    {i:<38} {r['country'] or '--':<3} \"{r['name']}\"")
    print(f"  rows whose name_source changes: {len(changed)}")

    if args.dry_run:
        print("\ndry run: nothing written")
        return

    conn.executemany(
        "UPDATE funding_instruments SET name_source = ? WHERE id = ?",
        [(v, i) for i, v in verdicts.items()])
    conn.commit()
    print(f"\nsqlite: {len(changed)} row(s) changed "
          f"({len(verdicts)} written, the rest already correct)")

    _load_env()
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit(
            "DATABASE_URL is not set. SQLite alone is not the corpus -- the "
            "product reads Postgres, and a bucket withheld in one store only "
            "is still in front of a founder.")
    import psycopg2  # noqa: PLC0415 — optional dep, only the write path needs it
    pg = psycopg2.connect(url)
    with pg, pg.cursor() as cur:
        cur.execute("ALTER TABLE funding_instruments ADD COLUMN IF NOT EXISTS "
                    "name_source TEXT NOT NULL DEFAULT 'deterministic'")
        # Postgres carries its own CHECK on this column, invisible in the
        # committed postgres_schema.sql, and it rejected the first write of
        # `partition_key` outright. Widened here as well as in migration 032, so
        # a corpus that has had the migration and a corpus that has only had
        # this script end up in the same shape.
        cur.execute("ALTER TABLE funding_instruments DROP CONSTRAINT IF EXISTS "
                    "funding_instruments_name_source_check")
        cur.execute(
            "ALTER TABLE funding_instruments ADD CONSTRAINT "
            "funding_instruments_name_source_check CHECK (name_source IN "
            "('deterministic','curated','programme_feed','case_register',"
            "'partition_key'))")
        # The FULL verdict set, not the SQLite delta. `changed` is computed
        # against SQLite, so a re-run after a partial failure -- which is exactly
        # what happened the first time this ran, when Postgres rejected
        # `partition_key` on a CHECK the committed schema does not show -- would
        # find nothing to do and leave Postgres behind forever. Writing every
        # verdict is idempotent and cannot depend on which store is ahead.
        for value in sorted(set(verdicts.values())):
            ids = [i for i, v in verdicts.items() if v == value]
            cur.execute("UPDATE funding_instruments SET name_source = %s "
                        "WHERE id = ANY(%s)", (value, ids))
        # Read back OUT of Postgres, so the run reports what the product will
        # see rather than what this script believes it did.
        cur.execute("SELECT COALESCE(name_source,'(null)'), count(*) "
                    "FROM funding_instruments GROUP BY 1 ORDER BY 2 DESC")
        print("\npostgres, read back:")
        for value, n in cur.fetchall():
            print(f"  {value:<18} {n}")
    pg.close()


if __name__ == "__main__":
    main()
