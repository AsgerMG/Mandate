"""Load the SQLite corpus into schema `capital` of the Mandate database. Once.

    python3 ETL/schema/consolidate/load_into_postgres.py CORPUS SIGNALS            # plan + DDL only
    python3 ETL/schema/consolidate/load_into_postgres.py CORPUS SIGNALS --write    # create, load, verify

CORPUS is the output of union_stores.py; SIGNALS is the news-signals SQLite.
Connects as DATABASE_URL (capital_app, whose search_path is `capital, public`).

WHAT MOVES, AND WHAT DOES NOT
  * Every corpus table Postgres does not already hold: companies,
    public_funding_events, the sector-label tables, the state-aid staging, the
    audit trail, the run marks. Same names, so ported SQL keeps its table names.
  * The news-signals tables, prefixed `signals_` (their `sources` would collide
    with nothing today, but would with the first brain that has sources).
  * NOT the five instrument tables Postgres already serves (funding_instruments,
    funding_instrument_sources, eligibility_gates, eligibility_clauses,
    instrument_application). The owner's rule, 2026-11-05: the record is what the
    product serves. Where SQLite's authoring copy disagrees, its version goes to
    `_reconcile_20261105_sqlite_gates` untouched, to be published later through
    the measured pipeline. Nothing is lost and nothing changes silently.
  * NOT the views. They are code (data/views.sql) and are ported with the code.

HOW THE SCHEMA IS TRANSLATED
  The SQLite DDL is translated rather than re-derived, so every CHECK, UNIQUE,
  NOT NULL and DEFAULT the corpus earned survives. Types: INTEGER -> BIGINT,
  REAL -> DOUBLE PRECISION, BLOB -> BYTEA, everything else TEXT. Dates and
  timestamps stay TEXT on purpose: SQLite stored them as text, the code compares
  them as text, and a lossless load is the only kind that can be verified
  byte-for-byte. Typing them is its own migration, made when it can be measured.
  Foreign keys are added afterwards as NOT VALID: enforced for every new row,
  while the 27 historical classify_audit orphans (present identically in both
  original stores) are kept rather than deleted to satisfy a constraint.
  The Europe-scope trigger on companies is re-created as a Postgres trigger.

The generated DDL is written to ETL/schema/corpus_schema.sql and committed: it
is the schema authority for these tables from here on.

VERIFICATION is per table and not optional: row count, then an ordered-row
SHA-256 over a normalised rendering of every value, computed independently on
both sides. A mismatch fails the run.
"""
from __future__ import annotations

import hashlib
import os
import re
import sqlite3
import struct
import sys
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[3]
DDL_OUT = ROOT / "ETL" / "schema" / "corpus_schema.sql"

ALREADY_SERVED = {"funding_instruments", "funding_instrument_sources", "eligibility_gates",
                  "eligibility_clauses", "instrument_application"}
SIGNALS_PREFIX = "signals_"
RECONCILE_TABLE = "_reconcile_20261105_sqlite_gates"
# chunk_embeddings.embedding is float32 little-endian, dim from embedding_meta.
VECTOR_COLUMNS = {("signals_chunk_embeddings", "embedding")}

UTC_TEXT_NOW = "to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS')"
EUROPE = ("'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE',"
          "'IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',"
          "'NO','CH','IS','LI','GB','AL','BA','ME','MK','RS','XK','UA','MD',''")


def load_env() -> None:
    env = ROOT / ".env.local"
    if env.exists():
        for line in env.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip("\"'"))


# ---------------------------------------------------------------- translation

def _strip_comments(sql: str) -> str:
    return re.sub(r"--[^\n]*", "", sql)


def translate_table(sql: str, name: str, target: str, rename: dict[str, str],
                    vector_dim: int | None) -> tuple[str, list[str]]:
    """SQLite CREATE TABLE -> Postgres. Returns (create, deferred FK statements)."""
    body = _strip_comments(sql)
    body = body[body.index("(") + 1: body.rindex(")")]
    # split on top-level commas
    parts, depth, cur = [], 0, ""
    for ch in body:
        depth += ch == "("
        depth -= ch == ")"
        if ch == "," and depth == 0:
            parts.append(cur.strip())
            cur = ""
        else:
            cur += ch
    if cur.strip():
        parts.append(cur.strip())

    cols, fks = [], []
    for p in parts:
        p = re.sub(r"\s+", " ", p).strip()
        m_fk = re.match(r"FOREIGN KEY \((\w+)\) REFERENCES (\w+)\s*\((\w+)\)", p, re.I)
        if m_fk:
            fks.append((m_fk.group(1), m_fk.group(2), m_fk.group(3)))
            continue
        if re.match(r"(UNIQUE|CHECK|PRIMARY KEY)\b", p, re.I):
            cols.append(_rewrite_expr(p))
            continue
        m = re.match(r'"?(\w+)"?\s*(.*)', p)
        col, rest = m.group(1), m.group(2)
        ref = re.search(r"REFERENCES (\w+)\s*\((\w+)\)", rest, re.I)
        if ref:
            fks.append((col, ref.group(1), ref.group(2)))
            rest = rest[:ref.start()] + rest[ref.end():]
        m_ty = re.match(r"([A-Za-z]+(?:\s*\([\d,\s]+\))?)?\s*(.*)", rest)
        decl, rest = (m_ty.group(1) or ""), m_ty.group(2)
        up = decl.upper()
        if (target, col) in VECTOR_COLUMNS:
            ty = f"public.vector({vector_dim})"
        elif up.startswith("INT") or up == "BOOLEAN":
            ty = "BIGINT"
        elif up in ("REAL", "FLOAT", "DOUBLE", "NUMERIC") or up.startswith("DECIMAL"):
            ty = "DOUBLE PRECISION"
        elif up == "BLOB":
            ty = "BYTEA"
        else:
            ty = "TEXT"
        if re.search(r"PRIMARY KEY AUTOINCREMENT", rest, re.I):
            rest = re.sub(r"PRIMARY KEY AUTOINCREMENT", "GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY",
                          rest, flags=re.I)
        rest = re.sub(r"DEFAULT CURRENT_TIMESTAMP", f"DEFAULT {UTC_TEXT_NOW}", rest, flags=re.I)
        rest = re.sub(r"DEFAULT \(datetime\('now'\)\)", f"DEFAULT {UTC_TEXT_NOW}", rest, flags=re.I)
        cols.append(f'"{col}" {ty} {_rewrite_expr(rest)}'.rstrip())

    create = f'CREATE TABLE "{target}" (\n  ' + ",\n  ".join(cols) + "\n);"
    deferred = [
        f'ALTER TABLE "{target}" ADD CONSTRAINT "{target}_{c}_fkey" FOREIGN KEY ("{c}") '
        f'REFERENCES "{rename.get(t, t)}" ("{k}") NOT VALID;'
        for c, t, k in fks]
    return create, deferred


def _rewrite_expr(s: str) -> str:
    # SQLite string concatenation and functions that differ are rare in this
    # schema; anything unknown surfaces as a Postgres error at CREATE time.
    return s.replace("==", "=")


def translate_index(sql: str, rename: dict[str, str]) -> str:
    s = re.sub(r"\s+", " ", _strip_comments(sql)).strip().rstrip(";")
    s = re.sub(r"^CREATE (UNIQUE )?INDEX (IF NOT EXISTS )?", lambda m: f"CREATE {m.group(1) or ''}INDEX IF NOT EXISTS ", s, flags=re.I)
    m = re.search(r" ON (\w+)\s*\(", s)
    if m and m.group(1) in rename:
        s = s[:m.start(1)] + f'"{rename[m.group(1)]}"' + s[m.end(1):]
    return s + ";"


TRIGGER = f"""
CREATE OR REPLACE FUNCTION companies_country_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.country IS NOT NULL AND upper(trim(NEW.country)) NOT IN ({EUROPE}) THEN
    RAISE EXCEPTION 'Europe-scope violation on companies.country: % is not in the 40-country EU/Europe scope. Use europe_scope.canonicalise_country() before insert, or skip the row.', NEW.country;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_companies_country_scope BEFORE INSERT OR UPDATE OF country ON companies
  FOR EACH ROW EXECUTE FUNCTION companies_country_scope();
"""


# ------------------------------------------------------------------ the plan

def plan(corpus: sqlite3.Connection, signals: sqlite3.Connection):
    """[(conn, source_table, target_table)], in dependency order."""
    out = []
    for (t,) in corpus.execute("SELECT name FROM sqlite_master WHERE type='table' "
                               "AND name NOT LIKE 'sqlite_%' ORDER BY name"):
        if t not in ALREADY_SERVED:
            out.append((corpus, t, t))
    for (t,) in signals.execute("SELECT name FROM sqlite_master WHERE type='table' "
                                "AND name NOT LIKE 'sqlite_%' ORDER BY name"):
        out.append((signals, t, SIGNALS_PREFIX + t))
    # parents first: anything referenced by a FK loads before its children
    order = {"companies": 0, "signals_sources": 0, "signals_articles": 1, "signals_article_chunks": 2}
    out.sort(key=lambda x: (order.get(x[2], 5), x[2]))
    return out


# --------------------------------------------------------------- verification

def _render(v, is_vector=False) -> str:
    if v is None:
        return "\\N"
    if is_vector:
        if isinstance(v, (bytes, memoryview)):
            b = bytes(v)
            vals = struct.unpack(f"<{len(b) // 4}f", b)
        else:
            vals = [float(x) for x in str(v).strip("[]").split(",")]
        # Both sides at EXACT float32: SQLite holds the raw bytes, Postgres prints
        # the shortest decimal that round-trips, and a rounded comparison of the
        # two disagrees at the last digit on a handful of the 4.3M values.
        vals = struct.unpack(f"<{len(vals)}f", struct.pack(f"<{len(vals)}f", *vals))
        return ",".join(repr(x) for x in vals)
    if isinstance(v, (bytes, memoryview)):
        return "x" + bytes(v).hex()
    if isinstance(v, bool):
        return str(int(v))
    if isinstance(v, float):
        return repr(int(v)) if v.is_integer() else repr(v)
    return str(v)


def row_hash(rows, vector_idx: set[int]) -> tuple[int, str]:
    """Order-independent: SHA-256 over the SORTED per-row digests. Postgres and
    SQLite collate text keys differently, so an ORDER BY cannot be shared."""
    digests = []
    for r in rows:
        digests.append(hashlib.sha256(
            "\x1f".join(_render(v, i in vector_idx) for i, v in enumerate(r)).encode()).digest())
    digests.sort()
    h = hashlib.sha256()
    for d in digests:
        h.update(d)
    return len(digests), h.hexdigest()


def _same(a, b) -> bool:
    """Is a SQLite value the same CLAIM as a Postgres one? Types differ by store:
    Postgres hands back dates, JSON and REAL as typed objects, SQLite as text."""
    import datetime
    import decimal
    import json

    def norm(v):
        if v is None:
            return None
        if isinstance(v, (datetime.date, datetime.datetime)):
            return v.isoformat()[:10]
        if isinstance(v, (dict, list)):
            return json.dumps(v, sort_keys=True)
        if isinstance(v, decimal.Decimal):
            v = float(v)
        if isinstance(v, bool):
            return int(v)
        if isinstance(v, float):
            return round(v, 5)
        if isinstance(v, str):
            try:
                j = json.loads(v)
                if isinstance(j, (dict, list)):
                    return json.dumps(j, sort_keys=True)
            except ValueError:
                pass
            if len(v) >= 10 and v[4] == "-" and v[7] == "-" and v[:4].isdigit():
                return v[:10]
        return v
    return norm(a) == norm(b)


# ----------------------------------------------------------------------- main

def main() -> int:
    if len(sys.argv) < 3:
        return print(__doc__) or 2
    corpus_p, signals_p = (Path(a).expanduser().resolve() for a in sys.argv[1:3])
    write = "--write" in sys.argv
    load_env()
    url = os.environ["DATABASE_URL"]

    corpus = sqlite3.connect(f"file:{corpus_p}?mode=ro", uri=True)
    signals = sqlite3.connect(f"file:{signals_p}?mode=ro", uri=True)
    vector_dim = signals.execute("SELECT dim FROM embedding_meta WHERE id=1").fetchone()[0]
    items = plan(corpus, signals)
    rename = {src: tgt for conn, src, tgt in items if conn is signals}

    ddl, deferred_fks, indexes = [], [], []
    for conn, src, tgt in items:
        sql = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (src,)).fetchone()[0]
        local_rename = rename if conn is signals else {}
        create, fks = translate_table(sql, src, tgt, local_rename, vector_dim)
        ddl.append(create)
        deferred_fks += fks
        for (isql,) in conn.execute("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? "
                                    "AND sql IS NOT NULL ORDER BY name", (src,)):
            indexes.append(translate_index(isql, local_rename))

    header = ("-- Schema authority for the capital corpus tables in schema `capital`.\n"
              "-- Generated once by ETL/schema/consolidate/load_into_postgres.py from the\n"
              "-- SQLite DDL on 2026-11-05; edited by migration from here on, not regenerated.\n"
              "-- Applied by capital_app, whose search_path is `capital, public`.\n")
    full = header + "\n\n".join(ddl) + "\n\n" + "\n".join(indexes) + "\n" + TRIGGER + "\n" + "\n".join(deferred_fks) + "\n"
    DDL_OUT.write_text(full)
    print(f"DDL for {len(items)} tables, {len(indexes)} indexes, {len(deferred_fks)} FKs -> {DDL_OUT.relative_to(ROOT)}")
    for conn, src, tgt in items:
        n = conn.execute(f'SELECT count(*) FROM "{src}"').fetchone()[0]
        print(f"  {src:28s} -> {tgt:32s} {n:>9,} rows")
    if not write:
        print("\nDRY RUN: nothing written. Re-run with --write.")
        return 0

    def connect():
        # Keepalives: the first attempt pushed the corpus through Railway's TCP
        # proxy as ONE transaction and lost the socket 14 minutes in (rolled back
        # cleanly). Now each table is its own transaction and the run resumes.
        return psycopg.connect(url, keepalives=1, keepalives_idle=30,
                               keepalives_interval=10, keepalives_count=6)

    with connect() as pg:
        if pg.execute("select current_user").fetchone()[0] != "capital_app":
            sys.exit("REFUSING: connect as capital_app, so every table is owned by the brain")
        existing = {r[0] for r in pg.execute(
            "SELECT tablename FROM pg_tables WHERE schemaname = current_schema()")}
        ours = {tgt for _, _, tgt in items}
        if not (existing & ours):
            with pg.transaction():
                for stmt in ddl:
                    pg.execute(stmt)
            print("created every table", flush=True)
        elif not ours <= existing:
            sys.exit(f"REFUSING: a partial schema exists ({sorted(existing & ours)}); inspect it by hand")
        else:
            print("tables exist: resuming", flush=True)

    for conn, src, tgt in items:
        n_src = conn.execute(f'SELECT count(*) FROM "{src}"').fetchone()[0]
        cols = [c[1] for c in conn.execute(f'PRAGMA table_info("{src}")')]
        vec = {i for i, c in enumerate(cols) if (tgt, c) in VECTOR_COLUMNS}
        collist = ", ".join(f'"{c}"' for c in cols)
        for attempt in range(1, 4):
            try:
                with connect() as pg:
                    n_pg = pg.execute(f'SELECT count(*) FROM "{tgt}"').fetchone()[0]
                    if n_pg == n_src:
                        print(f"  {tgt:32s} already loaded ({n_pg:,})", flush=True)
                        break
                    with pg.transaction():
                        # Only ever a table THIS loader created from the archive,
                        # so emptying a partial attempt loses nothing.
                        pg.execute(f'TRUNCATE "{tgt}"')
                        with pg.cursor().copy(f'COPY "{tgt}" ({collist}) FROM STDIN') as cp:
                            for r in conn.execute(f'SELECT {collist} FROM "{src}"'):
                                if vec:
                                    r = list(r)
                                    for i in vec:
                                        b = bytes(r[i])
                                        r[i] = "[" + ",".join(repr(x) for x in struct.unpack(f"<{len(b)//4}f", b)) + "]"
                                cp.write_row(r)
                        for (col,) in pg.execute(
                                "SELECT a.attname FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid "
                                "WHERE c.relname=%s AND c.relnamespace=current_schema()::regnamespace "
                                "AND a.attidentity<>''", (tgt,)).fetchall():
                            pg.execute(f'SELECT setval(pg_get_serial_sequence(\'"{tgt}"\', \'{col}\'), '
                                       f'COALESCE((SELECT max("{col}") FROM "{tgt}"), 0) + 1, false)')
                print(f"  {tgt:32s} loaded {n_src:,}", flush=True)
                break
            except psycopg.OperationalError as e:
                print(f"  {tgt}: attempt {attempt} lost the connection ({e}); retrying", flush=True)
        else:
            sys.exit(f"FAILED to load {tgt} after 3 attempts")

    with connect() as pg:
        with pg.transaction():
            for stmt in indexes:
                pg.execute(stmt)
            if not pg.execute("SELECT 1 FROM pg_trigger WHERE tgname='trg_companies_country_scope'").fetchone():
                pg.execute(TRIGGER)
            have = {r[0] for r in pg.execute(
                "SELECT conname FROM pg_constraint WHERE connamespace=current_schema()::regnamespace")}
            for stmt in deferred_fks:
                if re.search(r'CONSTRAINT "([^"]+)"', stmt).group(1) not in have:
                    pg.execute(stmt)
        print("indexes, trigger and foreign keys in place", flush=True)

        # SQLite's authoring copy of the gates, wherever it disagrees with
        # what the product serves. Kept whole, not as a diff, so it can be
        # published later by the ordinary pipeline.
        if not pg.execute("SELECT to_regclass(%s)", (RECONCILE_TABLE,)).fetchone()[0]:
            with pg.transaction():
                gcols = [c[1] for c in corpus.execute("PRAGMA table_info(eligibility_gates)")]
                pg.execute(f'CREATE TABLE "{RECONCILE_TABLE}" (LIKE eligibility_gates)')
                pg.execute(f'ALTER TABLE "{RECONCILE_TABLE}" ADD COLUMN disposition TEXT NOT NULL')
                served = {(r[0], r[1]): r for r in pg.execute(
                    f"SELECT instrument_id, gate_key, {', '.join(gcols)} FROM eligibility_gates")}
                kept = 0
                skip = {"id", "created_at", "updated_at"}
                idx = [i for i, c in enumerate(gcols) if c not in skip]
                with pg.cursor().copy(f'COPY "{RECONCILE_TABLE}" ({", ".join(gcols)}, disposition) FROM STDIN') as cp:
                    for r in corpus.execute(f"SELECT {', '.join(gcols)} FROM eligibility_gates"):
                        key = (r[gcols.index("instrument_id")], r[gcols.index("gate_key")])
                        s_ = served.get(key)
                        if s_ is None:
                            disp = "absent_from_served"
                        elif not all(_same(r[i], s_[2 + i]) for i in idx):
                            disp = "differs_from_served"
                        else:
                            continue
                        cp.write_row(list(r) + [disp])
                        kept += 1
            print(f"  {RECONCILE_TABLE}: {kept} SQLite gate rows kept for a measured publish", flush=True)

    print("\nVERIFY (count + order-independent SHA-256, both sides independently):", flush=True)
    bad = 0
    for conn, src, tgt in items:
        cols = [c[1] for c in conn.execute(f'PRAGMA table_info("{src}")')]
        vec = {i for i, c in enumerate(cols) if (tgt, c) in VECTOR_COLUMNS}
        collist = ", ".join(f'"{c}"' for c in cols)
        a = row_hash(conn.execute(f'SELECT {collist} FROM "{src}"'), vec)
        with connect() as pg, pg.cursor(name=f"v_{tgt}") as cur:
            cur.itersize = 5000
            cur.execute(f'SELECT {collist} FROM "{tgt}"')
            b = row_hash(cur, vec)
        ok = a == b
        bad += not ok
        print(f"  {'ok ' if ok else 'BAD'} {tgt:32s} {a[0]:>9,} rows  {a[1][:16]}" +
              ("" if ok else f"  != pg {b[0]:,} {b[1][:16]}"), flush=True)
    if bad:
        print(f"\n{bad} table(s) FAILED verification")
        return 1
    print("\nevery table verified")
    return 0


if __name__ == "__main__":
    sys.exit(main())
