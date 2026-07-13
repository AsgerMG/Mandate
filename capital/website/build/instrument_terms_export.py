"""Export verified term records for the brief's eligibility evaluator.

data/instrument_terms/*.yaml → website/frontend/public/data/instrument_terms.json
Only gates at verified: llm_2pass are exported as assertable; draft gates are
included with verified:false so the evaluator can render "verify:" rows but
never assert them. Run after ETL/terms/extract_terms.py.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from web_env import ROOT, SITE_DATA  # noqa: E402

import yaml  # noqa: E402

TERMS = ROOT / "data" / "instrument_terms"
OUT = SITE_DATA / "instrument_terms.json"

records = []
for f in sorted(TERMS.glob("*.yaml")):
    rec = yaml.safe_load(f.read_text())
    gates = []
    for g in rec.get("gates", []):
        gates.append({
            "id": g.get("id"),
            "gateFamily": g.get("gate_family"),
            "requirement": g.get("requirement"),
            "value": g.get("value") or "",
            "intakeField": g.get("intake_field") or "none",
            "quote": g.get("quote") or "",
            "source": {
                "file": (g.get("source") or {}).get("file", ""),
                "locator": (g.get("source") or {}).get("locator", ""),
            },
            "verified": g.get("verified") in ("llm_2pass", True),  # True = hand-verified exemplars
        })
    records.append({
        "id": rec["id"], "name": rec["name"], "country": rec.get("country", "EU"),
        "capitalType": rec.get("capital_type", ""), "gates": gates,
    })

OUT.write_text(json.dumps(
    {"generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
     "records": records}, indent=1, ensure_ascii=False))
n_v = sum(1 for r in records for g in r["gates"] if g["verified"])
n_t = sum(len(r["gates"]) for r in records)
print(f"instrument terms → {OUT}  ({len(records)} records, {n_v}/{n_t} gates verified)")
