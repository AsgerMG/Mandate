"""Free, read-only gap detector for the eligibility subsystem.

Flags event-corpus source families that have no corresponding row in
funding_instrument_sources -- i.e. a funding instrument the corpus tracks
but eligibility.py has never researched. No DB writes, no LLM calls; safe
to run on every automated cron pass so new gaps surface for review without
spending anything automatically (eligibility research/entailment work stays
an explicitly-triggered, cost-estimated step -- see project history).

Usage: python3 ETL/terms/detect_eligibility_gaps.py
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from store import connect  # noqa: E402
# --- end ETL path bootstrap ---

import re
from collections import Counter


def main() -> None:
    with connect(readonly=True) as con:
        rows = con.execute("""
            SELECT DISTINCT source FROM public_funding_events
            WHERE source NOT IN (SELECT source FROM funding_instrument_sources)
        """).fetchall()

    families: Counter = Counter()
    for (source,) in rows:
        fam = re.sub(r"_(19|20)\d{2}$", "", source)
        families[fam] += 1

    if not families:
        print("eligibility gap check: none -- every source family has a researched instrument.")
        return

    print(f"eligibility gap check: {len(rows)} raw source gaps "
          f"-> {len(families)} distinct instrument families need research:")
    for fam, n in sorted(families.items()):
        print(f"  {fam:<40} ({n} year-variant{'s' if n != 1 else ''})")


if __name__ == "__main__":
    main()
