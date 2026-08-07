"""Pull the latest db.sqlite from the Railway ETL volume, waking the
cron-idle service first (SFTP needs a running container) and restoring the
real cron schedule afterwards. See ETL/lib/railway_service.py.

Usage: python3 ETL/events/extract/pull_db.py   (or `make pull-db`)
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB  # noqa: E402
from railway_service import wake, restore  # noqa: E402
# --- end ETL path bootstrap ---

import subprocess

if __name__ == "__main__":
    wake()
    try:
        rc = subprocess.run(
            ["npx", "--yes", "@railway/cli", "volume", "files",
             "--volume", "etl-pipeline-volume", "download", "/db.sqlite",
             str(DB), "--overwrite"]
        ).returncode
    finally:
        # Waking the service replaces the cron schedule with `sleep infinity`.
        # A pull that succeeds and leaves the service woken has traded one
        # db.sqlite for the entire weekly refresh, silently — so the restore is
        # confirmed from Railway and its failure is fatal here even though the
        # download worked.
        restore_problems = restore()
    if rc != 0:
        _sys.exit(f"pull failed (rc={rc})")
    if restore_problems:
        _sys.exit("db.sqlite pulled, but the cron schedule was NOT restored. "
                  "Fix before anything else: python3 ETL/lib/verify_cron.py --deploy")
    print(f"Pulled fresh db.sqlite -> {DB}")
