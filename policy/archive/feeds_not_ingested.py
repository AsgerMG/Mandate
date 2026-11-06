"""Feed channels that are no longer ingested (archived 2026-11-06, E2).

Moved verbatim out of `etl/adapters/feeds.py` FEED_SPECS. All four were already
excluded from brief generation by `etl/intelligence/briefing.py`
`_PRESS_EXCLUDED_SOURCES`, so the weekly refresh collected them for nothing:

- gnews_eu_tech, gnews_de_tech, gnews_fr_tech: Google News keyword sweeps, a
  workaround for bot-blocked outlets, excluded 2026-07-23 because their
  near-identical explainers swept every press slot (curated Politico and EC
  newsletters now cover that ground).
- techcrunch_eu: its feed's lastBuildDate froze at 17 Feb 2026 (server-side);
  excluded 2026-07-21.

The documents already ingested from them stay in the policy database, and stay
out of briefs. To re-enable one, move its FeedSpec back into FEED_SPECS and its
key out of `ARCHIVED_FEED_KEYS` in feeds.py.

Not importable as-is on purpose: it is a record, not a module the refresh sees.
"""
# ruff: noqa
from etl.adapters.feeds import FeedSpec  # noqa: F401
from data.models import Jurisdiction  # noqa: F401  (as feeds.py imports it)

ARCHIVED_FEED_SPECS = [
    FeedSpec(
        key="gnews_eu_tech",
        name="News monitor — EU tech regulation (Google News)",
        url=(
            "https://news.google.com/rss/search?q=%22AI+Act%22+OR+%22Digital+Services+Act%22"
            "+OR+%22Digital+Markets+Act%22+OR+%22Data+Act%22+EU+regulation&hl=en&gl=BE&ceid=BE:en"
        ),
        jurisdiction=Jurisdiction.EU,
        deep_fetch=False,
    ),
    FeedSpec(
        key="techcrunch_eu",
        name="TechCrunch — European Union tag",
        url="https://techcrunch.com/tag/european-union/feed/",
        jurisdiction=Jurisdiction.EU,
    ),
    FeedSpec(
        key="gnews_fr_tech",
        name="News monitor — régulation numérique France (Google News)",
        url=(
            "https://news.google.com/rss/search?q=r%C3%A9gulation+num%C3%A9rique+France+loi"
            "&hl=fr&gl=FR&ceid=FR:fr"
        ),
        jurisdiction=Jurisdiction.FR,
        language="fr",
        deep_fetch=False,
    ),
    FeedSpec(
        key="gnews_de_tech",
        name="News monitor — Digitalregulierung Deutschland (Google News)",
        url=(
            "https://news.google.com/rss/search?q=Digitalgesetz+OR+KI-Verordnung"
            "+OR+Plattformregulierung+Deutschland&hl=de&gl=DE&ceid=DE:de"
        ),
        jurisdiction=Jurisdiction.DE,
        language="de",
        deep_fetch=False,
    ),
]
