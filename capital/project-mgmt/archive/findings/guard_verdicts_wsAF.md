# Guards run where the data is; CI asserts against what they published

Workstream AF. Branch `workstream-af-verdicts`.

## The defect

Nine of seventeen checks were in no automatic path. CI does not run
`npm run check`, and deliberately holds no `DATABASE_URL` — correctly: a
secret there would widen one compromised workflow from *can read our code* to
*can read and write every award, company and fund we hold*.

So the guards run where their data already is and publish a verdict; anything
without credentials reads the verdict over plain HTTPS. `guard_verdicts` is the
table, `/api/guards` serves it without the `detail` column, and
`check_verdicts.ts` asserts. **No secret was added anywhere.**

## What this workstream closed

### STALE was asked of the wrong half — the mechanism's own hole

The four `on_change` guards rested entirely on **DRIFTED**: their verdict is
bound to a hash of the code they judge, so changing the ranker forces a re-run.
That is right, and it is not enough, because **three of the four do not judge
code**. `corpus_currency`, `hydration_parity` and `degradation` each ask a
question about live Postgres. A call closing changes every one of those answers
and changes not one byte of any fingerprinted file.

A green verdict therefore covered today's corpus **forever**, and the guards
this workstream took out of "no automatic path" were quietly going back into
one.

STALE is now asked of every guard that **reads the corpus**, whatever its
cadence, derived from the registry's `needs` rather than from a list. The
property:

> **a verdict about the corpus is void when the corpus moves.**

SILENT stays weekly-only — it is about a *publisher that has stopped*, and an
`on_change` guard has no clock to be late against.

### That also supplies the clock the on_change guards could not otherwise have

They can run on a schedule nowhere. The Railway container is `python:3.11-slim`
with no Node and no frontend modules; CI must never hold `DATABASE_URL`. But
the weekly cron publishes a census, and a census that moves past these verdicts
turns them red in the next Sunday workflow. **The schedule is borrowed rather
than built.**

`npm run check` self-heals by construction: the four publishers run earlier in
the same `&&` chain than `check_verdicts --full`, so a developer's local run
refreshes what it then asserts on.

### Shown failing, on purpose

A feed serving the real rows with the census moved 8 days forward and nothing
else touched. Same input, both versions:

```
old code   2 problems — aggregate_independence, offerable_decay   (weekly only)
new code   6 problems — the four on_change guards as well
```

```
STALE — degradation's verdict is 8.0 days older than the newest census.
      The corpus has moved since this guard last looked at it, and this guard
      reads the corpus — so its verdict is about funds we no longer hold. No
      code changed, which is why the fingerprint still matches and why this
      is the only thing that can catch it.
```

DRIFTED was also seen firing for real: after merging main and AH, all seven
verdicts went red because the fingerprinted files had moved. Re-running the
four publishers cleared it.

### The degenerate cadence AH handed over

Both freshness readers derived their age limit from the observed spacing of the
verdicts, and both had the same two bugs:

| bug | effect |
|---|---|
| `produced_by !== "local"` | a proof run labelled `proof-local` counted as **scheduled** |
| no floor under a derived limit | 2.5 × a 0.0d burst = 0.0d |

Together they had `check_corpus_census` reporting a **twelve-hour-old census as
SILENT past a limit of 0.1 days**. Fixed in both readers from one definition
(`isScheduledProducer`, `MIN_DERIVED_CADENCE_DAYS` in `guardVerdict.ts`), not
two copies.

**This is not a loosening.** No threshold moved. Local runs simply stopped
counting as evidence about how often the cron fires — which they never were.
Verified both ways on real data: old `FAILED`, new `ok`.

## Two things found that we did not know

### 1. The registry both languages read was not in the repository

`data/guard_registry.json` calls itself *"ONE definition ... read by both
languages"*. It had **never been committed**: `.gitignore` line 49 ignores
`data`, and the 425 files tracked under that directory predate the rule, so a
new file there is invisible by default and nothing said so.

Every reader is on an automatic path — `check_verdicts.ts`, `guardVerdict.ts`,
`check_corpus_census.ts`, `check_guard_registry.py`, three of them in CI. On a
fresh checkout, which is exactly what a GitHub runner is, they throw before
reaching any of this workstream's logic. **The whole channel would have failed
on its first CI run, for a reason that has nothing to do with verdicts.** It is
also the standing rule already written down: no CI step may read gitignored
data.

### 2. `guard_verdicts.py run census` raised `KeyError: 'command'`

A guard with no `command` publishes its own verdict — that is what the key's
absence *means* in the registry. `run` now says so and names the right command.

## Open, and owned by the corpus rather than by this branch

Two guards are legitimately RED on real drift, which is the mechanism working:

- **`corpus_currency`** — the committed snapshot disagrees with Postgres.
- **`hydration_parity`** — the two stores do not produce the same brief.
- **`check_corpus_census` STALE** — the site serves **299,384** events and the
  ETL's newest census holds **297,933**; `totalCapitalEurRaw` 408.4B vs 352.9B.
  The census predates main's corpus merge and needs re-publishing.

- **`census` DRIFTED** — its verdict was judged at `fcd9eb0c678489bd`, this
  checkout is `4a4072360b848408`. It is a weekly guard; the Railway cron
  republishes it, or `python3 ETL/events/load/publish_corpus_census.py` does.

`degradation` and `recall_floor` are green on this checkout, both republished
on the merged code:

```
corpus_currency   failed  0.0d old  code e679b9450a08c9dd  by wsAN2-merge
hydration_parity  failed  0.0d old  code 3fb3cd52443ba7fa  by wsAN2-merge
degradation       ok      0.0d old  code c7ae854b02f84f5f  by wsAN2-merge
recall_floor      ok      0.0d old  code f236c03c6a892504  by wsAN2-merge
```

`recall_floor`, measured on the merged 1,088-instrument corpus rather than
skipped: pool 97% (floor 93), EXACT@5 30% (floor 22), REGIME@5 86% (floor 80),
300 tune pairs. **No floor was lowered.**

## Sequencing, on merge

`check_verdicts.ts` fails closed when the feed is unreachable, deliberately —
treating an unreachable feed as "no news" would make every guard pass by
default. `/api/guards` currently **404s**, because the route ships in this
branch and is not deployed yet. So the first CI run after merge is red until
Vercel has deployed. That window is one deploy and it is not papered over here,
because every alternative is a guard that passes having checked nothing.
