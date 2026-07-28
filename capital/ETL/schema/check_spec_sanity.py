"""Refuse encoded rules whose shape is semantically inverted.

Some specs are syntactically valid, pass the vocabulary check, and still mean
the opposite of the document they came from. The one that reached the database:

    exclusionFlags not_in ['none']

'none' is the "nothing is wrong with me" answer, so that rule blocks exactly
the founders for whom nothing is wrong. It was produced by a corrective pass
that was fixing a DIFFERENT wrong rule, which is the point — a correction is
just another encoding, and needs the same scrutiny as the thing it replaced.

Its sibling, `in ['none']`, is not inverted but is over-strict: it demands a
clean sheet on every flag, so an unrelated tax arrear blocks a rule that was
only ever about insolvency. A rule about insolvency must name insolvency.

Run in CI. Cheap, deterministic, no API.

Usage: python3 ETL/schema/check_spec_sanity.py
"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

for _anc in Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB  # noqa: E402

SENTINEL_AXES = ("exclusionFlags", "activities")


def main() -> None:
    conn = sqlite3.connect(DB)
    problems: list[str] = []
    for gid, vs, req in conn.execute(
        "SELECT id, value_spec, requirement FROM eligibility_gates WHERE value_spec IS NOT NULL"
    ):
        spec = json.loads(vs)
        field, op = spec.get("field"), spec.get("op")
        allowed = spec.get("allowed") or []
        if field not in SENTINEL_AXES:
            continue
        if op == "not_in" and "none" in allowed:
            problems.append(f"  gate {gid}: not_in {allowed} on {field} — blocks the compliant "
                            f"answer\n      {' '.join((req or '').split())[:88]}")
        elif op == "in" and allowed == ["none"]:
            problems.append(f"  gate {gid}: in ['none'] on {field} — demands a clean sheet on every "
                            f"flag\n      {' '.join((req or '').split())[:88]}")

    if problems:
        print(f"{len(problems)} semantically inverted spec(s):\n")
        print("\n".join(problems))
        print("\nName the specific flag the requirement is about.")
        sys.exit(1)
    print("no inverted exclusion specs")


if __name__ == "__main__":
    main()
