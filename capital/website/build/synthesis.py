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
# It lives in lib/corpus_kpis.py and is re-exported here, because this module
# cannot be imported without pandas (helpers.py, above) and the ETL image has
# no pandas. The corpus census runs in that image and needs these numbers; a
# second copy of the SQL would have been the third place this repo learned that
# "keep in sync" is not a mechanism. See lib/corpus_kpis.py for the definitions
# and why each is what it is.
from corpus_kpis import CANONICAL_KPI_SQL, compute_kpis  # noqa: E402,F401

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
