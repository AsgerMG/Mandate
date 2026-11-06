"""The capital brain's one store: schema `capital` of the Mandate Postgres.

    from store import connect, columns, table_exists

    with connect() as con:                       # read-write, as capital_app
        con.execute("INSERT INTO companies (canonical_name, country) VALUES (%s, %s) "
                    "ON CONFLICT DO NOTHING", (name, cc))
    with connect(readonly=True) as con:          # a build or a check
        rows = con.execute("SELECT id, canonical_name FROM companies").fetchall()

WHY THIS FILE EXISTS. Until 2026-11-05 the corpus lived in two SQLite files, the
laptop's and the Railway volume's, and ~200 scripts opened one of them with
`sqlite3.connect(DB)`. The two forked on 2026-08-08 and were reconciled by hand
for three months; the last reconciliation is ETL/archive/schema/consolidate/. There is
now one store, and this is the only way into it from Python. A script that
opens its own connection, or keeps a local copy, recreates the defect this
replaced.

WHERE THE TABLES ARE is not said here. The connecting role carries
`search_path = capital, public` as a role default (mandate/db/roles.sql), so
unqualified SQL resolves to this brain's schema whatever the client. Do not
schema-qualify capital's own tables; do not reach into another brain's schema
(the role cannot, and that is the point).

PORTING FROM sqlite3, the differences that bite:
  * placeholders are %s, not ?   (and a literal % in SQL must be written %%)
  * INSERT OR IGNORE    -> INSERT ... ON CONFLICT DO NOTHING
  * INSERT OR REPLACE   -> INSERT ... ON CONFLICT (<key>) DO UPDATE SET ...
                           (REPLACE deleted and re-inserted the row; say which
                           columns you mean to overwrite, and no others)
  * PRAGMA table_info   -> columns(con, table)
  * sqlite_master       -> table_exists(con, table)
  * GROUP_CONCAT(x, ',')-> string_agg(x, ',');  IFNULL -> COALESCE
  * julianday/date()    -> real date arithmetic; dates are TEXT in the corpus
                           tables (loaded losslessly), so cast explicitly
  * cursor.lastrowid    -> INSERT ... RETURNING id
  * rows: tuples by default; connect(dict_rows=True) for name access, the
    replacement for row_factory = sqlite3.Row
  * one transaction per `with connect()` block: it COMMITS on clean exit and
    ROLLS BACK on an exception, which is what sqlite3's context manager did too
"""
from __future__ import annotations

import os
import sys
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import psycopg
from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parent))
import etl_env  # noqa: E402,F401  (loads .env.local: DATABASE_URL and the read-only URL)

#: Where a read-only connection comes from. capital_ro can read every capital
#: table and write none -- the role refuses, not this module.
READONLY_ENV = "CAPITAL_RO_DATABASE_URL"


def _url(readonly: bool) -> str:
    if readonly and os.environ.get(READONLY_ENV):
        return os.environ[READONLY_ENV].strip()
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        raise SystemExit(
            "DATABASE_URL is not set. The capital corpus lives only in the Mandate "
            "Postgres (schema capital); there is no local copy to fall back to. Put "
            "the capital_app URL in capital/.env.local -- see mandate/db/apply_roles.py.")
    return url


class Row(tuple):
    """A row readable by position AND by column name: what sqlite3.Row was.

    For a port whose code does both (`r[0]` here, `r["source"]` there, `dict(r)`
    somewhere else). A tuple, so unpacking, equality and hashing behave exactly
    as with the default rows.
    """
    __slots__ = ()
    _index: dict[str, int] = {}

    def __getitem__(self, key):  # type: ignore[override]
        if isinstance(key, str):
            return tuple.__getitem__(self, self._index[key])
        return tuple.__getitem__(self, key)

    def keys(self) -> list[str]:
        return list(self._index)

    def get(self, key: str, default=None):
        i = self._index.get(key)
        return default if i is None else tuple.__getitem__(self, i)


def _row_factory(cursor):
    names = [c.name for c in cursor.description] if cursor.description else []
    cls = type("Row", (Row,), {"__slots__": (), "_index": {n: i for i, n in enumerate(names)}})
    return cls


@contextmanager
def connect(*, readonly: bool = False, dict_rows: bool = False, rows: bool = False,
            statement_timeout_ms: int | None = None) -> Iterator[psycopg.Connection]:
    """A connection to schema `capital`. Commits on clean exit, rolls back on error.

    `readonly` uses capital_ro when its URL is configured, and in any case marks
    the session read-only, so a build or a check cannot write even by mistake.
    `rows=True` yields `Row`s (by position and by name), the sqlite3.Row stand-in.
    """
    con = psycopg.connect(
        _url(readonly),
        row_factory=(_row_factory if rows else dict_row if dict_rows
                     else psycopg.rows.tuple_row),
        # Railway's TCP proxy drops quiet sockets; long ETL steps are quiet.
        keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=6,
    )
    try:
        if readonly:
            con.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
        if statement_timeout_ms is not None:
            con.execute(f"SET statement_timeout = {int(statement_timeout_ms)}")
        yield con
        con.commit()
    except BaseException:
        con.rollback()
        raise
    finally:
        con.close()


def reader(*, rows: bool = True) -> psycopg.Connection:
    """A read-only connection for a script that only reads, held for its run.

    The port of `conn = sqlite3.connect(DB)` in an emitter: same lifetime, no
    re-indentation of a 200-line main(). Read-only at the session level (and as
    capital_ro where configured), so a forgotten write fails instead of landing.
    `rows=True` gives Row (by position and by name), as sqlite3.Row did.
    """
    con = psycopg.connect(
        _url(True), row_factory=_row_factory if rows else psycopg.rows.tuple_row,
        keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=6)
    con.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
    return con


def columns(con: psycopg.Connection, table: str) -> list[str]:
    """Column names in order. The replacement for PRAGMA table_info."""
    return [r[0] if isinstance(r, tuple) else r["column_name"] for r in con.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema = current_schema() AND table_name = %s ORDER BY ordinal_position",
        (table,))]


def table_exists(con: psycopg.Connection, table: str) -> bool:
    """The replacement for a sqlite_master lookup. Unqualified: this brain's schema."""
    row = con.execute("SELECT to_regclass(%s) IS NOT NULL", (table,)).fetchone()
    return bool(row[0] if isinstance(row, tuple) else next(iter(row.values())))
