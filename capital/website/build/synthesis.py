"""Corpus KPI builder. Writes the headline figures the live site reads.

The Sprint 9 exploratory deep dives (q01–q08 + the synthesis page) have been
retired; this orchestrator now only produces the corpus-wide counts that the
home page KPI grid and the layout footer depend on.

  website/frontend/public/data/synthesis.json
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from web_env import SITE_DATA  # noqa: E402
from helpers import df, to_json, fmt_eur  # noqa: E402

SITE_DATA.mkdir(parents=True, exist_ok=True)


# ── Corpus KPIs ───────────────────────────────────────────────────────────────
def run_synthesis():
    """Write the corpus-wide KPI grid the home page and layout footer read.

    `source_families` and `sectors` are scoped exactly as the retired q01 corpus
    overview did, so the headline numbers on the home page are unchanged."""
    kpis_row = df("""
        SELECT
          -- distinct legal entities AFTER the parent-company merge: sister
          -- entities sharing a parent_group (Sprint dedup Layer 1) collapse to
          -- one. Falls back to the row id for the unmerged majority.
          (SELECT COUNT(DISTINCT COALESCE(parent_group, CAST(id AS TEXT)))
             FROM companies) AS companies,
          (SELECT COUNT(*) FROM public_funding_events WHERE is_duplicate = 0) AS events,
          (SELECT COUNT(*) FROM v_company_breadth WHERE n_source_families >= 2) AS champions,
          (SELECT COUNT(*) FROM companies WHERE step_flagged = 1) AS step_companies,
          -- ipcei_linked = 1 marks SATR rows that are granted tranches of aid
          -- the ipcei_* events already carry as approved ceilings; netting them
          -- here keeps the headline total single-counted (see decision log D-17).
          -- is_duplicate = 1 marks cross-source duplicates (ADEME also in SATR-FR,
          -- migration 009) — netted here too so the headline single-counts.
          (SELECT SUM(COALESCE(grant_amount_eur,0)+COALESCE(debt_amount_eur,0))
           FROM public_funding_events WHERE ipcei_linked = 0 AND is_duplicate = 0) AS total_capital_eur,
          (SELECT COUNT(DISTINCT country) FROM companies WHERE country IS NOT NULL) AS countries,
          (SELECT COUNT(DISTINCT source_family) FROM v_events) AS source_families,
          (SELECT COUNT(DISTINCT c.sector_top)
             FROM v_european_companies c
             JOIN v_events v ON v.company_id = c.id
             WHERE c.sector_top IS NOT NULL AND c.sector_top != '') AS sectors
    """).iloc[0]

    payload = {
        "companies": int(kpis_row["companies"]),
        "events": int(kpis_row["events"]),
        "champions": int(kpis_row["champions"]),
        "step_companies": int(kpis_row["step_companies"]),
        "total_capital_eur": fmt_eur(float(kpis_row["total_capital_eur"] or 0)),
        "total_capital_eur_raw": float(kpis_row["total_capital_eur"] or 0),
        "countries": int(kpis_row["countries"]),
        "source_families": int(kpis_row["source_families"]),
        "sectors": int(kpis_row["sectors"]),
    }
    to_json(payload, SITE_DATA / "synthesis.json")
    print("synthesis ✓")


if __name__ == "__main__":
    print("Building corpus KPIs...")
    run_synthesis()
    print("\nDone. synthesis.json written to website/frontend/public/data/")
