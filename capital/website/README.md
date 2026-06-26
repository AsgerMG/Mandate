# website — the publish layer

Everything that turns the built `data/db.sqlite` into the live site lives here, split into the
two halves of a publish pipeline. Data flows one direction:

```
build/      one builder per JSON file  ──►  frontend/public/data/*.json
  build_site_data.py  orchestrator: reinstall SQL views, run every builder, verify freshness
  lib/web_env.py      single source of truth for paths (ROOT, DB, SITE_DATA, VIEWS_SQL)
  lib/helpers.py      read-only DB access + formatters (df / to_json / fmt_eur)

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
from web_env import ROOT, DB, SITE_DATA   # + VIEWS_SQL / DATA_PROCESSED as needed
```

`web_env` exposes the canonical locations — `ROOT`, `DB`, `SITE_DATA`
(`= frontend/public/data`), `VIEWS_SQL` (`data/views.sql`, shared with ETL),
`DATA_PROCESSED` — so **no builder recomputes `db.sqlite` or the data dir by counting
`.parent` hops**. Change a location once, in `web_env.py`. A builder runs from anywhere
(`python3 website/build/synthesis.py`), no `cd`, no `PYTHONPATH`.

## Running the publish layer

```bash
# Rebuild EVERYTHING the site reads (views + every builder, in dependency order):
make data                                   # = python3 website/build/build_site_data.py
python3 website/build/build_site_data.py --check   # verify JSON is fresh vs data/db.sqlite

# Run a single builder:
python3 website/build/synthesis.py          # corpus KPIs -> synthesis.json
python3 website/build/company_search.py     # the /companies lookup shards

# Build / serve the site (frontend's `prebuild` re-runs the freshness check):
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

## Notes

- **`fund-processes/` and `companies_index.json` stay where they are** in `frontend/` — the
  intelligence route reads them via `process.cwd()` at runtime (see
  `frontend/next.config.ts` `outputFileTracingIncludes` and `lib/intelligence/corpus.ts`).
- **No barrel** re-exports the `"use client"` panel together with the server-only
  `corpus.ts` (fs reads) — that breaks under Turbopack. Import intelligence files directly.
- `data/views.sql` is reinstalled by `build_site_data.py` before the builders run; a new
  `source_family` CASE there is invisible to the site until the views are recreated.
