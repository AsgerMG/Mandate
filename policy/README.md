# Regina

**Reg**ulatory **in**telligence **a**nalyst for the **EU** (then France &
Germany). Regina automatically
collects official policy documents, structures them into a queryable corpus, and
— ultimately — lets a company describe itself and get a realistic, **citation-
backed** briefing on what applies to them, what's changing, and what to expect.

## Status

**Milestone 1: ETL + DB foundation** (in progress). Automated ingestion, the
canonical schema, and the single-trigger refresh exist; the EUR-Lex adapter is
live and the other EU sources are scaffolded. See
[project-management/backlog.md](project-management/backlog.md).

## Architecture

```
etl/          → Python backend: ingestion + enrichment + embeddings (adapters,
                pipeline, chunking), the RAG intelligence layer (etl/intelligence:
                profile → retrieval → grounded cited briefing), and the HTTP API
                the website calls (etl/api.py)
data/         → structured corpus: Postgres + pgvector, canonical schema, config
website/      → Next.js front-end (dashboard, profile intake, briefing UI) —
                a pure client of the API over HTTP
project-management/ → decision log, methodology, backlog
```

Designed around one promise: **fully automated collection** — one trigger
(`regina refresh`) updates the whole corpus, no manual data entry — and
**citation-grounded intelligence** — every generated claim traces back to a
specific passage of a specific document version.

## Quickstart

```bash
uv sync --extra dev                 # install (Python 3.12 via uv)
uv run playwright install chromium  # one-time: browser for ep_verbatim (see below)
uv run regina init                     # schema + pgvector + HNSW + seed + sources
uv run regina refresh --limit 25       # THE TRIGGER — collect/update the corpus
uv run regina embed                    # vectorize passages (local model, no key)
uv run regina search "AI obligations"  # meaning-search the corpus, citation-ready
uv run regina sources                  # inspect per-source run state

# A grounded, citation-backed briefing for a company (--dry-run needs no key):
uv run regina brief --name "FinScore" --sector fintech --ai --personal-data --dry-run
```

Set `ANTHROPIC_API_KEY` (in `.env`) to drop `--dry-run` and get a full briefing:
Claude writes it grounded in the retrieved passages via the native **Citations**
feature, so every claim links back to a specific official source.

### The web app

```bash
uv run regina serve                 # API at http://127.0.0.1:8000
cd website && npm install && npm run dev   # site at http://localhost:3000
```

The dashboard shows "what's moving" by lifecycle stage; the briefing page takes
a company profile and returns the cited analysis. See [website/](website/README.md).

**Storage is local and persistent by default.** With no configuration,
`DATABASE_URL=local` runs an embedded Postgres+pgvector under `.localdb/` — no
Docker, no managed service, no accounts — and the corpus survives between runs.

When you want a durable, *shared* corpus, set `DATABASE_URL` to any Postgres
with the `vector` extension: a free [Neon](https://neon.tech) project (pgvector
built in), or local Docker via `docker compose up -d`.

## Docs

- [Methodology](project-management/methodology.md) — how we build, the layers,
  the principles.
- [Decision log](project-management/decision-log.md) — what was decided and why.
- [Backlog](project-management/backlog.md) — what's done and what's next.
- [Design & UX guidelines](project-management/design-ux-guidelines.md) — the
  responsiveness/cross-device rules for `website/`, each tied to a real bug it
  prevents.
