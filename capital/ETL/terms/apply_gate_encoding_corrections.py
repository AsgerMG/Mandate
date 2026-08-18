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

BOTH STORES, OR THE CORRECTION DOES NOT SURVIVE
-----------------------------------------------
`--postgres` writes the same corrections to the store the brief actually reads.
It is not an optional extra: SQLite alone is not durable, because
`migrate_to_postgres.py` TRUNCATEs `eligibility_gates` and reloads it from
SQLite, so a Postgres-only write is silently reverted by the next release
publish -- and a SQLite-only write reaches no founder at all until one happens.

The two stores do not hold the same gate table (see
`project-mgmt/findings/gate_divergence_wsHC.md`), so each is asked its own
drift question, with the same rule, before either is written. Postgres already
holds the proposed comparator on one row, which is why this file writes 62
there and 63 in SQLite.

  python3 ETL/terms/apply_gate_encoding_corrections.py            # dry run
  python3 ETL/terms/apply_gate_encoding_corrections.py --apply
  python3 ETL/terms/apply_gate_encoding_corrections.py --apply --postgres

WHICH CORRECTIONS, AND WHY THAT IS AN ARGUMENT NOW
--------------------------------------------------
`--corrections` names the file. It defaulted to wsGU's and nothing else, so the
second workstream to derive a correction set had two choices: append its rows to
another workstream's evidence file, which destroys the provenance of both, or
copy this file and get a second drift rule that can quietly become laxer than
this one. Both are the failure `build_plan` is written once to avoid. The
default is unchanged, so every existing invocation means what it did.

  python3 ETL/terms/apply_gate_encoding_corrections.py \\
      --corrections project-mgmt/evidence/wsic_gate_branch_corrections_2026-08-19.jsonl
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
DEFAULT_CORRECTIONS = (ROOT / "project-mgmt" / "evidence"
                       / "wsgu_gate_encoding_corrections_2026-08-13.jsonl")


def canon(spec) -> str | None:
    """Key order is not part of a comparator's identity."""
    if spec is None:
        return None
    if isinstance(spec, str):
        spec = json.loads(spec)
    return json.dumps(spec, sort_keys=True)


def proposed(c) -> tuple[str | None, str]:
    """The two columns a correction writes. One definition, both stores."""
    spec = c["proposed_value_spec"]
    return (json.dumps(spec) if spec else None,
            "quarantined" if spec is None else "wsgu_corrected")


def build_plan(fetch, rows) -> tuple[list, list, list]:
    """(plan, drift, already) for one store. `fetch(instrument_id, gate_key)`
    returns that store's `value_spec` values for the row, as a list.

    ── Why the drift check is written once and run per store ──────────────
    SQLite and Postgres do not hold the same gate table (wsHC), so "the
    correction matches" has to be asked of EACH store rather than of one and
    assumed of the other. What must not differ is the QUESTION: a second copy
    of the canonicalisation or the match rule is how one store quietly gets a
    laxer test than the other. So the traversal, the canon and the verdict are
    here, and only the SELECT differs.

    ── ALREADY is not DRIFT ───────────────────────────────────────────────
    A row that already holds the PROPOSED comparator has not moved under the
    correction -- it has arrived where the correction was taking it, by some
    other route. Calling that drift would refuse the whole file over a row
    there is nothing left to do to. It is counted, named, and skipped.
    Postgres holds exactly one: `chips_ju_kdt_unknown [G1-03]`, which is why
    this file changes 62 rows there and 63 in SQLite.
    """
    plan, drift, already = [], [], []
    for c in rows:
        got = fetch(c["instrument_id"], c["gate_key"])
        if len(got) != 1:
            drift.append(f"{c['instrument_id']} [{c['gate_key']}]: "
                         f"{len(got)} matching gate rows, expected exactly 1")
            continue
        held = canon(got[0])
        if held == canon(c["proposed_value_spec"]) \
                and canon(c["current_value_spec"]) != canon(c["proposed_value_spec"]):
            already.append(f"{c['instrument_id']} [{c['gate_key']}]")
            continue
        if held != canon(c["current_value_spec"]):
            drift.append(f"{c['instrument_id']} [{c['gate_key']}]: now holds "
                         f"{got[0]}, correction was written against "
                         f"{json.dumps(c['current_value_spec'])}")
            continue
        plan.append(c)
    return plan, drift, already


def report(store: str, plan, drift, already, total: int) -> bool:
    """Print one store's verdict. True if it is safe to write."""
    print(f"\n{store}: {total} corrections, {len(plan)} to write, "
          f"{len(already)} already applied, {len(drift)} drifted")
    for a in already:
        print(f"  ALREADY  {a}")
    if drift:
        print(f"\nREFUSED on {store} — the corpus has moved under these rows:")
        for d in drift:
            print(f"  {d}")
        print("\n  Re-derive them against the current corpus rather than applying a\n"
              "  partial set: a half-applied pass leaves nothing recording which\n"
              "  half is which. `python3 ETL/terms/_wsgu_corrections.py --check`\n"
              "  reports the same drift against the published snapshot.")
        return False
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="actually write")
    ap.add_argument("--corrections", default=str(DEFAULT_CORRECTIONS),
                    help="the JSONL of corrections to apply. One file per "
                         "workstream, so a correction keeps the evidence and "
                         "the drift refusal it was derived with.")
    ap.add_argument("--postgres", action="store_true",
                    help="also write Postgres, which is the store the brief "
                         "reads. SQLite alone is not durable: "
                         "migrate_to_postgres.py TRUNCATEs eligibility_gates "
                         "and reloads it from SQLite, and a Postgres-only "
                         "write is reverted by the next release publish.")
    args = ap.parse_args()

    corrections_path = _Path(args.corrections)
    if not corrections_path.is_absolute():
        corrections_path = ROOT / corrections_path
    rows = [json.loads(l) for l in corrections_path.read_text().splitlines() if l.strip()]
    print(f"corrections: {corrections_path.relative_to(ROOT)}")
    conn = sqlite3.connect(DB, timeout=60)
    conn.row_factory = sqlite3.Row

    def sq_fetch(iid, key):
        return [r["value_spec"] for r in conn.execute(
            "SELECT value_spec FROM eligibility_gates "
            "WHERE instrument_id = ? AND gate_key = ?", (iid, key))]

    plan, drift, already = build_plan(sq_fetch, rows)

    by_action: dict[str, int] = {}
    for c in plan:
        by_action[c["action"]] = by_action.get(c["action"], 0) + 1
    print("  " + ", ".join(f"{k} {v}" for k, v in sorted(by_action.items())))
    for c in plan:
        to = json.dumps(c["proposed_value_spec"]) if c["proposed_value_spec"] else "NULL"
        print(f"  {c['instrument_id']} [{c['gate_key']}] {c['clause']}\n"
              f"      {json.dumps(c['current_value_spec'])}\n   -> {to}")
    if not report("sqlite", plan, drift, already, len(rows)):
        return 1

    pg = pg_plan = pg_drift = pg_already = None
    if args.postgres:
        dsn = os.environ.get("DATABASE_URL")
        if not dsn:
            for line in (ROOT / ".env.local").read_text().splitlines():
                if line.startswith("DATABASE_URL="):
                    dsn = line.split("=", 1)[1].strip().strip('"')
        if not dsn:
            return _sys.exit("DATABASE_URL not set (expected in the repo-root "
                             ".env.local). Nothing was written to either store.")
        import psycopg2
        pg = psycopg2.connect(dsn)
        cur = pg.cursor()

        def pg_fetch(iid, key):
            cur.execute("SELECT value_spec FROM eligibility_gates "
                        "WHERE instrument_id = %s AND gate_key = %s", (iid, key))
            return [r[0] for r in cur.fetchall()]

        pg_plan, pg_drift, pg_already = build_plan(pg_fetch, rows)
        # Postgres is checked BEFORE SQLite is written, so a store that has
        # moved stops the whole pass rather than leaving the two half-applied
        # in opposite directions.
        if not report("postgres", pg_plan, pg_drift, pg_already, len(rows)):
            pg.close()
            return 1

    if not args.apply:
        print("\nDRY RUN — nothing written. Re-run with --apply.")
        if pg:
            pg.close()
        return 0

    for c in plan:
        spec, method = proposed(c)
        conn.execute(
            "UPDATE eligibility_gates SET value_spec = ?, encoding_method = ? "
            "WHERE instrument_id = ? AND gate_key = ?",
            (spec, method, c["instrument_id"], c["gate_key"]))
    conn.commit()
    print(f"\nSQLITE: applied {len(plan)} corrections")

    if pg:
        with pg, pg.cursor() as cur:
            cur.executemany(
                "UPDATE eligibility_gates SET value_spec = %s, encoding_method = %s "
                "WHERE instrument_id = %s AND gate_key = %s",
                [proposed(c) + (c["instrument_id"], c["gate_key"]) for c in pg_plan])
        pg.close()
        print(f"POSTGRES: applied {len(pg_plan)} corrections")

    print("\nre-run:")
    print("  cd website/frontend && npx tsx scripts/check_winner_not_gated.ts")
    print("  python3 ETL/terms/check_gate_subject.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
