"""Retract rows that are APPROVALS of aid, not offers of it.

── The defect this exists to undo ─────────────────────────────────────────
Some rows in this corpus are not funds a founder can apply to. They are
Commission decisions approving aid for a beneficiary list the decision itself
names: IPCEI waves, ad hoc aid, individual approvals. Their award history is
real -- billions of euros to real companies -- so they belong in the corpus as
evidence. They are not routes in, and offering one is telling a founder to
apply to a door that was locked before the row existed.

On 2026-08-06 all eleven IPCEI wave leaves gained `eligibility_text` harvested
from those decisions. One published string reads, in as many words:

    "The Member States only grant support to the beneficiaries listed section
     2.2.6 and the funding is not available to all undertakings in a
     comparable situation."

Every quotation was verbatim and correctly attributed. The check that was
missing is not about accuracy: it is that a compatibility FINDING about aid
already granted to somebody else is the wrong KIND of statement to publish in
the column a founder reads as "who may apply". Two agents independently judged
IPCEI should carry no eligibility text; nobody argued the other way; it
happened anyway. This retracts it.

── What it does, and why in this order ────────────────────────────────────
1. `scheme_end_date_basis = closed_beneficiary_list`, which `isClosed()` reads
   as closed WITHOUT a date -- the row never had an application window. This
   is what actually removes it from `publishableInstruments()`, so it is the
   change that matters and it is made first.
2. Clears `eligibility_text`, `eligibility_source_url`, `eligibility_confidence`
   and `eligibility_fetched_at`. Belt and braces: step 1 already stops a
   founder seeing the row, but the text also feeds
   `build_instrument_profiles.py` -- it is embedded under the heading "Who may
   apply, from the scheme's own page" -- and a retraction that leaves the
   sentence in the retrieval index has retracted nothing.
3. `eligibility_gates` are LEFT ALONE. They were cut and triaged before this
   workstream, they carry `gate_role`, and they say true things about the
   IPCEI Communication. A closed row does not reach a founder through them,
   and deleting audited encoding to fix a text defect is scope creep.

Both stores, always. SQLite is where the ETL works and Postgres is what the
product reads; a night was already lost to a load that landed in one of them.

── Scope: a PARENT, not a list of ids ─────────────────────────────────────
The unit is a regime whose leaves are individual approvals. `--parent ipcei`
means "every leaf under this regime is a decision, not an offer", which is a
statement about the regime that a reader can check. Passing eleven ids would
be the same edit with the reasoning left out, and the next such regime would
have to rediscover it.

Idempotent: re-running changes nothing and says so.

Usage:
  python3 ETL/terms/close_fixed_beneficiary_lists.py --parent ipcei --dry-run
  python3 ETL/terms/close_fixed_beneficiary_lists.py --parent ipcei --write
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402

from liveness import CLOSED_BENEFICIARY_LIST  # noqa: E402

TEXT_COLS = ("eligibility_text", "eligibility_source_url",
             "eligibility_confidence", "eligibility_fetched_at")


def _load_env() -> None:
    """DATABASE_URL lives in the repo-root .env.local, same as every other
    publisher here. A missing URL is a hard exit, not a printed shrug: half a
    retraction is worse than none, because the product reads the half that is
    still there."""
    path = ROOT / ".env.local"
    if path.exists():
        for line in path.read_text().splitlines():
            m = re.match(r"^([A-Z_]+)=(.*)$", line)
            if m:
                os.environ.setdefault(m.group(1), m.group(2).strip("\"'"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--parent", required=True,
                    help="regime whose LEAVES are individual aid approvals")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if args.write == args.dry_run:
        raise SystemExit("choose exactly one of --write / --dry-run")

    _load_env()
    url = os.environ.get("DATABASE_URL")
    if args.write and not url:
        raise SystemExit(
            "DATABASE_URL is not set. SQLite alone is not a retraction -- the "
            "product reads Postgres, and the sentence would still be published.")

    sq = sqlite3.connect(DB)
    sq.row_factory = sqlite3.Row
    rows = sq.execute(
        f"""SELECT id, name, scheme_end_date_basis,
                   length(COALESCE(eligibility_text,'')) AS n_text
              FROM funding_instruments
             WHERE parent_id = ?
               AND id NOT IN (SELECT parent_id FROM funding_instruments
                               WHERE parent_id IS NOT NULL)
             ORDER BY id""", (args.parent,)).fetchall()
    if not rows:
        raise SystemExit(f"no leaves under parent {args.parent!r}")

    print(f"{len(rows)} leaves under {args.parent}")
    todo = []
    for r in rows:
        already = r["scheme_end_date_basis"] == CLOSED_BENEFICIARY_LIST and not r["n_text"]
        print(f"  {'ok  ' if already else 'RETRACT'} {r['id']:<22} "
              f"basis={r['scheme_end_date_basis'] or '-':<24} text={r['n_text'] or 0} chars")
        if not already:
            todo.append(r["id"])
    if not todo:
        print("nothing to do -- already retracted in SQLite")
    if args.dry_run:
        print("\ndry run: nothing written")
        return

    ids = [r["id"] for r in rows]
    sets = f"scheme_end_date_basis = ?, " + ", ".join(f"{c} = NULL" for c in TEXT_COLS)
    marks = ",".join("?" * len(ids))
    sq.execute(f"UPDATE funding_instruments SET {sets} WHERE id IN ({marks})",
               [CLOSED_BENEFICIARY_LIST, *ids])
    sq.commit()
    print(f"\nsqlite: {sq.total_changes} row(s) updated")

    import psycopg2  # noqa: PLC0415  -- optional dep, only the write path needs it
    pg = psycopg2.connect(url)
    with pg, pg.cursor() as cur:
        cur.execute(
            f"UPDATE funding_instruments SET scheme_end_date_basis = %s, "
            + ", ".join(f"{c} = NULL" for c in TEXT_COLS)
            + " WHERE id = ANY(%s)", (CLOSED_BENEFICIARY_LIST, ids))
        print(f"postgres: {cur.rowcount} row(s) updated")
        # Reconcile, out of Postgres, so the run reports what the PRODUCT will
        # see rather than what the script believes it did.
        cur.execute(
            "SELECT count(*) FROM funding_instruments "
            " WHERE id = ANY(%s) AND scheme_end_date_basis = %s "
            "   AND COALESCE(eligibility_text,'') = ''", (ids, CLOSED_BENEFICIARY_LIST))
        print(f"postgres: {cur.fetchone()[0]} of {len(ids)} confirmed retracted")
    pg.close()


if __name__ == "__main__":
    main()
