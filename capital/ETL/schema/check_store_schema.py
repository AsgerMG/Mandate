"""No two stores of the same table may disagree about its columns.

The corpus lives in more than one place -- the laptop's `data/db.sqlite`, the
SQLite file on the Railway volume the weekly cron writes, and the Postgres the
product reads -- and nothing compared their shapes. On 2026-08-07 the volume's
`funding_instruments` had no `tier` column while the laptop's did, because the
volume had run 9 of the 23 committed migrations and no step in the weekly cron
applied the rest. The census's coverage block reads `tier`, so it recorded a
coverage LOSS; half a day went into looking for the missing funds before anyone
looked at the schema. A missing column is not a smaller corpus, but it reads
exactly like one.

Two questions, because they fail differently:

  BETWEEN STORES  Every table two stores both hold must have the same columns
                  in both. This is the one that bit. No baseline, no tolerance:
                  stores that disagree are a bug, always.

  AGAINST SOURCE  Every column in every store must be creatable by committed
                  DDL, and every column committed DDL creates must be present.
                  A column that exists only because somebody ran ALTER by hand
                  cannot be rebuilt, so a store restored from source is silently
                  a different database. Today 14 columns and 3 tables are in
                  that position; they are recorded in ETL/schema/schema_debt.json
                  and the check fails if that list GROWS. It may only shrink.

Reading the DDL rather than replaying it is deliberate. Replaying `schema.sql`
then `migrations/*.sql` into an empty database does not work: schema.sql has
been edited to include columns their own migrations also add, so the replay dies
on `duplicate column name` at 004, then on 006, 021 and 022. That is a finding
in its own right and it is written down -- but a check that cannot run is not a
check, so the reference here is the UNION of every column any committed
statement creates, which needs no ordering to be correct.

The first thing it found was a git conflict marker sitting unresolved inside
ETL/schema/postgres_schema.sql, on a branch that had already merged. CI asserts
that file EXISTS (`test -f`) and nothing had ever read it.

    python3 ETL/schema/check_store_schema.py                 # source-only (CI)
    python3 ETL/schema/check_store_schema.py --sqlite data/db.sqlite \
        --volume /tmp/volume-db.sqlite --postgres
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break

import argparse  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402

ROOT = _Path(__file__).resolve().parents[2]

# The committed DDL for each ENGINE, because they are different databases with
# different tables. Comparing a Postgres store against the SQLite migrations
# would report every product table as unreproducible and every events table as
# missing, which is noise rather than drift; the two engines are compared
# against each other directly, by between_stores().
SQLITE_DDL = [ROOT / "ETL/events/load/schema.sql"] + sorted(
    (ROOT / "ETL/events/load/migrations").glob("*.sql"))
POSTGRES_DDL = [ROOT / "ETL/schema/postgres_schema.sql",
                ROOT / "ETL/schema/guard_verdicts.sql"]
DEBT_FILE = _Path(__file__).resolve().parent / "schema_debt.json"

# Bookkeeping SQLite maintains for itself, and the runner's own ledger. Neither
# is corpus data and neither has committed DDL to be reproducible from.
IGNORED_TABLES = {"sqlite_sequence", "sqlite_stat1", "sqlite_stat4",
                  "schema_migrations"}

# Words that start a table CONSTRAINT rather than a column definition.
_CONSTRAINT = re.compile(
    r"^(primary|foreign|unique|check|constraint|key)\b", re.I)


# ------------------------------------------------------------ the reference

def _split_top_level(body: str) -> list[str]:
    """Split a CREATE TABLE body on commas that are not inside parentheses."""
    out, depth, cur = [], 0, []
    for ch in body:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            out.append("".join(cur))
            cur = []
            continue
        cur.append(ch)
    if "".join(cur).strip():
        out.append("".join(cur))
    return out


def declared_schema(files: list[_Path]) -> dict[str, set[str]]:
    """Every column any committed statement creates, keyed by final table name.

    Follows `ALTER TABLE x RENAME TO y`, because the repo's table rewrites go
    via a `<table>_new` scratch copy: without that, half of funding_instruments'
    columns would look like they belong to a table that does not exist.
    """
    cols: dict[str, set[str]] = {}
    renames: list[tuple[str, str]] = []

    for path in files:
        if not path.exists():
            continue
        sql = re.sub(r"--[^\n]*", "", path.read_text())
        for m in re.finditer(
                r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[\"`]?(\w+)[\"`]?\s*\(",
                sql, re.I):
            name = m.group(1)
            depth, i = 1, m.end()
            while i < len(sql) and depth:
                depth += (sql[i] == "(") - (sql[i] == ")")
                i += 1
            for item in _split_top_level(sql[m.end():i - 1]):
                item = item.strip()
                if not item or _CONSTRAINT.match(item):
                    continue
                cols.setdefault(name, set()).add(item.split()[0].strip('"`'))
        for m in re.finditer(
                r"ALTER\s+TABLE\s+[\"`]?(\w+)[\"`]?\s+ADD\s+(?:COLUMN\s+)?[\"`]?(\w+)[\"`]?",
                sql, re.I):
            cols.setdefault(m.group(1), set()).add(m.group(2))
        for m in re.finditer(
                r"ALTER\s+TABLE\s+[\"`]?(\w+)[\"`]?\s+RENAME\s+TO\s+[\"`]?(\w+)[\"`]?",
                sql, re.I):
            renames.append((m.group(1), m.group(2)))

    for old, new in renames:
        if old in cols:
            cols.setdefault(new, set()).update(cols.pop(old))
    return {t: c for t, c in cols.items() if t not in IGNORED_TABLES}


# ----------------------------------------------------------------- the stores

def sqlite_schema(path: _Path) -> dict[str, set[str]]:
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    out = {}
    for (t,) in con.execute("SELECT name FROM sqlite_master WHERE type='table'"):
        if t in IGNORED_TABLES:
            continue
        out[t] = {r[1] for r in con.execute(f'PRAGMA table_info("{t}")')}
    con.close()
    return out


def postgres_schema() -> dict[str, set[str]]:
    import psycopg  # imported here: CI has no driver and needs none
    out: dict[str, set[str]] = {}
    with psycopg.connect(os.environ["DATABASE_URL"]) as con:
        for table, col in con.execute(
                "SELECT table_name, column_name FROM information_schema.columns "
                "WHERE table_schema = 'public'").fetchall():
            if table in IGNORED_TABLES:
                continue
            out.setdefault(table, set()).add(col)
    return out


# ----------------------------------------------------------------- the checks

def between_stores(stores: dict[str, dict[str, set[str]]]) -> list[str]:
    """Tables two stores both hold must have identical columns in both."""
    problems = []
    names = list(stores)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            shared = set(stores[a]) & set(stores[b])
            for t in sorted(shared):
                only_a = stores[a][t] - stores[b][t]
                only_b = stores[b][t] - stores[a][t]
                if only_a:
                    problems.append(
                        f"{t}: {', '.join(sorted(only_a))} in {a} and not in {b}")
                if only_b:
                    problems.append(
                        f"{t}: {', '.join(sorted(only_b))} in {b} and not in {a}")
    return problems


def against_source(stores: dict[str, dict[str, set[str]]],
                   declared_for: dict[str, dict[str, set[str]]],
                   debt: dict) -> tuple[list[str], list[str]]:
    """(problems, still-outstanding debt entries).

    Each store is compared against the DDL for ITS engine, and only on tables
    that DDL declares: Postgres holds a subset of the corpus by design, so
    reporting every events table as "missing from Postgres" would drown the
    signal this exists for.
    """
    accepted_tables = set(debt.get("tables_without_ddl", []))
    accepted_cols = {f"{t}.{c}" for t, cs in debt.get("columns_without_ddl", {}).items()
                     for c in cs}
    seen: set[str] = set()
    problems: list[str] = []

    for store, schema in stores.items():
        declared = declared_for[store]
        for t, live_cols in sorted(schema.items()):
            if t not in declared:
                if t in accepted_tables:
                    seen.add(t)
                else:
                    problems.append(
                        f"table {t} exists in {store} and no committed DDL creates "
                        f"it; a store rebuilt from source would not have it")
                continue
            for c in sorted(live_cols - declared[t]):
                key = f"{t}.{c}"
                if key in accepted_cols:
                    seen.add(key)
                else:
                    problems.append(
                        f"{store}.{key} exists and no committed DDL creates it — "
                        f"an ALTER run by hand. Write the migration.")
            for c in sorted(declared[t] - live_cols):
                key = f"{t}.{c}"
                if key in accepted_cols:
                    seen.add(key)
                    continue
                problems.append(
                    f"{store}.{t}.{c} is created by a committed migration and is "
                    f"NOT in the store — a migration that never ran there.")
    outstanding = sorted((accepted_tables | accepted_cols) & seen)
    return problems, outstanding


# ------------------------------------------------------------------ the script

def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sqlite", default=None, help="the laptop corpus")
    ap.add_argument("--volume", default=None,
                    help="a copy of the volume's db.sqlite, e.g. one pulled by "
                         "ETL/events/extract/pull_db_side.py")
    ap.add_argument("--postgres", action="store_true",
                    help="also read the live Postgres (needs DATABASE_URL)")
    args = ap.parse_args()

    stores: dict[str, dict[str, set[str]]] = {}
    for label, path in (("laptop", args.sqlite), ("volume", args.volume)):
        if not path:
            continue
        p = _Path(path).expanduser()
        if not p.exists():
            print(f"FAILED: --{label} {p} does not exist")
            return 1
        stores[label] = sqlite_schema(p)
    if args.postgres:
        if not os.environ.get("DATABASE_URL"):
            print("FAILED: --postgres asked for and DATABASE_URL is not set")
            return 1
        stores["postgres"] = postgres_schema()

    sqlite_declared = declared_schema(SQLITE_DDL)
    pg_declared = declared_schema(POSTGRES_DDL)
    declared_for = {s: (pg_declared if s == "postgres" else sqlite_declared)
                    for s in stores}
    debt = json.loads(DEBT_FILE.read_text()) if DEBT_FILE.exists() else {}

    print(f"committed DDL declares {len(sqlite_declared)} SQLite tables and "
          f"{len(pg_declared)} Postgres tables")
    for label, schema in stores.items():
        print(f"  {label:9s} {len(schema):>3} tables")
    if not stores:
        print("\nNo store given, so only the committed DDL was read. That is the "
              "correct behaviour in CI, which holds no credentials and no corpus "
              "— the store comparison runs on the weekly cron, where the data is.")

    fail = 0

    print("\n── BETWEEN STORES ─────────────────────────────────────────────")
    drift = between_stores(stores)
    if drift:
        fail = 1
        for d in drift:
            print(f"  {d}")
    else:
        print("  no two stores disagree about a shared table's columns.")

    print("\n── AGAINST COMMITTED DDL ──────────────────────────────────────")
    problems, outstanding = against_source(stores, declared_for, debt)
    budget = debt.get("budget")
    if problems:
        fail = 1
        for p in problems:
            print(f"  {p}")
    else:
        print(f"  every column in every store is creatable from committed DDL, "
              f"apart from {len(outstanding)} recorded in {DEBT_FILE.name}.")
    if budget is not None and len(outstanding) > budget:
        fail = 1
        print(f"  the recorded debt is {len(outstanding)}, over its budget of "
              f"{budget}. It may only shrink.")
    elif budget is not None and stores and len(outstanding) < budget:
        fail = 1
        print(f"  {budget - len(outstanding)} recorded debt entries no longer "
              f"exist. Lower 'budget' to {len(outstanding)} and delete them from "
              f"{DEBT_FILE.name}, so the ratchet cannot slip back.")

    return fail


if __name__ == "__main__":
    raise SystemExit(main())
