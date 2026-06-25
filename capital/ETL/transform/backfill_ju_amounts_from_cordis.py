"""Backfill NULL JU amounts (Chips JU KDT-2023, IHI, SESAR) from the local
CORDIS organization.csv.

The Sprint 18 JU loads left grant_amount_eur NULL on recently-signed projects
because the portals had not yet published per-organisation contributions.
CORDIS has since caught up: data/raw/cordis/organization.csv now carries
ecContribution for those projectIDs. This script fills ONLY rows that are
still NULL, matching (projectID, organisation name) — exact upper-cased name
match against the row's company raw_name/canonical_name, nothing fuzzy.

Amount semantics are unchanged (actual per-organisation EU grant), so the
existing grant_amount_basis values stay as they are. Zero contributions are
written as 0 (known zero: associated partners / unfunded roles), per the
amount-completeness doctrine in docs/methodology.md.
"""
from __future__ import annotations


# --- ETL path bootstrap (auto-added; see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB as _ETL_DB, ROOT as _ETL_ROOT  # noqa: E402,F401
# --- end ETL path bootstrap ---

import csv
import sqlite3
from collections import defaultdict
from pathlib import Path

ROOT = _ETL_ROOT
DB = _ETL_DB
ORG_CSV = ROOT / "data" / "raw" / "cordis" / "organization.csv"

SOURCES_SQL = ("source = 'chips_ju_kdt_2023' OR source LIKE 'ihi_%' "
               "OR source LIKE 'sesar_ju_%'")


def main():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    rows = con.execute(f"""
        SELECT e.id, e.source, e.project_number,
               UPPER(COALESCE(c.raw_name, c.canonical_name)) AS uname,
               UPPER(c.canonical_name) AS cname
        FROM public_funding_events e JOIN companies c ON c.id = e.company_id
        WHERE ({SOURCES_SQL}) AND e.grant_amount_eur IS NULL
          AND e.project_number IS NOT NULL
    """).fetchall()
    wanted = {r["project_number"] for r in rows}
    print(f"NULL JU rows: {len(rows)} across {len(wanted)} projects")

    # (projectID, UPPER(name)) -> ecContribution ('' = no EU contribution column value)
    lookup: dict[tuple[str, str], str] = {}
    project_has_amounts: dict[str, bool] = defaultdict(bool)
    with ORG_CSV.open(encoding="utf-8") as f:
        for r in csv.DictReader(f, delimiter=";"):
            pid = r.get("projectID")
            if pid in wanted:
                val = (r.get("ecContribution") or "").strip()
                lookup[(pid, (r.get("name") or "").upper().strip())] = val
                if val:
                    project_has_amounts[pid] = True

    filled = name_misses = zero = unpublished = 0
    for r in rows:
        pid = r["project_number"]
        key = (pid, r["uname"]) if (pid, r["uname"]) in lookup else (pid, r["cname"])
        hit = lookup.get(key)
        if hit is None:
            name_misses += 1
            continue
        if hit == "":
            # Empty contribution in a project where others have amounts =
            # unfunded partner (typically Swiss/UK associated participants
            # funded nationally): EU grant is a known zero. If the whole
            # project is empty, amounts are not yet published: keep NULL.
            if project_has_amounts[pid]:
                con.execute("UPDATE public_funding_events SET grant_amount_eur = 0 "
                            "WHERE id = ? AND grant_amount_eur IS NULL", (r["id"],))
                filled += 1
                zero += 1
            else:
                unpublished += 1
            continue
        val = float(hit)
        con.execute("UPDATE public_funding_events SET grant_amount_eur = ? "
                    "WHERE id = ? AND grant_amount_eur IS NULL", (val, r["id"]))
        filled += 1
        if val == 0:
            zero += 1
    con.commit()

    still = con.execute(f"SELECT COUNT(*) FROM public_funding_events "
                        f"WHERE ({SOURCES_SQL}) AND grant_amount_eur IS NULL").fetchone()[0]
    print(f"filled: {filled} (of which known-zero: {zero})  "
          f"name misses: {name_misses}  unpublished projects kept NULL: {unpublished}  still NULL: {still}")


if __name__ == "__main__":
    main()
