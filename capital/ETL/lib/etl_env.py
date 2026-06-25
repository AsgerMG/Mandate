"""Single source of truth for ETL paths + sys.path wiring.

Every ETL stage script (extract/transform/load) starts with a 2-line bootstrap:

    import sys; from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
    from etl_env import DB, ROOT

Importing this module has the side effect of putting ``extract/``, ``transform/``,
``load/`` and ``lib/`` on ``sys.path`` so the flat sibling imports used throughout the
pipeline (``from ndb_helpers import ...``, ``from extract_innovation_fund import ...``,
``from europe_scope import ...``) resolve no matter which stage directory the running
script lives in. It also exposes the canonical filesystem locations so no script has to
recompute ``db.sqlite`` by counting ``.parent`` hops.
"""
from __future__ import annotations

import sys
from pathlib import Path

# This file lives at <repo>/ETL/lib/etl_env.py
ETL = Path(__file__).resolve().parents[1]          # <repo>/ETL
ROOT = ETL.parent                                  # <repo> (repo root)

# Database + data locations.
DB = ROOT / "db.sqlite"
DATA = ROOT / "data"
DATA_RAW = DATA / "raw"
DATA_PROCESSED = DATA / "processed"

# Backup destinations (mirrors the historical Makefile `backup` target).
BACKUP_LOCAL = Path.home() / "EuroInvTracker-backups"
BACKUP_ICLOUD = (
    Path.home()
    / "Library"
    / "Mobile Documents"
    / "com~apple~CloudDocs"
    / "EuroInvTracker-backups"
)

# Put every stage directory on the import path so cross-stage flat imports work.
# `load/qa` is the one nested stage dir whose scripts import each other.
for _rel in ("extract", "transform", "load", "load/qa", "lib"):
    _p = str(ETL / _rel)
    if _p not in sys.path:
        sys.path.insert(0, _p)

# Backwards-compatible aliases for scripts that used these local names.
DB_PATH = DB
BASE_DIR = ROOT

__all__ = [
    "ROOT",
    "ETL",
    "DB",
    "DB_PATH",
    "BASE_DIR",
    "DATA",
    "DATA_RAW",
    "DATA_PROCESSED",
    "BACKUP_LOCAL",
    "BACKUP_ICLOUD",
]
