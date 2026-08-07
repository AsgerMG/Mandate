# Workstream AA — the ETL refreshes Railway weekly, the website does not follow

2026-08-07. Branch `workstream-aa-corpus-currency`.

## The decision, first

**Build the guard, not the publisher — but give the guard a clock and a channel,
because it had neither.**

The brief's own hypothesis was that `check_corpus_currency.ts` "may be most of
the answer". It is, and it was doing none of it: the check is in `npm run
check`, CI does not run `npm run check`, and CI deliberately has no
`DATABASE_URL`, so it would skip itself if it did. **It has never fired
automatically.** The same is true of `check_hydration_parity`, `check_liveness`,
`check_theme_index`, `check_leaf_cap`, `check_client_boundary`,
`check_recall_leaks`, `check_extracted_quotes` and `check_recall_floor` — nine
of the seventeen checks in `npm run check` are in no automatic path at all.

So this is the same shape as the note already in CONTINUE_HERE about
`check_hydration_parity`: *"which already existed, was correct, and was in no
build step"*. Writing another checker would have reproduced it.

Three things were missing, and only one of them is a check:

1. **A channel.** Nothing on the website side could ask what the ETL holds.
   `db.sqlite` is gitignored and lives on a Railway volume; no CI step may read
   it. There was no way to compare, so there was no check to run.
2. **A clock.** A push-triggered guard cannot see drift that starts on a cron.
3. **A one-command fix**, so that finding drift is not the start of an
   afternoon.

## The measurement the decision rests on

`python3 ETL/lib/drift_window.py --detail` re-derives this from the git log.

```
  fire (Sun 03:00 UTC)  -> any commit   -> site data regenerated
  2026-05-24                  2.47d           32.43d
  2026-05-31                  0.86d           25.43d
  2026-06-07                  3.28d           18.43d
  2026-06-14                  1.35d           11.43d
  2026-06-21                  2.52d            4.43d
  2026-06-28                  0.45d           11.59d
  2026-07-05                  4.59d            4.59d
  2026-07-12                  1.41d            1.59d
  2026-07-19                  1.78d            1.78d
  2026-07-26                  0.33d            0.60d
  2026-08-02                  0.26d            0.30d

  ANNOUNCED   median 1.41d   max  4.59d     the best a push-triggered guard can do
  REALISED    median 4.59d   max 32.43d     what actually happened
```

A guard that fires on every push would cut the median drift about threefold and
the worst case sevenfold. That is a large win and it is why the answer is a
guard rather than a publisher.

But `ANNOUNCED` is not the guard's real window. It is the window **conditional on
somebody pushing**. Unconditionally it is unbounded, and the weeks with no push
are the weeks with nobody looking — the failure mode is correlated with the
thing that would catch it. Hence the clock.

## Why not an automated publisher

Considered seriously and rejected on three specific grounds, not on principle:

- **The container cannot do it.** The Railway ETL image is `python:3.11-slim`
  with no Node, so `emit_theme_index.ts` and `check_hydration_parity.ts` cannot
  run there; it has no git credentials; and its filesystem is ephemeral, so
  regenerating a committed artifact there produces a file that is thrown away.
  Making it publish means adding Node, a deploy key, and commit rights to
  `main` for an unattended weekly job.
- **What it would push is exactly what a human should read.** The artifacts are
  the headline figures on the home page and the fund inventory a founder is
  shown. A push redeploys the site. That is not a thing to change unattended in
  exchange for a few hours of freshness.
- **The service is not even running the committed code** (below), so an
  automated publisher would have been publishing from a stale image.

`make republish` is the fix instead: pull the ETL's db, run the whole
regeneration chain through the coverage gate, print what moved, and stop before
the commit.

## What actually has to run, and what it costs

The brief asked whether `make eligibility` (which needs `VOYAGE_KEY` and
rebuilds two vector indexes) has to run. It does not — `ETL/refresh.py` is
already the right chain and already goes through the gate. Of its steps only
two cost anything:

- `build_instrument_profiles.py run` and `embed_eligibility.py run`, both
  Voyage `voyage-3.5`, both guarded by `NOT EXISTS` so they embed only what
  changed. At voyage-3.5 pricing over a ~1,000-instrument corpus this is cents
  per week, and zero on a week where nothing changed.
- The genuinely expensive parts of `make eligibility` — LLM gate encoding and
  `build_instrument_profiles.py classify-titles` — are **not** in the refresh
  chain and should not be.

## What was built

| | |
|---|---|
| `ETL/events/load/publish_corpus_census.py` | The channel. Records what the ETL corpus contains — canonical KPIs, instrument/gate counts, coverage axes, the coverage gate's verdict, the run's outcome, and a fingerprint of the Python that produced it — into an append-only `corpus_census` table in the Postgres the product already reads. |
| `website/frontend/scripts/check_corpus_census.ts` | The guard. Compares the committed `synthesis.json` against that record and separates STALE / SILENT / DEGRADED / DRIFTED. |
| `.github/workflows/corpus-currency.yml` | The clock. Sunday 08:00 UTC, five hours behind the ETL. Runs the census guard, `check_corpus_currency` and `check_hydration_parity` — the last two for the first time ever automatically. Opens and closes a labelled issue. |
| `make republish` | The fix. Pull → gate → regenerate → print the diff → stop before the commit. |
| `ETL/lib/verify_cron.py` | Is the weekly ETL scheduled, deployed, and running this code? |
| `ETL/lib/drift_window.py` | The measurement above, reproducible. |
| `ETL/terms/coverage_gate.py` | Rewritten around loss vs dilution (below). |

The census **is not gated and must not be**: the state you most need recorded is
a corpus that failed the gate. So the gate's verdict travels with the census
rather than deciding whether to write it, and everything that actually
publishes still goes through the real gate in `ETL/refresh.py`.

## The guards were still able to skip themselves into a pass

`check_corpus_currency.ts` and `check_hydration_parity.ts` load credentials from
`./.env.local` only, relative to `website/frontend`. `DATABASE_URL` is
documented as living at the **repo root**. On a checkout that has the root file
and not the frontend one — a fresh worktree, for instance — both printed
`skipped — nothing to compare against` and exited 0 **on a machine that had the
credentials all along**. That is the defect they exist to catch, occurring
inside the checks themselves, and `check_hydration_parity` already carries a
comment saying this happened once before. Both now read the root file first.

The moment `check_corpus_currency` could actually see the database, it failed:

```
snapshot generated 2026-08-06T22:41:09+00:00, 1076 records
postgres 1084 instruments, 1076 embedded profiles, as of 2026-08-07

- 11 of 1084 instruments are OPEN in one corpus and CLOSED in the other
- 8 live instruments absent from the snapshot
- 8 instruments have no row in instrument_profiles
```

**Not fixed here — the eleven are the IPCEI rows, which belong to workstream
Y2.** Left as found on purpose. It is also the best available evidence for this
workstream's central claim: a correct guard that fires nowhere finds nothing,
and this one found live drift within seconds of being able to run. **The first
scheduled run of the new workflow will fail on this until Y2 lands and somebody
runs `make republish`. That is the guard working, not the guard misfiring.**

## The coverage gate was wrong in both directions

The brief reported a false alarm. It is worse than that: the gate compared
percentages only, and percentages cannot answer the question it asks.

**The false alarm, from the committed baselines** (`da0a32c5` → `d16fcccd`):

```
              baseline 08-01        now 08-07
instruments        861                1011      +150
complete           743                 815       +72
eligibility  95.9%  826         88.7%   897      +71   share -7.2pp
funds        99.7%  858         92.0%   930      +72   share -7.7pp
amount       90.5%  779         84.2%   851      +72   share -6.3pp
route        97.3%  838         89.8%   908      +70   share -7.5pp
live         97.7%  841         90.3%   913      +72   share -7.4pp
```

Five axes "regressed" while every one of them **gained about seventy
instruments**. Nothing was lost. The share fell because 150 arrivals were
thinner than the incumbents, which is what growth looks like.

**The blind spot, which nothing had ever looked for.** Delete 150 instruments of
which 130 were the only ones carrying an application route: n 1011→861, route
908→778, share 89.8% → **90.4%**. The share *rises*. A percentage gate passes a
run that threw away 130 funds' worth of research.

The two are separate failures and now get separate tests:

- **LOSS** — an axis holds fewer instruments than it ever has. Absolute, so the
  denominator cannot hide it. Compared against a **high-water mark**, not
  against last week: a tolerance measured from the previous run is a ratchet you
  can walk down one tolerated step at a time, and against a high-water mark the
  same walk fails on the second step. The mark only rises on its own; lowering it
  is `--accept`, which is deliberate, human, and a different command from the one
  that detects the problem — the right shape for a legitimate shrink like
  deleting GB's sixteen fake funds.
- **DILUTION** — a share fell *and* the count did not rise. Growth that dilutes
  is never blocked; growth that adds only rows we know nothing about is.

`ETL/terms/test_coverage_gate.py` asserts both from the real baselines, plus the
ratchet, the legacy-baseline path and the tolerance boundaries. It is in CI.

This is **stricter**, not looser: the loss test is new and catches a class the
old gate could not see at all, and the dilution test is the old rule plus an
extra condition.

## Railway: three findings, one of them live breakage

**1. `trigger_etl_now.py`'s verification verified nothing.** It read the schedule
back by grepping `railway status` for the service name and returning the first
matching line. That line is the bare service name printed under "Linked
service". The function returned the string `"etl-pipeline"` and the script
printed `restored: etl-pipeline` — and would have printed exactly that had the
restore failed completely.

**2. There are two schedules and they disagreed.** A Railway cron service has a
schedule in the service-instance config (written over the API) and one baked
into the deployed `serviceManifest` (changed only by a deploy). Found live:

```
serviceInstance.cronSchedule        "0 3 * * 0"      the real one
latestDeployment ... cronSchedule   "19 23 * * *"    yesterday's trigger schedule
latestDeployment.status             CRASHED
```

The restore's API write had landed and its deploy had not. `railway status`
showed only the reassuring half. **Repaired and verified** — a fresh deploy of
`main` now carries `0 3 * * 0`, status SUCCESS.

`deploymentRedeploy` was tried first as the minimal repair and **does not
work**: it replays the deployment's own baked manifest, so the new deployment
came up SUCCESS still carrying `19 23 * * *`. Recorded in
`railway_service.redeploy()` so nobody spends that half hour again. Only a fresh
upload rebakes the manifest.

**3. The service has no repo trigger.** `repoTriggers: []` — it is deployed by
CLI upload, and nothing redeploys it when `main` changes. The image running
yesterday was built 2026-08-06 23:10; the fix that stops one blocked website
cancelling the week's ETL was committed 2026-08-07 17:47. The weekly run was
executing the bug that had already been fixed. That is why the census carries a
code fingerprint and the guard compares it against the checkout.

`restore()` now retries, and confirms from Railway rather than from its own
return code. `pull_db.py` and `push_local.py` exit non-zero when it cannot be
confirmed: a pull that succeeds and leaves the service woken has traded one
`db.sqlite` for the entire weekly refresh.

## Also fixed

- **A failed ETL used to leave last week's good numbers standing as the newest
  record.** `railway_cron.py` now writes the census whatever happened, with the
  run's outcome attached (`ok` / `partial: …` / `failed at …`), and the guard
  fails on a degraded run. Previously a failed weekly run was visible only in a
  Railway deployment status nobody watches.
- **`.env.local` was being baked into the ETL image.** `.dockerignore` excluded
  `data/` and `.git/` but not the file holding the Anthropic, OpenAI, Voyage and
  Postgres credentials, and the Dockerfile is `COPY . .`. Now excluded.
- `DATABASE_URL` added to the `etl-pipeline` service as a Railway reference to
  the Postgres service — the census cannot record without it, and it had none.

## Open, and deliberately not done

- **The census's own SILENT check has a cold start.** Until three scheduled
  censuses exist, the staleness limit is a stated 15 days rather than derived
  from the observed cadence. It self-calibrates after that.
- **`verify_cron.py`'s image-freshness test compares timestamps**, which answers
  "is the image at least as new as this code" but not "is it this code". The
  census fingerprint is the exact test; the timestamp is the cheap pre-filter
  that works without waiting for a run.
- **Nothing here publishes.** By decision. If the drift window proves too wide
  in practice — watch the census's `taken_at` against the next
  `synthesis.json` commit — the next step is a bot that opens a PR with the
  regenerated artifacts, which keeps the human decision and removes the
  afternoon. It is not a cron with commit rights to `main`.
