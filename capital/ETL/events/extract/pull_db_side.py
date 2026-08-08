"""Pull the ETL volume's db.sqlite to a SIDE file, never over the local one.

`pull_db.py` downloads with `--overwrite` straight onto `data/db.sqlite`. That
is correct when the volume is the corpus of record and the laptop is a cache.
It is catastrophic right now, because the two have diverged in OPPOSITE
directions:

    laptop  data/db.sqlite   1,086 instruments   297,933 KPI events
    volume  /db.sqlite         322 instruments   299,384 KPI events

The volume accumulates EVENTS from the weekly cron and never receives
instrument work. The laptop holds the instrument corpus -- this week's Spain,
France, EU and GB coverage -- and never receives the cron's events. Running
`make pull-db` today would replace 1,086 instruments with 322 and delete a
week of work with no warning and no undo.

So this fetches to a path you name, changes nothing, and leaves the merge as a
separate, reviewable step. Same wake/restore discipline as pull_db.py, because
a pull that leaves the service awake has traded one database for the entire
weekly refresh.

    python3 ETL/events/extract/pull_db_side.py /tmp/volume-db.sqlite
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

import subprocess  # noqa: E402

if __name__ == "__main__":
    if len(_sys.argv) < 2:
        _sys.exit(f"usage: pull_db_side.py <destination>   (never {DB})")
    dest = _Path(_sys.argv[1]).expanduser().resolve()
    if dest == _Path(DB).resolve():
        _sys.exit(f"refusing: {dest} is the local corpus. Use pull_db.py if you "
                  f"really mean to overwrite it -- but read this file's header first.")
    dest.parent.mkdir(parents=True, exist_ok=True)

    wake()
    try:
        rc = subprocess.run(
            ["npx", "--yes", "@railway/cli", "volume", "files",
             "--volume", "etl-pipeline-volume", "download", "/db.sqlite",
             str(dest), "--overwrite"]
        ).returncode
    finally:
        restore_problems = restore()
    if rc != 0:
        _sys.exit(f"pull failed (rc={rc})")
    if restore_problems:
        _sys.exit("pulled, but the cron schedule was NOT restored. Fix before "
                  "anything else: python3 ETL/lib/verify_cron.py --deploy")
    print(f"Pulled volume db.sqlite -> {dest}   (local corpus untouched)")
