# policy/archive

`website/` is Regina's standalone site (regina-ai.eu), retired on 2026-11-06.
Its pages now live in the one Mandate site under `web/app/regina`, and every
regina-ai.eu path permanently redirects there (web/redirects.regina.json).
Kept as a record, not built or deployed.

`feeds_not_ingested.py` (2026-11-06, E2): the FeedSpecs of the four channels
`etl/intelligence/briefing.py` `_PRESS_EXCLUDED_SOURCES` already kept out of
every brief (gnews_eu_tech, gnews_de_tech, gnews_fr_tech, techcrunch_eu). They
were still collected every Sunday; now they are not. Their documents stay in
the database and stay excluded. `ARCHIVED_FEED_KEYS` in `etl/adapters/feeds.py`
names them, so the exclusion test can still tell a real key from a typo.
