# One env loader, and a harness that cannot measure nothing quietly

Workstream AH. Branch `workstream-ah-env-loader`.

## The defect

Forty-one harnesses each opened `.env.local` with their own pasted copy of the
same preamble. Seven copies knew that `DATABASE_URL` is documented to live at
the **repo root**; thirty-four read only `./.env.local`. All of them swallowed
the failure and continued on whatever the ambient shell held.

That matters because retrieval ranks on pgvector with `DATABASE_URL` and
`VOYAGE_KEY` present, and on a lexical fallback without them. A harness with no
credentials measures **a different system from the one that ships** and prints a
number that looks exactly like a real one.

The sharpest case was `check_recall_floor`, the last line of `npm run check`: it
printed `SKIPPED — no DATABASE_URL/VOYAGE_KEY` and **exited 0**. A green
`npm run check` with the recall floors never evaluated.

`requireLiveCorpus()` cannot catch this, by construction. With no `DATABASE_URL`
at all, hydration records `source: "snapshot", degraded: false` and the guard
passes. It catches *asked Postgres and got the snapshot*. It cannot catch
*never asked, because the credentials never loaded*.

## What is in place

`scripts/loadEnv.ts` is the one module allowed to name an env file. It walks
from the working directory up to the repository root, root-most first, nearest
file winning, ambient environment beating both. `.git` is treated as a stop
whether it is a directory (clone) or a file (worktree) — the worktree is the
checkout the whole thing exists for.

The second half is the one that matters. `requireCredentials(context, keys)`
resolves **three** states, and only one is an error:

| state | condition | behaviour |
|---|---|---|
| `offline` | `NO_PG=1` | deliberate. Skip, say so, exit 0. |
| `live` | every declared key present | measure. |
| — | neither | **throw**. |

That is `requireLiveCorpus()`'s rule moved one link earlier in the chain, which
is where it has to be, rather than a second discipline.

`check_env_loader.ts` states it as four properties rather than a filename
register, and fails the build on the forty-second re-paste. It is free and
hermetic: it reads source and runs nothing.

## What this workstream did

**Converted the remainder.** 46 harnesses now declare a credential contract.
`check_env_loader` passes over 151 files: one loader, every declared credential
accounted for.

**Ran them.** A conversion that turns a silent pass into a silent pass is worth
nothing, so every one of the 46 was executed rather than inspected.

- All 46 resolve `credentials=live` at startup via `ENV_SELFTEST=1`, naming the
  keys they got and the files they were found in.
- `npx tsc --noEmit` clean.
- Ten of the cheap DB-backed ones run to completion against live Postgres
  (`source: "postgres"`, `instruments: 1088`).
- `check_recall_floor` — **the script that had the bug** — run in full, on the
  merged corpus, and it now measures instead of skipping.

### check_recall_floor, actually evaluated

```
corpus=postgres instruments=1088
__recallSetComposed.json  300 tune pairs
  ok   pool     97% (floor 93%)
  ok   exact5   30% (floor 22%)
  ok   regime5  86% (floor 80%)
  ok   regime5  84% (floor 70%)  original join, n=160
  ok   regime5  87% (floor 84%)  traced:exact_attribution, n=140
```

Floors unchanged. Nothing was lowered.

### The three states, demonstrated

Run on the real script, with the worktree's `.env.local` moved aside:

```
no credentials, no NO_PG   -> Error: check_recall_floor: missing
                              DATABASE_URL, VOYAGE_KEY ... EXIT=1
NO_PG=1                    -> check_recall_floor: skipped — NO_PG=1 ... EXIT=0
credentials present        -> measures (above)
```

The old behaviour was the first row printing `SKIPPED` and exiting 0.

### The guard, broken on purpose

A script re-pasting the preamble (`readFileSync("./.env.local")`) and reading
`process.env.DATABASE_URL` without declaring it:

```
check_env_loader: 2 problem(s)
  scripts/__breaktest.ts: names an env file in code ("./.env.local").
  scripts/__breaktest.ts: reads DATABASE_URL and declares nothing.
```

Removed, and the check returns to ok. Both properties fire independently.

## Was any published number measured through a silent skip?

**No published figure in this repo is suspect. Named, with the reasoning:**

The failure needs *both* no ancestor-or-self `.env.local` *and* no ambient
credentials. On this machine's main checkout **two** env files exist:

```
/Users/asgermollergrimberg/Wincent/.env.local                  4 keys
/Users/asgermollergrimberg/Wincent/website/frontend/.env.local 3 keys
```

and their `DATABASE_URL` values are byte-identical. So `./.env.local` resolved
to a real file from *both* documented working directories — the repo root and
`website/frontend`. The thirty-four wrong-preamble scripts found credentials on
this machine regardless of which spelling they used.

Corroborated rather than assumed: every recall figure published under
`project-mgmt/findings/` that carries provenance carries `corpus=postgres`
(`workstream_z_leaf_cap_recall_run{1,2}.txt`, `degradation_policy_wsX.md`) —
1,076 then 1,084 instruments, tracking the corpus as it moved. None reads
`corpus=snapshot`.

**The exposure was real but forward-looking, and it was agents, not the PM.**
The scripts break in a *worktree*, where `.env.local` is gitignored and
therefore absent. Of eleven worktrees on this machine right now, **three carry
no env file at all** (`workstream-af-verdicts`, `workstream-ag-census-drift`,
`wsAL-corpus-of-record`). Under the old preamble a harness run in one of those
would have measured the lexical fallback and said nothing. Under
`requireCredentials` it dies — verified above.

So: nothing to retract. The fix closes a hole that had not yet been fallen into
on a published number, and the check is what keeps it that way.

## Two live failures found while running the converted scripts

Both pre-date this branch and are corpus state, not env loading. Recorded
because they were seen come out of Postgres:

1. **`check_corpus_currency` FAILS.** The committed snapshot holds 1,084
   instruments; Postgres holds 1,088. Nine instruments are OPEN in one corpus
   and CLOSED in the other, all `ademe_aid__*`, all with a `call_deadline` basis
   Postgres honours and the snapshot does not. The fallback corpus is not a
   degraded production — it is a different answer to "which funds exist".
   Fix is `make republish`.

2. **`check_corpus_census` FAILS `SILENT` + `DRIFTED`.** The `DRIFTED` half is
   real: census #5 was fingerprinted `fcd9eb0c678489bd`, this checkout is
   `91cffff76da29d32`. The `SILENT` half is a **degenerate cadence** — five
   censuses published in a burst by a local proof run give an observed cadence
   of 0.0d, so the limit collapses to 0.1d and a census six minutes old is
   called silent. The adaptive limit needs a floor when the observed cadence is
   near zero. Handed to workstream AF, which owns the same vocabulary.
