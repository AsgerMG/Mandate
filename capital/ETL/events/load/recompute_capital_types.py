"""Recompute funding_instruments.capital_type in place, from the events.

Why a separate script rather than re-running populate_funding_instruments.py:
that script does a full rebuild, and its rebuild does

    DELETE FROM eligibility_gates WHERE instrument_id NOT IN (... is_framework=1)

which would destroy the encoded value_specs and the gate_role triage that cost
real money to produce. Correcting one derived column does not justify losing
the eligibility layer, so this reuses populate's own row_capital_type() and
family_capital_type() -- the single source of truth for the mapping -- and
writes only the two columns it owns.

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
from etl_env import DB  # noqa: E402
# --- end ETL path bootstrap ---

import argparse
import sqlite3
from collections import Counter, defaultdict

from populate_funding_instruments import (  # noqa: E402
    family_capital_type, row_capital_type, source_to_family,
)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row

    votes: dict[str, Counter] = defaultdict(Counter)
    for r in conn.execute(
        """SELECT source, grant_amount_basis, aid_instrument,
                  grant_amount_eur, equity_amount_eur, debt_amount_eur
             FROM public_funding_events"""
    ):
        fam = source_to_family(r["source"])
        votes[fam][row_capital_type(
            r["grant_amount_basis"], r["aid_instrument"],
            r["grant_amount_eur"], r["equity_amount_eur"], r["debt_amount_eur"],
        )] += 1

    changes: list[tuple[str, str, str, str]] = []
    for iid, name, old in conn.execute(
        "SELECT id, name, capital_type FROM funding_instruments WHERE is_framework = 0"
    ).fetchall():
        counter = votes.get(iid)
        if not counter:
            continue  # synthetic rollup with no direct events — leave alone
        new, basis = family_capital_type(counter)
        if new != old:
            changes.append((iid, name, old, new))
            if not args.dry_run:
                conn.execute(
                    "UPDATE funding_instruments SET capital_type=?, capital_type_basis=? WHERE id=?",
                    (new, basis, iid))

    if not args.dry_run:
        conn.commit()

    print(f"{len(changes)} instruments change capital_type"
          f"{' (dry run, nothing written)' if args.dry_run else ''}")
    for iid, name, old, new in changes[:40]:
        print(f"   {old:12} -> {new:12}  {name} ({iid})")
    if len(changes) > 40:
        print(f"   ... and {len(changes) - 40} more")


if __name__ == "__main__":
    main()
