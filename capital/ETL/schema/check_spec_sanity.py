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

Reads the COMMITTED snapshot (web/public/data/instrument_terms.json)
rather than data/db.sqlite. Two reasons, and the first only became obvious when
CI went red: the database is gitignored, so a check that needs it cannot run in
CI at all — it fails on a missing file and teaches everyone to ignore the job.
The second is better: the snapshot is what actually ships to production, so
checking it verifies the artefact a founder's brief is built from, not a local
working copy that may be ahead of or behind it.

Run in CI. Cheap, deterministic, no API, no database.

Usage: python3 ETL/schema/check_spec_sanity.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ETL" / "lib"))
from web_path import WEB  # noqa: E402  (the web app, <monorepo>/web)
SNAPSHOT = WEB / "public" / "data" / "instrument_terms.json"

SENTINEL_AXES = ("exclusionFlags", "activities")


def main() -> None:
    if not SNAPSHOT.exists():
        sys.exit(f"missing {SNAPSHOT} — run website/build/eligibility_export.py")
    data = json.loads(SNAPSHOT.read_text())
    problems: list[str] = []
    checked = 0
    for record in data["records"]:
        for gate in record.get("gates", []):
            spec = gate.get("valueSpec")
            if not spec:
                continue
            checked += 1
            gid = f"{record['id']}/{gate['id']}"
            req = gate.get("requirement", "")
            field, op = spec.get("field"), spec.get("op")
            allowed = spec.get("allowed") or []
            if field not in SENTINEL_AXES:
                continue
            if op == "not_in" and "none" in allowed:
                problems.append(f"  {gid}: not_in {allowed} on {field} — blocks the compliant "
                                f"answer\n      {' '.join((req or '').split())[:88]}")
            elif op == "in" and allowed == ["none"]:
                problems.append(f"  {gid}: in ['none'] on {field} — demands a clean sheet on "
                                f"every flag\n      {' '.join((req or '').split())[:88]}")

    if problems:
        print(f"{len(problems)} semantically inverted spec(s):\n")
        print("\n".join(problems))
        print("\nName the specific flag the requirement is about.")
        sys.exit(1)
    print(f"no inverted exclusion specs ({checked} encoded rules checked)")


if __name__ == "__main__":
    main()
