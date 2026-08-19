"""Re-derive the correction rows a defective encode pass moved under.

WHY A CORRECTION CAN NEED RE-DERIVING AT ALL
--------------------------------------------
`apply_gate_encoding_corrections.py` refuses the WHOLE file if any row no longer
holds the `current_value_spec` it was written against, because applying the rest
would leave a corpus half one pass and half another with nothing recording
which. That refusal is right and is not being relaxed here.

What moved these rows is known exactly: `encode_gates.py encode` re-derived a
comparator for a gate whose comparator had been deliberately withdrawn (see
check_corrections_applied.py). So the "decision this file knows nothing about"
that the refusal exists to protect is not a decision at all -- it is the defect,
and its provenance says so on the row (`llm_encode` / `fx_converted`).

WHAT IT MAY AND MAY NOT REWRITE
-------------------------------
`current_value_spec` only, plus a `redrift` record naming what was there before,
which pass wrote what replaced it, and when. The VERDICT is never touched.

That is safe here for a reason that must be checked rather than assumed, so it
is asserted: every row this touches has `proposed_value_spec: null`. A withdrawal
says no comparator on this gate is defensible, which does not depend on which
comparator the encoder happened to produce -- so re-pointing the correction at
the new one changes nothing about the decision. A row with a POSITIVE proposal
would be different: the correction argued from a specific starting spec, and a
new one has to be re-read against the funder's words by a person. This script
refuses rather than guessing.

  python3 ETL/terms/_wsih_rederive.py            # report
  python3 ETL/terms/_wsih_rederive.py --write
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB  # noqa: E402

import argparse  # noqa: E402
import json  # noqa: E402
import sqlite3  # noqa: E402

ROOT = _Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "project-mgmt" / "evidence"
WHY = ("encode_gates.py `encode` re-derived a comparator for a gate whose "
       "comparator had been deliberately withdrawn: the quarantine exclusion "
       "existed only under --fresh and the default pass selects "
       "`value_spec IS NULL`, which is the shape of every quarantine. "
       "The withdrawal verdict is unchanged; only the spec it displaces is.")


def canon(spec):
    if spec is None:
        return None
    if isinstance(spec, str):
        if not spec.strip():
            return None
        try:
            spec = json.loads(spec)
        except json.JSONDecodeError:
            return spec
    return json.dumps(spec, sort_keys=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()
    conn = sqlite3.connect(DB, timeout=60)
    conn.row_factory = sqlite3.Row
    total = 0
    for f in sorted(EVIDENCE.glob("*corrections*.jsonl")):
        # RAW lines are kept and only a changed one is re-serialised. A
        # blanket re-dump would reformat all 63 of wsGU's rows and bury a
        # one-row decision in a diff nobody can read, which defeats the reason
        # the evidence is committed at all.
        raw = [l for l in f.read_text().splitlines() if l.strip()]
        lines = [json.loads(l) for l in raw]
        touched = 0
        for idx, c in enumerate(lines):
            g = conn.execute(
                "SELECT value_spec, encoding_method FROM eligibility_gates "
                "WHERE instrument_id=? AND gate_key=?",
                (c["instrument_id"], c["gate_key"])).fetchone()
            if g is None:
                raise SystemExit(f"{c['instrument_id']} [{c['gate_key']}] has no "
                                 "gate row; re-derivation cannot proceed.")
            held = canon(g["value_spec"])
            if held == canon(c["proposed_value_spec"]):
                continue                      # already in effect
            if held == canon(c["current_value_spec"]):
                continue                      # not drifted, just not applied yet
            if c["proposed_value_spec"] is not None:
                raise SystemExit(
                    f"REFUSED: {c['instrument_id']} [{c['gate_key']}] drifted and "
                    "its correction proposes a POSITIVE comparator. That argued "
                    "from a specific starting spec and has to be re-read against "
                    "the funder's words by a person, not re-pointed here.")
            print(f"  {f.name}: {c['instrument_id']} [{c['gate_key']}]\n"
                  f"      was  {canon(c['current_value_spec'])}\n"
                  f"      now  {held}   written by {g['encoding_method']}")
            c.setdefault("redrift", []).append({
                "by": "wsIH", "date": "2026-08-19",
                "was": c["current_value_spec"],
                "held_written_by": g["encoding_method"], "why": WHY})
            c["current_value_spec"] = json.loads(g["value_spec"])
            raw[idx] = json.dumps(c, ensure_ascii=False)
            touched += 1
        total += touched
        print(f"{f.name}: {touched} rows re-derived")
        if touched and args.write:
            f.write_text("".join(l + "\n" for l in raw))
    print(f"\n{total} rows re-derived" + ("" if args.write else " (report only — use --write)"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
