"""Recompute funding_instruments.capital_type in place, from the events.

Why a separate script rather than re-running populate_funding_instruments.py:
that script does a full rebuild, and its rebuild does

    DELETE FROM eligibility_gates WHERE instrument_id NOT IN (... is_framework=1)

which would destroy the encoded value_specs and the gate_role triage that cost
real money to produce. Correcting one derived column does not justify losing
the eligibility layer, so this reuses populate's own row_capital_type() and
family_capital_type() -- the single source of truth for the mapping -- and
writes only the two columns it owns.

CHILDREN TOO, and that is not a refinement. This script grouped events by
`source_to_family()` and then looked each instrument id up in that dict, so it
only ever reached the ~370 FAMILY rollups; every one of the 430 per-scheme
children -- the rows a founder is actually shown -- fell through the
`if not counter: continue` branch and kept whatever the last full rebuild gave
it. Correcting the G/DG transposition moved three rollups and left
`Fondo di garanzia per le PMI` (13,892 awards, EUR 14.9B) rendering as a grant.
The children are keyed by `child_key()` / `child_instrument_id()` in
populate_funding_instruments.py, imported rather than restated.

Run after changing SATR_INSTRUMENT_MAP or any of the *_BASES sets:

    python3 ETL/events/load/recompute_capital_types.py [--dry-run]
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

import argparse
import os
import re
import sqlite3
from collections import Counter, defaultdict

from populate_funding_instruments import (  # noqa: E402
    MIN_CHILD_EVENTS, assert_bases_declared, child_instrument_id, child_key,
    family_capital_type, row_capital_type, source_to_family, split_families,
)


def _load_env() -> None:
    """DATABASE_URL lives in the repo-root .env.local, same as every other
    write path in ETL/terms. One loader shape, so a rotated key reaches all."""
    path = ROOT / ".env.local"
    if path.exists():
        for line in path.read_text().splitlines():
            m = re.match(r"^([A-Z_]+)=(.*)$", line)
            if m:
                os.environ.setdefault(m.group(1), m.group(2).strip("\"'"))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    # Same gate as the full rebuild, for the same reason: this script writes
    # the same column, so it can strand the same instruments.
    assert_bases_declared(conn)

    # The two split rules the rebuild uses, read the same way it reads them, so
    # a child's vote here lands in the same bucket the rebuild would give it.
    split_targets = split_families(conn)
    programme_split = {r[0] for r in conn.execute("""
        SELECT source FROM public_funding_events
         WHERE programme_name IS NOT NULL AND programme_name != ''
         GROUP BY source
        HAVING COUNT(*) >= ? AND COUNT(DISTINCT programme_name) > 1
    """, (MIN_CHILD_EVENTS,))}

    # The rebuild's own event population, join for join: European companies
    # only, duplicates excluded. The old query here was a bare SELECT over
    # public_funding_events, so this script and the rebuild were voting on
    # different rows and could reach different answers for the same instrument.
    votes: dict[str, Counter] = defaultdict(Counter)
    for r in conn.execute(
        """SELECT e.source, e.programme_name, e.granting_authority, e.call_id,
                  e.grant_amount_basis, e.aid_instrument,
                  e.grant_amount_eur, e.equity_amount_eur, e.debt_amount_eur
             FROM public_funding_events e
             INNER JOIN v_european_companies c ON c.id = e.company_id
            WHERE COALESCE(e.is_duplicate, 0) = 0"""
    ):
        fam = source_to_family(r["source"])
        kind = row_capital_type(
            r["grant_amount_basis"], r["aid_instrument"],
            r["grant_amount_eur"], r["equity_amount_eur"], r["debt_amount_eur"],
        )
        votes[fam][kind] += 1
        # A child's capital type is voted on by the child's OWN awards, not its
        # regime's. `satr_it_equity` is majority-guarantee and its ADEME-style
        # siblings are not; a child that inherited the rollup's answer would be
        # asserting something about a scheme nobody counted.
        key = child_key(r, fam, split_targets, programme_split)
        if key:
            votes[child_instrument_id(*key)][kind] += 1

    changes: list[tuple[str, str, str, str, str]] = []
    for iid, name, old in conn.execute(
        "SELECT id, name, capital_type FROM funding_instruments WHERE is_framework = 0"
    ).fetchall():
        counter = votes.get(iid)
        if not counter:
            continue  # synthetic rollup with no direct events — leave alone
        new, basis = family_capital_type(counter)
        if new != old:
            changes.append((iid, name, old, new, basis))
            if not args.dry_run:
                conn.execute(
                    "UPDATE funding_instruments SET capital_type=?, capital_type_basis=? WHERE id=?",
                    (new, basis, iid))

    if not args.dry_run:
        conn.commit()

    print(f"{len(changes)} instruments change capital_type"
          f"{' (dry run, nothing written)' if args.dry_run else ''}")
    for iid, name, old, new, _basis in changes[:40]:
        print(f"   {old:12} -> {new:12}  {name} ({iid})")
    if len(changes) > 40:
        print(f"   ... and {len(changes) - 40} more")

    if args.dry_run or not changes:
        return

    # ── Postgres, always, in the same run ────────────────────────────────────
    # SQLite is where the ETL works; Postgres is what the product reads. This
    # script has always written only the first, so a corrected capital type sat
    # in the authoring store while every founder kept seeing the old one -- the
    # same one-store drift `source_window_policy` was lost to. A guarantee typed
    # correctly in a file nobody serves is not a fix.
    _load_env()
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit(
            "DATABASE_URL is not set, and SQLite now disagrees with Postgres on "
            f"{len(changes)} instruments. Set it and re-run: the product reads "
            "Postgres.")
    import psycopg2  # noqa: PLC0415 — optional dep, only the write path needs it
    pg = psycopg2.connect(url)
    with pg, pg.cursor() as cur:
        for iid, _name, _old, new, basis in changes:
            cur.execute("UPDATE funding_instruments SET capital_type = %s, "
                        "capital_type_basis = %s WHERE id = %s",
                        (new, basis, iid))
        # Read back OUT of Postgres, so the run reports what the product will
        # see rather than what this script believes it did.
        cur.execute("SELECT capital_type, count(*) FROM funding_instruments "
                    "WHERE source_family_bucket = 'state_aid_satr' "
                    "GROUP BY 1 ORDER BY 2 DESC")
        print("\npostgres, read back — state_aid_satr channel:")
        for kind, n in cur.fetchall():
            print(f"  {kind:<14} {n}")
    pg.close()


if __name__ == "__main__":
    main()
