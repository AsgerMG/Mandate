# Methodology

How we build EuroPolTracker.

## Architecture (four layers, mirrored in the repo)

```
  etl/        Ingestion + enrichment. Source adapters normalize official
              documents into the canonical schema, version them by content
              hash, chunk them into passages, and (later) embed + enrich them.
                │
                ▼
  data/       Structured corpus. Postgres + pgvector. The schema is built for
              citation-grounded RAG: passages carry char offsets + embeddings.
                │
                ▼
  website/    Composable Next.js app: company profile intake, "what's moving"
              dashboard, document views, and the citation-backed LLM interface.
```

Intelligence (RAG with mandatory citations) sits between `data/` and `website/`
and is added once the corpus exists.

## Principles

1. **Automated, single-trigger collection.** Data is never entered by hand. One
   trigger (`ept refresh`) updates everything. See the decision log.
2. **Grounded, not generative-by-default.** Every company-facing claim must
   trace to a passage of a specific document version. No hallucinated obligations.
3. **Adapters are thin; the pipeline is smart.** Hashing, versioning, upserts,
   chunking and cursors live in `etl/pipeline.py` so each adapter only handles
   the quirks of its source. Adding a source = one `SourceAdapter` subclass.
4. **Resilient ingestion.** One bad document never aborts a run; sources are
   polite (rate-limited) and retried with backoff.
5. **Schema-first.** The canonical model is the contract. Bootstrap via
   `init_db()` now; switch to Alembic migrations once the schema stabilizes.

## Working agreement

- Decisions get logged in `decision-log.md` the day they're made.
- Work is tracked in `backlog.md`.
- Prefer the smallest change that proves the next risky assumption.

## Local setup

```bash
uv sync --extra dev            # create .venv, install deps
cp .env.example .env           # set DATABASE_URL (Neon or local Docker)
uv run ept init                # schema + pgvector + seed vocab + register sources
uv run ept refresh --limit 25  # the trigger (EUR-Lex live; others pending)
uv run ept sources             # inspect run state
```
