"""Install the capital read-side views (ETL/schema/views.sql), or check them.

    python3 ETL/schema/install_views.py           install, as capital_app
    python3 ETL/schema/install_views.py --check   are the installed views this file?

WHY A CHECK AND NOT A REINSTALL ON EVERY BUILD. The site build used to
re-run the views file into db.sqlite before every builder, so a new
source_family CASE could not be forgotten. A build now reads Postgres as
capital_ro, which cannot create a view -- deliberately: a build must not be
able to change the corpus it reads. So the guarantee moves from "the build
reinstalls" to "the build refuses views that are not the committed file".

Installation stamps every view with the file's SHA-256 (COMMENT ON VIEW).
--check compares the stamp with the file in this checkout; a view that is
missing, unstamped or stamped with another version of the file fails it.
That also catches the Postgres-specific trap: `e.*` is expanded when a view is
created, so a column added to public_funding_events is invisible to v_events
until the file is installed again.

The views are installed in one transaction: a failure leaves the previous
definitions in place, never a half-installed set.
"""
from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "lib"))
from store import connect  # noqa: E402

VIEWS_SQL = HERE / "views.sql"
STAMP_PREFIX = "ETL/schema/views.sql sha256:"


def view_names(sql: str) -> list[str]:
    """The views the file creates, in file order."""
    return re.findall(r"^CREATE VIEW (\w+) AS", sql, flags=re.MULTILINE)


def stamp(sql: str) -> str:
    return STAMP_PREFIX + hashlib.sha256(sql.encode()).hexdigest()


def install() -> int:
    sql = VIEWS_SQL.read_text()
    names = view_names(sql)
    with connect() as con:
        con.execute(sql)
        for name in names:
            con.execute(f"COMMENT ON VIEW {name} IS '{stamp(sql)}'")
    print(f"installed {len(names)} views from {VIEWS_SQL.name}: {', '.join(names)}")
    return check()


def check() -> int:
    sql = VIEWS_SQL.read_text()
    want = stamp(sql)
    problems = []
    with connect(readonly=True) as con:
        for name in view_names(sql):
            row = con.execute(
                "SELECT obj_description(to_regclass(%s), 'pg_class'), to_regclass(%s) IS NOT NULL",
                (name, name)).fetchone()
            got, exists = row
            if not exists:
                problems.append(f"{name}: not installed")
            elif got != want:
                problems.append(f"{name}: installed from {got or 'an unstamped definition'}")
    if problems:
        print("VIEWS ARE NOT ETL/schema/views.sql -- run: python3 ETL/schema/install_views.py")
        for p in problems:
            print(f"  {p}")
        return 1
    print(f"views current: {len(view_names(sql))} views match {want[len(STAMP_PREFIX):][:12]}")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    sys.exit(check() if ap.parse_args().check else install())
