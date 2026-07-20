"""Export funding_instruments + eligibility_gates from the DB into the JSON
the frontend eligibility evaluator reads. Replaces the old YAML-sourced
instrument_terms_export.py now that eligibility criteria live DB-natively
(migration 011) — data/instrument_terms/*.yaml is still the AUTHORING format
for Tier 2/human-reviewed gates (git-diffable review surface), synced into
the DB by ETL/terms/sync_gates_from_yaml.py; this script only ever reads
from the DB, never the YAML directly, so every tier (inventory_inferred,
llm_classified, llm_2pass, human_verified) exports uniformly.

Run after populate_funding_instruments.py + sync_gates_from_yaml.py (+, once
it exists, classify_gates_bulk.py).
"""
from __future__ import annotations

import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from web_env import DB, SITE_DATA  # noqa: E402

OUT = SITE_DATA / "instrument_terms.json"

# Only these tiers may ever render as an asserted met/not_met fact in the
# frontend (see eligibility.ts) — mirrors the pre-existing YAML convention
# where `verified in ("llm_2pass", True)` was the assertable set.
ASSERTABLE_LEVELS = {"llm_2pass", "human_verified"}


def main() -> None:
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row

    instruments = conn.execute("""
        SELECT id, parent_id, name, country, capital_type, is_framework,
               event_count, company_count, total_eur, source_family_bucket,
               sample_project_titles
        FROM funding_instruments
    """).fetchall()
    gates = conn.execute("""
        SELECT instrument_id, gate_key, gate_family, requirement, value,
               value_spec, intake_field, quote, source_file, source_locator,
               verification_level
        FROM eligibility_gates
    """).fetchall()

    gates_by_instrument: dict[str, list[dict]] = {}
    for g in gates:
        gates_by_instrument.setdefault(g["instrument_id"], []).append({
            "id": g["gate_key"],
            "gateFamily": g["gate_family"],
            "requirement": g["requirement"],
            "value": g["value"] or "",
            "valueSpec": json.loads(g["value_spec"]) if g["value_spec"] else None,
            "intakeField": g["intake_field"] or "none",
            "quote": g["quote"] or "",
            "source": {"file": g["source_file"] or "", "locator": g["source_locator"] or ""},
            "verificationLevel": g["verification_level"],
            "verified": g["verification_level"] in ASSERTABLE_LEVELS,
        })

    records = [{
        "id": inst["id"],
        "parentId": inst["parent_id"],
        "name": inst["name"],
        "country": inst["country"] or "EU",
        "capitalType": inst["capital_type"],
        "isFramework": bool(inst["is_framework"]),
        "eventCount": inst["event_count"],
        "companyCount": inst["company_count"],
        "totalEur": inst["total_eur"],
        "sourceFamilyBucket": inst["source_family_bucket"],
        "sampleProjectTitles": json.loads(inst["sample_project_titles"]) if inst["sample_project_titles"] else None,
        "gates": gates_by_instrument.get(inst["id"], []),
    } for inst in instruments]

    OUT.write_text(json.dumps(
        {"generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
         "records": records}, indent=1, ensure_ascii=False))

    n_gates = sum(len(r["gates"]) for r in records)
    n_verified = sum(1 for r in records for g in r["gates"] if g["verified"])
    n_with_gates = sum(1 for r in records if r["gates"])
    print(f"eligibility export -> {OUT}  ({len(records)} instruments, "
          f"{n_with_gates} with >=1 gate, {n_gates} gates, {n_verified} assertable)")


if __name__ == "__main__":
    main()
