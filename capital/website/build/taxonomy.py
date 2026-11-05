"""Emit the live sector taxonomy as JSON for the frontend.

Reads whichever sectors/sub-sectors actually exist in companies.sector_top /
subsector, so the site's labels, ordering, dropdown options and colours stay in
sync with the classification automatically — rebuild after a reclassification and
the whole site follows. No taxonomy is hardcoded in the frontend.

  web/public/data/taxonomy.json
    {"generatedAt": ...,
     "sectors": [{"id","label","count"}, ...],            # Tier-1, by count desc
     "subsectors": {sector_top: [{"id","label","count"}, ...]}}  # Tier-2 within
"""
from __future__ import annotations

import os
import json
from datetime import date
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from web_env import ROOT, SITE_DATA  # noqa: E402
from sector_labels import label  # noqa: E402
from store import connect  # noqa: E402

OUT = SITE_DATA / "taxonomy.json"


def main() -> None:
    # Ties in a count break on the slug, stated, so a dropdown's order cannot
    # depend on the plan. DESCENDING byte order because that is what the SQLite
    # store emitted (its sorter returned equal keys in reverse input order), so
    # the move to Postgres changed no byte of this file; there is one such tie
    # today (three software_data_ai sub-sectors of one company each).
    with connect(readonly=True) as con:
        sectors = [
            {"id": s, "label": label(s), "count": n}
            for s, n in con.execute(
                "SELECT sector_top, COUNT(*) FROM companies "
                "WHERE sector_top IS NOT NULL AND sector_top != '' "
                'GROUP BY sector_top ORDER BY COUNT(*) DESC, sector_top COLLATE "C" DESC')
        ]
        subs: dict[str, list[dict]] = {}
        for s, sub, n in con.execute(
                "SELECT sector_top, subsector, COUNT(*) FROM companies "
                "WHERE sector_top IS NOT NULL AND subsector IS NOT NULL "
                "AND subsector != '' GROUP BY sector_top, subsector "
                'ORDER BY sector_top COLLATE "C", COUNT(*) DESC, subsector COLLATE "C" DESC'):
            subs.setdefault(s, []).append({"id": sub, "label": label(sub), "count": n})

    OUT.write_text(json.dumps(
        {"generatedAt": date.today().isoformat(), "sectors": sectors,
         "subsectors": subs}, ensure_ascii=False, separators=(",", ":")))
    print(f"wrote {Path(os.path.relpath(OUT, ROOT))}: {len(sectors)} sectors, "
          f"{sum(len(v) for v in subs.values())} sub-sectors")


if __name__ == "__main__":
    main()
