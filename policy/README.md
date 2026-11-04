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
etl/          → Python backend: ingestion (adapters, pipeline, chunking),
                enrichment (etl/enrichment: embeddings, reranking, document-type
                reclassification, Cellar dates/lifecycle, per-document synthesis),
                the RAG intelligence layer (etl/intelligence: profile → retrieval
                → grounded cited briefing), and the HTTP API the website calls
                (etl/api.py)
data/         → structured corpus: Postgres + pgvector, canonical schema, config,
                Alembic migrations (data/migrations/)
website/      → Next.js front-end (dashboard, profile intake, briefing UI) —
                a pure client of the API over HTTP
project-management/ → decision log, methodology, backlog, brief-quality-plan
```

Designed around one promise: **fully automated collection** — one trigger
(`regina refresh`) updates the whole corpus, no manual data entry — and
**citation-grounded intelligence** — every generated claim traces back to a
specific passage of a specific document version.

`refresh` is collection followed by exactly one enrichment pass
(`etl/enrichment/corpus.py`), whose step order is a correctness constraint rather
than a preference: dating and actor extraction both filter on `document_type`, so
they must run after reclassification or they silently skip documents whose type
hasn't been derived yet. Every step is idempotent, so re-running is always safe.

**"Idempotent" does not mean "incremental", and one step is not.** Most steps
select only the rows still missing what they produce, so a re-run is nearly free.
`enrich_lifecycle` (`etl/enrichment/lifecycle.py`) is the exception: its query
selects *every* CELEX-bearing document of a dated type, with **no
already-enriched filter at all**, and then re-fetches the lot from Cellar over
SPARQL — on every run, forever, whether or not anything changed. Measured
2026-08-07: 410 such documents, 397 distinct CELEX codes, batched at
`_BATCH_SIZE = 150` — so **3 SPARQL round-trips**, plus `HttpClient`'s
`REQUEST_DELAY_SECONDS` politeness pause on each, every time.

At today's corpus that is cheap, and it is arguably correct rather than a bug:
Cellar amends end-of-validity when an act is repealed, so yesterday's answer can
be wrong today and there is nothing to diff against locally. But it scales with
the whole corpus rather than with what changed, and it makes every enrichment run
depend on a third party being up — so it is stated here rather than hidden behind
a blanket "only touches what is still missing".

## Quickstart

```bash
uv sync --extra dev                 # install (Python 3.12 via uv)
uv run playwright install chromium  # one-time: browser for ep_verbatim (see below)
uv run regina init                     # schema + pgvector + HNSW + seed + sources
uv run regina refresh --limit 25       # THE TRIGGER — collect/update the corpus
uv run regina search "AI obligations"  # meaning-search the corpus, citation-ready
uv run regina sources                  # inspect per-source run state

uv run regina enrich                   # ONE ordered pass: types, actors, dates,
                                       # embeddings, tags (runs inside refresh too)
uv run regina enrich --only summaries  # opt in to the paid per-document step
uv run regina run <key> --full         # recover a starved source (see below)

# A grounded, citation-backed briefing for a company (--dry-run needs no key):
uv run regina brief --name "FinScore" --sector fintech --ai --personal-data --dry-run

# Spend-bounded check of the real brief path — one rotating panel profile per
# run, so successive checks cover different company types for one brief's cost:
uv run regina brief-check                  # next profile in the rotation
uv run regina brief-check --all            # whole panel, for a batch of fixes
uv run regina brief-check --dry-run --repeat 3   # retrieval's noise floor, free
uv run regina brief-check --all --model claude-haiku-4-5   # try another model
uv run regina brief-compare before.json after.json         # judged, 3 axes
```

Which model writes the brief is a parameter (`LLM_MODEL`, or `--model` for one
run): `reasoning_params()` translates the effort levels each call site asks for
into whatever that model accepts, so pointing it at an older, cheaper model is a
config change rather than three 400s. Which model *judges* a brief is separate and
pinned (`EVAL_MODEL`) — the instrument must not move when the subject does.
`brief-compare` reports quality, cost, and latency per side; see
[brief-quality-plan.md](project-management/brief-quality-plan.md) → Phase 6 for
the A/B runbook and how to read the result.

Set `ANTHROPIC_API_KEY` (in `.env`) to drop `--dry-run` and get a full briefing:
Claude writes it grounded in the retrieved passages via the native **Citations**
feature, so every claim links back to a specific official source.

**A source that looks healthy but returns almost nothing** is usually the
incremental cursor, not a broken adapter: after a source's first run, discovery
only asks its upstream for what is newer than that run, so a first run that was
truncated (`--limit`) or crashed partway leaves the missed history permanently
unreachable. This is not rare — as of 2026-08-07, **46 of 102 sources ingested
nothing on the last weekly run**, reporting `errors: 0` throughout.
`regina run <key> --full` (or `regina refresh --full`) re-discovers the whole
backfill window: it ignores both the date floor *and* `source.cursor`. It's
idempotent. See `pipeline._since` for the full writeup.

> **⚠ Verify this before relying on it.** Until 2026-08-07, `--full` overrode
> only the date window (`_since`) and never reset `source.cursor` — so for every
> adapter that carries its high-water mark in the cursor rather than in `since`
> (`oeil`, `an_verbatim`, `de_verbatim`, `ep_verbatim` and the newsletter
> adapters) `regina run <key> --full` was a **silent no-op**: it reported a clean
> run and re-discovered nothing. The text above describes the intended, fixed
> behaviour. A fix was in flight on 2026-08-07 and had **not been confirmed as
> landed** when this was written — if in doubt, run
> `regina run <key> --full` and check that `discovered` is larger than the
> previous run's before trusting it.

Schema changes go through Alembic (`uv run alembic upgrade head`); `regina init`
remains the fresh-install path. Note that SQLAlchemy persists enum *member
names*, so `document_type` labels in Postgres are UPPERCASE.

Retrieval is a deliberate breadth/depth split: the profile is decomposed into
obligation facets (AI, data protection, sector, consumer…) and each is retrieved
and cross-encoder reranked separately, then the instruments that matter get
re-retrieved *within* themselves so the brief sees several of an act's operative
provisions rather than one window of each of sixty laws. Every brief reports its
own retrieval shape (`retrieval_stats`) — watch
`substantive_documents_per_passage`, where 1.0 means every instrument the brief
actually reasons over contributed exactly one passage. (The all-passage
`documents_per_passage` is also reported but is floored near 0.5 by the ~50
single-passage canon stubs, so it cannot detect a collapse.)

🔄 **Discrepancy found 2026-08-07, fix in flight:** at `main` (`etl/cli.py:554`)
`brief-check` printed `documents_per_passage` to the operator as `depth ratio` —
the metric this paragraph had just said *cannot detect a collapse*. So at the one
moment someone is actually watching the numbers, during a run that costs real
money, they were shown the blind one. A fix switching that line to
`substantive_documents_per_passage` was in the working tree but **not yet
committed** when this was written; confirm before relying on `depth ratio`.

Neither metric would have caught the duplicate-canon problem: 16 canon acts are
stored twice, byte-identical, so both copies retrieve and land at adjacent ranks.
Breadth halves while the ratio reads healthy, because two documents genuinely did
contribute two passages. A ratio cannot see that they are the same text.

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
- [Brief quality plan](project-management/brief-quality-plan.md) — what makes a
  brief good, how it's measured, and the model A/B that settled Sonnet vs Haiku.
- [Brief UX plan](project-management/brief-ux-plan.md) — a brief takes ~3 minutes
  and that is now a fixed constraint; this is the plan for the wait, built on
  measured latency (93.6±2.1 tok/s) rather than preset animation.
