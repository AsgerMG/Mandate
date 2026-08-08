"""Apply OVERRIDE_NAMES to SQLite and Postgres, without a full instrument rebuild.

`name` is in BUILT_COLUMNS, so populate_funding_instruments.py owns it and
reproduces OVERRIDE_NAMES on every rebuild -- the declaration in code is the
durable thing and nothing here changes that. What this exists for is the gap in
between: adding an override should not require a DELETE-and-reinsert of the
whole instrument table while other enrichment passes hold uncommitted edits to
the same SQLite file.

So this materialises the declaration, for exactly the ids the declaration names
and no others, in both corpora. Idempotent, never inserts, never deletes. Run it
after editing OVERRIDE_NAMES; a later `populate_funding_instruments.py` produces
the same result from scratch.

Usage:
  python3 ETL/terms/apply_override_names.py --dry-run
  python3 ETL/terms/apply_override_names.py
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        _sys.path.insert(0, str(_anc / "events" / "load"))
        break
from etl_env import DB  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import sqlite3  # noqa: E402

from populate_funding_instruments import OVERRIDE_NAMES  # noqa: E402
from publish_capital_type import load_database_url  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    import psycopg2

    changed: list[tuple[str, str, str]] = []
    conn = sqlite3.connect(DB)
    for iid, name in OVERRIDE_NAMES.items():
        row = conn.execute(
            "SELECT name FROM funding_instruments WHERE id = ?", (iid,)).fetchone()
        if row is None or row[0] == name:
            continue
        changed.append((iid, row[0], name))
        if not args.dry_run:
            conn.execute(
                "UPDATE funding_instruments SET name = ?, name_source = 'curated' "
                "WHERE id = ?", (name, iid))
    if not args.dry_run:
        conn.commit()

    pg = psycopg2.connect(load_database_url())
    cur = pg.cursor()
    for iid, _old, name in changed:
        print(f"   {_old}  ->  {name}   ({iid})")
        if not args.dry_run:
            cur.execute(
                "UPDATE funding_instruments SET name = %s, name_source = 'curated' "
                "WHERE id = %s", (name, iid))
    if not args.dry_run:
        pg.commit()
    pg.close()

    print(f"{len(changed)} instrument names applied"
          f"{' (dry run, nothing written)' if args.dry_run else ''}")


if __name__ == "__main__":
    main()
