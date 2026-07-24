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
        restore()
    if rc != 0:
        _sys.exit(f"pull failed (rc={rc})")
    print(f"Pulled fresh db.sqlite -> {DB}")
