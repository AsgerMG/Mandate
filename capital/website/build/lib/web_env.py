"""Single source of truth for the website publish layer's paths.

Every builder under ``website/build/`` starts with a 2-line bootstrap:

    import sys; from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
    from web_env import ROOT, SITE_DATA   # + DATA / DATA_PROCESSED as needed
    from store import connect              # the corpus: schema capital in Postgres

This mirrors ``ETL/lib/etl_env.py``: importing it exposes the canonical filesystem
locations so no builder recomputes the site data dir by counting ``.parent``
hops, and it puts ``website/build/``, ``website/build/lib`` and ``ETL/lib`` on
``sys.path`` so flat imports (``from helpers import fmt_eur``, ``from store
import connect``) resolve no matter where the running script sits.

There is no database path here. The corpus is schema `capital` of the Mandate
Postgres and a builder reaches it only through ``store.connect(readonly=True)``
(ETL/lib/store.py), which reads CAPITAL_RO_DATABASE_URL when it is set.
"""
from __future__ import annotations

import sys
from pathlib import Path

# This file lives at <repo>/website/build/lib/web_env.py
BUILD = Path(__file__).resolve().parents[1]        # <repo>/website/build
WEBSITE = BUILD.parent                             # <repo>/website
ROOT = WEBSITE.parent                              # <repo> (repo root)

# Committed inputs and local caches (no database: see the docstring).
DATA = ROOT / "data"
DATA_PROCESSED = DATA / "processed"
REFERENCE = ROOT / "reference"

# Put the build dir + lib on the import path so `from helpers import ...` and
# `from investor_insights import ...` resolve from any builder.
for _p in (str(BUILD), str(BUILD / "lib"), str(ROOT / "ETL" / "lib")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

# Where every generated *.json lands — read by the Next.js app at build time.
# The app is <monorepo>/web (was web); the path is defined once,
# in ETL/lib/web_path.py, and re-exported here under its old name.
from web_path import WEB as FRONTEND  # noqa: E402
SITE_DATA = FRONTEND / "public" / "data"

__all__ = [
    "ROOT",
    "WEBSITE",
    "BUILD",
    "FRONTEND",
    "DATA",
    "DATA_PROCESSED",
    "REFERENCE",
    "SITE_DATA",
]
