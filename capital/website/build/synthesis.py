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
from helpers import db, to_json, fmt_eur  # noqa: E402

SITE_DATA.mkdir(parents=True, exist_ok=True)


# ── The single canonical definition of every corpus-wide figure ───────────────
# THIS is the source of truth. synthesis.json (home page + footer), the
# /for-companies headline, and the build guardrail all derive their numbers from
# here. Do not recompute a corpus count anywhere else: import compute_kpis and
# the guardrail in build_site_data.py will fail the build if a generated file
# disagrees. Definitions are deliberate, not incidental:
#   companies  — distinct legal entities AFTER the parent-group merge (dedup
#                Layer 1); sisters sharing a parent_group collapse to one, else
#                fall back to the row id. NOT a raw COUNT(*) (which double-counts
#                un-merged sisters), NOT "companies with an event" (a subset).
#   events     — non-duplicate rows only (is_duplicate = 0).
#   capital    — grant + debt, EXCLUDING ipcei_linked tranches (already counted
#                as ipcei_* ceilings, decision log D-17) and is_duplicate rows
#                (ADEME also in SATR-FR, migration 009). Single-counted on purpose;
#                a raw SUM(grant_amount_eur) over-states it by ~€13B.
CANONICAL_KPI_SQL = {
    "companies":
        "SELECT COUNT(DISTINCT COALESCE(parent_group, CAST(id AS TEXT))) FROM companies",
    "events":
        "SELECT COUNT(*) FROM public_funding_events WHERE is_duplicate = 0",
    "champions":
        "SELECT COUNT(*) FROM v_company_breadth WHERE n_source_families >= 2",
    "step_companies":
        "SELECT COUNT(*) FROM companies WHERE step_flagged = 1",
    "total_capital_eur_raw":
        "SELECT COALESCE(SUM(COALESCE(grant_amount_eur,0)+COALESCE(debt_amount_eur,0)),0)"
        " FROM public_funding_events WHERE ipcei_linked = 0 AND is_duplicate = 0",
    "countries":
        "SELECT COUNT(DISTINCT country) FROM companies WHERE country IS NOT NULL",
    "source_families":
        "SELECT COUNT(DISTINCT source_family) FROM v_events",
    "sectors":
        "SELECT COUNT(DISTINCT c.sector_top) FROM v_european_companies c"
        " JOIN v_events v ON v.company_id = c.id"
        " WHERE c.sector_top IS NOT NULL AND c.sector_top != ''",
}


def compute_kpis(con) -> dict:
    """Compute every canonical corpus-wide figure from `con`. The one definition;
    imported by both the synthesis writer and the build guardrail."""
    out = {}
    for key, sql in CANONICAL_KPI_SQL.items():
        val = con.execute(sql).fetchone()[0]
        out[key] = float(val) if key == "total_capital_eur_raw" else int(val)
    return out


# ── Corpus KPIs ───────────────────────────────────────────────────────────────
def run_synthesis():
    """Write the corpus-wide KPI grid the home page and layout footer read."""
    con = db()
    try:
        k = compute_kpis(con)
    finally:
        con.close()

    payload = {
        "companies": k["companies"],
        "events": k["events"],
        "champions": k["champions"],
        "step_companies": k["step_companies"],
        "total_capital_eur": fmt_eur(k["total_capital_eur_raw"]),
        "total_capital_eur_raw": k["total_capital_eur_raw"],
        "countries": k["countries"],
        "source_families": k["source_families"],
        "sectors": k["sectors"],
    }
    to_json(payload, SITE_DATA / "synthesis.json")
    print("synthesis ✓")


if __name__ == "__main__":
    print("Building corpus KPIs...")
    run_synthesis()
    print("\nDone. synthesis.json written to website/frontend/public/data/")
