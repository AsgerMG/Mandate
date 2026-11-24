# Deployment

How the live stack is wired, where each piece runs, and how to redeploy or
debug it. Written 2026-07-13 after a production incident (see "History") that
existed precisely because none of this was written down.

## The four pieces

| Piece | Platform | Where | Deploys how |
|---|---|---|---|
| Postgres + pgvector (the corpus) | Railway | project `regina`, service `pgvector` | n/a — managed; data flows in via `regina refresh`/`regina embed` from anywhere that has `DATABASE_URL` |
| FastAPI backend (`etl/api.py`) | Railway | same project, service `Regina` → https://regina-production.up.railway.app | **Auto-deploys on push to `main`** (git-connected to `AsgerMG/Regina`, builds via the root `Dockerfile`, config in `railway.json`) |
| Next.js site (`website/`) | Vercel | project `regina` (team `asgermgs-projects`) → **https://regina-ai.eu** (custom domain; `regina-intel.vercel.app` is the Vercel-assigned one behind it) | Push to `main` (git-connected) or `vercel redeploy <latest-deployment-url> --target production` from `website/` |
| **The scheduler** (`refresh-cron`) | Railway | same project, service `refresh-cron` — a stock `curlimages/curl:latest` image with an inline start command that POSTs to `/api/refresh` with the `X-Refresh-Secret` header. Cron: **weekly, Sundays 05:00 UTC** | **Dashboard only — see the warning below.** No git source, nothing to push |

There is exactly ONE database. Local runs, the deployed API, and `regina
refresh` from any machine all read/write the same Railway Postgres via
`DATABASE_URL`. There is no staging copy and no "push the DB" step — writes
are live immediately.

### ⚠ `refresh-cron` is not in version control

This is the real operational risk in the stack, so it gets its own heading.
`refresh-cron` has **no git source**: its image, its cron expression and its
entire start command live only in the Railway dashboard. It is not in
`railway.json` (which configures the `Regina` service only), not in this repo,
and **not reconstructible from the repo** — if the service is deleted or the
Railway project is lost, the weekly refresh is gone with no record of what it
did. Treat the dashboard as the source of truth and re-read it before assuming
anything here is current.

Second, **the running deployment does not match the staged config** (checked
2026-08-07). The last successful deployment is from **2026-07-20 12:34 UTC**,
but its live container logs steps that do not appear anywhere in the current
start command:

```
before-install
ERROR: Unable to open log: Permission denied
apk-exit=99
{"started":true}curl-exit=0
```

There is no `apk` and no `before-install` in the staged command — and the staged
command's own first statement, `echo starting refresh`, does **not** appear in the
log. So the command was edited after 2026-07-20 and **never redeployed** — what
runs every Sunday is the older one. Editing this service's start command does nothing until you
redeploy it. (The `apk` failure is non-fatal: the `curl` still fires and the
POST still returns `{"started":true}`.)

Third, and the reason this matters more than it looks: `curl -fsS -X POST` to
`/api/refresh` returns **immediately** with `{"started":true}` — the refresh runs
as a FastAPI background task. So `curl-exit=0` means "the request was accepted",
never "the refresh succeeded". The cron goes green whatever happens next. See
`weekly-audit-pending.md` and decision-log.md 2026-08-07.

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
| `BACKFILL_DAYS` | first-run discovery window per source | **keep in sync with `.env` and `data/config.py`'s default (7300)** — a stale low value here silently narrows discovery (this exact drift happened; found 2026-07-13). Railway is correct at 7300 (checked 2026-08-07). **`.env.example` shipped 730 from the day it was written and was never corrected — fixed 2026-08-07.** So the "keep in sync" instruction pointed at a file that was itself wrong, and every fresh clone started 10× too narrow |
| `VOYAGE_API_KEY` | embeddings **and** reranking | undocumented here until 2026-08-07. Without it `regina embed` cannot run at all in prod — the corpus is on `voyage-4-large`, not the local model |
| `EMBEDDING_MODEL`, `EMBEDDING_DIM` | `voyage-4-large` / `1024` | **stored-data decisions.** Changing either needs a pgvector column migration *and* a full re-embed; a mismatch between these and the column silently breaks vector search |
| `HTTP_USER_AGENT`, `REQUEST_DELAY_SECONDS`, `LOG_LEVEL` | ingestion politeness / logging | ⬜ **`HTTP_USER_AGENT` in production still carries the placeholder `contact: you@example.com`** (checked 2026-08-07). This is the address EU institutional sources (EUR-Lex, Cellar, OEIL) would use to reach us about our crawling — poor etiquette against exactly the publishers we depend on, and unreachable if one of them ever throttles us. Set it to a real address. Note `data/config.py`'s default is a *different* placeholder (`ops@example.com`), so neither the code default nor prod is right |

⬜ **Leftover variable:** the `Regina` service still has `TEST_PING=hello123`
set (checked 2026-08-07). Harmless — nothing reads it, and `Settings` is
`extra="ignore"` — but it is debug residue in a production environment and
should be removed.

### Vercel project `regina`

| Var | Purpose | Gotcha |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | the Railway API base URL | **Baked in at build time** (Next.js `NEXT_PUBLIC_` semantics): changing it does nothing until the next build/redeploy. If empty/missing, `lib/api.ts` silently falls back to `http://127.0.0.1:8000` and every data-driven page renders its empty-state while the site otherwise looks fine — this was broken in prod from first deploy until 2026-07-13. **The visible symptom has changed**: in 2026-07 it was the words "Corpus is empty"; today it is Coverage cards reading `0 live` and topic badges stuck on `…`. See the verification section below — do not go looking for the old string |

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
curl https://regina-production.up.railway.app/api/refresh   # status — read it carefully, see below
```

**`GET /api/refresh` does not tell you whether the refresh worked.** The handler
returns `_refresh_state` verbatim, and `last_result` is assigned on the *last*
line of the `try` in `_run_refresh` (`etl/api.py`). Only `last_finished` and
`running` are in the `finally`. So a run that raises anywhere — collection,
embedding, classification — leaves `last_result` at whatever the last *successful*
run wrote, or at `null` if there has never been one, while `last_finished` updates
and `running` goes false. It looks exactly like a completed run.

That is not hypothetical. As of 2026-08-07 production reads:

```json
{"running":false,"last_result":null,"last_finished":"2026-08-02T06:45:12+00:00"}
```

`last_result: null` after a `last_finished` means **the refresh has never once
completed** — see decision-log.md 2026-08-07. Until that field moves into the
`finally` block, treat a stale-or-null `last_result` alongside a fresh
`last_finished` as a *failed* run, not a quiet one.

This is also the field the weekly audit routine reads to judge refresh health,
which is why the ETL outage ran undetected for weeks. A fix adding explicit
`ok`/`error`/`progress_at` fields to `_refresh_state` was **in flight on
2026-08-07 and had not landed on `main` when this was written** — once it has,
read `ok` and delete this paragraph.

## Is prod actually working? The 90-second check

Rewritten 2026-08-07: the previous version of this section could not detect a
broken production, and gave a false negative on a healthy one. Both of its checks
are recorded below under "two dead canaries" so the same probes don't get
reinvented.

```bash
# 1. Is the API alive and is the corpus non-empty?
curl -s https://regina-production.up.railway.app/api/stats
# Expect documents/versions/passages/sources all non-zero and llm_available:true.
# Baseline 2026-08-07: 6,796 documents, 7,250 versions, 112,588 passages,
# 110,286 embedded, 102 sources. These only ever go UP — a drop is an incident.

# 2. Is CORS right for every origin that resolves? GET with an Origin, not HEAD.
for o in https://regina-ai.eu https://www.regina-ai.eu; do
  echo -n "$o -> "
  curl -s -D - -o /dev/null -H "Origin: $o" \
    https://regina-production.up.railway.app/api/stats \
    | grep -i access-control-allow-origin || echo "BLOCKED"
done
# Every origin must echo itself back. "BLOCKED" = the site's fetches die in the
# browser while curl-without-Origin still returns a clean 200.
```

**3. Then open the site in a browser** — `https://regina-ai.eu/` and
`https://regina-ai.eu/documents` — and read the *numbers on the cards*:

- **Healthy**: every Coverage card shows a non-zero `N live` badge and the
  Hot-right-now cards show real per-keyword counts. `categoryFor()` partitions
  every source into exactly one of the three cards (`press` is the fallback), so
  the three badges sum to the total source count — 102 on 2026-08-07. That
  matches `/api/stats`'s `sources` today, but note they are *different queries*:
  `/api/sources` returns all sources, `/api/stats` counts only enabled ones.
  They agree only while nothing is disabled.
- **Broken**: Coverage cards read **`0 live`** and the Hot-right-now badges stay
  at **`…`** forever. That is the site failing to reach the API — check
  `NEXT_PUBLIC_API_URL` (Vercel, baked in at build time) and
  `CORS_ALLOW_ORIGINS` (Railway).

This failure mode is far less obvious than the one it replaced, which is exactly
why it is spelled out. The deployed register calls `.catch(() => null)` on both
of its fetches (`website/app/documents/page.tsx` at `main`), so loading, empty
and *failed* render identically: `0 live` looks like a quiet week and `…` looks
like a slow request. **Always confirm in the browser console** — a CORS or
unreachable-API failure shows as `net::ERR_FAILED` per request, never as a
non-200.

> **In flight, 2026-08-07:** `website/` is being changed to render failure as an
> explicit state — a "Coverage is unavailable" banner carrying the real error
> string, and `Unavailable` badges instead of `…`. That change was **not
> committed to `main` and not deployed** when this was written; production still
> renders the silent version above. Once it ships, the browser check becomes
> "look for the error banner" and this paragraph should be updated.

### Two dead canaries (do not use these)

1. **"Corpus is empty"** — the string the old runbook told you to look for. It
   **no longer exists anywhere in `website/`** (verified by grep 2026-08-07,
   repo-wide); every remaining hit in the repo is documentation *about* the
   2026-07-13 incident, including the ones in this file. Looking for it on the
   live site will never fail, whatever state prod is in.
2. **Counting register rows** —
   `document.querySelectorAll('a[href^="/documents/"]').length` returns **0 on a
   perfectly healthy site**. The paginated register was deliberately removed on
   2026-07-30 and nothing on the site links to `/documents/[id]` any more (see the
   comment at `website/app/documents/page.tsx:13-24`). A runbook that treats 0 as
   failure reports prod broken when it is fine.

## What does NOT run in the deployed API

- **Most of the enrichment pass.** This is the big one and it was undocumented
  until 2026-08-07. `POST /api/refresh` — the *only* automated path, the one the
  weekly cron hits — does **not** call `enrich_corpus`. `_run_refresh` in
  `etl/api.py` calls `embed_pending` and `classify_pending` directly and nothing
  else, so **types, actors, lifecycle/dates and summaries have never run on the
  cron**, only from `regina refresh` / `regina enrich` on a laptop
  (`etl/cli.py:129` and `:229` are the only `enrich_corpus` call sites). Measured
  consequence: 4,120 of 6,796 documents (60.6%) sit at
  `lifecycle_stage = UNKNOWN`. A code fix was in flight on 2026-08-07; until it
  lands, run `uv run regina enrich` locally after any cron week that mattered.
  See backlog.md → "Decide whether `enrich` joins `refresh`".
- `ep_verbatim` (EP debate transcripts) needs headless Chromium — deliberately
  excluded from the Docker image (see `Dockerfile` comment and
  decision-log.md 2026-07-09). Run `regina refresh --only ep_verbatim` locally;
  it writes to the same shared DB.
- Embedding (`regina embed`) runs wherever refresh runs, including in the API
  path. Production embeds via **Voyage** (`voyage-4-large`, hosted), so it is
  network-bound rather than CPU-bound and the Railway container handles it fine;
  the "~30-40 passages/min/core, run it locally under `caffeinate -i`" advice
  applied to the old local BGE model and only still applies if you deliberately
  configure fastembed.

## History (why this file exists)

- **2026-08-07**: full audit (decision-log.md 2026-08-07). What it changed here:
  the `refresh-cron` service was added to the pieces table — it had been missing
  entirely, so this file documented a stack of three while four were running; the
  verification runbook was rewritten because **both** of its checks were dead (the
  "Corpus is empty" canary no longer exists in `website/`, and the register
  row-count probe now returns 0 on a healthy site); and the
  `regina-intel.vercel.app` "working fallback" claim was corrected — it is not in
  `CORS_ALLOW_ORIGINS`, so it serves a shell whose every API call is blocked. The
  headline finding was that **the weekly refresh has never once completed
  successfully**, which nothing in this file could have told you: the cron exits 0
  on a `{"started":true}` and `GET /api/refresh` reports `last_result: null` in a
  way that reads as "quiet", not "failed".
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
   `regina-intel.vercel.app` attached — it costs nothing — but **it is not a
   working fallback**, and treating it as one is a trap:

   > `regina-intel.vercel.app` is **missing from `CORS_ALLOW_ORIGINS`**, which is
   > set to `https://regina-ai.eu,https://www.regina-ai.eu` and nothing else
   > (Railway, checked 2026-08-07). The shell loads and looks fine; every
   > `/api/*` fetch is blocked. Verified: `GET /api/stats` with `Origin:
   > https://regina-intel.vercel.app` returns **200 with no
   > `access-control-allow-origin` header at all**, while the same request with
   > either `regina-ai.eu` origin echoes the origin back correctly.
   >
   > **⬜ Open item:** add `https://regina-intel.vercel.app` to
   > `CORS_ALLOW_ORIGINS` and restart the `Regina` service (the value is read
   > once at import). Deliberately *not* changed as part of the 2026-08-07 audit
   > — that audit only corrected documentation. Until it is done, the only
   > working public address is `regina-ai.eu` / `www.regina-ai.eu`, and if the
   > apex DNS ever fails there is no fallback that can talk to the API.

   The general rule this is an instance of: a domain that resolves but is not in
   `CORS_ALLOW_ORIGINS` is worse than a domain that does not resolve, because it
   serves a page that looks correct.
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
`https://regina-ai.eu/documents`, confirm the counts actually render, and confirm
the console is clean — a CORS failure shows up as `net::ERR_FAILED` per request,
never as a non-200. Automating it takes about a minute:

```python
# playwright: fails loudly on the thing curl cannot see
page.on("console", lambda m: m.type == "error" and errors.append(m.text))
page.on("requestfailed", lambda r: failed.append(r.url))
page.goto("https://regina-ai.eu/documents", wait_until="networkidle")
# Assert on the LIVE COUNTS, not on links. The Coverage cards render
# `<span class="badge in_force">N live</span>` inside `.coverage-badges`; the
# old probe counted `/documents/<id>` links, which is now always 0 — see
# "Two dead canaries" above.
counts = page.eval_on_selector_all(
    ".coverage-badges .badge.in_force",
    "els => els.map(e => e.textContent.trim())"
        ".filter(t => t.endsWith(' live')).map(t => parseInt(t, 10))",
)
assert counts and sum(counts) > 0, f"register shows no live sources: {counts}"
assert not failed, failed
```

The assertion is the point. `requestfailed` alone is not enough — it catches the
CORS case but not, say, an API returning an empty corpus; and a count of zero
alone is not enough, because the un-hardened page renders `0 live` for both a
blocked fetch and a genuinely empty result. Check both.
