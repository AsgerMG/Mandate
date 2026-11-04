"""Emit the live sector taxonomy as JSON for the frontend.

Reads whichever sectors/sub-sectors actually exist in companies.sector_top /
subsector, so the site's labels, ordering, dropdown options and colours stay in
sync with the classification automatically — rebuild after a reclassification and
the whole site follows. No taxonomy is hardcoded in the frontend.

  website/frontend/public/data/taxonomy.json
    {"generatedAt": ...,
     "sectors": [{"id","label","count"}, ...],            # Tier-1, by count desc
     "subsectors": {sector_top: [{"id","label","count"}, ...]}}  # Tier-2 within
"""
from __future__ import annotations

import json
import sqlite3
from datetime import date
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from web_env import ROOT, DB, SITE_DATA  # noqa: E402
from sector_labels import label  # noqa: E402

OUT = SITE_DATA / "taxonomy.json"


def main() -> None:
    con = sqlite3.connect(DB)
    sectors = [
        {"id": s, "label": label(s), "count": n}
        for s, n in con.execute(
            "SELECT sector_top, COUNT(*) FROM companies "
            "WHERE sector_top IS NOT NULL AND sector_top != '' "
            "GROUP BY sector_top ORDER BY COUNT(*) DESC")
    ]
    subs: dict[str, list[dict]] = {}
    for s, sub, n in con.execute(
            "SELECT sector_top, subsector, COUNT(*) FROM companies "
            "WHERE sector_top IS NOT NULL AND subsector IS NOT NULL "
            "AND subsector != '' GROUP BY sector_top, subsector "
            "ORDER BY sector_top, COUNT(*) DESC"):
        subs.setdefault(s, []).append({"id": sub, "label": label(sub), "count": n})
    con.close()

    OUT.write_text(json.dumps(
        {"generatedAt": date.today().isoformat(), "sectors": sectors,
         "subsectors": subs}, ensure_ascii=False, separators=(",", ":")))
    print(f"wrote {OUT.relative_to(ROOT)}: {len(sectors)} sectors, "
          f"{sum(len(v) for v in subs.values())} sub-sectors")


if __name__ == "__main__":
    main()
