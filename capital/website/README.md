# website — the publish layer

Everything that turns the corpus -- schema `capital` of the Mandate Postgres, read as
`capital_ro` through `ETL/lib/store.py` -- into the live site lives here, split into the two
halves of a publish pipeline. Data flows one direction:

```
build/      one builder per JSON file  ──►  frontend/public/data/*.json
  build_site_data.py  orchestrator: check the views, run every builder, check consistency
  lib/web_env.py      single source of truth for paths (ROOT, SITE_DATA, DATA, REFERENCE)
  lib/helpers.py      formatters + JSON export (to_json / fmt_eur); no database access

frontend/   the Next.js app — reads only frontend/public/data/*.json
  app/                routes: / · for-companies · companies · methodology · limitations
                      + api/intelligence/route.ts (the server-side LLM report)
  lib/intelligence/   the LLM analysis/report feature: pipeline · corpus · types · panel
  fund-processes/     per-instrument briefs the intelligence route reads at runtime
  components/  lib/  public/data/
```

## How paths work in `build/` (`lib/web_env.py`)

Every builder starts with a 2-line bootstrap (mirrors `ETL/lib/etl_env.py`):

```python
import sys; from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from web_env import ROOT, SITE_DATA      # + DATA / DATA_PROCESSED / REFERENCE as needed
from store import connect                # with connect(readonly=True) as con: ...
```

`web_env` exposes the canonical locations — `ROOT`, `SITE_DATA` (`= frontend/public/data`),
`DATA`, `DATA_PROCESSED`, `REFERENCE` — and puts `ETL/lib` on the path, so **no builder
recomputes a location by counting `.parent` hops** and every builder reaches the corpus the
same way. A builder runs from anywhere (`python3 website/build/synthesis.py`), no `cd`, no
`PYTHONPATH`. The read-only URL is `CAPITAL_RO_DATABASE_URL` (in `capital/.env.local`).

## Running the publish layer

```bash
# Rebuild EVERYTHING the site reads (every builder, in dependency order):
make data                                   # = python3 website/build/build_site_data.py
python3 website/build/build_site_data.py --check   # views current + figures consistent
make views                                  # (re)install ETL/schema/views.sql, as capital_app

# Run a single builder:
python3 website/build/synthesis.py          # corpus KPIs -> synthesis.json
python3 website/build/company_search.py     # the /companies lookup shards

# Build / serve the site (frontend's `prebuild` regenerates the data when
# CAPITAL_RO_DATABASE_URL is set, and otherwise uses what is on disk):
make site-build                             # cd frontend && npm run build  -> frontend/out/
make site-dev                               # cd frontend && npm run dev     -> localhost:3000
```

## The builders

| Builder | Writes | Read by |
|---|---|---|
| `coverage_indicator.py` | `coverage_ratings.json`, `country_coverage.json`, `data/processed/coverage_indicator.json` | home page coverage table |
| `country_map.py` | `country_map.json` | home Europe map |
| `home_visuals.py` | `instrument_leaderboard.json` | home taxonomy diagram |
| `synthesis.py` | `synthesis.json` | home KPI grid + layout footer |
| `investor_insights.py` | `investor_insights.json` | the `/for-companies` charts |
| `company_search.py` | `companies/*.json` shards | `/companies` client-side lookup |
| `companies_index.py` | `companies_index.json` | the server-side intelligence agent |
| `eligibility_export.py` | `instrument_terms.json` | the request path's fallback corpus, the theme index, most checks |

## Notes

- **`fund-processes/` and `companies_index.json` stay where they are** in `frontend/` — the
  intelligence route reads them via `process.cwd()` at runtime (see
  `frontend/next.config.ts` `outputFileTracingIncludes` and `lib/intelligence/corpus.ts`).
- **No barrel** re-exports the `"use client"` panel together with the server-only
  `corpus.ts` (fs reads) — that breaks under Turbopack. Import intelligence files directly.
- The views live in `ETL/schema/views.sql`. A build cannot install them (it reads as
  `capital_ro`); it refuses to run when the installed views are not that file
  (`install_views.py --check`). A new `source_family` CASE reaches the site after `make views`.
- **Nothing here is committed.** Every JSON a builder writes is generated from Postgres
  (`build_site_data.py`, run by the frontend's prebuild and by CI with the read-only
  credential). `world-110m.json` is a static asset; `signals_digest.json` is written by
  `signals_digest.py` (the signals layer).
