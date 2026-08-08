"""WHICH STORE OWNS WHAT. The one definition, stdlib only, read by both languages.

── The problem this names ─────────────────────────────────────────────────
The corpus lives in three places and, until this file existed, none of them was
authoritative:

  railway-volume   db.sqlite on the Railway ETL volume. The weekly cron's only
                   write target: 43 extractors, classify, sanity, open-call
                   refresh. Every event in the corpus is created here.
  local            data/db.sqlite on a workstation. Where the instrument corpus
                   is authored — sync_gates_from_yaml, encode_gates,
                   encode_regions, the audit, the coverage gate.
  postgres         the Railway Postgres the product reads. Receives the
                   instrument subset via ETL/terms/migrate_to_postgres.py.

On 2026-08-07 they had diverged in OPPOSITE directions and nothing reconciled
them. Worse, they could not be reconciled: the only channels between the two
SQLite stores are `pull_db.py` and `push_local.py`, and both move the entire
645 MB file with `--overwrite`. Whichever direction you run, the other store's
work is destroyed. Divergence was not a lapse of discipline; it was guaranteed.

── The decision ───────────────────────────────────────────────────────────
ONE store is of record: railway-volume. The test that decides it is not "who
runs the pipeline" or "who the product reads", it is:

    which store, if lost, could not be rebuilt?

  local lost      → rebuild from the volume (events) and Postgres (instruments).
  postgres lost   → rebuild by re-running `make eligibility`. Fully.
  volume lost     → the events cannot be rebuilt. 43 extractors read registers
                    that republish a current file and keep no history; a
                    withdrawn award is gone. Irrecoverable.

So the volume is of record for events, unambiguously. And it must be of record
for instruments too, because the alternative is the state found on 2026-08-07:
the only complete instrument corpus was a gitignored file on a laptop, and this
repo's own documented commands (`make pull-db`, `make republish`) overwrite it.
Postgres cannot take that role — it is a lossy projection, by design:
funding_instrument_sources publishes 2 of its columns and the gate/clause
surrogate ids are re-issued on every truncate-and-reload. A store that cannot
reproduce what it received is a publication, not a record.

  railway-volume  OF RECORD. Holds every table, every column. Backed by a
                  persistent volume rather than by one laptop's disk.
  postgres        DERIVED — a published projection of the instrument subset.
                  Rebuilt from the record by `make eligibility`.
  local           DERIVED — a working copy. Authoring happens here, but work
                  does not COUNT until it has been promoted to the record.

── What the rule is, and how it is tested ─────────────────────────────────
Not "the stores must be equal": the record legitimately runs ahead of every
derived store between a Sunday cron and the next pull. The property is
directional, and it is the one that has teeth:

    NO DERIVED STORE MAY HOLD A ROW THE RECORD LACKS.

A derived store that is behind is stale, which is ordinary and fixable. A
derived store that is AHEAD holds the only copy of something — real awards, or
an evening of gate encoding — and the next sync in either direction destroys
it. That is the condition that must fail a check, and it is measured per table
family rather than in aggregate, because the two halves drift oppositely.

Usage:
  python3 website/build/lib/corpus_stores.py --json   the map, for the TS guard
"""
from __future__ import annotations

import json
import os

OF_RECORD = "railway-volume"

STORES = {
    "railway-volume": "db.sqlite on the Railway ETL volume — the corpus of record",
    "local": "data/db.sqlite on a workstation — a working copy",
    "postgres": "the Railway Postgres the product reads — a published projection",
}

# Table families, because the two halves of the corpus drift in opposite
# directions and an aggregate row count hides that completely.
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
    """WHICH STORE this process is reading — the file, not the runner.

    Derived from the environment rather than passed as a label, because a label
    is a thing a human gets wrong: the census rows taken on 2026-08-07 carried
    `local`, `image-equivalent` and `proof-local` for three runs against the
    SAME laptop file, and the downstream guard's test for a scheduled run was
    `produced_by !== "local"`, so two laptop censuses were read as the ETL's.

    Railway sets RAILWAY_* in the container and mounts the volume the DB sits
    on, so a run inside it is reading the volume whatever it calls itself; a run
    anywhere else is reading a workstation copy however it was launched.
    """
    if os.environ.get("RAILWAY_SERVICE_NAME") or os.environ.get("RAILWAY_ENVIRONMENT"):
        return "railway-volume"
    return "local"


def as_dict() -> dict:
    return {
        "ofRecord": OF_RECORD,
        "stores": STORES,
        "families": FAMILIES,
        "familyMeasures": FAMILY_MEASURES,
    }


if __name__ == "__main__":
    print(json.dumps(as_dict(), indent=1))
