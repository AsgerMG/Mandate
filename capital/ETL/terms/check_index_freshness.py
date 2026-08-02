"""Fail if anything the advisor may SHOW is not something it can FIND.

The two vector indexes are built by paid steps that only process what is
missing, so they drift silently: a corpus change adds gates and instruments, the
next refresh embeds nothing unless someone runs the paid steps, and the advisor
ends up able to state facts it cannot retrieve. After one session's corpus work
that was 141 gates and 26 instrument profiles.

The invariant is simple and worth stating as a rule rather than a habit:

    retrievable == showable

Anything at an attributable evidence tier (see
website/frontend/lib/intelligence/evidenceTiers.json, the one definition both
languages read) must have an embedding, and every publishable instrument must
have a profile.

Exits non-zero with the counts. Skips cleanly without DATABASE_URL so CI stays
green; it guards the publish, not the build.

Usage: python3 ETL/terms/check_index_freshness.py
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import ROOT  # noqa: E402

import json  # noqa: E402
import os  # noqa: E402

TIERS = (ROOT / "website" / "frontend" / "lib" / "intelligence" / "evidenceTiers.json")


def main() -> None:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("check_index_freshness: skipped — no DATABASE_URL")
        return
    import psycopg
    tiers = json.loads(TIERS.read_text())["attributable"]["tiers"]
    pg = psycopg.connect(url)
    gates = pg.execute(
        """SELECT COUNT(*) FROM eligibility_gates g
           WHERE g.verification_level = ANY(%s)
             AND NOT EXISTS (SELECT 1 FROM eligibility_embeddings e
                             WHERE e.source_type = 'gate'
                               AND e.instrument_id = g.instrument_id
                               AND e.source_key = g.gate_key)""",
        (list(tiers),)).fetchone()[0]
    profiles = pg.execute(
        """SELECT COUNT(*) FROM funding_instruments i
           WHERE NOT EXISTS (SELECT 1 FROM instrument_profiles p
                             WHERE p.instrument_id = i.id)""").fetchone()[0]
    pg.close()

    if gates or profiles:
        _sys.exit(
            f"INDEX STALE: {gates} attributable gate(s) unembedded, "
            f"{profiles} instrument(s) without a profile.\n"
            f"The advisor can state these and cannot retrieve them.\n"
            f"Fix: python3 ETL/terms/embed_eligibility.py run"
            f" && python3 ETL/terms/build_instrument_profiles.py run")
    print("check_index_freshness: ok — everything showable is retrievable")


if __name__ == "__main__":
    main()
