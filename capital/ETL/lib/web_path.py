"""Where the Mandate web app lives: the ONE definition, for every Python script.

The site that serves the capital brain (and, since 2026-11-06, every brain)
is the Next.js app at ``<monorepo>/web``. Until then it was
``capital/website/frontend``, and some sixty scripts each spelled that path
out as ``ROOT / "website" / "frontend"``. A path spelled sixty times is
sixty places to miss on the next move, so it is spelled here once and
imported everywhere: ``etl_env.WEB`` and ``web_env.FRONTEND`` both re-export
it.

Side-effect free on purpose (no dotenv, no sys.path edits), so a CI check
that must not import etl_env can still import this.

Note the web app is OUTSIDE ``capital/``: the capital ETL image (build context
``capital/``) does not contain it, and nothing the weekly cron runs may read it.
"""
from __future__ import annotations

from pathlib import Path

#: <monorepo>/capital
CAPITAL = Path(__file__).resolve().parents[2]
#: <monorepo>/web -- the one Mandate web app (was capital/website/frontend)
WEB = CAPITAL.parent / "web"
