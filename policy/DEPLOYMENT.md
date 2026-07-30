# Deployment

How the live stack is wired, where each piece runs, and how to redeploy or
debug it. Written 2026-07-13 after a production incident (see "History") that
existed precisely because none of this was written down.

## The three pieces

| Piece | Platform | Where | Deploys how |
|---|---|---|---|
| Postgres + pgvector (the corpus) | Railway | project `regina`, service `pgvector` | n/a — managed; data flows in via `regina refresh`/`regina embed` from anywhere that has `DATABASE_URL` |
| FastAPI backend (`etl/api.py`) | Railway | same project, service `Regina` → https://regina-production.up.railway.app | **Auto-deploys on push to `main`** (git-connected to `AsgerMG/Regina`, builds via the root `Dockerfile`, config in `railway.json`) |
| Next.js site (`website/`) | Vercel | project `regina` (team `asgermgs-projects`) → **https://regina-ai.eu** (custom domain; `regina-intel.vercel.app` is the Vercel-assigned one behind it) | Push to `main` (git-connected) or `vercel redeploy <latest-deployment-url> --target production` from `website/` |

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
# then open https://regina-ai.eu/documents and confirm the
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
  Vercel user, so the Vercel-assigned domain is `regina-intel.vercel.app`;
  `euro-pol-tracker.vercel.app` remains attached as a 308 redirect to it. The
  **custom domain `regina-ai.eu` was added 2026-07-30** and is now the canonical
  public address.
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


## Changing the site's domain

The functional surface is small — the site has no `metadataBase`, no sitemap or
robots route, no absolute URLs in its components, and the PDF export embeds none.
So a domain change is four things, and only the first can break the product:

1. **`CORS_ALLOW_ORIGINS` on Railway** (comma-separated, no trailing slash):
   `https://regina-ai.eu,https://www.regina-ai.eu`. **Apex and `www` are different
   origins to a browser**, so list every one that resolves. This is the item that
   fails *quietly*: the page loads fine and every `/api/*` fetch is blocked, so it
   looks like the API is down rather than like a config problem. Restart the
   service after setting it — the value is read once at import (`data/config.py`).
2. **Vercel domain + DNS**: add the domain to the Vercel project, then the records
   Vercel prints (A/ALIAS for the apex, CNAME for `www`). Keep
   `regina-intel.vercel.app` attached; it costs nothing and stays a working
   fallback while DNS propagates.
3. **`NEXT_PUBLIC_API_URL` on Vercel** — only if the API *also* moves (e.g. to
   `api.regina-ai.eu`). If the backend stays on
   `regina-production.up.railway.app`, leave it alone. It is baked in at build
   time, so changing it needs a rebuild, not just a redeploy.
4. **Docs**: `.env.example`, the `cors_allow_origins` comment in `data/config.py`,
   and this file.

### Verifying it — and two ways to get this wrong

**`curl` cannot answer this question.** It ignores CORS entirely, so a blocked
origin still returns a clean 200 from the command line. Worse, the obvious curl
probe is actively misleading: `curl -sI` sends a **HEAD** request, `/api/stats`
only allows GET, and the header is not reliably attached to the resulting 405 — so
you get "NO HEADER" for an origin that is perfectly well configured. That happened
here on 2026-07-30 and produced a confident, wrong "still blocked" report.

If you must use curl, send the request the browser actually sends — a GET with an
Origin, reading response headers:

```bash
curl -s -D - -o /dev/null -H "Origin: https://regina-ai.eu" \
  https://regina-production.up.railway.app/api/stats | grep -i access-control-allow-origin
```

**The only check that settles it is a browser.** Load
`https://regina-ai.eu/documents`, confirm rows actually render, and confirm the
console is clean — a CORS failure shows up as an empty page with `net::ERR_FAILED`
per request, never as a non-200. Automating it takes about a minute:

```python
# playwright: fails loudly on the thing curl cannot see
page.on("console", lambda m: m.type == "error" and errors.append(m.text))
page.on("requestfailed", lambda r: failed.append(r.url))
page.goto("https://regina-ai.eu/documents", wait_until="networkidle")
rows = page.evaluate("document.querySelectorAll('a[href^=\"/documents/\"]').length")
```
