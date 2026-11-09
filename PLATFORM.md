# The Mandate platform

How the brains are deployed, where their data lives, and how a new one is added.
This file describes what IS running. When the stack changes, it changes in the
same commit.

## The rule underneath everything

**One database, one schema per brain, one role per schema.** Every brain's data
lives in the Mandate Postgres on Railway and nowhere else: no SQLite files, no
local copies, no second instance. Two stores is what let an approved correction
sit applied in one and reverted in the other for six days, and what let the
capital corpus fork for three months (`capital/ETL/archive/schema/consolidate/`).

A role carries `search_path = <schema>, public` as a role default, so a brain's
code never says where its tables are, and no brain can write into another's
schema. `public` holds the pgvector extension and nothing else.

## What runs where

| | where | source | data |
|---|---|---|---|
| Postgres (`pgvector` service) | Railway project **Mandate** | image `pgvector/pgvector:pg18` | schemas `capital`, `policy`, `mandate` |
| policy API (`Regina` service) | Railway project Mandate | `AsgerMG/Mandate`, root `policy/` | role `policy_app` |
| ~~policy refresh (`refresh-cron`)~~ | retired by the one weekly run (below) | | |
| Mandate site | Vercel `wincent` (wincent-ai.eu) | root `web` (Wincent at `/wincent`, `/brief`; Regina at `/regina`) | role `capital_app`; the policy API, server-side (`POLICY_API_URL`) |
| THE weekly refresh (`capital-etl` service) | Railway project Mandate, Sundays 03:00 UTC | `AsgerMG/Mandate`, start `mandate/refresh/run.py` | role `capital_app`: capital's chain (`railway_cron.py`), then policy's refresh via its API (waited on in `mandate.runs`), then site data, then the artefact release to the bucket |
| health | GitHub Actions `mandate-health.yml`, daily | `mandate/health/check.py` vs `targets.json` | `capital_ro`; keeps ONE issue "Mandate health" |
| CI | GitHub Actions, root `.github/workflows/` | one workflow per brain, path-scoped | `capital_ro` where a check reads the corpus |

## Grounding and embeddings: shared by every brain

**Schema `grounding`** (`mandate/db/grounding.sql`) is the one store of what any
brain cites: documents by canonical URL, versions by sha256 (UNIQUE, so a
duplicate cannot exist), every fetch date, passages, and their vectors as
`halfvec(1024)`. The original bytes are in the Railway bucket `mandate-grounding`
under `sha256/<2>/<sha256>`. Owned by `grounding_owner` (NOLOGIN); every brain
role may SELECT and INSERT, nobody may UPDATE or DELETE (grants, and a trigger
that stops the owner too). Code: `mandate/grounding` (`store_original`, `fetch`,
`cite`). **Policy is on it** (Alembic 5c2f9e1a7b30): its ingestion writes
versions, fetches, passages and vectors here, and reads them through the views
`policy.grounded_versions` / `policy.grounded_passages`; policy keeps only its own
state (`version_refs`: which grounding version a document is at, is_current).
`policy.document_versions` / `policy.passages` are deprecated and read-only by
trigger, kept until the owner retires them. Bucket config: `BUCKET_ENDPOINT`, `BUCKET_ACCESS_KEY_ID`,
`BUCKET_SECRET_ACCESS_KEY`, `BUCKET_NAME`.

**One embedding model**: `mandate/embedding` (`spaces.json`), mirrored into
`web/lib/embedding.ts`. `check_boundary.py` fails on a model name or an
embeddings call anywhere else.

**Moving a table to the model, with no mismatch window.** `spaces.json` says,
per table, which space its vectors are `stored` in and, in `vector_columns`,
which column (and pgvector type) holds each space. Every reader asks
`vector_column(table)` (Python) or `vectorColumn(table)` (TS, generated) for
the STORED space's column, and embeds its query in that same space. So a
re-embed is: write the new vectors in a NEW column beside the old (capital
migration 036, `embedding_v4 halfvec(1024)`; the writers dual-write new rows),
backfill and verify every row, then flip `stored` in ONE commit. The query
model and the column flip together in Python and TypeScript, and during the
Vercel rollout the old build reads old vectors with the old model while the
new build reads new vectors with the new model: both columns are complete, so
no live version mixes spaces. The old column is dropped later, archived first.
Owner commands, in order: `bash mandate/ops/one_model.sh` (dry run),
`--apply` (036 + backfill, ~$0.23), `--flip` (on a branch; merge = the
deploy), then, briefed, `bash mandate/ops/one_model_drop_old.sh`.

Both are imported from the monorepo, so **every Railway service builds from the
repo root** (root directory `/`, config file `/<brain>/railway.json`).

## Runs, artefacts, health

Every refresh and every step is a row in `mandate.runs` / `mandate.run_steps`
(`mandate/db/runs.sql`, client `mandate/runs.py`); policy records its own. The
site's data and runtime priors are built once by the weekly run and published
as a release (`mandate.artefact_releases` + sha256 objects in the bucket,
`mandate/artefacts.py`); the prebuild downloads it and falls back to Postgres.

## Bulk LLM jobs: Message Batches, one helper

Every bulk labelling job sends its requests through `mandate/llm/batch.py`
(half price, async, usually under an hour, at most 24 h). A batch is a row in
`mandate.llm_batches` (`mandate/db/llm_batches.sql`) from submission to
collection, carrying its custom_ids and the per-item metadata needed to write
results back, so a run may submit and a LATER run collect, and nothing in flight
is paid for twice. The estimate is capped before submitting; measured cost is
recorded at collection. On it: `classify_taxonomy.py run` (weekly, waits 60 min)
and `classify_eligibility_pertinence.py --classify` (`mandate/ops/pertinence.sh`).
Interactive calls (a brief, a Regina answer) stay live.

## Credentials

Each role's URL is stored on the Railway database service as two variables:
`<BRAIN>_DATABASE_URL` (private network, for Railway services) and
`<BRAIN>_DATABASE_PUBLIC_URL` (TCP proxy, for Vercel, CI and a laptop). A
Railway service declares `DATABASE_URL=${{pgvector.<BRAIN>_DATABASE_URL}}`, so
a rotation is one run of:

    python3 mandate/db/apply_roles.py --admin-url "$ADMIN_URL" --apply

which sets new passwords, stores them on Railway, and **proves** the isolation
by attempting a cross-schema write. Anything still holding an old password fails
loudly on its next connection. The URL scheme is `postgres://`, the one spelling
every client in the stack reads.

Local env files are gitignored: `capital/.env.local`, `policy/.env`.

## Adding a brain

A brain is a schema, a role, a deployable and a workflow. In order:

1. **Schema and role.** Add `<brain>` / `<brain>_app` to the arrays in
   `mandate/db/roles.sql` and to `ROLES` in `mandate/db/apply_roles.py`, create
   the schema (`CREATE SCHEMA <brain>` as the admin), then run `apply_roles.py
   --apply`. It must report `all roles sound`.
2. **Code.** A top-level directory `<brain>/`. Its connection code reads
   `DATABASE_URL` and nothing else, and never schema-qualifies its own tables.
   Its schema authority is a migration tool owned by the brain (policy uses
   Alembic, with `version_table_schema` set to its schema).
3. **Deploy.** A Railway service with root `<brain>/` and watch path
   `/<brain>/**`, `DATABASE_URL=${{pgvector.<BRAIN>_DATABASE_URL}}`. There is
   no per-brain site: the brain's agent gets routes under `web/app/<agent>/` in
   the one Mandate site, a bench entry in `web/components/nav-bar.tsx` (AGENTS)
   and a card on the home page.
4. **CI.** `.github/workflows/<brain>-ci.yml`, path-scoped to `<brain>/**`. Tests
   run against a real Postgres in the production schema layout, never SQLite.
5. **Worktrees.** Add the brain's `node_modules`, `.venv` and env file to the
   `link` lines in `scripts/agent-worktree.sh`.
6. **This file.** A row in the table above.

## The company profile and vocabulary: shared by every brain

**One vocabulary**: `mandate/vocabulary/vocabulary.json` (sectors, size bands,
countries, stage, customer type, AI and data exposure), every mapping decision
stated in it. `emit.py` generates `mandate/vocabulary/generated.py` and
`web/lib/mandate/vocabulary.generated.ts`; `check.py` (mandate-ci) fails when
either is stale or a brain's own copy drifts.

**One profile**: `mandate/profile` (Python) and `web/lib/mandate/profile.ts`, the
same shape, held equal by `mandate/profile/fixtures.json`. Company size is
derived from the EU SME bands, never asked. Each brain's input is DERIVED from
it: capital's routes and policy's `/api/brief` and `/api/questions` accept an
optional `profile` (absent, nothing changes; tests prove identical input either
way). Stored in schema `mandate` (`mandate/db/profiles.sql`, NOT YET APPLIED):
accounts, workspaces, and append-only `company_profile_versions`.
