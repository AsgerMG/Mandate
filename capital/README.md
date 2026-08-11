# Wincent

Wincent is a data study of where Europe's state-backed capital actually goes — grants,
guarantees, loans, and equity — across the main EU instruments, national development banks, and
the EU State Aid Transparency Register (2020–2025), published as a static website.

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
| `website/` | The publish layer. `build/` (the Python builders that turn `data/db.sqlite` into the site JSON, + `lib/web_env.py` path bootstrap) and `frontend/` (the Next.js app). See [website/README.md](website/README.md). **Working on `/brief`? Read [website/frontend/lib/intelligence/ARCHITECTURE.md](website/frontend/lib/intelligence/ARCHITECTURE.md) first** — it states which stage is ours, which is the LLM's, and lists the ranking routes already measured dead. |
| `data/` | The database (`db.sqlite` + `backups/`, both under data/), the read-side SQL (`views.sql`, `queries/`), the source caches (`raw/`, `processed/`), and `europe_scope.json`. See [data/README.md](data/README.md). |
| `project-mgmt/` | `methodology.md` (canonical, rendered by the site), `decision_log.md`, `technical_dd_2026-07.md` (the engineering audit and its remediation record), `design-guidelines.md`, `europe_scope.md`, the dev journal (`notes.md`), `plans/` (active plans + `backlog/`), and `findings/` (analysis write-ups). |
| `.claude/` | Harness config: `settings.json` and `hooks/` (the stop-gate + generated-edit guards). |

## Common commands

```bash
make data          # rebuild EVERY site JSON from data/db.sqlite (views + all builders)
make analyze       # corpus KPIs only (website/build/synthesis.py)
make visuals       # home-page visuals only (taxonomy, map, coverage)
make site-build    # static build of the site -> website/frontend/out/
make site-dev      # run the site locally at localhost:3000
make backup        # snapshot data/ (db.sqlite + caches) to ~/Wincent-backups and iCloud
```

Extractors are per-source and hit external APIs, so run them one at a time, for example
`python3 ETL/events/extract/extract_cdti.py --load-db`. They detect duplicates on `(source, call_id)` and
are safe to re-run (see the re-runnability registry in [ETL/README.md](ETL/README.md)). After any
loader inserts rows, run `make transform` (classify + sanity) — or the steps individually,
`python3 ETL/events/transform/classify.py` then `python3 ETL/events/load/qa/sanity_check.py` — and
`python3 ETL/events/load/backup.py` to snapshot the DB to local + iCloud.

## Verification

Every push runs [.github/workflows/ci.yml](.github/workflows/ci.yml) — three jobs: the frontend
(types, tests with a coverage floor, the contract checks below, lint, build), the ETL (byte-compile,
schema file present, one country map, country resolution, encoded-spec sanity, cross-language
constants), and a security pass. **No CI step may depend on data that is not committed** — the
checks read `website/frontend/public/data/*.json`, never `data/db.sqlite`, which is gitignored. Test
that property by moving the database aside and re-running.

```bash
cd website/frontend
npm run check       # types + 96 tests + vocabulary, archetype, payload and dependency contracts
npm run vocab       # regenerate data/vocabularies.json — run after editing intake options
npm run trace       # print the real candidate pool for a profile (free, no model calls)
npm run board       # scoreboard over the 12 archetypes
npm run health      # recent errors, spend and quota from event_log
```

Two of these are contracts rather than tests, and matter most when changing intake:
`check_vocabularies.ts` fails if the intake options drift from the corpus, and `npm run vocab` is
what keeps the Python encoder reading the same vocabulary rather than a second copy of it. The
duplication rule behind both is in [project-mgmt/decision_log.md](project-mgmt/decision_log.md).

Model-calling scripts (`npm run bench`) cost real money — run them on a batch of changes, not per fix.

## Data and backups

The database and the `data/` caches are **generated build artifacts**, not version-controlled
(they are large and reproducible). They live on disk and are backed up by `make backup`, which
writes dated archives to `~/Wincent-backups/` and copies them to iCloud Drive. The code,
the SQL, and the small derived JSON in `website/frontend/public/data/` are the version-controlled record of
results. To rebuild the database from scratch, re-run the extractors against `data/raw/`.

## Method, in one line

Descriptive framing only: does public funding *coincide with* private follow-on, not *cause* it.
One company row, many event rows; deduplicated across instruments. See
[project-mgmt/methodology.md](project-mgmt/methodology.md) for scope, source coverage, and known limitations.
