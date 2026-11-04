"""Single source of truth for the website publish layer's paths.

Every builder under ``website/build/`` starts with a 2-line bootstrap:

    import sys; from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
    from web_env import ROOT, DB, SITE_DATA   # + VIEWS_SQL / DATA_PROCESSED as needed

This mirrors ``ETL/lib/etl_env.py``: importing it exposes the canonical filesystem
locations so no builder recomputes ``db.sqlite`` or the site data dir by counting
``.parent`` hops, and it puts ``website/build/`` + ``website/build/lib`` on
``sys.path`` so flat sibling imports (``from helpers import df``) resolve no matter
where the running script sits.
"""
from __future__ import annotations

import sys
from pathlib import Path

# This file lives at <repo>/website/build/lib/web_env.py
BUILD = Path(__file__).resolve().parents[1]        # <repo>/website/build
WEBSITE = BUILD.parent                             # <repo>/website
ROOT = WEBSITE.parent                              # <repo> (repo root)

# Database + data locations. The DB lives inside data/ alongside its backups.
DATA = ROOT / "data"
DB = DATA / "db.sqlite"
DATA_PROCESSED = DATA / "processed"

# SQL views the builders read (v_events …). Read-side SQL lives in data/,
# alongside the DB it queries (shared with ETL migrations and `make views`).
VIEWS_SQL = DATA / "views.sql"

# Where every generated *.json lands — read by the Next.js app at build time.
FRONTEND = WEBSITE / "frontend"
SITE_DATA = FRONTEND / "public" / "data"

# Put the build dir + lib on the import path so `from helpers import ...` and
# `from investor_insights import ...` resolve from any builder.
for _p in (str(BUILD), str(BUILD / "lib")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

# Backwards-compatible aliases for builders that used these local names.
DB_PATH = DB
BASE_DIR = ROOT

__all__ = [
    "ROOT",
    "WEBSITE",
    "BUILD",
    "FRONTEND",
    "DB",
    "DB_PATH",
    "BASE_DIR",
    "DATA",
    "DATA_PROCESSED",
    "SITE_DATA",
    "VIEWS_SQL",
]
