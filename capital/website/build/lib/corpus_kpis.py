"""THE single canonical definition of every corpus-wide figure. Stdlib only.

── Why this is its own module ─────────────────────────────────────────────
These definitions used to live in synthesis.py, which is the right *place* but
the wrong *import*: synthesis.py opens with `from helpers import db, to_json,
fmt_eur`, and helpers.py imports pandas and numpy. Neither is in
requirements.txt, so anything running in the ETL's `python:3.11-slim` image that
asked for the canonical numbers got ModuleNotFoundError.

That is exactly what happened to the corpus census on its first real run inside
the container: `kpis: ModuleNotFoundError: No module named 'pandas'`. The census
records a failed block rather than crashing, so it would have kept publishing a
census with no KPIs in it, week after week, and the guard downstream would have
kept failing DEGRADED without anybody reading far enough to see why. A silent
dependency on a plotting library, in the one number a founder reads.

The alternative was adding pandas to the ETL image — a hundred megabytes for a
handful of COUNT(*) queries that use none of it. So the definitions moved here
instead, where they import nothing, and synthesis.py re-exports them. There is
still exactly one definition; it is now reachable from every runtime that has
the database.

Definitions are deliberate, not incidental:
  companies  — distinct legal entities AFTER the parent-group merge (dedup
               Layer 1); sisters sharing a parent_group collapse to one, else
               fall back to the row id. NOT a raw COUNT(*) (which double-counts
               un-merged sisters), NOT "companies with an event" (a subset).
  events     — non-duplicate rows only (is_duplicate = 0).
  capital    — grant + debt, EXCLUDING ipcei_linked tranches (already counted
               as ipcei_* ceilings, decision log D-17) and is_duplicate rows
               (ADEME also in SATR-FR, migration 009). Single-counted on purpose;
               a raw SUM(grant_amount_eur) over-states it by ~€13B.

2026-07-08 country-scope reduction: countries below €1B cumulative public
support are outside the corpus (soft-exclude — rows stay in the DB, the read
layer filters). The view v_country_public_support (data/views.sql) is the one
definition of the threshold; these fragments apply it to the raw-table KPIs
that don't go through v_events. NULL/blank-country companies keep counting
(they are a data-quality bucket, not an excluded country), so the guard is
"not in an explicitly out-of-corpus country" rather than "in corpus".
"""
from __future__ import annotations

_CO_IN_SCOPE = (
    " (country IS NULL OR country = '' OR country NOT IN"
    "  (SELECT country FROM v_country_public_support WHERE in_corpus = 0))"
)
_EV_IN_SCOPE = (
    " (company_id IS NULL OR company_id NOT IN"
    "  (SELECT id FROM companies WHERE country IN"
    "   (SELECT country FROM v_country_public_support WHERE in_corpus = 0)))"
)

CANONICAL_KPI_SQL = {
    "companies":
        "SELECT COUNT(DISTINCT COALESCE(parent_group, CAST(id AS TEXT))) FROM companies"
        " WHERE" + _CO_IN_SCOPE,
    "events":
        "SELECT COUNT(*) FROM public_funding_events WHERE is_duplicate = 0"
        " AND" + _EV_IN_SCOPE,
    "champions":
        "SELECT COUNT(*) FROM v_company_breadth WHERE n_source_families >= 2",
    "step_companies":
        "SELECT COUNT(*) FROM companies WHERE step_flagged = 1"
        " AND" + _CO_IN_SCOPE,
    "total_capital_eur_raw":
        "SELECT COALESCE(SUM(COALESCE(grant_amount_eur,0)+COALESCE(debt_amount_eur,0)),0)"
        " FROM public_funding_events WHERE ipcei_linked = 0 AND is_duplicate = 0"
        " AND" + _EV_IN_SCOPE,
    "countries":
        "SELECT COUNT(*) FROM v_country_public_support WHERE in_corpus = 1",
    "source_families":
        "SELECT COUNT(DISTINCT source_family) FROM v_events",
    "sectors":
        "SELECT COUNT(DISTINCT c.sector_top) FROM v_european_companies c"
        " JOIN v_events v ON v.company_id = c.id"
        " WHERE c.sector_top IS NOT NULL AND c.sector_top != ''",
}


def compute_kpis(con) -> dict:
    """Compute every canonical corpus-wide figure from `con`. The one definition;
    imported by the synthesis writer, the build guardrail and the corpus census.

    Do not recompute a corpus count anywhere else: the guardrail in
    build_site_data.py fails the build if a generated file disagrees with this.
    """
    out = {}
    for key, sql in CANONICAL_KPI_SQL.items():
        val = con.execute(sql).fetchone()[0]
        out[key] = float(val) if key == "total_capital_eur_raw" else int(val)
    return out
