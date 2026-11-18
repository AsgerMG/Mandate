"""Graph core, Germany, phase 2: the units and the people in charge, from the org charts. Dry run
unless --apply.

    python3 capital/ETL/terms/load_graph_de_structure.py --database-url URL            # dry run
    python3 capital/ETL/terms/load_graph_de_structure.py --database-url URL --apply    # write

INPUT: capital/reference/graph_de/structure.yaml (units and people, each with a VERBATIM quote from
its chart), extracted from capital/reference/graph_de/chart_texts/ (the chart text as held in
grounding). Every quote is located in the grounding version of that chart (the newest fetch in
capital.org_charts); a quote that is not there REFUSES the run (exit 3, nothing written): a name
that is not in the official chart never enters the register.

WRITES (insert-only, migration 042):
  capital.institutions   every unit (division / unit / committee) under its parent, cited
  capital.stakeholders   every role-holder: the role, the name as printed, last_verified = the date
                         the chart was fetched; a role whose holder is unchanged since the last load
                         adds nothing, a new holder is a NEW row (who moved is itself a signal)
No model, no API credits.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import psycopg  # noqa: E402
import yaml  # noqa: E402

from load_batch_italy import Drift, insert_checked  # noqa: E402
from mandate.grounding.store import locate  # noqa: E402

DATA = REPO / "capital" / "reference" / "graph_de" / "structure.yaml"
MARKET = "DE"


def load(db_url: str, *, apply: bool) -> tuple[dict, list[str]]:
    d = yaml.safe_load(DATA.read_text())
    units, people = d.get("units") or [], d.get("people") or []
    report: list[str] = []
    counts: dict = {}
    with psycopg.connect(db_url) as con:
        con.execute("SET search_path = capital, public")
        # the newest held version of each chart, with its text and fetch date
        charts = {}
        for key, sha, fetched, url in con.execute("""
                select distinct on (o.institution_key) o.institution_key, o.sha256, o.fetched_at, o.url
                from org_charts o order by o.institution_key, o.recorded_at desc""").fetchall():
            row = con.execute("select text from grounding.document_versions where sha256 = %s", (sha,)).fetchone()
            charts[key] = {"sha256": sha, "fetched": fetched, "url": url, "text": (row[0] if row else "") or ""}
        held_inst = {r[0]: r[1] for r in con.execute("select key, level from institutions where market = %s", (MARKET,))}

        def cite(item: dict, what: str) -> dict:
            c = charts.get(item["chart"])
            if not c:
                raise Drift(f"{what} {item.get('key')}: chart {item['chart']} is not held (run load_graph_de.py first)")
            span = locate(c["text"], item["quote"])
            if not span:
                raise Drift(f"{what} {item.get('key')}: quote not found in {item['chart']}'s chart: {item['quote'][:80]!r}")
            return {"sha256": c["sha256"], "url": c["url"], "located": True, "quote": c["text"][span[0]:span[1]],
                    "char_start": span[0], "char_end": span[1]}

        batch = "graph_de_structure_" + max(c["fetched"] for c in charts.values()).strftime("%Y_%m") if charts else "graph_de_structure"
        # units: parents first (the order written usually is; resolve in passes)
        pending, new_u, same_u = list(units), 0, 0
        known = set(held_inst)
        for _ in range(10):
            rest = []
            for u in pending:
                if u["parent"] not in known and u["parent"] != u["institution"]:
                    rest.append(u)
                    continue
                if u["key"] in held_inst:
                    same_u += 1
                    known.add(u["key"])
                    continue
                inst_level = held_inst.get(u["institution"], "national")
                out = insert_checked(con, "institutions", ("key",), {
                    "key": u["key"], "parent_key": u["parent"], "market": MARKET, "level": inst_level,
                    "region": None, "kind": u["kind"], "name": u["name"], "name_local": u["name"],
                    "role": u.get("remit"), "website": None, "citations": [cite(u, "unit")], "batch": batch})
                new_u += out == "new"
                known.add(u["key"])
            if not rest:
                break
            pending = rest
        if pending and rest:
            raise Drift(f"units whose parent is neither held nor in the file: {[u['key'] for u in rest][:8]}")
        counts["units"] = f"{new_u} new, {same_u} already held"

        new_p = same_p = 0
        for p in people:
            if p["unit"] not in known:
                raise Drift(f"person {p['key']}: unit {p['unit']} is not held")
            c = cite(p, "person")
            last = con.execute("select holder_name from stakeholders where key = %s order by last_verified desc, recorded_at desc limit 1",
                               (p["key"],)).fetchone()
            if last and last[0] == p["holder_name"]:
                same_p += 1
                continue
            con.execute("""insert into stakeholders (key, institution_key, role, holder_name, reach, last_verified, citations, batch)
                           values (%s, %s, %s, %s, %s, %s, %s::jsonb, %s)""",
                        (p["key"], p["unit"], p["role"], p["holder_name"], None, charts[p["chart"]]["fetched"].date(),
                         __import__("json").dumps([c], ensure_ascii=False), batch))
            new_p += 1
            if last:
                report.append(f"  CHANGED HOLDER {p['key']}: {last[0]} -> {p['holder_name']}")
        counts["people"] = f"{new_p} new rows, {same_p} unchanged"
        if not apply:
            con.rollback()
    return counts, report


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--database-url", required=True)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    try:
        counts, report = load(a.database_url, apply=a.apply)
    except Drift as e:
        print(f"REFUSED (drift): {e}", file=sys.stderr)
        return 3
    print("\n".join(report))
    for k, v in counts.items():
        print(f"  {k:10} {v}")
    print("APPLIED." if a.apply else "DRY RUN: rolled back, nothing written. Add --apply to write (owner-approved).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
