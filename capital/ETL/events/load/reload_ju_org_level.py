"""Reload JU families (CHP, IHI, EuroHPC, Chips JU) at (project, organisation)
granularity, replacing the coordinator-only Option A rows from extract_cordis.py.

Same treatment as the Sprint 12 Pillar II load: per-participant `ecContribution`
amounts, `role` + `coordinator_only` preserved so lead-only analytics keep working.
Source stems and grant_amount_basis labels are unchanged.

Replacement strategy per family:
  - CHP / IHI / EuroHPC are fully CORDIS-derived: every legacy row is deleted,
    then the family is reloaded org-level.
  - Chips JU mixes chips-ju.europa.eu OData rows with CORDIS rows. Only projects
    present in the CORDIS dump are replaced (matched via the legacy acronym-slug
    call_id convention plus project_number); portal-only rows (e.g. kdt_2020)
    stay coordinator-only.

Idempotent: org-level call_ids are stable on (source, project, org), so re-runs
delete the same legacy set (already gone) and skip all inserts as duplicates.

Usage: python3 scripts/reload_ju_org_level.py
Reminder: run python3 ETL/events/transform/classify_taxonomy.py apply-nace && python3 ETL/events/transform/classify_taxonomy.py run afterwards.
"""


# --- ETL path bootstrap (auto-added; see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB as _ETL_DB, ROOT as _ETL_ROOT  # noqa: E402,F401
# --- end ETL path bootstrap ---

import re
import sqlite3
import sys
from pathlib import Path

pass  # sys.path handled by etl_env bootstrap
import extract_cordis_pillar_ii as p2

DB_PATH = _ETL_DB

FULL_REPLACE = {"CHP_JU": "chp_%", "IHI_JU": "ihi_%", "EUROHPC_JU": "eurohpc_%"}
CHIPS = "CHIPS_JU"


def _acronym_slug(acronym: str, pid: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (acronym or pid).lower()).strip("_")


def main() -> None:
    print(f"Loading CORDIS dataset from {p2.DATA_DIR} ...")
    projects = p2._load_csv(p2.DATA_DIR / "project.csv")
    orgs = p2._load_csv(p2.DATA_DIR / "organization.csv")
    topics = p2._load_csv(p2.DATA_DIR / "topics.csv")
    print(f"  projects: {len(projects)}, orgs: {len(orgs)}, topics: {len(topics)}")

    projects_by_id = {p["id"]: p for p in projects}
    orgs_by_pid: dict[str, list[dict]] = {}
    for o in orgs:
        orgs_by_pid.setdefault(o["projectID"], []).append(o)
    topics_by_pid: dict[str, list[str]] = {}
    for t in topics:
        topics_by_pid.setdefault(t["projectID"], []).append(t["topic"])

    for cluster, source_like in FULL_REPLACE.items():
        rows = p2.discover_cluster_rows(cluster, projects_by_id, orgs_by_pid,
                                        topics_by_pid, exclude_ihi=False)
        con = sqlite3.connect(DB_PATH)
        deleted = con.execute(
            "DELETE FROM public_funding_events WHERE source LIKE ?", (source_like,)
        ).rowcount
        con.commit()
        con.close()
        print(f"  {cluster}: deleted {deleted} legacy rows ({source_like})")
        counts = p2._load_to_db(rows, cluster)
        print(f"  {cluster}: match {counts}")

    # Chips JU: replace only CORDIS-covered projects.
    rows = p2.discover_cluster_rows(CHIPS, projects_by_id, orgs_by_pid,
                                    topics_by_pid, exclude_ihi=False)
    legacy_ids = set()
    cordis_projects: dict[str, set[str]] = {}  # pid -> new call_ids
    for r in rows:
        legacy_ids.add((r["source"],
                        f"{r['source']}_{_acronym_slug(r['project_acronym'], r['project_number'])}"))
        cordis_projects.setdefault(r["project_number"], set()).add(r["call_id"])

    con = sqlite3.connect(DB_PATH)
    deleted = 0
    for source, call_id in legacy_ids:
        deleted += con.execute(
            "DELETE FROM public_funding_events WHERE source=? AND call_id=?",
            (source, call_id),
        ).rowcount
    for pid, new_ids in cordis_projects.items():
        placeholders = ",".join("?" * len(new_ids))
        deleted += con.execute(
            f"""DELETE FROM public_funding_events
                WHERE source LIKE 'chips_ju_kdt_%' AND project_number=?
                  AND call_id NOT IN ({placeholders})""",
            (pid, *new_ids),
        ).rowcount
    remaining = con.execute(
        "SELECT COUNT(*) FROM public_funding_events WHERE source LIKE 'chips_ju_kdt_%'"
    ).fetchone()[0]
    con.commit()
    con.close()
    print(f"  {CHIPS}: deleted {deleted} legacy CORDIS-covered rows; "
          f"{remaining} portal-only rows kept coordinator-only")
    counts = p2._load_to_db(rows, CHIPS)
    print(f"  {CHIPS}: match {counts}")

    print("\nDone. Reminder: run python3 ETL/events/transform/classify_taxonomy.py apply-nace && python3 ETL/events/transform/classify_taxonomy.py run")


if __name__ == "__main__":
    main()
