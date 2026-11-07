"""Committed DDL must account for every table and column in the store, and the
store must hold every one the DDL declares.

On 2026-08-07 the Railway volume's `funding_instruments` had no `tier` column
while the laptop's did, because the volume had run 9 of the 23 committed
migrations. The census's coverage block reads `tier`, so it recorded a coverage
LOSS; half a day went into looking for the missing funds before anyone looked
at the schema. A missing column is not a smaller corpus, but it reads exactly
like one.

Since 2026-11-05 there is one store -- schema `capital` of the Mandate Postgres
-- so the old BETWEEN-STORES half has nothing left to compare. What remains is
the question that does not go away:

  AGAINST SOURCE  Every column in the store must be creatable by committed DDL
                  (ETL/schema/corpus_schema.sql, postgres_schema.sql,
                  guard_verdicts.sql and the forward migrations in
                  ETL/schema/migrations/), and every column that DDL creates
                  must be present. A column that exists only because somebody
                  ran ALTER by hand cannot be rebuilt. Accepted exceptions are
                  in ETL/schema/schema_debt.json, which may only shrink.

Views are not tables and are not compared here.

    python3 ETL/schema/check_store_schema.py              # committed DDL only (CI)
    python3 ETL/schema/check_store_schema.py --postgres   # and the store (cron)
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break

import etl_env  # noqa: E402,F401  (loads .env.local, as every ETL entry point does)
import argparse  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402

ROOT = _Path(__file__).resolve().parents[2]

POSTGRES_DDL = [ROOT / "ETL/schema/corpus_schema.sql",
                ROOT / "ETL/schema/postgres_schema.sql",
                ROOT / "ETL/schema/guard_verdicts.sql"] + sorted(
    (ROOT / "ETL/schema/migrations").glob("*.sql"))
DEBT_FILE = _Path(__file__).resolve().parent / "schema_debt.json"

# The runner's own ledger: it has DDL, but it is bookkeeping, not corpus.
IGNORED_TABLES = {"schema_migrations"}

# Words that start a table CONSTRAINT rather than a column definition.
_CONSTRAINT = re.compile(
    r"^(primary|foreign|unique|check|constraint|key)\b", re.I)


# ------------------------------------------------------------ the reference

def _split_top_level(body: str) -> list[str]:
    """Split a CREATE TABLE body on commas outside parentheses AND string literals.

    A comma inside a quoted default (035's `DEFAULT '{"batches": [], "collected":
    []}'`) used to split the column in two, so the store looked like it lacked a
    column named `"collected":` and the cron's first step failed (2026-11-07).
    """
    out, depth, cur, quoted = [], 0, [], False
    for ch in body:
        if ch == "'":
            quoted = not quoted          # '' (an escaped quote) toggles twice: net no-op
        elif not quoted and ch == "(":
            depth += 1
        elif not quoted and ch == ")":
            depth -= 1
        if ch == "," and depth == 0 and not quoted:
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
                r"ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?[\"`]?(\w+)[\"`]?\s+ADD\s+"
                r"(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?!CONSTRAINT\b)[\"`]?(\w+)[\"`]?",
                sql, re.I):
            cols.setdefault(m.group(1), set()).add(m.group(2))
        # A column a later migration drops is no longer declared (the one-model
        # move drops each legacy vector column once its replacement is complete).
        for m in re.finditer(
                r"ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?[\"`]?(\w+)[\"`]?\s+DROP\s+"
                r"(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?(?!CONSTRAINT\b)[\"`]?(\w+)[\"`]?",
                sql, re.I):
            cols.get(m.group(1), set()).discard(m.group(2))
        for m in re.finditer(
                r"ALTER\s+TABLE\s+[\"`]?(\w+)[\"`]?\s+RENAME\s+TO\s+[\"`]?(\w+)[\"`]?",
                sql, re.I):
            renames.append((m.group(1), m.group(2)))

    for old, new in renames:
        if old in cols:
            cols.setdefault(new, set()).update(cols.pop(old))
    return {t: c for t, c in cols.items() if t not in IGNORED_TABLES}


# ----------------------------------------------------------------- the store

def postgres_schema(con) -> dict[str, set[str]]:
    """Base tables and their columns in this brain's schema. Views excluded."""
    out: dict[str, set[str]] = {}
    for table, col in con.execute(
            "SELECT c.table_name, c.column_name FROM information_schema.columns c "
            "JOIN information_schema.tables t ON t.table_schema = c.table_schema "
            " AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE' "
            "WHERE c.table_schema = current_schema()").fetchall():
        if table in IGNORED_TABLES:
            continue
        out.setdefault(table, set()).add(col)
    return out


# ----------------------------------------------------------------- the check

def against_source(schema: dict[str, set[str]], declared: dict[str, set[str]],
                   debt: dict) -> tuple[list[str], list[str]]:
    """(problems, still-outstanding debt entries)."""
    accepted_tables = set(debt.get("tables_without_ddl", []))
    accepted_cols = {f"{t}.{c}" for t, cs in debt.get("columns_without_ddl", {}).items()
                     for c in cs}
    seen: set[str] = set()
    problems: list[str] = []
    for t, live_cols in sorted(schema.items()):
        if t not in declared:
            if t in accepted_tables:
                seen.add(t)
            else:
                problems.append(f"table {t} exists in the store and no committed DDL "
                                f"creates it; a store rebuilt from source would not have it")
            continue
        for c in sorted(live_cols - declared[t]):
            key = f"{t}.{c}"
            if key in accepted_cols:
                seen.add(key)
            else:
                problems.append(f"{key} exists and no committed DDL creates it — an "
                                f"ALTER run by hand. Write the migration.")
    for t in sorted(set(declared) - set(schema)):
        problems.append(f"table {t} is declared by committed DDL and is NOT in the store")
    for t in sorted(set(declared) & set(schema)):
        for c in sorted(declared[t] - schema[t]):
            key = f"{t}.{c}"
            if key in accepted_cols:
                seen.add(key)
                continue
            problems.append(f"{key} is created by committed DDL and is NOT in the "
                            f"store — a migration that never ran there.")
    outstanding = sorted((accepted_tables | accepted_cols) & seen)
    return problems, outstanding


# ------------------------------------------------------------------ the script

def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--postgres", action="store_true",
                    help="also read the store (needs DATABASE_URL)")
    args = ap.parse_args()

    declared = declared_schema(POSTGRES_DDL)
    debt = json.loads(DEBT_FILE.read_text()) if DEBT_FILE.exists() else {}
    print(f"committed DDL declares {len(declared)} tables")
    if not args.postgres:
        print("\nNo store read, only the committed DDL. That is the correct "
              "behaviour in CI, which holds no credentials -- the store comparison "
              "runs on the weekly cron and publishes a verdict.")
        return 0
    if not os.environ.get("DATABASE_URL"):
        print("FAILED: --postgres asked for and DATABASE_URL is not set")
        return 1
    from store import connect  # noqa: PLC0415  (CI has no driver for the DDL-only mode)
    with connect(readonly=True) as con:
        schema = postgres_schema(con)
    print(f"  the store holds {len(schema)} tables")

    print("\n── AGAINST COMMITTED DDL ──────────────────────────────────────")
    problems, outstanding = against_source(schema, declared, debt)
    budget = debt.get("budget")
    fail = 0
    if problems:
        fail = 1
        for p in problems:
            print(f"  {p}")
    else:
        print(f"  every table and column in the store is creatable from committed "
              f"DDL and present, apart from {len(outstanding)} recorded in "
              f"{DEBT_FILE.name}.")
    if budget is not None and len(outstanding) > budget:
        fail = 1
        print(f"  the recorded debt is {len(outstanding)}, over its budget of "
              f"{budget}. It may only shrink.")
    elif budget is not None and len(outstanding) < budget:
        fail = 1
        print(f"  {budget - len(outstanding)} recorded debt entries no longer "
              f"exist. Lower 'budget' to {len(outstanding)} and delete them from "
              f"{DEBT_FILE.name}, so the ratchet cannot slip back.")
    print(f"\nstore_schema: {'FAILED' if fail else 'ok'}")
    return fail


if __name__ == "__main__":
    raise SystemExit(main())
