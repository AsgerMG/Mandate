"""The graph core's MONTHLY refresh: re-fetch every market's official org charts (no model).

    python3 capital/ETL/terms/refresh_graph.py            # what the weekly runner calls (step `graph`)
    python3 capital/ETL/terms/refresh_graph.py --dry-run  # fetch and compare, write nothing
    python3 capital/ETL/terms/refresh_graph.py --force    # every market now, whatever its age

Called every week by mandate/refresh/run.py; a market is refreshed only when its newest org-chart fetch
is older than MAX_AGE_DAYS (so in practice monthly). Per market it runs load_graph_de.load(): every
chart in the knowledge map is re-fetched into grounding, a fetch row is recorded only when the chart's
TEXT changed, and any new map node is added. A CHANGED chart is then listed on the bench's Knowledge
page and in Needs you for re-extraction on the owner's subscription (people and units; no API credits).
Exit 0 when every due market ran, 3 when some failed (recorded, never fatal to the weekly run).
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

import psycopg  # noqa: E402

from load_graph_de import load  # noqa: E402

MARKETS = ("DE", "FR", "IT", "EU", "UK")
MAX_AGE_DAYS = 28


def due(db_url: str, force: bool) -> list[str]:
    if force:
        return list(MARKETS)
    with psycopg.connect(db_url, autocommit=True) as con:
        rows = dict(con.execute("""select i.market, max(o.fetched_at) from capital.org_charts o
                                   join capital.institutions i on i.key = o.institution_key group by 1""").fetchall())
    now = dt.datetime.now(dt.timezone.utc)
    return [m for m in MARKETS if rows.get(m) is None or (now - rows[m]).days >= MAX_AGE_DAYS]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    if not a.database_url:
        print("no DATABASE_URL", file=sys.stderr)
        return 1
    todo = due(a.database_url, a.force)
    if not todo:
        print(f"graph core: every market's org charts are younger than {MAX_AGE_DAYS} days; nothing to do")
        return 0
    failed = []
    for m in todo:
        try:
            counts, report = load(a.database_url, apply=not a.dry_run, market=m)
            fails = [r.strip() for r in report if "FETCH FAILED" in r]
            print(f"{m}: {counts.get('charts fetched')} charts; {counts.get('org_charts')}; {counts.get('institutions')}"
                  + (f"; {len(fails)} failed: " + " | ".join(f[:60] for f in fails[:5]) if fails else ""))
        except Exception as e:  # noqa: BLE001
            failed.append(m)
            print(f"{m}: FAILED {str(e)[:200]}", file=sys.stderr)
    print("DRY RUN: nothing written." if a.dry_run else "done.")
    return 3 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
