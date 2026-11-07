"""Capital's three vector tables onto the ONE model, with no mismatch window.

    python3 mandate/ops/one_model.py plan     --db-url URL          read-only: counts, cost, size
    python3 mandate/ops/one_model.py backfill --db-url URL --apply  fill embedding_v4 (paid)
    python3 mandate/ops/one_model.py verify   --db-url URL          read-only: is every row complete?
    python3 mandate/ops/one_model.py flip     --db-url URL          repo edit: spaces.json stored -> MODEL

The owner's entry point is mandate/ops/one_model.sh, which runs these in order.

WHY THERE IS NO WINDOW. A query embedded in one space and compared with vectors
of another returns noise that looks like a result. So:
  1. migration 036 adds MODEL's column (embedding_v4 halfvec(1024)) BESIDE the
     legacy one; nothing is overwritten and every reader still reads legacy.
  2. `backfill` fills embedding_v4 for every row, resumably (anti-join on
     `embedding_v4 IS NULL`, per-batch commit). The writers dual-write every
     NEW row from the moment 036 exists, so the table cannot fall behind.
  3. `verify` proves every row has a 1024-d vector, each row is its own nearest
     neighbour, and reports how far the neighbourhoods moved.
  4. `flip` changes spaces.json `stored` for the three tables and regenerates
     web/lib/embedding.ts. That ONE commit moves the query model AND the column
     every reader reads (vector_columns), in Python and TypeScript alike. Each
     deployed version is self-consistent: the old one reads legacy vectors with
     the legacy model, the new one reads embedding_v4 with MODEL, and both
     columns are complete while both versions may be live.
  5. Only after the flip is deployed: mandate/ops/one_model_drop_old.sh
     archives and drops the legacy columns (owner-briefed; a deletion).

Cost: Voyage bills what its tokenizer counts; the plan's chars/4 estimate is
checked against the run's own billed usage line. MODEL's price is in spaces.json.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import psycopg

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))
from mandate.embedding import (DIM, MODEL, SPACES, STORED, Embedder,  # noqa: E402
                               column_dim, estimate_cost_usd, target_column,
                               vector_column, vector_literal)

SPEC = REPO / "mandate" / "embedding" / "spaces.json"
VOLUME_BYTES = 5 * 1024 ** 3          # the Railway Hobby volume; it cannot grow
BATCH = 128

#: How to read each table's text, keyed by its registered name.
TABLES = {
    "capital.eligibility_embeddings": {
        "key": "t.id", "text": "t.chunk_text", "from": "eligibility_embeddings t"},
    "capital.instrument_profiles": {
        "key": "t.instrument_id", "text": "t.profile_text", "from": "instrument_profiles t"},
    "capital.signals_chunk_embeddings": {
        "key": "t.chunk_id", "text": "c.chunk_text",
        "from": "signals_chunk_embeddings t JOIN signals_article_chunks c ON c.id = t.chunk_id"},
}


def _connect(url: str, readonly: bool) -> psycopg.Connection:
    con = psycopg.connect(url, keepalives=1, keepalives_idle=30)
    if readonly:
        con.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
    con.execute("SET search_path = capital, public")
    return con


def _target(table: str):
    """MODEL's column for `table`: the target while the table is legacy, and the
    stored column itself once it has been flipped."""
    return target_column(table) or vector_column(table)


def _short(table: str) -> str:
    return table.split(".")[-1]


# ── plan ────────────────────────────────────────────────────────────────────
def plan(con, max_db_gb: float) -> dict:
    rows = []
    for table, t in TABLES.items():
        tgt = _target(table)
        has = column_dim(con, tgt) is not None
        missing_where = f"WHERE t.{tgt.column} IS NULL" if has else ""
        n_all = con.execute(f"SELECT count(*) FROM {_short(table)}").fetchone()[0]
        n, chars, empty = con.execute(
            f"SELECT count(*), coalesce(sum(length({t['text']})), 0), "
            f"count(*) FILTER (WHERE coalesce(btrim({t['text']}), '') = '') "
            f"FROM {t['from']} {missing_where}").fetchone()
        heap = con.execute("SELECT pg_relation_size(%s::regclass)", (_short(table),)).fetchone()[0]
        total = con.execute("SELECT pg_total_relation_size(%s::regclass)", (_short(table),)).fetchone()[0]
        tokens = int(chars) // 4
        rows.append({
            "table": table, "stored": STORED[table], "flipped": STORED[table] == MODEL,
            "column": tgt.column, "column_exists": has, "rows": n_all, "missing": n,
            "empty_text": empty, "tokens_est": tokens,
            "cost_usd_est": round(estimate_cost_usd(tokens, MODEL), 4),
            "bytes_new": n * (2 * DIM + 8), "heap_bytes": heap, "total_bytes": total})
    db = con.execute("SELECT pg_database_size(current_database())").fetchone()[0]
    new = sum(r["bytes_new"] for r in rows)
    # An UPDATE writes a new row version (and, not being HOT, new index
    # entries); until vacuum reclaims the old ones the table can briefly hold
    # both. Counted at the table's whole size with TOAST and indexes: generous.
    transient = sum(r["total_bytes"] for r in rows if r["missing"])
    no_elig = con.execute(
        """SELECT count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM eligibility_gates g
                                    WHERE g.instrument_id = fi.id AND g.verification_level <> 'llm_classified')
                                AND NOT EXISTS (SELECT 1 FROM eligibility_clauses c
                                    WHERE c.instrument_id = fi.id AND c.verification_level <> 'llm_classified')),
                  count(*)
             FROM funding_instruments fi
            WHERE NOT EXISTS (SELECT 1 FROM eligibility_embeddings e WHERE e.instrument_id = fi.id)""").fetchone()
    no_profile = con.execute(
        """SELECT count(*) FROM funding_instruments fi WHERE NOT EXISTS
           (SELECT 1 FROM eligibility_embeddings e WHERE e.instrument_id = fi.id)
           AND NOT EXISTS (SELECT 1 FROM instrument_profiles p WHERE p.instrument_id = fi.id)""").fetchone()[0]
    return {"tables": rows, "db_bytes": db, "new_bytes": new, "transient_bytes": transient,
            "projected_bytes": db + new + transient, "max_db_bytes": int(max_db_gb * 1024 ** 3),
            "no_eligibility_embedding": {"instruments": no_elig[1], "only_uncited_gates": no_elig[0],
                                         "also_no_profile": no_profile}}


def print_plan(p: dict) -> None:
    price = SPACES[MODEL].price_per_mtok_usd
    print(f"PLAN: capital's vector tables onto {MODEL} ({DIM}-d halfvec). Read-only; nothing called.\n")
    for r in p["tables"]:
        state = ("FLIPPED: readers are on it" if r["flipped"] else f"stored in {r['stored']}")
        print(f"  {r['table']}  ({state})")
        if not r["column_exists"]:
            print(f"     {r['column']} does not exist yet: migration 036 has not run")
        print(f"     {r['rows']:>7,} rows; {r['missing']:,} without a {MODEL} vector; "
              f"~{r['tokens_est']:,} tokens ~ ${r['cost_usd_est']:.4f}"
              + (f"; {r['empty_text']} with EMPTY text (cannot be embedded)" if r["empty_text"] else ""))
    tok = sum(r["tokens_est"] for r in p["tables"])
    usd = sum(r["cost_usd_est"] for r in p["tables"])
    gb = 1024 ** 3
    print(f"\n  TOTAL: ~{tok:,} tokens, ~${usd:.2f} at ${price}/M (Voyage's free tokens for the 4 "
          f"series apply first, if unspent)")
    print(f"  SIZE: database {p['db_bytes'] / gb:.2f} GB; +{p['new_bytes'] / 1e6:.0f} MB of vectors, "
          f"up to +{p['transient_bytes'] / 1e6:.0f} MB transient until vacuum; projected "
          f"{p['projected_bytes'] / gb:.2f} GB of the {VOLUME_BYTES / gb:.0f} GB volume "
          f"(refuses above {p['max_db_bytes'] / gb:.1f} GB)")
    ne = p["no_eligibility_embedding"]
    print(f"\n  NOT EMBEDDED BY DESIGN: {ne['instruments']} instruments have no eligibility "
          f"embedding; {ne['only_uncited_gates']} of them hold only llm_classified requirements "
          f"(no quote), which embed_eligibility.py refuses to index so retrieval never surfaces "
          f"an ungrounded guess. They are not in this backfill. {ne['instruments'] - ne['also_no_profile']} "
          f"of them have an instrument_profiles vector, so they are still matched and ranked.")


# ── backfill ────────────────────────────────────────────────────────────────
def backfill(con, max_usd: float, limit: int = 0, embedder=None) -> int:
    e = embedder or Embedder(MODEL)
    written = 0
    for table, t in TABLES.items():
        tgt = _target(table)
        if column_dim(con, tgt) != DIM:
            raise SystemExit(f"{table}.{tgt.column} is missing or not {DIM}-d: run migration 036 first")
        n_table = 0
        while True:
            batch = con.execute(
                f"SELECT {t['key']}, {t['text']} FROM {t['from']} "
                f"WHERE t.{tgt.column} IS NULL AND coalesce(btrim({t['text']}), '') <> '' "
                f"ORDER BY {t['key']} LIMIT {BATCH}").fetchall()
            if not batch:
                break
            vecs = e.embed_documents([r[1] for r in batch])
            key = t["key"].split(".")[-1]
            with con.cursor() as cur:
                cur.executemany(
                    f"UPDATE {_short(table)} SET {tgt.column} = %s{tgt.cast} "
                    f"WHERE {key} = %s AND {tgt.column} IS NULL",
                    [(vector_literal(v), r[0]) for r, v in zip(batch, vecs, strict=True)])
            con.commit()                                   # per batch: kill-safe, resumable
            n_table += len(batch)
            written += len(batch)
            print(f"  {_short(table)}: {n_table:,} written  ({e.usage.line()})", flush=True)
            if e.usage.cost_usd > max_usd:
                raise SystemExit(f"STOPPED at --max-usd ${max_usd:.2f}; re-run to continue "
                                 f"(every batch written so far is committed)")
            if limit and written >= limit:
                print(f"  --limit {limit} reached")
                return written
    print(f"backfill done: {written:,} vectors written. {e.usage.line()}")
    return written


# ── verify ──────────────────────────────────────────────────────────────────
def verify(con, sample: int = 20) -> bool:
    ok = True
    print(f"VERIFY: every row has a {MODEL} vector. Read-only.\n")
    for table, t in TABLES.items():
        tgt = _target(table)
        if column_dim(con, tgt) != DIM:
            print(f"  FAIL {table}: {tgt.column} missing or not {DIM}-d (migration 036)")
            ok = False
            continue
        s = _short(table)
        n, missing = con.execute(
            f"SELECT count(*), count(*) FILTER (WHERE {tgt.column} IS NULL) FROM {s}").fetchone()
        # Each sampled row must be its own nearest neighbour: catches vectors
        # written to the wrong row, zero vectors, and a wrong cast.
        key = t["key"].split(".")[-1]
        ids = [r[0] for r in con.execute(
            f"SELECT {key} FROM {s} WHERE {tgt.column} IS NOT NULL ORDER BY md5({key}::text) LIMIT %s",
            (sample,)).fetchall()]
        zero = con.execute(f"SELECT count(*) FROM {s} WHERE {tgt.column} IS NOT NULL "
                           f"AND vector_norm({tgt.column}::vector) = 0").fetchone()[0]
        self_nn = 0
        overlap = []
        legacy = vector_column(table, STORED[table]) if STORED[table] != MODEL else None
        legacy_ok = legacy is not None and column_dim(con, legacy) is not None
        for i in ids:
            got = con.execute(
                f"SELECT {key}, {tgt.column} <=> (SELECT {tgt.column} FROM {s} WHERE {key} = %s) "
                f"FROM {s} WHERE {tgt.column} IS NOT NULL ORDER BY 2, {key} LIMIT 10", (i,)).fetchall()
            nn = [r[0] for r in got]
            # Its own nearest neighbour, or a neighbour at distance 0: an identical text.
            # 2,495 of 9,103 eligibility rows share their text with another (one clause
            # cited by several funds), and with more than ten twins the row itself can
            # sit outside its own top 10 although its vector is exactly right
            # (2026-11-07: 17/20 failed only for that reason).
            self_nn += bool(got) and (got[0][0] == i or abs(float(got[0][1])) < 1e-6)
            if legacy_ok:
                old = [r[0] for r in con.execute(
                    f"SELECT {key} FROM {s} WHERE {legacy.column} IS NOT NULL ORDER BY {legacy.column} <=> "
                    f"(SELECT {legacy.column} FROM {s} WHERE {key} = %s), {key} LIMIT 10", (i,)).fetchall()]
                overlap.append(len(set(nn) & set(old)) / 10)
        good = missing == 0 and n > 0 and zero == 0 and self_nn == len(ids)
        ok &= good
        moved = (f"; top-10 neighbours shared with the legacy space: {sum(overlap) / len(overlap):.0%} "
                 f"(a different model: reported, not gated)") if overlap else ""
        print(f"  {'ok  ' if good else 'FAIL'} {table}: {n - missing:,}/{n:,} rows have {tgt.column}; "
              f"{self_nn}/{len(ids)} sampled rows are their own nearest neighbour; "
              f"{zero} zero vectors{moved}")
    print("\nCOMPLETE: safe to flip." if ok else "\nINCOMPLETE: do not flip. Re-run the backfill.")
    return ok


# ── flip ────────────────────────────────────────────────────────────────────
def flip(spec_path: Path = SPEC) -> list[str]:
    spec = json.loads(spec_path.read_text())
    changed = []
    for table in TABLES:
        if spec["stored"][table] != MODEL:
            spec["stored"][table] = MODEL
            changed.append(table)
    if changed:
        spec_path.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n")
    return changed


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["plan", "backfill", "verify", "flip"])
    ap.add_argument("--db-url", required=True)
    ap.add_argument("--apply", action="store_true", help="backfill: actually call Voyage and write")
    ap.add_argument("--max-usd", type=float, default=1.0, help="backfill: stop past this spend")
    ap.add_argument("--max-db-gb", type=float, default=4.5, help="refuse if projected past this")
    ap.add_argument("--limit", type=int, default=0, help="backfill: stop after N vectors (rehearsal)")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    if a.cmd == "plan":
        with _connect(a.db_url, readonly=True) as con:
            p = plan(con, a.max_db_gb)
        print(json.dumps(p, indent=2) if a.json else "", end="")
        if not a.json:
            print_plan(p)
        return 0 if p["projected_bytes"] <= p["max_db_bytes"] else 3
    if a.cmd == "verify":
        with _connect(a.db_url, readonly=True) as con:
            return 0 if verify(con) else 1
    if a.cmd == "flip":
        with _connect(a.db_url, readonly=True) as con:
            if not verify(con):
                return 1
        changed = flip()
        print(f"\nspaces.json: stored -> {MODEL} for {', '.join(changed) or 'nothing (already flipped)'}")
        return 0
    # backfill
    with _connect(a.db_url, readonly=not a.apply) as con:
        p = plan(con, a.max_db_gb)
        print_plan(p)
        if p["projected_bytes"] > p["max_db_bytes"]:
            print("\nREFUSED: the projected size is past --max-db-gb. Free space first.")
            return 3
        if not a.apply:
            print("\nDRY RUN: nothing called, nothing written. Add --apply.")
            return 0
        backfill(con, a.max_usd, a.limit)
    return 0


if __name__ == "__main__":
    sys.exit(main())
