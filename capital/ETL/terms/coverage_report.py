"""The fund-intelligence coverage table: one row per instrument, every stat.

audit_grounding.py answers "how are we doing" in aggregate. This answers "what
do we know about THIS fund", which is the question you have when a brief puts a
row in front of a founder and you want to know what stands behind it.

Emits JSON for the coverage dashboard, and a compact Markdown summary for the
repo. Read-only, no API cost.

Usage:
  python3 ETL/terms/coverage_report.py [--json OUT.json] [--md OUT.md]
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_sys.path.insert(0, str(_Path(__file__).resolve().parents[1] / "lib"))

import argparse  # noqa: E402
import json  # noqa: E402
import sqlite3  # noqa: E402
from collections import defaultdict  # noqa: E402

from etl_env import DB, ROOT  # noqa: E402

EVALUABLE = ("value_spec IS NOT NULL AND value_spec != '' "
             "AND (gate_role IS NULL OR gate_role = 'filter')")
CITED = ("llm_cited", "llm_2pass", "human_verified")
STALE_YEARS = 3

# The six things an analyst needs before they can advise on a fund. Each is
# either present or it is not; "partly" is what hides gaps, so every axis is
# a hard boolean and the score is simply how many are true.
AXES = ("eligibility", "funds", "where", "amount", "route", "live")


def build(conn: sqlite3.Connection) -> dict:
    conn.row_factory = sqlite3.Row

    insts = list(conn.execute("""
        SELECT id, parent_id, name, country, source_family_bucket, capital_type,
               event_count, company_count, total_eur, first_year, last_year,
               sample_project_titles, sector_mix, scheme_code,
               award_p25, award_p50, award_p75, award_n
          FROM funding_instruments
    """))

    row = conn.execute("""
        SELECT last_year FROM funding_instruments WHERE last_year IS NOT NULL
         GROUP BY last_year HAVING COUNT(*) >= 10 ORDER BY last_year DESC LIMIT 1
    """).fetchone()
    latest = row[0] if row else 0

    # ── gates, with parent rules layered under the child's, as the read path
    # resolves them. Counting only directly-attached rows measures a corpus the
    # product never sees.
    own_keys: dict[str, set[str]] = defaultdict(set)
    n_eval: dict[str, int] = defaultdict(int)
    n_cited: dict[str, int] = defaultdict(int)
    fields: dict[str, set[str]] = defaultdict(set)
    region_eval: set[str] = set()

    for r in conn.execute(f"""
        SELECT instrument_id, gate_key, value_spec, verification_level,
               COALESCE(intake_field_resolved, intake_field) AS f,
               CASE WHEN {EVALUABLE} THEN 1 ELSE 0 END AS ev
          FROM eligibility_gates
    """):
        iid = r["instrument_id"]
        own_keys[iid].add(r["gate_key"])
        if r["ev"]:
            n_eval[iid] += 1
            if r["f"] and r["f"] != "none":
                fields[iid].add(r["f"])
            if r["verification_level"] in CITED:
                n_cited[iid] += 1
            if r["value_spec"] and '"region_within"' in r["value_spec"]:
                region_eval.add(iid)

    parent_of = {i["id"]: i["parent_id"] for i in insts}
    for iid, pid in parent_of.items():
        if pid and (own_keys.get(pid, set()) - own_keys.get(iid, set())):
            n_eval[iid] += n_eval.get(pid, 0)
            n_cited[iid] += n_cited.get(pid, 0)
            fields[iid] |= fields.get(pid, set())
            if pid in region_eval:
                region_eval.add(iid)

    # Rows the product can never publish: framework placeholders, and rollup
    # parents that exist only to hold a regime's curated gates for the children
    # underneath them. They score zero on everything by construction, and
    # counting them made coverage look ~7 points worse than it is. Same test
    # publishableInstruments() applies in the read path.
    has_children = {p for p in parent_of.values() if p}
    frameworks = {r[0] for r in conn.execute(
        "SELECT id FROM funding_instruments WHERE is_framework = 1")}

    apply_direct = {r[0] for r in conn.execute(
        "SELECT DISTINCT instrument_id FROM instrument_application")}
    apply_url = {r[0] for r in conn.execute(
        "SELECT DISTINCT instrument_id FROM instrument_application "
        "WHERE url IS NOT NULL AND url != ''")}

    rows = []
    for i in insts:
        iid = i["id"]
        titles = json.loads(i["sample_project_titles"] or "[]") if i["sample_project_titles"] else []
        has_route = iid in apply_direct or (parent_of[iid] in apply_direct)
        stale = bool(i["last_year"]) and latest - i["last_year"] >= STALE_YEARS
        axes = {
            "eligibility": n_eval[iid] >= 2,
            "funds": bool(titles) or bool(i["sector_mix"]),
            # Country is the floor; a region is only owed where a rule needs one.
            "where": bool(i["country"]),
            "amount": i["award_p50"] is not None,
            "route": has_route,
            "live": not stale and bool(i["last_year"]),
        }
        rows.append({
            "id": iid,
            "publishable": iid not in has_children and iid not in frameworks,
            "name": i["name"] or iid,
            "country": i["country"] or "",
            "channel": i["source_family_bucket"] or "",
            "capital": i["capital_type"] or "",
            "scheme": i["scheme_code"] or "",
            "events": i["event_count"] or 0,
            "companies": i["company_count"] or 0,
            "totalEur": i["total_eur"] or 0,
            "firstYear": i["first_year"],
            "lastYear": i["last_year"],
            "gates": n_eval[iid],
            "cited": n_cited[iid],
            "fields": len(fields[iid]),
            "titles": len(titles),
            "sectorMix": bool(i["sector_mix"]),
            "regionEval": iid in region_eval,
            "awardP25": i["award_p25"],
            "awardP50": i["award_p50"],
            "awardP75": i["award_p75"],
            "awardN": i["award_n"] or 0,
            "route": has_route,
            "routeUrl": iid in apply_url or (parent_of[iid] in apply_url),
            "stale": stale,
            "axes": axes,
            "score": sum(axes.values()),
        })

    rows.sort(key=lambda r: (-r["score"], -r["totalEur"]))
    # Coverage is measured on what a founder can actually be shown.
    pub = [r for r in rows if r["publishable"]]
    n = len(pub)
    summary = {
        "instruments": n,
        "total": len(rows),
        "latestYear": latest,
        "axes": {a: sum(1 for r in pub if r["axes"][a]) for a in AXES},
        "complete": sum(1 for r in pub if r["score"] == len(AXES)),
        "byChannel": [],
    }
    per_ch: dict[str, list] = defaultdict(list)
    for r in pub:
        per_ch[r["channel"] or "(none)"].append(r)
    for ch, rs in sorted(per_ch.items(), key=lambda kv: -len(kv[1])):
        summary["byChannel"].append({
            "channel": ch, "n": len(rs),
            "complete": sum(1 for r in rs if r["score"] == len(AXES)),
            "meanScore": round(sum(r["score"] for r in rs) / len(rs), 2),
            **{a: sum(1 for r in rs if r["axes"][a]) for a in AXES},
        })
    return {"summary": summary, "rows": rows}


def to_markdown(data: dict) -> str:
    s = data["summary"]
    n = s["instruments"]
    def pct(x): return f"{100 * x / n:.0f}%"
    out = [
        "# Fund intelligence coverage",
        "",
        f"Generated from the live corpus: **{n} instruments**, latest active "
        f"award year {s['latestYear']}. Regenerate with "
        "`python3 ETL/terms/coverage_report.py --md project-mgmt/coverage.md`.",
        "",
        "Six things an analyst needs before advising on a fund. Each is present "
        "or it is not — \"partly\" is what hides gaps.",
        "",
        "| What we know | Instruments | Share |",
        "|---|---:|---:|",
        f"| Eligibility we can evaluate (2+ filters) | {s['axes']['eligibility']} | {pct(s['axes']['eligibility'])} |",
        f"| What it has actually funded | {s['axes']['funds']} | {pct(s['axes']['funds'])} |",
        f"| Where it applies | {s['axes']['where']} | {pct(s['axes']['where'])} |",
        f"| What it typically awards | {s['axes']['amount']} | {pct(s['axes']['amount'])} |",
        f"| How to approach it | {s['axes']['route']} | {pct(s['axes']['route'])} |",
        f"| Still awarding | {s['axes']['live']} | {pct(s['axes']['live'])} |",
        f"| **All six** | **{s['complete']}** | **{pct(s['complete'])}** |",
        "",
        "## By channel",
        "",
        "| Channel | n | All six | Mean score | Eligibility | Funds | Amount | Route | Live |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for c in s["byChannel"]:
        out.append(
            f"| {c['channel']} | {c['n']} | {c['complete']} | {c['meanScore']} | "
            f"{c['eligibility']} | {c['funds']} | {c['amount']} | {c['route']} | {c['live']} |")
    out += ["", "Per-instrument detail lives in the coverage dashboard "
            "(coverage.json), which carries every row.", ""]
    return "\n".join(out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json")
    ap.add_argument("--md")
    args = ap.parse_args()
    conn = sqlite3.connect(DB)
    data = build(conn)
    conn.close()
    s = data["summary"]
    print(f"coverage: {s['instruments']} instruments, {s['complete']} complete on all six axes")
    for a in AXES:
        print(f"  {a:14} {s['axes'][a]:>5}  {100*s['axes'][a]/s['instruments']:5.1f}%")
    if args.json:
        _Path(args.json).write_text(json.dumps(data, ensure_ascii=False))
        print(f"json -> {args.json}")
    if args.md:
        _Path(args.md).write_text(to_markdown(data))
        print(f"md   -> {args.md}")


if __name__ == "__main__":
    main()
