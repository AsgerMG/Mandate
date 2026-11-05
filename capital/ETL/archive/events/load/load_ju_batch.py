"""Sprint 18 Phase 1: load the remaining JU/programme families from the local
CORDIS dump at org-level.

Families: Clean Aviation, SNS (6G), SESAR 3, Europe's Rail, EUSPA, EDCTP3,
plus the prefix extensions of CHIPS_JU (mixed-case Chips-Act era) and
EUROHPC_JU (HORIZON-JU-EUROHPC) — probed counts in
plans/sprint_18_channel_coverage.md Phase 1.

Cross-tagging guard: a project carrying both a JU topic and a CL topic may
already be loaded under a Pillar II family (the JU_EXCLUDE list only grew in
Sprint 18). Any project whose project_number already exists in the DB under a
different source family is SKIPPED here — the earlier load stays canonical.

Idempotent: (source, call_id) dedup + the pid skip make re-runs no-ops.
Usage: python3 scripts/load_ju_batch.py
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

import sqlite3
import sys
from pathlib import Path

pass  # sys.path handled by etl_env bootstrap
import extract_cordis_pillar_ii as p2

DB_PATH = _ETL_DB

BATCH = ["CLEAN_AVIATION", "SNS_JU", "SESAR_JU", "EUROPES_RAIL", "EUSPA",
         "GH_EDCTP3", "CHIPS_JU", "EUROHPC_JU"]


def main() -> None:
    print(f"Loading CORDIS dataset from {p2.DATA_DIR} ...")
    projects = p2._load_csv(p2.DATA_DIR / "project.csv")
    orgs = p2._load_csv(p2.DATA_DIR / "organization.csv")
    topics = p2._load_csv(p2.DATA_DIR / "topics.csv")

    projects_by_id = {p["id"]: p for p in projects}
    orgs_by_pid: dict[str, list[dict]] = {}
    for o in orgs:
        orgs_by_pid.setdefault(o["projectID"], []).append(o)
    topics_by_pid: dict[str, list[str]] = {}
    for t in topics:
        topics_by_pid.setdefault(t["projectID"], []).append(t["topic"])

    con = sqlite3.connect(DB_PATH)
    existing_pids = {
        r[0] for r in con.execute(
            "SELECT DISTINCT project_number FROM public_funding_events "
            "WHERE project_number IS NOT NULL"
        )
    }
    con.close()

    grand = {"events": 0, "skipped_projects": 0}
    for cluster in BATCH:
        rows = p2.discover_cluster_rows(cluster, projects_by_id, orgs_by_pid,
                                        topics_by_pid, exclude_ihi=False)
        before = len(rows)
        skipped_pids = {r["project_number"] for r in rows
                        if r["project_number"] in existing_pids}
        rows = [r for r in rows if r["project_number"] not in existing_pids]
        if skipped_pids:
            print(f"  {cluster}: skipped {len(skipped_pids)} projects already "
                  f"in DB ({before - len(rows)} rows) — earlier load is canonical")
        if not rows:
            print(f"  {cluster}: nothing new")
            continue
        counts = p2._load_to_db(rows, cluster)
        print(f"  {cluster}: {counts}")
        grand["events"] += counts.get("inserted_events", 0)
        grand["skipped_projects"] += len(skipped_pids)
        # newly inserted pids are now existing for subsequent clusters
        existing_pids.update(r["project_number"] for r in rows)

    print(f"\nBatch done: {grand['events']} events inserted, "
          f"{grand['skipped_projects']} cross-tagged projects skipped.")
    print("Next: python3 ETL/events/transform/classify_taxonomy.py apply-nace && python3 ETL/events/transform/classify_taxonomy.py run")


if __name__ == "__main__":
    main()
