"""Sprint 19 Step 4 — backfill EIC Fund portfolio into public_equity_stakes.

The 233 source='eic_fund' events (loaded 2026-06-11 from eic.ec.europa.eu)
are equity POSITIONS, not funding events. This mirrors them into the stakes
table at disclosure_level='name_only' — the Fund publishes company names but
no percentages and no ticket sizes, which is itself a scorecard finding
(the EU's own equity arm lands at tier E-C).

Idempotent via the (company_id, holder, source, as_of) unique key.
Run: python3 scripts/backfill_eic_stakes.py
"""
from __future__ import annotations


# --- ETL path bootstrap (auto-added; see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB as _ETL_DB, ROOT as _ETL_ROOT  # noqa: E402,F401
# --- end ETL path bootstrap ---

import sqlite3
from pathlib import Path

DB_PATH = _ETL_DB

AS_OF = "2026-06-11"  # portfolio scrape date (see methodology, EIC Fund load)


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.execute(
            """
            INSERT OR IGNORE INTO public_equity_stakes
                (company_id, holder, holder_type, as_of, first_seen,
                 source, raw_source_url, disclosure_level)
            SELECT company_id, 'eic_fund', 'eu_instrument', ?, ?,
                   'eic_fund_portfolio', raw_source_url, 'name_only'
            FROM public_funding_events
            WHERE source = 'eic_fund' AND company_id IS NOT NULL
            """,
            (AS_OF, AS_OF),
        )
        conn.commit()
        n = conn.execute(
            "SELECT COUNT(*) FROM public_equity_stakes WHERE holder='eic_fund'"
        ).fetchone()[0]
        print(f"  inserted {cur.rowcount} (total eic_fund stakes: {n})")
        by_country = conn.execute(
            "SELECT c.country, COUNT(*) FROM public_equity_stakes s "
            "JOIN companies c ON c.id = s.company_id "
            "WHERE s.holder='eic_fund' GROUP BY 1 ORDER BY 2 DESC LIMIT 8"
        ).fetchall()
        print("  top countries: " + ", ".join(f"{c or '??'} {n}" for c, n in by_country))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
