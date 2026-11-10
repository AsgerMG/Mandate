"""One store is authoritative for each table, it is written down, and the code
is held to it.

The decision this enforces: *"Database work should always just be fed to the
cloud version. It cannot be true that it should be on this desk."* Postgres is
the store of record. Everything else is a cache or a transport.

That is not where the repo is. Five tables the product serves --
funding_instruments and its sources, the two eligibility tables, and
instrument_application -- are rebuilt in Postgres on every publish by
`migrate_to_postgres.py`, which TRUNCATEs them and reloads from the laptop's
SQLite. For those tables the laptop IS the store of record, whatever anyone
intends; Postgres is a replica that a `TRUNCATE` away from a stale laptop would
silently roll back. Eight more tables (companies, public_funding_events and the
rest of the events corpus) have no Postgres representation at all, which is why
"the weekly ETL runs on the old corpus" was possible in the first place: with
no single store, "the corpus" was whichever file you happened to open.

So this does three things, and the third is the one that makes the other two
mean something.

  DECLARED   Every table any committed DDL creates is named in
             store_of_record.json with the store that owns it. A new table
             nobody assigned an owner to fails here, which is the moment to
             decide rather than a year later.

  RATCHET    The number of tables owned by SQLite may only go DOWN. That number
             is the migration, counted. It cannot grow by accident and it
             cannot grow quietly.

  ENFORCED   A table declared `postgres` may not be reconstructed from SQLite.
             Concretely: no module that opens a SQLite connection may also
             TRUNCATE or bulk-INSERT that table. Moving a table's declaration to
             `postgres` therefore FAILS until its write path actually moves,
             so the declaration can never become a statement of intent that the
             code quietly contradicts -- which is what "Postgres is the source
             of truth" was before this file existed.

  NO SQLITE  Since 2026-11-05 the corpus is in Postgres only, so `import sqlite3`
             anywhere under capital/ is either code that has not been ported
             or code reaching for a store that no longer exists. The count of
             modules that import it may only go DOWN (`sqlite_import_budget`),
             and is headed for 0. ETL/archive/ is exempt and is the only
             exemption: it holds the records of work done against the retired
             store, kept and not run.

  And separately: replacing a whole store is a capability, not a convenience.
             Any module that can overwrite a corpus store wholesale -- an
             `--overwrite` volume transfer, a TRUNCATE of a declared table --
             is listed under `replacers`, with whether it proves first. A module
             that gains that power without being listed fails. `push_local.py`
             and `pull_db.py` hold it without proof, which is how a plain
             overwrite in either direction could have destroyed 1,457 events or
             766 instruments on 2026-08-07;
             `ETL/events/extract/push_db_verified.py` is the one that proves.

    python3 ETL/schema/check_store_of_record.py
"""
from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DECL = Path(__file__).resolve().parent / "store_of_record.json"
SQLITE_DDL = [ROOT / "ETL/events/load/schema.sql"] + sorted(
    (ROOT / "ETL/events/load/migrations").glob("*.sql"))
POSTGRES_DDL = [ROOT / "ETL/schema/postgres_schema.sql",
                ROOT / "ETL/schema/guard_verdicts.sql"] + sorted(
    # the forward Postgres migrations (033 on): a table one of them creates is
    # as committed as one in the baseline, and needs an owner just the same
    (ROOT / "ETL/schema/migrations").glob("*.sql"))

SCANNED = [ROOT / "ETL", ROOT / "website" / "build"]

#: Records of the retired SQLite store (see its README). Not scanned for
#: anything: they are not run, and holding them to live rules would mean
#: rewriting a record.
ARCHIVE = ROOT / "ETL" / "archive"

#: Directories that are not capital's code: dependencies and caches.
NOT_CODE = {"node_modules", ".venv", "venv", "__pycache__", ".next"}

# Tables that are engine bookkeeping or a scratch copy made mid-migration, not
# corpus data anybody can be the store of record for.
NOT_CORPUS = re.compile(r"^(sqlite_|schema_migrations$)|_new$")


def declared_tables() -> set[str]:
    """Every table name any committed DDL creates (and no forward Postgres
    migration has since dropped)."""
    names = set()
    dropped = set()
    for path in SQLITE_DDL + POSTGRES_DDL:
        if not path.exists():
            continue
        sql = re.sub(r"--[^\n]*", "", path.read_text())
        names |= {m.group(1) for m in re.finditer(
            r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[\"`]?(\w+)[\"`]?", sql, re.I)}
        # A `<table>_new` scratch copy is renamed onto the real name; the real
        # name is what gets declared.
        names |= {m.group(1) for m in re.finditer(
            r"ALTER\s+TABLE\s+[\"`]?\w+[\"`]?\s+RENAME\s+TO\s+[\"`]?(\w+)[\"`]?",
            sql, re.I)}
        if path.parent.parent.name == "schema" and path.parent.name == "migrations":
            dropped |= {m.group(1) for m in re.finditer(
                r"DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?[\"`]?(\w+)[\"`]?", sql, re.I)}
    return {n for n in names - dropped if not NOT_CORPUS.search(n)}


def python_sources() -> list[Path]:
    return sorted(p for d in SCANNED for p in d.rglob("*.py")
                  if ARCHIVE not in p.parents)


def imports_sqlite3(text: str) -> bool:
    """A real import, read from the syntax tree: a docstring that says
    "sqlite3" is not a dependency on it (store.py's says it several times)."""
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return "import sqlite3" in text
    for node in ast.walk(tree):
        if isinstance(node, ast.Import) and any(
                a.name == "sqlite3" or a.name.startswith("sqlite3.") for a in node.names):
            return True
        if isinstance(node, ast.ImportFrom) and (node.module or "").split(".")[0] == "sqlite3":
            return True
    return False


def sqlite_importers() -> list[str]:
    """Every module under capital/ outside ETL/archive/ that imports sqlite3."""
    out = []
    for p in ROOT.rglob("*.py"):
        rel = p.relative_to(ROOT)
        if NOT_CODE & set(rel.parts) or ARCHIVE in p.parents:
            continue
        if imports_sqlite3(p.read_text(errors="ignore")):
            out.append(str(rel))
    return sorted(out)


def code_only(text: str) -> str:
    """The module with its docstrings and comments removed.

    Every file in this repo explains itself at length, and the explanations name
    the very things being searched for -- this file's own docstring names
    `volume files`, `--overwrite` and three tables. Scanning raw source made the
    checker report itself, and would report any file that merely DISCUSSED a
    store overwrite. Prose is not a capability.
    """
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return text
    drop: set[int] = set()
    for node in ast.walk(tree):
        if not isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef,
                                 ast.ClassDef)):
            continue
        body = getattr(node, "body", None)
        if (body and isinstance(body[0], ast.Expr)
                and isinstance(body[0].value, ast.Constant)
                and isinstance(body[0].value.value, str)):
            drop |= set(range(body[0].lineno, (body[0].end_lineno or body[0].lineno) + 1))
    return "\n".join(
        "" if i in drop or line.lstrip().startswith("#") else line
        for i, line in enumerate(text.splitlines(), start=1))


def rebuilds_from_sqlite(text: str, table: str) -> bool:
    """Does this module REPLACE `table`'s contents out of a SQLite connection?

    Both halves are required. A module that only reads SQLite and one that only
    writes Postgres are both fine; it is the pair -- SQLite open, Postgres table
    emptied and refilled -- that means the laptop is the store of record for it.

    Emptying is the test, not writing. `publish_corpus_census.py` reads SQLite
    and INSERTs one row per weekly run: that is an observation ABOUT a store,
    appended, and Postgres remains the only place it exists. Flagging it said
    the census was the reason Postgres was not authoritative, which is exactly
    backwards -- the census is the mechanism by which anyone can see that it is.
    A targeted `DELETE ... WHERE` is a retraction of named rows and likewise not
    a rebuild; only an unqualified delete of the whole table is.
    """
    if "sqlite3" not in text:
        return False
    if re.search(rf"TRUNCATE(\s+TABLE)?\s+[\"`]?{table}\b", text, re.I):
        return True
    for m in re.finditer(rf"DELETE\s+FROM\s+[\"`]?{table}[\"`]?", text, re.I):
        tail = text[m.end():m.end() + 200].split(";")[0]
        if not re.search(r"\bWHERE\b", tail, re.I):
            return True
    return False


def replaces_a_store(text: str, tables: set[str]) -> str | None:
    """Why this module can replace a whole store, or None.

    The Railway transfer is matched on the CLI and the `--overwrite` flag rather
    than on the words "volume files", because every call site builds its argv as
    a list of separate strings and the two words are never adjacent in the
    source. Matching the prose found this file and missed push_local.py.
    """
    if "@railway/cli" in text and "--overwrite" in text:
        return "runs a Railway volume transfer with --overwrite"
    for t in sorted(tables):
        if re.search(rf"TRUNCATE(\s+TABLE)?\s+[\"`]?{t}\b", text, re.I):
            return f"TRUNCATEs {t}"
    return None


def main() -> int:
    if not DECL.exists():
        print(f"FAILED: {DECL} does not exist. Every table needs a declared "
              f"store of record; there is nothing to check against.")
        return 1
    decl = json.loads(DECL.read_text())
    owners: dict[str, str] = {t: v["store"] for t, v in decl["tables"].items()}

    # ── ONE ANSWER PER QUESTION ─────────────────────────────────────────────
    # This file owns the ENGINE axis (sqlite -> postgres, per table). It does
    # not get to have an opinion about WHICH STORE is the corpus of record;
    # corpus_stores.py owns that. Both were written in the same week by
    # workstreams that could not see each other, and each declared itself the
    # one definition while giving the opposite answer. Reading the value across
    # instead of restating it is what stops that being a live contradiction
    # again -- and it is checked here rather than trusted, because a comment
    # saying "keep these in sync" is the bug, not the fix.
    sys.path.insert(0, str(ROOT / "website" / "build" / "lib"))
    try:
        import corpus_stores
    except ImportError as e:
        print(f"FAILED: cannot read the corpus-of-record definition: {e}")
        return 1
    lives_on = decl.get("sqlite_lives_on")
    if lives_on != corpus_stores.OF_RECORD:
        print(f"FAILED: {DECL.name} says SQLite-owned tables are authoritative on "
              f"{lives_on!r}, corpus_stores.py says the corpus of record is "
              f"{corpus_stores.OF_RECORD!r}. Two definitions, two answers. Fix "
              f"corpus_stores.py -- it owns this question -- and follow it here.")
        return 1
    replacers: dict[str, dict] = decl.get("replacers", {})
    tables = declared_tables()
    problems: list[str] = []

    # ── DECLARED ────────────────────────────────────────────────────────────
    for t in sorted(tables - set(owners)):
        problems.append(
            f"table {t} is created by committed DDL and no store is declared "
            f"for it in {DECL.name}. Decide who owns it.")
    for t in sorted(set(owners) - tables):
        problems.append(
            f"{DECL.name} declares a store for {t}, which no committed DDL "
            f"creates. Delete the entry or write the DDL.")

    # ── RATCHET ─────────────────────────────────────────────────────────────
    elsewhere = sorted(t for t, s in owners.items() if s == "sqlite")
    budget = decl["not_postgres_budget"]
    print(f"{len(owners)} tables declared; {len(elsewhere)} still owned by "
          f"SQLite (budget {budget})")
    if len(elsewhere) > budget:
        problems.append(
            f"{len(elsewhere)} tables are owned by a store other than Postgres, "
            f"over the budget of {budget}. This number may only go down.")
    elif len(elsewhere) < budget:
        problems.append(
            f"only {len(elsewhere)} tables are still owned by a store other "
            f"than Postgres. Lower 'not_postgres_budget' to {len(elsewhere)} so "
            f"the ratchet holds at the new position.")

    # ── NO SQLITE ───────────────────────────────────────────────────────────
    importers = sqlite_importers()
    sq_budget = decl["sqlite_import_budget"]
    print(f"{len(importers)} modules under capital/ import sqlite3 outside "
          f"ETL/archive/ (budget {sq_budget})")
    if len(importers) > sq_budget:
        problems.append(
            f"{len(importers)} modules import sqlite3, over the budget of "
            f"{sq_budget}. The corpus is in Postgres only: use ETL/lib/store.py. "
            f"A one-off that ran against the retired store belongs in "
            f"ETL/archive/. Importers:\n      " + "\n      ".join(importers))
    elif len(importers) < sq_budget:
        problems.append(
            f"only {len(importers)} modules still import sqlite3. Lower "
            f"'sqlite_import_budget' to {len(importers)} so the ratchet holds at "
            f"the new position.")

    # ── ENFORCED ────────────────────────────────────────────────────────────
    # `postgres-derived` is deliberately NOT enforced against: those tables are
    # recomputed wholesale by design, and the question that matters for them is
    # where their INPUTS live, which `derived_from` records and the input's own
    # entry answers.
    pg_tables = {t for t, s in owners.items() if s == "postgres"}
    found_replacers: dict[str, str] = {}
    for path in python_sources():
        rel = str(path.relative_to(ROOT))
        if path.resolve() == Path(__file__).resolve():
            continue  # the detector matches on its own patterns; a checker
            # that reports itself teaches everyone to ignore it
        text = code_only(path.read_text(errors="ignore"))
        for t in sorted(pg_tables):
            if rebuilds_from_sqlite(text, t):
                problems.append(
                    f"{rel} opens SQLite and rewrites {t}, which is declared "
                    f"`postgres`. Either the declaration is wrong or this write "
                    f"path has not moved yet — a store of record that is "
                    f"reconstructed from somewhere else is not one.")
        why = replaces_a_store(text, tables)
        if why:
            found_replacers[rel] = why

    for rel, why in sorted(found_replacers.items()):
        entry = replacers.get(rel)
        if entry is None:
            problems.append(
                f"{rel} {why} and is not listed under `replacers` in "
                f"{DECL.name}. Replacing a store wholesale is a capability: "
                f"say so, and say whether it proves it loses nothing first.")
        elif not entry.get("proves_superset"):
            print(f"  unproven replacer: {rel} — {why} "
                  f"({entry.get('why', 'no reason recorded')})")
    for rel in sorted(set(replacers) - set(found_replacers)):
        problems.append(
            f"{DECL.name} lists {rel} as a replacer and it no longer replaces "
            f"anything. Delete the entry.")

    if problems:
        print(f"\nFAILED: {len(problems)} problem(s).")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("ok — every table has a declared store of record, the count owned "
          "elsewhere has not grown, and nothing rebuilds a Postgres-owned table "
          "from SQLite.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
