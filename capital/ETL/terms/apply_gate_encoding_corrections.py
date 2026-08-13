"""Apply the wsGU gate-encoding corrections to the gate table.

DRY RUN BY DEFAULT. It writes nothing without `--apply`, and it refuses to
write at all if any row has moved under it.

WHAT IT CHANGES, AND WHAT IT NEVER TOUCHES
------------------------------------------
Only `value_spec`, and `encoding_method` so the change is traceable. The
`requirement`, the `quote`, the `value`, the `intake_field` and the
`verification_level` are left exactly as they are: they are the funder's own
words, they were verified, and they are right. What was wrong is only the
comparator built from them.

A quarantined gate keeps its requirement and loses its comparator. That is the
convention `audit_encoding_vs_reality.py` and `verify_encodings.py` already
use, and it is the honest state for a rule this product cannot express: the
memo still shows the requirement as something the assessor weighs, and
`assessInstrument` stops returning a verdict nobody can defend.

WHY IT REFUSES ON DRIFT
-----------------------
Every correction carries the spec it was written against. If a re-encode has
run since, the row it was written for no longer exists and applying the
correction would overwrite a decision this file knows nothing about. The
alternative -- apply what matches and skip the rest -- produces a corpus that
is half one pass and half another with nothing recording which.

  python3 ETL/terms/apply_gate_encoding_corrections.py            # dry run
  python3 ETL/terms/apply_gate_encoding_corrections.py --apply
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

import argparse  # noqa: E402
import json  # noqa: E402
import sqlite3  # noqa: E402

ROOT = _Path(__file__).resolve().parents[2]
CORRECTIONS = (ROOT / "project-mgmt" / "evidence"
               / "wsgu_gate_encoding_corrections_2026-08-13.jsonl")


def canon(spec) -> str | None:
    """Key order is not part of a comparator's identity."""
    if spec is None:
        return None
    if isinstance(spec, str):
        spec = json.loads(spec)
    return json.dumps(spec, sort_keys=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="actually write")
    args = ap.parse_args()

    rows = [json.loads(l) for l in CORRECTIONS.read_text().splitlines() if l.strip()]
    conn = sqlite3.connect(DB, timeout=60)
    conn.row_factory = sqlite3.Row

    drift, plan = [], []
    for c in rows:
        got = conn.execute(
            "SELECT id, value_spec FROM eligibility_gates "
            "WHERE instrument_id = ? AND gate_key = ?",
            (c["instrument_id"], c["gate_key"])).fetchall()
        if len(got) != 1:
            drift.append(f"{c['instrument_id']} [{c['gate_key']}]: "
                         f"{len(got)} matching gate rows, expected exactly 1")
            continue
        if canon(got[0]["value_spec"]) != canon(c["current_value_spec"]):
            drift.append(f"{c['instrument_id']} [{c['gate_key']}]: now holds "
                         f"{got[0]['value_spec']}, correction was written against "
                         f"{json.dumps(c['current_value_spec'])}")
            continue
        plan.append((got[0]["id"], c))

    by_action: dict[str, int] = {}
    for _, c in plan:
        by_action[c["action"]] = by_action.get(c["action"], 0) + 1
    print(f"{len(rows)} corrections, {len(plan)} match the corpus, {len(drift)} drifted")
    print("  " + ", ".join(f"{k} {v}" for k, v in sorted(by_action.items())))
    for gid, c in plan:
        to = json.dumps(c["proposed_value_spec"]) if c["proposed_value_spec"] else "NULL"
        print(f"  gate {gid} {c['instrument_id']} [{c['gate_key']}] {c['clause']}\n"
              f"      {json.dumps(c['current_value_spec'])}\n   -> {to}")
    if drift:
        print("\nREFUSED — the corpus has moved under these rows:")
        for d in drift:
            print(f"  {d}")
        print("\n  Re-derive them against the current corpus rather than applying a\n"
              "  partial set: a half-applied pass leaves nothing recording which\n"
              "  half is which. `python3 ETL/terms/_wsgu_corrections.py --check`\n"
              "  reports the same drift against the published snapshot.")
        return 1

    if not args.apply:
        print("\nDRY RUN — nothing written. Re-run with --apply.")
        return 0

    for gid, c in plan:
        conn.execute(
            "UPDATE eligibility_gates SET value_spec = ?, encoding_method = ? "
            "WHERE id = ?",
            (json.dumps(c["proposed_value_spec"]) if c["proposed_value_spec"] else None,
             "quarantined" if c["proposed_value_spec"] is None else "wsgu_corrected",
             gid))
    conn.commit()
    print(f"\napplied {len(plan)} corrections. Publish to Postgres, then re-run:")
    print("  cd website/frontend && npx tsx scripts/check_winner_not_gated.ts")
    print("  python3 ETL/terms/check_gate_subject.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
