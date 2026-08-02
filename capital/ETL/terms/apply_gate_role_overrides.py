"""Reapply hand corrections to gate_role after the LLM triage that sets it.

encode_gates.py triages every gate with a paid model call and writes gate_role
directly, so a manual correction made in the database is silently reverted the
next time triage runs. The corrections live in
data/reference/gate_role_overrides.json with the reasoning per gate, and this
puts them back.

Each one is a gate triaged as a `filter` carrying a value_spec -- meaning it can
DISQUALIFY a founder and remove the fund from their brief with nothing shown --
whose own wording does not state a requirement. Read the file for the cases.

Usage: python3 ETL/terms/apply_gate_role_overrides.py
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402

import json  # noqa: E402
import sqlite3  # noqa: E402

SRC = ROOT / "data" / "reference" / "gate_role_overrides.json"


def main() -> None:
    if not SRC.exists():
        print("no gate_role_overrides.json; nothing to apply")
        return
    conn = sqlite3.connect(DB)
    applied = missing = 0
    for o in json.loads(SRC.read_text())["overrides"]:
        cur = conn.execute(
            """UPDATE eligibility_gates
                 SET gate_role = ?, intake_field_resolved = 'none'
               WHERE instrument_id = ? AND gate_key = ? AND gate_role IS NOT ?""",
            (o["role"], o["instrument_id"], o["gate_key"], o["role"]))
        if cur.rowcount:
            applied += 1
        else:
            # Either already correct, or the gate is gone. Both are worth
            # distinguishing from silence: a gate that vanished means the
            # override is now dead weight describing nothing.
            exists = conn.execute(
                "SELECT 1 FROM eligibility_gates WHERE instrument_id=? AND gate_key=?",
                (o["instrument_id"], o["gate_key"])).fetchone()
            if not exists:
                missing += 1
                print(f"  STALE OVERRIDE: {o['instrument_id']}/{o['gate_key']} no longer exists")
    conn.commit()
    conn.close()
    print(f"gate_role overrides: {applied} applied, {missing} stale")


if __name__ == "__main__":
    main()
