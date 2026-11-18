"""Hold the database up against the knowledge map (owner, 18 Nov: "map everything we need to know
first, so we can always hold it up against whether we actually know everything").

    PYTHONPATH=. python3 -m mandate.eval.knowledge_coverage            # per market: held / expected
    PYTHONPATH=. python3 -m mandate.eval.knowledge_coverage --missing  # and every missing key

The map is mandate/brains/wincent/knowledge_map.yaml (institutions, products, processes, roles per
market). What is held is read from the graph-core tables (migration 042: institutions,
institution_offers, processes, stakeholders), matched by key. Read-only: it opens the database with
the URL in DATABASE_URL (or --db) and never writes. Tables not yet created count as nothing held.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
MAP = HERE.parent / "brains" / "wincent" / "knowledge_map.yaml"
PARTS = {"institutions": "capital.institutions", "products": "capital.institution_offers",
         "processes": "capital.processes", "roles": "capital.stakeholders"}


def load_map(path: Path = MAP) -> dict:
    return (yaml.safe_load(path.read_text()) or {}).get("markets") or {}


def coverage(kmap: dict, held: dict[str, set[str]]) -> dict:
    """market -> part -> {expected, held, missing[]} ; `held` maps part -> keys present."""
    out: dict = {}
    for market, parts in kmap.items():
        out[market] = {}
        for part in PARTS:
            keys = [x["key"] for x in (parts or {}).get(part) or []]
            have = [k for k in keys if k in held.get(part, set())]
            out[market][part] = {"expected": len(keys), "held": len(have), "missing": [k for k in keys if k not in have]}
    return out


def held_keys(db_url: str) -> dict[str, set[str]]:
    import psycopg  # read-only use
    held: dict[str, set[str]] = {p: set() for p in PARTS}
    with psycopg.connect(db_url, autocommit=True) as conn:
        conn.execute("SET default_transaction_read_only = on")
        for part, table in PARTS.items():
            schema, name = table.split(".")
            exists = conn.execute("select 1 from information_schema.tables where table_schema=%s and table_name=%s",
                                  (schema, name)).fetchone()
            if exists:
                held[part] = {r[0] for r in conn.execute(f"select distinct key from {table}")}
    return held


def render(cov: dict, missing: bool = False) -> str:
    lines = ["| market | institutions | products | processes | roles |", "|---|---|---|---|---|"]
    for m, parts in cov.items():
        cells = [f"{p['held']}/{p['expected']}" if p["expected"] else "not mapped" for p in parts.values()]
        lines.append(f"| {m} | " + " | ".join(cells) + " |")
    if missing:
        for m, parts in cov.items():
            for part, p in parts.items():
                if p["missing"]:
                    lines.append(f"\n**{m} {part} missing ({len(p['missing'])}):** " + ", ".join(p["missing"]))
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=os.environ.get("DATABASE_URL"))
    ap.add_argument("--missing", action="store_true")
    a = ap.parse_args(argv)
    if not a.db:
        print("no database URL (set DATABASE_URL or --db); showing the map with nothing held", file=sys.stderr)
    held = held_keys(a.db) if a.db else {p: set() for p in PARTS}
    print(render(coverage(load_map(), held), a.missing))
    return 0


if __name__ == "__main__":
    sys.exit(main())
