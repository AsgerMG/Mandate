"""WHICH STORE OWNS WHAT. The one definition, stdlib only, read by both languages.

── The answer, since 2026-11-05 ───────────────────────────────────────────
ONE store: schema `capital` of the Mandate Postgres. There is nothing else to
rank it against. Every table of the corpus -- the events half and the
instruments half -- was loaded there and verified row for row
(ETL/schema/consolidate/load_into_postgres.py), every reader and writer reaches
it through ETL/lib/store.py, and the two SQLite files that used to compete for
the title are archived, read-only, under ~/Mandate-backups/2026-11-05/.

── What this file used to say, and why it is kept as a file ───────────────
Until the move the corpus lived in three places -- db.sqlite on the Railway
volume, a copy on a workstation, and Postgres holding the instrument subset --
and this file existed to name ONE of them of record (the volume, by the test
"which store, if lost, could not be rebuilt?") and to make the census, the
vault and the reconcilers measure the others against it. That question cannot
arise with one store, but its consumers still ask it: the census labels each
reading with the store it read (`store_id`), check_corpus_census.ts compares
the newest reading of the store of record against the site, and the event and
instrument families below are how those comparisons are grouped. So the map
stays, and gives the one answer.

A census row labelled `railway-volume` or `local` is a reading of a store that
no longer exists. It is history, not a competitor: check_corpus_census.ts reads
the newest row whose store is OF_RECORD.

Usage:
  python3 website/build/lib/corpus_stores.py --json   the map, for the TS guard
"""
from __future__ import annotations

import json

OF_RECORD = "postgres"

STORES = {
    "postgres": "schema capital of the Mandate Postgres — the corpus, and the only copy",
}

# Table families. The census measures each separately because, while there were
# several stores, the two halves drifted in opposite directions and an aggregate
# row count hid that completely. Still the grouping the census reports in.
FAMILIES = {
    "events": [
        "companies", "public_funding_events", "public_equity_stakes",
        "private_funding_events", "satr_staging", "company_sector_labels",
        "company_sector_llm", "classify_audit",
    ],
    "instruments": [
        "funding_instruments", "funding_instrument_sources",
        "eligibility_gates", "eligibility_clauses", "instrument_application",
    ],
}

# Which census KPI/instrument keys measure which family. Used by the guard so a
# new figure is compared under the family it belongs to rather than silently
# uncompared.
FAMILY_MEASURES = {
    "events": ["companies", "events", "total_capital_eur_raw"],
    "instruments": ["total", "gates"],
}


def store_id() -> str:
    """WHICH STORE this process is reading. With one store there is one answer,
    wherever the process runs: a laptop and the Railway cron both read the same
    schema through ETL/lib/store.py."""
    return OF_RECORD


def as_dict() -> dict:
    return {
        "ofRecord": OF_RECORD,
        "stores": STORES,
        "families": FAMILIES,
        "familyMeasures": FAMILY_MEASURES,
    }


if __name__ == "__main__":
    print(json.dumps(as_dict(), indent=1))
