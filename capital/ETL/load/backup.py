"""Back up the corpus after a load — local + iCloud.

The canonical post-load step: snapshot ``db.sqlite`` and the raw/processed data
trees to ``~/EuroInvTracker-backups`` and mirror them into iCloud Drive so the
database is never the single point of failure. Replaces the old Makefile
``backup`` recipe (now a thin wrapper around this script).

Usage:
  python3 ETL/load/backup.py            # gzip db + tar data/, copy to local + iCloud
  python3 ETL/load/backup.py --dry-run  # print what would happen, touch nothing
  python3 ETL/load/backup.py --no-icloud
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, DATA_RAW, DATA_PROCESSED, BACKUP_LOCAL, BACKUP_ICLOUD  # noqa: E402
# --- end ETL path bootstrap ---

import argparse
import gzip
import shutil
import tarfile
from datetime import date


def _human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f}{unit}" if unit == "B" else f"{n:.1f}{unit}"
        n /= 1024
    return f"{n:.1f}GB"


def main() -> None:
    ap = argparse.ArgumentParser(description="Back up db.sqlite + data/ to local + iCloud.")
    ap.add_argument("--dry-run", action="store_true", help="print planned actions, change nothing")
    ap.add_argument("--no-icloud", action="store_true", help="skip the iCloud mirror")
    args = ap.parse_args()

    stamp = date.today().strftime("%Y%m%d")
    db_gz = BACKUP_LOCAL / f"db.sqlite.{stamp}.gz"
    raw_tar = BACKUP_LOCAL / f"data-raw.{stamp}.tar.gz"
    proc_tar = BACKUP_LOCAL / f"data-processed.{stamp}.tar.gz"
    artifacts = [db_gz, raw_tar, proc_tar]

    print(f"Backup {stamp}")
    print(f"  source db : {DB} ({_human(DB.stat().st_size) if DB.exists() else 'MISSING'})")
    print(f"  local dir : {BACKUP_LOCAL}")
    print(f"  iCloud dir: {'(skipped)' if args.no_icloud else BACKUP_ICLOUD}")
    for a in artifacts:
        print(f"  -> {a.name}")

    if args.dry_run:
        print("\n[dry-run] nothing written.")
        return

    if not DB.exists():
        raise SystemExit(f"db.sqlite not found at {DB}")

    BACKUP_LOCAL.mkdir(parents=True, exist_ok=True)

    # gzip the database.
    with open(DB, "rb") as src, gzip.open(db_gz, "wb", compresslevel=6) as dst:
        shutil.copyfileobj(src, dst, length=1024 * 1024)

    # tar.gz the data trees (skip gracefully if a tree is absent).
    for tree, out in ((DATA_RAW, raw_tar), (DATA_PROCESSED, proc_tar)):
        if not tree.exists():
            print(f"  warn: {tree} missing — skipping {out.name}")
            continue
        with tarfile.open(out, "w:gz") as tar:
            tar.add(tree, arcname=tree.name)

    if not args.no_icloud:
        BACKUP_ICLOUD.mkdir(parents=True, exist_ok=True)
        for a in artifacts:
            if a.exists():
                shutil.copy2(a, BACKUP_ICLOUD / a.name)

    print(f"\nDone. Backed up to {BACKUP_LOCAL}"
          + ("" if args.no_icloud else f" and {BACKUP_ICLOUD}"))


if __name__ == "__main__":
    main()
