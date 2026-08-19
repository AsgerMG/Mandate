"""A VERIFIED CORRECTION MUST SURVIVE A PIPELINE PASS. Fails the build if one did not.

WHAT WENT WRONG, AND WHY NOTHING SAW IT
---------------------------------------
`encode_gates.py encode` selects `gate_role='filter' AND value_spec IS NULL`.
A quarantined gate is a filter whose comparator was deliberately removed, so it
has value_spec NULL BY DEFINITION -- which made every quarantine in the corpus a
member of the default encode pass's working set. The exclusion that was supposed
to stop this existed, but only inside the `--fresh` branch, and `make
eligibility` runs the default pass first. Measured 2026-08-19: 159 of 186
quarantined gates were in that working set, and a single pass reverted 22 rows
across four hand-verified correction sets. The oldest revert was six days old and
had never been noticed, because the encoder reverts SILENTLY and PARTIALLY -- it
puts a comparator back only where the model happens to produce one, so no count
moves and no check that reads totals can see it.

Postgres was clean only by accident: that pipeline run failed before
`migrate_to_postgres.py`, which TRUNCATEs `eligibility_gates` and reloads it from
SQLite. Had it completed, all 22 reversions would have shipped to production.
That is what this check stands in front of.

WHY THE POPULATION IS A GLOB AND NOT A LIST
-------------------------------------------
The set of corrections is every `*corrections*.jsonl` in `project-mgmt/evidence`,
re-derived on every run. No gate, instrument, workstream or clause is named in
this file. A correction set written next week is covered the day it lands, with
no edit here, and a check that had to be extended per workstream is a check that
silently stops covering the newest one -- which is exactly how this defect
survived six days.

Evidence lives in `project-mgmt/evidence/` and not in `data/`, because `data/` is
gitignored in the agent-worktree layout and no CI step may read gitignored data.

WHAT IT ASSERTS
---------------
For every correction row, in each store asked:

  1. exactly one gate exists at (instrument_id, gate_key), and
  2. its `value_spec` is canonically the correction's `proposed_value_spec`
     (`null` meaning the comparator is withdrawn).

Key order is not part of a comparator's identity, so both sides are canonicalised
before comparison -- the same rule `apply_gate_encoding_corrections.py` uses, and
deliberately the same one: a second, laxer definition of "the correction is in
effect" is how the two would drift apart.

A ROW THIS FIRES ON IS NOT AUTOMATICALLY A BUG TO SUPPRESS
----------------------------------------------------------
Two verified passes can legitimately disagree -- `audit_encoding_vs_reality.py
--quarantine` can withdraw a comparator a correction file asked to keep. That is
a real conflict between two decisions and belongs in front of a person, not
resolved by whichever ran last. So this check reports it and fails; it never
edits an evidence file, and the fix is never to widen the check.

  python3 ETL/terms/check_corrections_applied.py             # SQLite
  python3 ETL/terms/check_corrections_applied.py --postgres  # the store the brief reads
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
import os  # noqa: E402
import sqlite3  # noqa: E402

ROOT = _Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "project-mgmt" / "evidence"
GLOB = "*corrections*.jsonl"


def canon(spec) -> str | None:
    """Key order is not part of a comparator's identity."""
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


def corrections() -> list[tuple[str, dict]]:
    out: list[tuple[str, dict]] = []
    for f in sorted(EVIDENCE.glob(GLOB)):
        for line in f.read_text().splitlines():
            if line.strip():
                out.append((f.name, json.loads(line)))
    return out


def conflicts(rows) -> list[str]:
    """Two files asking for different comparators on one gate is unresolvable.

    Last-file-wins would make the verdict depend on a filename, so it is named
    and failed instead.
    """
    seen: dict[tuple[str, str], tuple[str, str | None]] = {}
    bad = []
    for fname, c in rows:
        k = (c["instrument_id"], c["gate_key"])
        want = canon(c["proposed_value_spec"])
        if k in seen and seen[k][1] != want:
            bad.append(f"{k[0]} [{k[1]}]: {seen[k][0]} asks for {seen[k][1]}, "
                       f"{fname} asks for {want}")
        seen.setdefault(k, (fname, want))
    return bad


def audit(store: str, fetch, rows) -> int:
    bad = []
    for fname, c in rows:
        got = fetch(c["instrument_id"], c["gate_key"])
        if len(got) != 1:
            bad.append(f"  {fname}: {c['instrument_id']} [{c['gate_key']}] "
                       f"-> {len(got)} gate rows, expected exactly 1")
            continue
        held, method = got[0]
        if canon(held) != canon(c["proposed_value_spec"]):
            bad.append(
                f"  {fname}: {c['instrument_id']} [{c['gate_key']}] "
                f"({c.get('action', '?')}/{c.get('clause', '?')})\n"
                f"      correction: {canon(c['proposed_value_spec'])}\n"
                f"      {store} holds: {canon(held)}   written by: {method}")
    print(f"{store}: {len(rows)} corrections on record, {len(bad)} not in effect")
    if bad:
        print(f"\nFAIL — a verified correction is not in effect in {store}:")
        print("\n".join(bad))
        print("\n  Something re-derived a comparator over a decision that was made\n"
              "  deliberately. The `written by:` provenance names the pass. Restore\n"
              "  with apply_gate_encoding_corrections.py --corrections <the file>,\n"
              "  and fix whatever wrote it -- not this check.")
    return len(bad)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--postgres", action="store_true",
                    help="check Postgres as well, which is the store the brief "
                         "reads. Before migrate_to_postgres.py has run, SQLite "
                         "is the store that is about to become production; "
                         "after it, Postgres is the only one that matters.")
    args = ap.parse_args()

    rows = corrections()
    files = sorted({f for f, _ in rows})
    print(f"evidence: {len(files)} correction files under "
          f"{EVIDENCE.relative_to(ROOT)}/{GLOB}")
    for f in files:
        print(f"  {f:58} {sum(1 for n, _ in rows if n == f):4} rows")
    if not rows:
        return _sys.exit(f"no correction files matched {EVIDENCE}/{GLOB} — this "
                         "check cannot pass vacuously.")

    clash = conflicts(rows)
    if clash:
        print("\nFAIL — two correction files disagree about one gate:")
        for c in clash:
            print(f"  {c}")
        return 1

    conn = sqlite3.connect(DB, timeout=60)
    conn.row_factory = sqlite3.Row
    bad = audit("sqlite", lambda i, k: [
        (r["value_spec"], r["encoding_method"]) for r in conn.execute(
            "SELECT value_spec, encoding_method FROM eligibility_gates "
            "WHERE instrument_id = ? AND gate_key = ?", (i, k))], rows)

    if args.postgres:
        dsn = os.environ.get("DATABASE_URL")
        if not dsn:
            for line in (ROOT / ".env.local").read_text().splitlines():
                if line.startswith("DATABASE_URL="):
                    dsn = line.split("=", 1)[1].strip().strip('"')
        if not dsn:
            return _sys.exit("DATABASE_URL not set (expected in the repo-root "
                             ".env.local).")
        import psycopg2
        pg = psycopg2.connect(dsn)
        cur = pg.cursor()

        def pg_fetch(i, k):
            cur.execute("SELECT value_spec, encoding_method FROM eligibility_gates "
                        "WHERE instrument_id = %s AND gate_key = %s", (i, k))
            return cur.fetchall()

        bad += audit("postgres", pg_fetch, rows)
        pg.close()
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
