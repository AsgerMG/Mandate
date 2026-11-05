# The Mandate platform

How the brains are deployed, where their data lives, and how a new one is added.
This file describes what IS running. When the stack changes, it changes in the
same commit.

## The rule underneath everything

**One database, one schema per brain, one role per schema.** Every brain's data
lives in the Mandate Postgres on Railway and nowhere else: no SQLite files, no
local copies, no second instance. Two stores is what let an approved correction
sit applied in one and reverted in the other for six days, and what let the
capital corpus fork for three months (`capital/ETL/schema/consolidate/`).

A role carries `search_path = <schema>, public` as a role default, so a brain's
code never says where its tables are, and no brain can write into another's
schema. `public` holds the pgvector extension and nothing else.

## What runs where

| | where | source | data |
|---|---|---|---|
| Postgres (`pgvector` service) | Railway project **Mandate** | image `pgvector/pgvector:pg18` | schemas `capital`, `policy`, `mandate` |
| policy API (`Regina` service) | Railway project Mandate | `AsgerMG/Mandate`, root `policy/` | role `policy_app` |
| policy refresh (`refresh-cron`) | Railway project Mandate | curl image, Sundays 05:00 UTC | calls the policy API |
| policy site | Vercel `regina` (regina-ai.eu) | root `policy/website` | reads the policy API |
| capital site | Vercel `wincent` (wincent-ai.eu) | root `capital/website/frontend` | role `capital_app` |
| capital ETL | Railway, weekly cron | root `capital/` | role `capital_app` |
| CI | GitHub Actions, root `.github/workflows/` | one workflow per brain, path-scoped | `capital_ro` where a check reads the corpus |

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
   `/<brain>/**`, `DATABASE_URL=${{pgvector.<BRAIN>_DATABASE_URL}}`. A site is
   a Vercel project with root `<brain>/website` and an ignored-build step scoped
   to that directory.
4. **CI.** `.github/workflows/<brain>-ci.yml`, path-scoped to `<brain>/**`. Tests
   run against a real Postgres in the production schema layout, never SQLite.
5. **Worktrees.** Add the brain's `node_modules`, `.venv` and env file to the
   `link` lines in `scripts/agent-worktree.sh`.
6. **This file.** A row in the table above.

The company profile every brain reads (`capital/website/frontend/lib/profile/
companyProfile.ts` today) moves into schema `mandate`, which is reserved for the
things no single brain owns: accounts, the shared company profile, and the
register of who decides.
