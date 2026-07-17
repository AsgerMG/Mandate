# Deployment

How the live stack is wired, where each piece runs, and how to redeploy or
debug it. Written 2026-07-13 after a production incident (see "History") that
existed precisely because none of this was written down.

## The three pieces

| Piece | Platform | Where | Deploys how |
|---|---|---|---|
| Postgres + pgvector (the corpus) | Railway | project `regina`, service `pgvector` | n/a — managed; data flows in via `regina refresh`/`regina embed` from anywhere that has `DATABASE_URL` |
| FastAPI backend (`etl/api.py`) | Railway | same project, service `Regina` → https://regina-production.up.railway.app | **Auto-deploys on push to `main`** (git-connected to `AsgerMG/Regina`, builds via the root `Dockerfile`, config in `railway.json`) |
| Next.js site (`website/`) | Vercel | project `regina` (team `asgermgs-projects`) → https://regina-intel.vercel.app | Push to `main` (git-connected) or `vercel redeploy <latest-deployment-url> --target production` from `website/` |

There is exactly ONE database. Local runs, the deployed API, and `regina
refresh` from any machine all read/write the same Railway Postgres via
`DATABASE_URL`. There is no staging copy and no "push the DB" step — writes
are live immediately.

## Environment variables

### Railway service `Regina`

Set via `railway variables --set "KEY=value"` (CLI, from the repo root after
`railway link -p regina`) or the Railway dashboard.

| Var | Purpose | Gotcha |
|---|---|---|
| `DATABASE_URL` | the shared Postgres | must be the `postgresql+psycopg://` form |
| `ANTHROPIC_API_KEY` | brief generation | without it, `/api/brief` degrades to dry-run (sources only) |
| `CORS_ALLOW_ORIGINS` | extra allowed origins, comma-separated | must contain the Vercel prod URL or the site's API calls fail in-browser only (curl works — deceptive) |
| `REFRESH_SECRET` | guards `POST /api/refresh` | callers send it as `X-Refresh-Secret` header; unset = endpoint open |
| `BACKFILL_DAYS` | first-run discovery window per source | **keep in sync with `.env` and `data/config.py`'s default (7300)** — a stale low value here silently narrows discovery (this exact drift happened; found 2026-07-13) |
| `HTTP_USER_AGENT`, `REQUEST_DELAY_SECONDS`, `LOG_LEVEL` | ingestion politeness / logging | |

### Vercel project `regina`

| Var | Purpose | Gotcha |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | the Railway API base URL | **Baked in at build time** (Next.js `NEXT_PUBLIC_` semantics): changing it does nothing until the next build/redeploy. If empty/missing, `lib/api.ts` silently falls back to `http://127.0.0.1:8000` and every page shows its empty-state ("Corpus is empty") while the site otherwise looks fine — this was broken in prod from first deploy until 2026-07-13 |

Manage via `vercel env ls|add|rm` from `website/` (after `vercel link
--project regina` — **always pass `--project`**; a bare
`vercel link --yes` creates a brand-new empty project named after the
directory).

## Common operations

```bash
# --- one-time CLI setup ---
npm i -g @railway/cli vercel
railway login && railway link -p regina
cd website && vercel link --yes --project regina

# --- deploy backend (normal path: just push) ---
git push                        # Railway auto-builds main via Dockerfile

# --- deploy site ---
git push                        # if Vercel git integration is on
# or force a rebuild (e.g. after an env-var change, which needs a new build):
cd website && vercel ls regina   # grab latest deployment URL
vercel redeploy <that-url> --target production

# --- refresh the corpus remotely (no laptop needed) ---
curl -X POST https://regina-production.up.railway.app/api/refresh \
  -H "X-Refresh-Secret: $REFRESH_SECRET"
curl https://regina-production.up.railway.app/api/refresh   # status

# --- sanity-check prod end to end ---
curl https://regina-production.up.railway.app/api/stats
# then open https://regina-intel.vercel.app/documents and confirm the
# register shows real counts, NOT "Corpus is empty" (that message = the site
# can't reach the API: check NEXT_PUBLIC_API_URL and CORS_ALLOW_ORIGINS)
```

## What does NOT run in the deployed API

- `ep_verbatim` (EP debate transcripts) needs headless Chromium — deliberately
  excluded from the Docker image (see `Dockerfile` comment and
  decision-log.md 2026-07-09). Run `regina refresh --only ep_verbatim` locally;
  it writes to the same shared DB.
- Embedding (`regina embed`) runs wherever refresh runs. It is CPU-heavy
  (~30-40 passages/min/core on the local BGE model) — for large backfills run
  it locally under `caffeinate -i`, not on the Railway hobby container.

## History (why this file exists)

- **2026-07-17**: full rebrand EuroPolTracker → Regina (see decision-log.md).
  Renamed: GitHub repo (`AsgerMG/EuroPolTracker` → `AsgerMG/Regina`, GitHub
  redirects the old URL), Railway project (`nurturing-delight` → `regina`),
  Railway service (`EuroPolTracker` → `Regina`) and its generated domain
  (`europoltracker-production.up.railway.app` →
  `regina-production.up.railway.app` — old domain is DEAD), Vercel project
  (`euro-pol-tracker` → `regina`). `regina.vercel.app` was taken by another
  Vercel user, so the site's domain is **`regina-intel.vercel.app`**;
  `euro-pol-tracker.vercel.app` remains attached as a 308 redirect to it.
  `NEXT_PUBLIC_API_URL` (Vercel) and `CORS_ALLOW_ORIGINS`/`HTTP_USER_AGENT`
  (Railway) were updated in the same cutover, followed by a Vercel rebuild
  (build-time baking) and a Railway redeploy (var changes need one).
- **2026-07-13**: live site had shown "Corpus is empty" since first deploy —
  `NEXT_PUBLIC_API_URL` was set but EMPTY in Vercel prod env, so the client
  fell back to localhost. Nobody noticed because the marketing pages render
  fine without the API. Fixed by setting the var and redeploying (build-time
  baking means the env fix alone did nothing). Same day: Railway's
  `BACKFILL_DAYS` found stale at 730 vs the intended 7300.
- Deployment knowledge lived nowhere before this file; backlog.md Milestone 4
  still said "⬜ Deploy" while prod had in fact been serving for days.
