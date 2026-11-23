"""One body, one unit, one person: write `same_as` corrections (migration 047) for bodies the census
added that the hand-made map already held under another name. Dry run unless --apply.

    python3 capital/ETL/terms/load_same_as.py --database-url URL

Input: capital/reference/census/duplicate_pairs.csv (judged pairs: census_key, original_key,
verdict same|different). For every SAME pair the census body becomes an alias of the original;
then their units are aligned TOP-DOWN: a census unit is the same as an original unit only when
their parents are already aligned and their names match exactly (case, accents and punctuation
ignored), so "(II)" in two different directorates never pairs them. Insert-only; no row deleted.
No model, no API credits.
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
import unicodedata
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import psycopg  # noqa: E402

PAIRS = REPO / "capital" / "reference" / "census" / "duplicate_pairs.csv"
MIGRATIONS = REPO / "capital" / "ETL" / "schema" / "migrations"


def nm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()).strip()


def migrate(con) -> str:
    have = {r[0] for r in con.execute("SELECT id FROM schema_migrations").fetchall()}
    if "047" in have:
        return "047 already applied"
    con.execute("SELECT pg_advisory_xact_lock(hashtext('capital.schema_migrations'))")
    con.execute(next(MIGRATIONS.glob("047_*.sql")).read_text())
    con.execute("INSERT INTO schema_migrations (id) VALUES ('047')")
    return "047 applied (or would be, in a dry run)"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--database-url", required=True)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    pairs = [(r["census_key"], r["original_key"]) for r in csv.DictReader(PAIRS.open()) if r["verdict"].strip().lower() == "same"]
    with psycopg.connect(a.database_url) as con:
        con.execute("SET search_path = capital, public")
        print(" ", migrate(con))
        rows = con.execute("SELECT key, parent_key, name FROM institutions").fetchall()
        kids: dict[str, list] = {}
        name = {}
        for k, p, n in rows:
            name[k] = n
            if p:
                kids.setdefault(p, []).append(k)
        held = {r[0] for r in con.execute("SELECT row_key FROM graph_corrections WHERE table_name = 'institutions' AND column_name = 'same_as'")}
        out: list[tuple[str, str, str]] = []
        queue = [(c, o, "judged the same body (census duplicate review)") for c, o in pairs if c in name and o in name]
        while queue:
            c, o, why = queue.pop()
            out.append((c, o, why))
            okids = {nm(name[k]): k for k in kids.get(o, [])}
            for ck in kids.get(c, []):
                ok = okids.get(nm(name[ck]))
                if ok and ok != ck:
                    queue.append((ck, ok, f"same name under aligned parents ({o})"))
        new = [x for x in out if x[0] not in held]
        for c, o, why in new:
            con.execute("INSERT INTO graph_corrections (table_name, row_key, column_name, value, reason, citations, batch) "
                        "VALUES ('institutions', %s, 'same_as', %s, %s, '[]'::jsonb, 'same_as_2026_11') ON CONFLICT DO NOTHING",
                        (c, o, why))
        bodies = sum(1 for x in new if x[2].startswith("judged"))
        print(f"  same_as corrections: {len(new)} new ({bodies} bodies judged the same, {len(new) - bodies} units aligned under them), "
              f"{len(out) - len(new)} already held")
        for c, o, _ in new[:12]:
            print(f"    {c} -> {o}")
        if not a.apply:
            con.rollback()
            print("DRY RUN: rolled back, nothing written. Add --apply to write (owner-approved).")
        else:
            print("APPLIED.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
