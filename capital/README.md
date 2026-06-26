# EuroInvTracker

A data study of where European public capital actually goes. It assembles a corpus of companies
that received public funding from the main EU instruments, national development banks, and the EU
State Aid Transparency Register (2020–2025), then publishes the analysis as a static website.

**Corpus:** ~116,900 companies · ~213,900 funding events · ~€255B committed · 40 countries.

## The pipeline

Everything flows one direction. Each arrow is a stage you can re-run independently:

```
data/raw/            external API + HTML caches (per source, gitignored, backed up)
   │  ETL/extract/extract_*.py    one extractor per funding source, loads into the DB
   ▼
data/db.sqlite       the built database (gitignored, backed up — not in version control)
   │  ETL/transform/*.py          classify, merge, dedup, backfill, resolve entities
   │  ETL/load/*.py + load/qa/    loaders, migrations, schema, post-load QA, backup
   │  make data      (website/build/build_site_data.py: views + every builder)
   ▼
website/frontend/public/data/*.json   the only data the website reads
   │  make site-build
   ▼
website/frontend/    Next.js static site (the published findings)
```

## Directory map

Five top-level folders, each owning one concern:

| Folder | What's in it |
|---|---|
| `ETL/` | The data pipeline. `extract/` (one `extract_*.py` per source), `transform/` (`classify.py`, `merge_companies.py`, the `build_*_groups.py` parent-group rollups, dedup, backfills, entity resolution), `load/` (`load_*.py`, `schema.sql`, `migrations/`, `backup.py`, and `load/qa/` post-load checks), and `lib/` (shared modules + `etl_env.py`, the single source of truth for paths). See [ETL/README.md](ETL/README.md). |
| `website/` | The publish layer. `build/` (the Python builders that turn `data/db.sqlite` into the site JSON, + `lib/web_env.py` path bootstrap) and `frontend/` (the Next.js app). See [website/README.md](website/README.md). |
| `data/` | The database (`db.sqlite` + `backups/`, both under data/), the read-side SQL (`views.sql`, `queries/`), the source caches (`raw/`, `processed/`), and `europe_scope.json`. See [data/README.md](data/README.md). |
| `project-mgmt/` | `methodology.md` (canonical, rendered by the site), `decision_log.md`, `design-guidelines.md`, `europe_scope.md`, the dev journal (`notes.md`), `plans/` (active plans + `backlog/`), and `findings/` (analysis write-ups). |
| `.claude/` | Harness config: `settings.json` and `hooks/` (the stop-gate + generated-edit guards). |

## Common commands

```bash
make data          # rebuild EVERY site JSON from data/db.sqlite (views + all builders)
make analyze       # corpus KPIs only (website/build/synthesis.py)
make visuals       # home-page visuals only (taxonomy, map, coverage)
make site-build    # static build of the site -> website/frontend/out/
make site-dev      # run the site locally at localhost:3000
make backup        # snapshot data/ (db.sqlite + caches) to ~/EuroInvTracker-backups and iCloud
```

Extractors are per-source and hit external APIs, so run them one at a time, for example
`python3 ETL/extract/extract_cdti.py --load-db`. They detect duplicates on `(source, call_id)` and
are safe to re-run (see the re-runnability registry in [ETL/README.md](ETL/README.md)). After any
loader inserts rows, run `make transform` (classify + sanity) — or the steps individually,
`python3 ETL/transform/classify.py` then `python3 ETL/load/qa/sanity_check.py` — and
`python3 ETL/load/backup.py` to snapshot the DB to local + iCloud.

## Data and backups

The database and the `data/` caches are **generated build artifacts**, not version-controlled
(they are large and reproducible). They live on disk and are backed up by `make backup`, which
writes dated archives to `~/EuroInvTracker-backups/` and copies them to iCloud Drive. The code,
the SQL, and the small derived JSON in `website/frontend/public/data/` are the version-controlled record of
results. To rebuild the database from scratch, re-run the extractors against `data/raw/`.

## Method, in one line

Descriptive framing only: does public funding *coincide with* private follow-on, not *cause* it.
One company row, many event rows; deduplicated across instruments. See
[project-mgmt/methodology.md](project-mgmt/methodology.md) for scope, source coverage, and known limitations.
