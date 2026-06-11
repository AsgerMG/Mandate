"""Sprint 19 Step 3 — label equity-class instruments already in the corpus.

Sets public_funding_events.instrument_class (migration 008) on rows that are
equity-class but were loaded through grant/loan pipelines. Amounts are NOT
moved between columns; inspection (2026-06-11) showed:

- SATR PRVRISKFIN rows carry the EC-published aid amount under a risk-finance
  MEASURE, often scheme-level (e.g. the HU EUR 1.55B Kecskemet capital
  programme prolongation row), not a per-company ticket -> 'risk_finance',
  amount stays as grant_amount_basis='satr_aid_element'.
- BDNS prestamos participativos already store nominal in debt_amount_eur and
  the aid element in grant_amount_eur ('bdns_loan_aid_element') -> the label
  'quasi_equity' is the only missing piece.
- EIC Fund / ALTUM co-invest / EIT KIC portfolio / EIFO Venturelisten rows are
  genuine equity positions or rounds -> 'equity'.

Idempotent: every UPDATE is a full re-derivation from stable predicates.
Run: python3 scripts/reclassify_equity_class.py
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "db.sqlite"

RULES: list[tuple[str, str, str]] = [
    # (label, description, WHERE predicate)
    ("risk_finance",
     "SATR GBER Art.21 risk-finance awards (PRVRISKFIN)",
     "aid_instrument = 'StateAidInstrumentPRVRISKFIN'"),
    ("quasi_equity",
     "ES BDNS prestamos participativos",
     "source LIKE 'bdns%' AND (project_title LIKE '%participativ%' "
     "OR project_summary LIKE '%participativ%')"),
    ("equity",
     "EIC Fund portfolio positions",
     "source = 'eic_fund'"),
    ("equity",
     "ALTUM co-investment fund equity tickets",
     "grant_amount_basis = 'ndb_equity'"),
    ("equity",
     "EIT KIC portfolio investments (amounts undisclosed)",
     "grant_amount_basis = 'eit_kic_equity'"),
    ("equity",
     "EIFO Venturelisten co-invest rounds (round volume, not ticket)",
     "source = 'eifo_coinvest'"),
    ("equity",
     "Sprint 13 NDB portfolio listings (positions loaded as events)",
     "grant_amount_basis IN ('htgf_equity','coparion_equity',"
     "'almi_invest_equity','cdp_vc_equity','tesi_equity','invest_nl_equity')"),
]


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    try:
        total = 0
        for label, desc, predicate in RULES:
            cur = conn.execute(
                f"UPDATE public_funding_events SET instrument_class = ? "
                f"WHERE {predicate}",
                (label,),
            )
            print(f"  {label:13s} {cur.rowcount:5d}  {desc}")
            total += cur.rowcount
        conn.commit()

        print(f"\n  total labelled: {total}")
        print("\nEquity-class corpus signal:")
        for row in conn.execute(
            "SELECT instrument_class, COUNT(*), COUNT(DISTINCT company_id), "
            "ROUND(SUM(COALESCE(grant_amount_eur,0)"
            "          + COALESCE(equity_amount_eur,0))/1e6, 1) "
            "FROM public_funding_events WHERE instrument_class IS NOT NULL "
            "GROUP BY 1 ORDER BY 2 DESC"
        ):
            print(f"  {row[0]:13s} {row[1]:5d} events  {row[2]:5d} companies  "
                  f"EUR {row[3]:,.1f}M (mixed basis — do not sum as tickets)")
        n_countries = conn.execute(
            "SELECT COUNT(DISTINCT c.country) FROM public_funding_events e "
            "JOIN companies c ON c.id = e.company_id "
            "WHERE e.instrument_class IS NOT NULL AND c.country != ''"
        ).fetchone()[0]
        print(f"  across {n_countries} countries")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
