"""What does the corpus actually know about each instrument?

── Why this exists ────────────────────────────────────────────────────────
A brief is only as good as the grounding under it, and "grounding" is not one
thing. An analyst reading a fund forms four separate judgements, and each needs
its own evidence:

  1. WHO it is for      — eligibility gates that can be evaluated, not quoted
  2. WHAT it funds      — positive evidence: award history, project titles,
                          sector mix. Absent everywhere until measured.
  3. WHERE it applies   — country, and below it region. Region is the one most
                          often present in prose and least often evaluable.
  4. HOW to approach it — an application route, and whether it is live

An instrument can be rich in one and empty in another, and the failure modes
differ: no (1) means it can never be ruled out, no (2) means it cannot be
ranked, no (3) means it is offered to the wrong city, no (4) means the row is
advice a founder cannot act on.

Counting "instruments with at least one gate" hides all of that, which is how
780 instruments looked well covered while a Paris company was shown a Normandy
scheme and a cinema fund.

Run: python3 ETL/terms/audit_grounding.py [--csv out.csv]
Read-only. No API cost.
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_sys.path.insert(0, str(_Path(__file__).resolve().parents[1] / "lib"))

import argparse  # noqa: E402
import csv  # noqa: E402
import json  # noqa: E402
import sqlite3  # noqa: E402
from collections import Counter, defaultdict  # noqa: E402

from etl_env import DB  # noqa: E402

# A gate the evaluator can act on, rather than one the writer can only quote.
EVALUABLE = "value_spec IS NOT NULL AND value_spec != '' AND (gate_role IS NULL OR gate_role = 'filter')"

# Requirement text that describes a place BELOW the country. Matched on the
# shape of the claim ("located in X", "registered office in X", "based in X"),
# because region names are exactly what we do not have a list of -- that is
# the gap being measured.
REGION_PROSE = (
    "requirement LIKE '%region%' OR requirement LIKE '%Region%' "
    "OR requirement LIKE '%région%' or requirement LIKE '%located in%' "
    "OR requirement LIKE '%registered office%' OR requirement LIKE '%based in%' "
    "OR requirement LIKE '%province%' OR requirement LIKE '%Länder%' "
    "OR requirement LIKE '%comunidad%' OR requirement LIKE '%territor%'"
)

STALE_YEARS = 3


def pct(n: int, d: int) -> str:
    return f"{100 * n / d:5.1f}%" if d else "    -"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", help="write the per-instrument matrix here")
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row

    insts = list(conn.execute("""
        SELECT id, parent_id, name, source_family_bucket, country, event_count,
               total_eur, last_year, sample_project_titles, sector_mix,
               is_framework
        FROM funding_instruments
    """))
    latest = conn.execute("SELECT MAX(last_year) FROM funding_instruments").fetchone()[0] or 0

    # ── gate evidence, per instrument ──────────────────────────────────────
    n_eval: Counter[str] = Counter()
    n_gates: Counter[str] = Counter()
    fields: dict[str, set[str]] = defaultdict(set)
    for r in conn.execute(f"""
        SELECT instrument_id, COUNT(*) AS n,
               SUM(CASE WHEN {EVALUABLE} THEN 1 ELSE 0 END) AS n_eval
        FROM eligibility_gates GROUP BY instrument_id
    """):
        n_gates[r["instrument_id"]] = r["n"]
        n_eval[r["instrument_id"]] = r["n_eval"] or 0
    for r in conn.execute(f"""
        SELECT instrument_id, COALESCE(intake_field_resolved, intake_field) AS f
        FROM eligibility_gates WHERE {EVALUABLE}
    """):
        if r["f"] and r["f"] != "none":
            fields[r["instrument_id"]].add(r["f"])

    # ── inheritance, exactly as the read path resolves it ─────────────────
    # corpus.ts layers a parent's gates UNDER the child's, the child winning on
    # gate_key, and falls back to the parent's application route. An audit that
    # counts only directly-attached rows
    # measures a corpus the product never sees: it was that mistake, not the
    # data, that first showed every instrument missing an application route.
    parent_of = {i["id"]: i["parent_id"] for i in insts}
    own_keys: dict[str, set[str]] = defaultdict(set)
    for r in conn.execute("SELECT instrument_id, gate_key FROM eligibility_gates"):
        own_keys[r["instrument_id"]].add(r["gate_key"])
    for iid, pid in parent_of.items():
        if not pid:
            continue
        added = len(own_keys.get(pid, set()) - own_keys.get(iid, set()))
        if added:
            n_gates[iid] += added
            n_eval[iid] += n_eval.get(pid, 0)
            fields[iid] |= fields.get(pid, set())

    apply_direct = {r[0] for r in conn.execute(
        "SELECT DISTINCT instrument_id FROM instrument_application")}
    has_apply = {iid for iid in parent_of
                 if iid in apply_direct or parent_of[iid] in apply_direct}

    # ── region: stated in prose vs actually evaluable ──────────────────────
    region_prose: set[str] = {
        r[0] for r in conn.execute(
            f"SELECT DISTINCT instrument_id FROM eligibility_gates WHERE {REGION_PROSE}")
    }
    region_eval: set[str] = set()
    for r in conn.execute(
            f"SELECT instrument_id, value_spec FROM eligibility_gates WHERE {EVALUABLE}"):
        try:
            spec = json.loads(r["value_spec"])
        except Exception:
            continue
        if spec.get("field") == "region":
            region_eval.add(r["instrument_id"])

    # ── the four axes ──────────────────────────────────────────────────────
    rows = []
    for i in insts:
        iid = i["id"]
        titles = json.loads(i["sample_project_titles"] or "[]") if i["sample_project_titles"] else []
        rows.append({
            "id": iid,
            "name": (i["name"] or "")[:60],
            "channel": i["source_family_bucket"] or "-",
            "country": i["country"] or "-",
            # 1. who it is for
            "gates": n_gates[iid],
            "evaluable": n_eval[iid],
            "distinct_fields": len(fields[iid]),
            # 2. what it funds
            "titles": len(titles),
            "sector_mix": 1 if i["sector_mix"] else 0,
            "events": i["event_count"] or 0,
            # 3. where
            "region_prose": 1 if iid in region_prose else 0,
            "region_eval": 1 if iid in region_eval else 0,
            # 4. how
            "apply_url": 1 if iid in has_apply else 0,
            "stale": 1 if (i["last_year"] or 0) and latest - i["last_year"] >= STALE_YEARS else 0,
        })

    n = len(rows)
    print(f"\nGrounding audit — {n} instruments, latest award year {latest}\n")

    def report(title: str, checks: list[tuple[str, object]]) -> None:
        print(title)
        for label, fn in checks:
            miss = [r for r in rows if fn(r)]  # type: ignore[operator]
            print(f"   {label:<52} {len(miss):>4}  {pct(len(miss), n)}")
        print()

    report("1. WHO IT IS FOR  (cannot be ruled in or out)", [
        ("no gate at all", lambda r: r["gates"] == 0),
        ("gates, but none evaluable", lambda r: r["gates"] > 0 and r["evaluable"] == 0),
        ("fewer than 2 evaluable gates", lambda r: r["evaluable"] < 2),
        ("fewer than 3 distinct intake fields covered", lambda r: r["distinct_fields"] < 3),
    ])
    report("2. WHAT IT FUNDS  (cannot be ranked against a company)", [
        ("no funded-project titles", lambda r: r["titles"] == 0),
        ("no sector mix", lambda r: r["sector_mix"] == 0),
        ("neither titles nor sector mix", lambda r: r["titles"] == 0 and r["sector_mix"] == 0),
        ("no award history at all", lambda r: r["events"] == 0),
    ])
    report("3. WHERE IT APPLIES  (offered to the wrong place)", [
        ("region named in prose but not evaluable",
         lambda r: r["region_prose"] and not r["region_eval"]),
        ("region evaluable", lambda r: r["region_eval"] == 1),
        ("no country recorded", lambda r: r["country"] == "-"),
    ])
    report("4. HOW TO APPROACH IT  (row a founder cannot act on)", [
        ("no application route", lambda r: r["apply_url"] == 0),
        (f"stale: no award in {STALE_YEARS}+ years", lambda r: r["stale"] == 1),
        ("no route AND not assessable",
         lambda r: r["apply_url"] == 0 and r["evaluable"] < 2),
    ])

    # The number that matters most: instruments strong on every axis.
    def complete(r: dict) -> bool:
        return (r["evaluable"] >= 2 and (r["titles"] > 0 or r["sector_mix"])
                and r["apply_url"] and not r["stale"])

    n_ok = sum(1 for r in rows if complete(r))
    print(f"Complete on all four axes: {n_ok} / {n}  ({pct(n_ok, n).strip()})\n")

    by_ch: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_ch[r["channel"]].append(r)
    print(f"{'channel':<24}{'n':>5}{'complete':>10}{'no filter':>11}{'no route':>10}{'no titles':>11}")
    for ch, rs in sorted(by_ch.items(), key=lambda kv: -len(kv[1])):
        print(f"{ch:<24}{len(rs):>5}{sum(1 for r in rs if complete(r)):>10}"
              f"{sum(1 for r in rs if r['evaluable'] < 2):>11}"
              f"{sum(1 for r in rs if not r['apply_url']):>10}"
              f"{sum(1 for r in rs if not r['titles']):>11}")

    if args.csv:
        with open(args.csv, "w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
        print(f"\nper-instrument matrix -> {args.csv}")
    conn.close()


if __name__ == "__main__":
    main()
