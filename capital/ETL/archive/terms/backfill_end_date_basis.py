"""Say which register supplied each `scheme_end_date`, for the dates already loaded.

Migration 025 adds `scheme_end_date_basis`. Every date written before it exists
is unlabelled, and an unlabelled date is read as a call deadline -- which closes
its row. That is the safe default for a fresh write, but applied retroactively
to the whole corpus it would keep all 306 past-end leaves hidden, including the
220 SATR measures this workstream exists to reopen. So the existing dates have
to be classified once, from evidence rather than from a guess.

── The classification is exact, not heuristic ──────────────────────────────
A `notified_duration` is by definition a SATR `caseMeasureEndDate`, and that
value is still on disk in data/raw/state_aid_cases/cases.json, keyed by SA
number. So a row is a notified duration if and only if its `scheme_code` names a
case whose `caseMeasureEndDate` IS the date the row carries. Nothing is inferred
from the shape of the date, the country, or the id.

Everything else is a `call_deadline`: it came from a call catalogue -- BDNS
convocatorias, ADEME's `date_cloture` -- because those are the only other
writers of the column.

The two are cleanly separated in the corpus, which is the check this script
prints: at the time of writing all 448 SATR leaves with an end date carry a
scheme_code, and none of the 82 BDNS or 6 ADEME leaves with one does.

Usage:
  python3 backfill_end_date_basis.py                 # report only
  python3 backfill_end_date_basis.py --write         # SQLite + Postgres
  python3 backfill_end_date_basis.py --write --sqlite-only
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT as REPO_ROOT  # noqa: E402
from liveness import CALL_DEADLINE, NOTIFIED_DURATION  # noqa: E402

import argparse  # noqa: E402
import collections  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import sqlite3  # noqa: E402

CASES = REPO_ROOT / "data" / "raw" / "state_aid_cases" / "cases.json"


def _one(rec: dict, key: str) -> str:
    v = rec.get(key)
    return (v[0] if isinstance(v, list) and v else v) or ""


def classify(rows: list[dict], cases: dict) -> dict[str, str]:
    """id -> basis, for every row carrying an end date."""
    out: dict[str, str] = {}
    for r in rows:
        end = (r["scheme_end_date"] or "")[:10]
        if not end:
            continue
        code = (r["scheme_code"] or "").strip()
        case_end = _one(cases.get(code) or {}, "caseMeasureEndDate")[:10]
        out[r["id"]] = (NOTIFIED_DURATION if code and case_end == end
                        else CALL_DEADLINE)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--sqlite-only", action="store_true")
    args = ap.parse_args()

    if not CASES.exists():
        raise SystemExit(
            f"{CASES} is missing -- run ETL/terms/fetch_state_aid_cases.py first. "
            "Guessing the basis from the shape of a date would be exactly the "
            "kind of inference this column exists to replace.")
    cases = json.loads(CASES.read_text())

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    rows = [dict(r) for r in conn.execute(
        "SELECT id, country, scheme_code, scheme_end_date, last_year "
        "  FROM funding_instruments WHERE scheme_end_date IS NOT NULL")]
    basis = classify(rows, cases)

    by = collections.Counter(basis.values())
    print(f"{len(rows)} rows carry an end date")
    print(f"  {by[NOTIFIED_DURATION]:>4} notified_duration  (SATR caseMeasureEndDate)")
    print(f"  {by[CALL_DEADLINE]:>4} call_deadline      (call catalogue window)")

    # The check the docstring promises: a row with no scheme_code cannot have a
    # SATR date, so any notified_duration among them would mean the match rule
    # is wrong rather than the data.
    bad = [r["id"] for r in rows
           if not (r["scheme_code"] or "").strip()
           and basis.get(r["id"]) == NOTIFIED_DURATION]
    if bad:
        raise SystemExit(f"{len(bad)} rows classified notified_duration with no "
                         f"scheme_code -- the match rule is wrong: {bad[:5]}")

    if not args.write:
        print("[report only] nothing written")
        return

    payload = [(b, i) for i, b in basis.items()]
    conn.executemany(
        "UPDATE funding_instruments SET scheme_end_date_basis = ? WHERE id = ?",
        payload)
    conn.commit()
    conn.close()
    print(f"wrote {len(payload)} bases to SQLite")

    if args.sqlite_only:
        print("--sqlite-only: NOTHING A FOUNDER CAN SEE HAS CHANGED. The product "
              "reads Postgres; run again without the flag to publish.")
        return

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit(
            "DATABASE_URL is not set, so this backfill would reach SQLite only -- "
            "which no consumer reads. Put it in the repo-root .env.local, or "
            "pass --sqlite-only if you genuinely mean to stage without publishing.")
    import psycopg2  # noqa: E402
    pg = psycopg2.connect(dsn)
    with pg, pg.cursor() as cur:
        cur.execute("ALTER TABLE funding_instruments "
                    "ADD COLUMN IF NOT EXISTS scheme_end_date_basis TEXT")
        cur.executemany(
            "UPDATE funding_instruments SET scheme_end_date_basis = %s WHERE id = %s",
            payload)
        # Reconcile, rather than trust the executemany's rowcount: a row present
        # in SQLite and absent from Postgres updates nothing and reports success.
        cur.execute("SELECT count(*) FROM funding_instruments "
                    " WHERE scheme_end_date IS NOT NULL "
                    "   AND scheme_end_date_basis IS NULL")
        left = cur.fetchone()[0]
    pg.close()
    print(f"wrote {len(payload)} bases to Postgres; "
          f"{left} rows still carry a date with no basis")
    if left:
        raise SystemExit(
            f"{left} Postgres rows have an end date and no basis. Each one is a "
            "row the liveness test will treat as a closed call. They exist in "
            "Postgres but not in SQLite -- publish the corpus, then re-run.")


if __name__ == "__main__":
    main()
