# reference — committed input that code reads

Everything here is **input**, not corpus: a codebook, a projection, a hand-curated
override, a baseline a guard grades against. It is small, it is committed, it is reviewed
in a pull request like the code that reads it, and it travels **in the ETL image**.

## Why it is not under `data/`

`data/` is the corpus. `.gitignore` line 57 is a bare `data`, which — having no slash —
matches a directory of that name at any depth, so git ignores the whole tree and
`railway up` strips it from the build context before Docker sees `.dockerignore`. On the
Railway service, `/app/data` is a mounted volume holding the database. A committed file
placed under `data/` therefore reaches the container only if a human copies it onto that
volume, and nothing in this repo does that or records having done it.

That is not a theory. On 2026-08-10 the activity codebook was added as
`data/reference/activity_codebook.json` and read at module level by
`ETL/events/transform/classify_taxonomy.py`. The first weekly cron run on an image built
from that commit — 2026-08-16, 03:15 UTC — raised `FileNotFoundError` before the script's
first statement. `railway_cron.py` exits on a non-tolerated failure, so the load, the
classification, the sanity check, gap detection, the two window refreshes and all four
corpus-side guards never ran, and the corpus of record has been three days stale since.
`project-mgmt/findings/wsHU_etl_stopped/` has the reproduction.

## The rule, and the test for a file nobody has thought of yet

> A file a scheduled container reads must be carried by the image. `data/` is the volume,
> so no module reachable from `ETL/events/extract/railway_cron.py`'s steps may read a
> path under `data/` while it is being imported.

`ETL/schema/check_cron_image_inputs.py` walks the cron's own import graph and fails on any
module-level read of a `data/` path. It names no file and no directory: a reference input
added next year fails the day its read appears, and moving it here is the fix.

Reads inside a function are out of that scope on purpose — they are the working files of
one step and they fail loudly, where an import-time read kills the whole run before it can
say which step it was. `check_offerable_decay.py` is the live example: its baseline is a
module-level *constant* and a function-level *read*, and it now resolves here either way.

## What does not belong here

The database, its backups, the source caches, the derived intermediates, and anything the
pipeline writes and re-reads. Those are the store; they live in `data/` and they reach the
container on the volume, which is exactly what a volume is for.
