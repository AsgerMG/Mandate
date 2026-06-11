"""Sprint 19 Steps 6.2-6.4 — mirror in-corpus portfolio listings into stakes.

Several loads already brought institution portfolios in as funding events;
this backfills them into public_equity_stakes so the equity layer is queryable
in one place. Two source semantics, handled differently:

- HOLDINGS registers (portfolio pages: HTGF, Coparion, CDP VC, Tesi, Almi
  Invest, Invest-NL, EIT KICs): the institution claims to currently hold the
  position -> as_of = scrape date (Sprint 13 pages pulled 2026-05-26/27),
  first_seen = NULL (listing has no vintage).
- INVESTMENT registers (ALTUM co-invest workbook, EIFO Venturelisten): rows
  are dated investment events; whether the position is still held is unknown
  -> as_of = first_seen = event date, exited=0 is an assumption documented in
  methodology.

ALTUM rows carry real ticket amounts (equity_amount_eur) ->
disclosure_level='amount', the corpus's first ticket-level stakes. Everything
else is name_only.

Idempotent via the (company_id, holder, source, as_of) unique key.
Run: python3 scripts/backfill_portfolio_stakes.py
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "db.sqlite"

# (event predicate, holder, holder_type, as_of, source)
HOLDINGS = [
    ("e.source = 'htgf_equity'", "htgf", "state_vc", "2026-05-26",
     "htgf_portfolio"),
    ("e.source = 'coparion_equity'", "coparion", "state_vc", "2026-05-26",
     "coparion_portfolio"),
    ("e.source IN ('cdp_vc_equity')", "cdp_vc", "state_vc", "2026-05-26",
     "cdp_vc_portfolio"),
    ("e.source = 'tesi_equity'", "tesi", "state_vc", "2026-05-26",
     "tesi_portfolio"),
    ("e.source = 'almi_invest_equity'", "almi_invest", "state_vc",
     "2026-05-26", "almi_invest_portfolio"),
    ("e.source = 'invest_nl_equity'", "invest_nl", "ndb", "2026-05-26",
     "invest_nl_portfolio"),
    ("e.source LIKE 'eit_innoenergy_highway%'", "eit_innoenergy",
     "eu_instrument", "2026-05-25", "eit_innoenergy_portfolio"),
    ("e.source = 'eit_manufacturing_investments'", "eit_manufacturing",
     "eu_instrument", "2026-05-25", "eit_manufacturing_portfolio"),
    ("e.source = 'eit_urban_mobility_portfolio'", "eit_urban_mobility",
     "eu_instrument", "2026-05-25", "eit_urban_mobility_portfolio"),
]


def main() -> None:
    con = sqlite3.connect(DB_PATH)
    try:
        total = 0
        for pred, holder, htype, as_of, source in HOLDINGS:
            cur = con.execute(
                f"""INSERT OR IGNORE INTO public_equity_stakes
                    (company_id, holder, holder_type, as_of, exited,
                     source, raw_source_url, disclosure_level)
                    SELECT DISTINCT e.company_id, ?, ?, ?, 0, ?,
                           e.raw_source_url, 'name_only'
                    FROM public_funding_events e
                    WHERE {pred} AND e.company_id IS NOT NULL""",
                (holder, htype, as_of, source),
            )
            print(f"  {holder:20s} +{cur.rowcount}")
            total += cur.rowcount

        # Investment registers: dated rows, exit status unknown.
        cur = con.execute(
            """INSERT OR IGNORE INTO public_equity_stakes
               (company_id, holder, holder_type, as_of, first_seen, exited,
                ticket_eur, source, raw_source_url, disclosure_level)
               SELECT e.company_id, 'altum', 'ndb',
                      COALESCE(e.project_started, '2026-06-03'),
                      e.project_started, 0, e.equity_amount_eur,
                      'altum_coinvest_register', e.raw_source_url, 'amount'
               FROM public_funding_events e
               WHERE e.grant_amount_basis = 'ndb_equity'
                 AND e.equity_amount_eur IS NOT NULL
                 AND e.company_id IS NOT NULL"""
        )
        print(f"  {'altum (amount!)':20s} +{cur.rowcount}")
        total += cur.rowcount

        cur = con.execute(
            """INSERT OR IGNORE INTO public_equity_stakes
               (company_id, holder, holder_type, as_of, first_seen, exited,
                source, raw_source_url, disclosure_level)
               SELECT e.company_id, 'eifo', 'ndb',
                      COALESCE(e.project_started, '2026-06-03'),
                      e.project_started, 0,
                      'eifo_venturelisten', e.raw_source_url, 'name_only'
               FROM public_funding_events e
               WHERE e.source = 'eifo_coinvest' AND e.company_id IS NOT NULL"""
        )
        print(f"  {'eifo':20s} +{cur.rowcount}")
        total += cur.rowcount
        con.commit()

        print(f"\n  total inserted: {total}")
        for row in con.execute(
            "SELECT holder, COUNT(*), disclosure_level "
            "FROM public_equity_stakes GROUP BY holder, disclosure_level "
            "ORDER BY 2 DESC"
        ):
            print(f"  {row[0]:22s} {row[1]:5d}  {row[2]}")
    finally:
        con.close()


if __name__ == "__main__":
    main()
