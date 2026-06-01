# EuroInvTracker

A data study of where European public capital actually goes. It assembles a corpus of companies
that received public funding from the main EU instruments, national development banks, and the EU
State Aid Transparency Register (2020–2025), then publishes the analysis as a static website.

**Corpus:** ~116,900 companies · ~213,900 funding events · ~€255B committed · 40 countries.

## The pipeline

Everything flows one direction. Each arrow is a stage you can re-run independently:

```
data/raw/            external API + HTML caches (per source, gitignored, backed up)
   │  scripts/extract_*.py        one extractor per funding source, loads into the DB
   ▼
db.sqlite            the built database (gitignored, backed up — not in version control)
   │  make analyze   (analysis/run.py runs the SQL in analysis/queries/)
   │  make visuals   (scripts/build_*.py + gen_country_map.py)
   ▼
site/public/data/*.json   the only data the website reads
   │  make site-build
   ▼
site/                Next.js static site (the published findings)
```

## Directory map

| Folder | What's in it |
|---|---|
| `scripts/` | The ETL layer. `extract_*.py` (one per source), `build_*.py` (site visuals), `load_*.py`, `classify.py`, `tag_step.py`, `schema.sql`, `migrations/`, shared `lib/`. |
| `analysis/` | `run.py` (orchestrator), `queries/` (the SQL behind each finding), `views.sql`, and `findings/` (the prose the site renders). |
| `site/` | The Next.js website. Reads only `site/public/data/*.json`. |
| `docs/` | `methodology.md` (canonical, rendered by the site), plus working notes and design guidelines. |
| `plans/` | `backlog/` (active future work) and `archive/` (completed sprint plans, kept for reference). |
| `data/` | Source caches: `raw/` and `processed/`. Gitignored and backed up, not version-controlled. `europe_scope.json` (the country scope config) is the one tracked file here. |

## Common commands

```bash
make analyze       # rebuild site JSON from db.sqlite
make visuals       # rebuild the home-page visuals
make data          # both of the above
make site-build    # static build of the site -> site/out/
make site-dev      # run the site locally at localhost:3000
make backup        # snapshot db.sqlite + data/ to ~/EuroInvTracker-backups and iCloud
```

Extractors are per-source and hit external APIs, so run them one at a time, for example
`python3 scripts/extract_cdti.py --load-db`. They detect duplicates on `(source, call_id)` and are
safe to re-run. After any loader inserts rows, run `python3 scripts/classify.py` then
`python3 scripts/sanity_check.py`.

## Data and backups

The database and the `data/` caches are **generated build artifacts**, not version-controlled
(they are large and reproducible). They live on disk and are backed up by `make backup`, which
writes dated archives to `~/EuroInvTracker-backups/` and copies them to iCloud Drive. The code,
the SQL, and the small derived JSON in `site/public/data/` are the version-controlled record of
results. To rebuild the database from scratch, re-run the extractors against `data/raw/`.

## Method, in one line

Descriptive framing only: does public funding *coincide with* private follow-on, not *cause* it.
One company row, many event rows; deduplicated across instruments. See
[docs/methodology.md](docs/methodology.md) for scope, source coverage, and known limitations.
