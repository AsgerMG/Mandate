"""Rank INTAKE_FIELDS by real-world reach across the funding_instruments
corpus — the offline analysis behind which fields belong on the wizard's
deterministic first page (Phase 3 of the eligibility-pivot plan) vs. which
are better asked adaptively once a shortlist is known.

reach(field) = SUM(event_count) of instruments carrying >=1 gate on that
field / SUM(event_count) of all non-framework instruments — i.e. what
fraction of the real, event-weighted fund universe a question even touches.
This is a coverage proxy, NOT true information-gain: exact partition
simulation would need a populated value_spec per gate (see n_with_value_spec
below), which is 0 today. Country and capital_type are native
funding_instruments columns, not gate-derived, so they're reported
separately — every instrument has a country and a capital type, so their
reach is structurally ~100% regardless of gate coverage.

This is an offline, rerunnable analysis script, not a runtime dependency —
rerun after any future classify_gates_bulk.py sweep or YAML sync to see the
ranking move (n_with_value_spec in particular, once that work starts).

Usage: python3 ETL/terms/aggregate_intake_usage.py [--json out.json]
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB  # noqa: E402
# --- end ETL path bootstrap ---

import argparse
import json
import sqlite3


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                  formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", type=str, default=None, help="also write the ranked table to this path")
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    totals = conn.execute("""
        SELECT SUM(event_count), SUM(company_count) FROM funding_instruments
        WHERE is_framework = 0
    """).fetchone()
    total_events, total_companies = totals

    # Aggregate in Python rather than SQL: an instrument can carry 2+ gates on
    # the same intake_field, and a naive SQL SUM would double-count its
    # event_count once per gate — a set-based per-field instrument roster
    # sidesteps that cleanly.
    field_instruments: dict[str, set[str]] = {}
    field_gate_count: dict[str, int] = {}
    field_value_spec_count: dict[str, int] = {}
    for intake_field, instrument_id, has_spec in conn.execute("""
        SELECT eg.intake_field, eg.instrument_id, eg.value_spec IS NOT NULL
        FROM eligibility_gates eg
        JOIN funding_instruments fi ON fi.id = eg.instrument_id
        WHERE eg.intake_field != 'none' AND fi.is_framework = 0
    """):
        field_instruments.setdefault(intake_field, set()).add(instrument_id)
        field_gate_count[intake_field] = field_gate_count.get(intake_field, 0) + 1
        if has_spec:
            field_value_spec_count[intake_field] = field_value_spec_count.get(intake_field, 0) + 1

    inst_stats = dict(conn.execute(
        "SELECT id, event_count FROM funding_instruments WHERE is_framework = 0"))
    inst_companies = dict(conn.execute(
        "SELECT id, company_count FROM funding_instruments WHERE is_framework = 0"))

    ranked = []
    for field, inst_ids in field_instruments.items():
        events = sum(inst_stats.get(i, 0) for i in inst_ids)
        companies = sum(inst_companies.get(i, 0) for i in inst_ids)
        ranked.append({
            "field": field,
            "n_instruments": len(inst_ids),
            "n_gates": field_gate_count[field],
            "n_with_value_spec": field_value_spec_count.get(field, 0),
            "event_reach_pct": round(100 * events / total_events, 1) if total_events else 0.0,
            "company_reach_pct": round(100 * companies / total_companies, 1) if total_companies else 0.0,
        })
    ranked.sort(key=lambda r: r["event_reach_pct"], reverse=True)

    print(f"{'field':<24} {'instruments':>11} {'gates':>6} {'w/ spec':>8} {'event reach':>12} {'company reach':>14}")
    for r in ranked:
        print(f"{r['field']:<24} {r['n_instruments']:>11} {r['n_gates']:>6} {r['n_with_value_spec']:>8} "
              f"{r['event_reach_pct']:>11}% {r['company_reach_pct']:>13}%")

    total_value_spec = sum(field_value_spec_count.values())
    print(f"\nTotal gates with a populated value_spec: {total_value_spec} "
          f"(0 means this is a coverage proxy only, not true information-gain, "
          f"until value_spec authoring starts).")
    print("\nNote: country and capital_type are native funding_instruments "
          "columns, not gate-derived — every instrument has both, so their "
          "reach is structurally ~100% regardless of this table.")

    if args.json:
        _Path(args.json).write_text(json.dumps(ranked, indent=1))
        print(f"\nwrote {args.json}")

    conn.close()


if __name__ == "__main__":
    main()
