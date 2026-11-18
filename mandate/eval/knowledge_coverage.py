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
         "processes": "capital.processes",
         # the org charts held: institutions whose chart is in grounding and extracted (org_charts table)
         "org_charts": "capital.org_charts"}


def load_map(path: Path = MAP) -> dict:
    return (yaml.safe_load(path.read_text()) or {}).get("markets") or {}


def coverage(kmap: dict, held: dict[str, set[str]], people: dict[str, int] | None = None) -> dict:
    """market -> part -> {expected, held, missing[]} ; `held` maps part -> keys present; `people`
    is the count of role-holders held per market (from the org charts: no checklist)."""
    out: dict = {}
    for market, parts in kmap.items():
        out[market] = {"people": {"expected": 0, "held": (people or {}).get(market, 0), "missing": []}}
        for part in PARTS:
            keys = [x["key"] for x in (parts or {}).get(part) or []]
            have = [k for k in keys if k in held.get(part, set())]
            out[market][part] = {"expected": len(keys), "held": len(have), "missing": [k for k in keys if k not in have]}
    return out


def changed_charts(db_url: str) -> list[dict]:
    """Org charts whose latest fetch changed and has not been extracted since (Needs you)."""
    import psycopg
    with psycopg.connect(db_url, autocommit=True) as conn:
        conn.execute("SET default_transaction_read_only = on")
        if not conn.execute("select 1 from information_schema.tables where table_schema='capital' and table_name='org_charts'").fetchone():
            return []
        rows = conn.execute("""
            select distinct on (institution_key) institution_key, url, fetched_at, changed, extracted_at
            from capital.org_charts order by institution_key, recorded_at desc""").fetchall()
    return [{"institution_key": r[0], "url": r[1], "fetched_at": r[2].isoformat()} for r in rows if r[3] and not r[4]]


def as_json(kmap: dict, cov: dict, changed: list[dict]) -> dict:
    """For the bench's Knowledge page: per market and part, held / expected and the missing items by name."""
    names = {m: {x["key"]: x.get("name") or x.get("title") or x.get("role") or x["key"]
                 for part in PARTS if part != "org_charts"  # a chart reuses its institution's key, without a name
                 for x in (parts or {}).get(part) or []} for m, parts in kmap.items()}
    inst_names = {m: {x["key"]: x.get("name", x["key"]) for x in (parts or {}).get("institutions") or []} for m, parts in kmap.items()}
    out = {"markets": [], "changed_charts": changed}
    for m, parts in cov.items():
        out["markets"].append({"market": m, "parts": [
            {"part": part, "expected": p["expected"], "held": p["held"],
             "missing": [{"key": k, "name": (inst_names[m].get(k) if part == "org_charts" else names[m].get(k)) or k} for k in p["missing"]]}
            for part, p in parts.items()]})
    return out


def people_held(db_url: str) -> dict[str, int]:
    import psycopg
    with psycopg.connect(db_url, autocommit=True) as conn:
        conn.execute("SET default_transaction_read_only = on")
        if not conn.execute("select 1 from information_schema.tables where table_schema='capital' and table_name='stakeholders'").fetchone():
            return {}
        return {m: n for m, n in conn.execute("""select i.market, count(distinct s.key) from capital.stakeholders s
                 join capital.institutions i on i.key = s.institution_key group by 1""").fetchall()}


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
                col = "institution_key" if part == "org_charts" else "key"
                held[part] = {r[0] for r in conn.execute(f"select distinct {col} from {table}")}
    return held


def render(cov: dict, missing: bool = False) -> str:
    lines = ["| market | institutions | products | processes | org charts | people held |", "|---|---|---|---|---|---|"]
    for m, parts in cov.items():
        cells = [f"{p['held']}/{p['expected']}" if p["expected"] else "not mapped" for k, p in parts.items() if k != "people"]
        lines.append(f"| {m} | " + " | ".join(cells) + f" | {parts.get('people', {}).get('held', 0)} |")
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
    ap.add_argument("--json", action="store_true", help="for the bench's Knowledge page")
    a = ap.parse_args(argv)
    if not a.db:
        print("no database URL (set DATABASE_URL or --db); showing the map with nothing held", file=sys.stderr)
    held = held_keys(a.db) if a.db else {p: set() for p in PARTS}
    kmap = load_map()
    cov = coverage(kmap, held, people_held(a.db) if a.db else {})
    if a.json:
        import json
        print(json.dumps(as_json(kmap, cov, changed_charts(a.db) if a.db else [])))
    else:
        print(render(cov, a.missing))
    return 0


if __name__ == "__main__":
    sys.exit(main())
