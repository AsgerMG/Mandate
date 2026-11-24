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

MARKET = "DE"  # default; --market picks another; input capital/reference/graph_<market>/structure.yaml


def load(db_url: str, *, apply: bool, market: str = MARKET) -> tuple[dict, list[str]]:
    MARKET_ = market
    d = yaml.safe_load((REPO / "capital" / "reference" / f"graph_{market.lower()}" / "structure.yaml").read_text())
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
        held_inst = {r[0]: r[1] for r in con.execute("select key, level from institutions where market = %s", (MARKET_,))}

        def cite(item: dict, what: str) -> dict:
            c = charts.get(item["chart"])
            if not c:
                raise Drift(f"{what} {item.get('key')}: chart {item['chart']} is not held (run load_graph_de.py first)")
            span = locate(c["text"], item["quote"])
            if not span:
                raise Drift(f"{what} {item.get('key')}: quote not found in {item['chart']}'s chart: {item['quote'][:80]!r}")
            return {"sha256": c["sha256"], "url": c["url"], "located": True, "quote": c["text"][span[0]:span[1]],
                    "char_start": span[0], "char_end": span[1]}

        batch = f"graph_{MARKET_.lower()}_structure_" + max(c["fetched"] for c in charts.values()).strftime("%Y_%m") if charts else "graph_de_structure"
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
                    "key": u["key"], "parent_key": u["parent"], "market": MARKET_, "level": inst_level,
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

        new_p = same_p = reread = 0
        not_in_newest: list[str] = []
        for p in people:
            if p["unit"] not in known:
                raise Drift(f"person {p['key']}: unit {p['unit']} is not held")
            last = con.execute("select holder_name, citations->0->>'sha256' from stakeholders where key = %s order by last_verified desc, recorded_at desc limit 1",
                               (p["key"],)).fetchone()
            if last and last[0] == p["holder_name"]:
                # already held: nothing to write. If the newest chart no longer carries the quote, the
                # person may have moved: say so (19 Nov: refusing here blocked a whole market after one
                # chart URL changed). A NEW name still never enters without its quote located.
                ch = charts.get(p["chart"])
                if not (ch and locate(ch["text"], p["quote"])):
                    not_in_newest.append(f"{p['key']} ({p['holder_name']})")
                elif last[1] != ch["sha256"]:
                    # the chart's text changed and the same holder is still printed in it: a new row
                    # citing the newest text (the holder is re-verified, nobody moved). Without it the
                    # chart stays "changed since read" for ever (knowledge_coverage.changed_charts).
                    c = cite(p, "person")
                    c["association"] = "re_read"
                    con.execute("""insert into stakeholders (key, institution_key, role, holder_name, reach, last_verified, citations, batch)
                                   values (%s, %s, %s, %s, %s, %s, %s::jsonb, %s)""",
                                (p["key"], p["unit"], p["role"], p["holder_name"], None, ch["fetched"].date(),
                                 __import__("json").dumps([c], ensure_ascii=False), batch))
                    reread += 1
                    continue
                same_p += 1
                continue
            c = cite(p, "person")
            # how the person is tied to the unit: the quote names the unit (or its code), or the
            # tie rests on where the name sits in the chart's layout (a strong hint, said as such)
            u = next((x for x in units if x["key"] == p["unit"]), None)
            marks = [m for m in ((u or {}).get("code"), (u or {}).get("name")) if m]
            c["association"] = "quote_names_unit" if any(" ".join(m.split()).lower() in " ".join(p["quote"].split()).lower() for m in marks) else "chart_layout"
            con.execute("""insert into stakeholders (key, institution_key, role, holder_name, reach, last_verified, citations, batch)
                           values (%s, %s, %s, %s, %s, %s, %s::jsonb, %s)""",
                        (p["key"], p["unit"], p["role"], p["holder_name"], None, charts[p["chart"]]["fetched"].date(),
                         __import__("json").dumps([c], ensure_ascii=False), batch))
            new_p += 1
            if last:
                report.append(f"  CHANGED HOLDER {p['key']}: {last[0]} -> {p['holder_name']}")
        counts["people"] = f"{new_p} new rows ({len(report)} changed holder: who moved), {same_p} unchanged, {reread} re-read (same holder, newest chart text)"
        # held people the file no longer lists, read from an org chart (any version): they left the chart (or its unit)
        # and nothing is written for them (insert-only); say so, so a departure is never silent
        listed = {p["key"] for p in people}
        gone = [f"{k} ({h})" for k, h in con.execute(
            """select distinct on (s.key) s.key, s.holder_name from stakeholders s join institutions i on i.key = s.institution_key
               where i.market = %s and s.holder_name is not null
                 and exists (select 1 from org_charts o where o.sha256 = s.citations->0->>'sha256')
               order by s.key, s.last_verified desc, s.recorded_at desc""", (MARKET_,)).fetchall() if k not in listed]
        if gone:
            counts["held, no longer in the file"] = f"{len(gone)} (left the chart; the held row stays, nothing is written)"
            report += [f"  LEFT THE FILE: {x}" for x in gone]
        if not_in_newest:
            counts["not in the newest chart"] = f"{len(not_in_newest)} held people (may have moved; re-read the chart)"
            report += [f"  NOT IN THE NEWEST CHART: {x}" for x in not_in_newest]
        tie = {"quote_names_unit": 0, "chart_layout": 0}
        for p in people:
            u = next((x for x in units if x["key"] == p["unit"]), None)
            marks = [m for m in ((u or {}).get("code"), (u or {}).get("name")) if m]
            tie["quote_names_unit" if any(" ".join(m.split()).lower() in " ".join(p["quote"].split()).lower() for m in marks) else "chart_layout"] += 1
        counts["ties"] = f"{tie['quote_names_unit']} named in the quote, {tie['chart_layout']} by chart layout"
        if not apply:
            con.rollback()
    return counts, report


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--database-url", required=True)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--market", default=MARKET)
    a = ap.parse_args()
    try:
        counts, report = load(a.database_url, apply=a.apply, market=a.market.upper())
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
