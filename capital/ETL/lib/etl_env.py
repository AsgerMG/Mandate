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

# python-dotenv is a convenience for local development, not a requirement for
# importing this module. CI installs no Python dependencies and needs none: the
# schema-drift and syntax checks read committed files only, and there is no
# .env.local to load there in the first place.
#
# Hard-importing it made every check that touches ETL/lib fail on the runner
# with ModuleNotFoundError while passing on any machine that happened to have
# the package. Mirrors the pattern the TypeScript checks already use for the
# same file ("CI has no .env.local and must not need one").
try:
    from dotenv import load_dotenv
except ModuleNotFoundError:  # pragma: no cover - exercised only where deps are absent
    def load_dotenv(_path=None, **_kwargs):  # type: ignore[misc]
        """No-op stand-in. Real secrets come from the environment in CI."""
        return False

# This file lives at <repo>/ETL/lib/etl_env.py
ETL = Path(__file__).resolve().parents[1]          # <repo>/ETL
ROOT = ETL.parent                                  # <repo> (repo root)

# Load .env.local as an import-time side effect so every script that already
# does `from etl_env import DB, ROOT` gets ANTHROPIC_API_KEY/OPENAI_API_KEY/
# DATABASE_URL/etc. for free, instead of each script hand-rolling its own
# .env.local parser (the pattern this replaced, formerly copy-pasted across
# ~10 scripts). Doesn't override already-set env vars (e.g. from the shell).
load_dotenv(ROOT / ".env.local")

# Database + data locations. The DB lives inside data/ alongside its backups.
DATA = ROOT / "data"
DB = DATA / "db.sqlite"
DATA_RAW = DATA / "raw"
DATA_PROCESSED = DATA / "processed"

# News/signals layer: qualitative, forward-looking corpus (articles, entity
# links, signals, embeddings) lives in its OWN file so its rebuild cadence
# never touches the events DB the site build depends on. Joined at query time
# via ATTACH DATABASE (see ETL/load/load_signals.py).
SIGNALS_DB = DATA / "signals.sqlite"

# Backup destinations (mirrors the historical Makefile `backup` target).
BACKUP_LOCAL = Path.home() / "Wincent-backups"
BACKUP_ICLOUD = (
    Path.home()
    / "Library"
    / "Mobile Documents"
    / "com~apple~CloudDocs"
    / "Wincent-backups"
)

# Put every stage directory of BOTH tracks on the import path so cross-stage
# flat imports work. Track 1 `events/` = investment events (grants, tax
# credits, equity stakes → db.sqlite). Track 2 `intelligence/` = public
# capital intelligence (news/signals → signals.sqlite). `events/load/qa` is
# the one nested stage dir whose scripts import each other.
for _rel in (
    "events/extract", "events/transform", "events/load", "events/load/qa",
    "intelligence/extract", "intelligence/transform", "intelligence/load",
    "terms",
    "lib",
):
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
    "SIGNALS_DB",
    "BACKUP_LOCAL",
    "BACKUP_ICLOUD",
]
