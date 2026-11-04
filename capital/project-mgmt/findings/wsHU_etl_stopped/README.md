# The pipeline stopped on a file that has never existed where it runs

**wsHU, 2026-08-18. Free: one Postgres read, three read-only SQLite reads, one
image reproduction on this laptop. No model calls, no writes, no deploy.**

---

## For the owner, verbatim

The weekly ETL did not break; it was handed a file it could not have. On
2026-08-10 a shared codebook was committed as
`data/reference/activity_codebook.json`, and `classify_taxonomy.py` opens it on
the line where it is imported. `data/` is the corpus: git ignores the whole tree,
`railway up` applies `.gitignore` to what it uploads, and on the Railway service
`/app/data` is the mounted volume. So that file has never been in the image. The
first weekly run built from that commit — 03:15 UTC on Sunday 16 August — raised
`FileNotFoundError` before the script's first statement, and `railway_cron.py`
stops on a step it does not tolerate, so the load, the classifier, the sanity
check, gap detection, both window refreshes and all four guards never ran. **No
founder was affected: the coverage gate refused the degraded corpus and the site
kept serving the older admissible reading, which is the gate doing exactly its
job.** Committed input that code reads now lives in `reference/` at the repo
root, where the image carries it, and a check imports every script the cron names
under conditions that make a committed `data/` path unreadable — so the next one
fails on a laptop instead of at 03:00 on a Sunday. **Two things still need you.**
The fix is inert until somebody runs `railway up`; nothing redeploys that service
on a push. And the eleventh sector does not come back with it — that is a
separate, older loss, and the cheapest route to it is a write to the corpus of
record.

---

## 1. The exit, run rather than reasoned about

Census #11 records `failed at classify_taxonomy.py (rc=1)` and nothing else. That
script is four of the cron's steps under four subcommands, Railway deletes the
container's logs with the container, and the census records the script and not
the subcommand — so the record does not say which of the four, or why. It was
reproduced instead.

An image-shaped tree was built by hand: `ETL/` and `website/build/` copied,
`data/` created empty (the volume is mounted over it and holds the corpus), and
the two files `.dockerignore` re-includes placed in it. The first
`classify_taxonomy.py` step is `restore`, and it does this:

```
FileNotFoundError: [Errno 2] No such file or directory:
    '.../data/reference/activity_codebook.json'
  classify_taxonomy.py:385 in <module>
```

Line 385 is module level — `_CODEBOOK = json.loads((ROOT / "data" / "reference" /
"activity_codebook.json").read_text(...))`, added by wsCZ in `3b47ced3` on
2026-08-10. It fires on **every** subcommand, including `vocab`, because it fires
on import.

The dates close the case without needing the container. Census #10 (2026-08-09)
ran the whole step list and reported `partial: refresh_open_calls.py`; its image
fingerprint is `e25d3712f8cc48f2`. Census #11's is `c99a0aeb2a070141` = commit
`f6ff3957`, **2026-08-11** — the first image built after the codebook landed, and
the first run on it is the one that died.

## 2. Why the image cannot have it, and why `.dockerignore` cannot fix it

`.gitignore:57` is a bare `data`. Having no slash, it matches a directory of that
name at any depth, so git ignores the entire tree; every file under it that is
"committed" was force-added past that rule. `.gitignore` line 63's own comment
records the consequence — *"`railway up` honours .gitignore"* — so `data/` is
stripped from the upload before Docker ever reads `.dockerignore`, and a
`!data/...` negation there cannot put it back. One line proves it:

```
$ git check-ignore -v data/guard_registry.json
.gitignore:57:data      data/guard_registry.json
```

That has a second consequence worth writing down: **wsHC's `!data/guard_registry.json`,
added 2026-08-17 to reopen the container's verdict channel, is inert.** It is kept
with a comment saying so, because it starts working the day line 57 stops matching
— but the registry is still absent from the image, and the "zero verdicts ever
from the container" fact wsHC measured has not been fixed by it.

`data/europe_scope.json` is the counter-example that makes the shape clear. Also
committed, also under `data/`, also read at import — and it works, because it was
added 2026-06-01 and is on the volume from whenever the volume was seeded. Every
committed `data/` file added *after* that seeding is invisible to the container,
and nothing in the repo copies one across or records having done so.

## 3. Two defects, not one, and they meet in an unlucky place

They are adjacent and it would be easy to fuse them. They are separate:

| | sectors 8 instead of 11 | the run exiting 1 |
|---|---|---|
| cause | destructive `companies` reload, 2026-07-24, repaired on the laptop only (`89c082ae`, 08-01) | a committed file under `data/` read at import, added 2026-08-10 |
| first observed | census #4, 2026-08-07 | census #11, 2026-08-16 |
| fixed by this workstream | **no** | yes |

wsHB's provenance argument reproduces exactly, measured here independently
against a read-only copy of the laptop store:

```
companies 164,029; company_sector_labels 144,493; distinct sector_top 11
methods: recovered_2026_07_23 113,023 | nace 19,521 | (none) 18,799
         nace_top 11,264 | programme 1,422
families from nace/nace_top/programme alone .............. 8
families ONLY the recovered pass can name ................ materials_chemicals,
                                                           mobility_transport, space
```

Eight is what a store without that pass names, and eight is what every census
ever taken inside the container reports.

Where they meet: the `restore` step that repairs sectors after a reload was added
to the cron on 2026-08-09 and deployed on 08-11. **It has never once executed** —
the first Sunday it existed, the import killed it. Had it run it would have
restored nothing, because the volume's `company_sector_labels` is empty; but it is
worth saying plainly that the repair path and the thing that blocked it landed one
day apart, which is why the two look like one event in the record.

## 4. Was the script wrong to exit?

No, and the interesting answer is one level up.

- It **refused a state it should refuse**. An absent codebook is not an empty one,
  and this repo has already paid for reading a missing reference file as empty:
  `encode_registered_regions.py` deleted 141 correct region filters that way and
  exited 0 (`etl_env.require_reference`). Failing loudly was right.
- It **tolerated nothing it should have refused**. `railway_cron.py` is right that
  `classify_taxonomy.py` is fatal: every step below it writes into the corpus.

The defect is that nothing could see it coming, and that what it said did not
survive. Both are fixed:

- `ETL/schema/check_cron_image_inputs.py` states the property — *no module
  reachable from `railway_cron.py`'s steps may read a git-tracked file under
  `data/` while it is being imported* — and tests it by importing every script the
  cron names, steps and guards both derived from the cron and the registry rather
  than listed, under an audit hook that makes every tracked `data/` path
  unreadable. Tracked is the whole test: an untracked file under `data/` is a
  corpus artifact the pipeline wrote and the volume holds. It names no file, so a
  reference input added next year fails the day its read appears. Verified by
  putting both defects back: it fails on each, including the one that reads its
  file through a helper two modules down, which a static walk would have missed.
- A failed step now carries its label and its last stderr line into the census's
  `run_outcome`, which lands in Postgres. `failed at classify_taxonomy.py restore
  (rc=1): FileNotFoundError: reference/activity_codebook.json` is a diagnosis. The
  live Railway log is unchanged — stderr is echoed as it arrives.

**`data/liveness.json` was the second failure waiting behind the first.** Added
2026-08-06, so also absent from the container; `fetch_ademe_windows.py` is a fatal
step and imports `ETL/lib/liveness.py`, which reads the projection at import.
Fixing only the codebook would have moved the outage six steps down the list.

## 5. What it takes to get the eleventh sector back

Fixing the exit does not do it. `classify_taxonomy.py restore` is a pure function
of `company_sector_labels`, and the volume's copy does not carry the 2026-08-01
recovery, so the step restores zero rows and the corpus still names eight.

Three routes, priced:

| route | cost | verdict |
|---|---|---|
| promote `company_sector_labels` to the volume, then let the cron's own weekly `restore` repair `companies.sector_top` | a **write to the corpus of record** — `make republish`, which pulls the volume by union (`pull_db_side.py` + `merge_volume_into_local.py`, so the volume's 21 companies / 41 events / €7.95M survive) and pushes the merged 645 MB back through `overwrite_gate` | the one that works. Needs your approval; it is a production write and out of this workstream's bounds |
| let the container re-earn the labels from the LLM | **~$136** in batch, computed from `cmd_run`'s own estimator over the work the volume would present (127,343 full + 12,685 sub-only) | it will never happen unattended: `--max-cost 20` skips it every week, correctly |
| do nothing | free | the record stays at eight. Nobody is served it today, and a rebuild against the volume makes the sector term identically zero for founders in mobility, materials and space (wsHB §2) |

And before any of it: **`railway up`.** The service has `repoTriggers: []`, so
nothing here reaches the container on a push. Until it is deployed, next Sunday's
run dies at the same line.

## 6. Not done, deliberately

- **`data/guard_registry.json` is the last committed input still under `data/`.**
  The same disease and the same fix — move it — but it has sixty-odd readers
  across the check suite and none of them is the ETL, so it is a change to the
  guard system, not to the pipeline. The `.dockerignore` line that was supposed to
  cover it is now documented as inert rather than believed.
- **No deploy, no write.** Both are named above with their cost.
- **`both stores agree` (`check_hydration_parity`)** went red on main between
  21:18 and 21:50 on 2026-08-18 — Postgres moved and the committed snapshot did
  not. Verified red in the primary checkout with no branch in the way. Held in
  `suite_accepted` with the same owner and fix as `corpus currency`; observed by
  this workstream, not caused by it.

## Reproduction

Everything below is free and read-only.

```bash
# the check, and the two defects it catches (put either path back to see it fail)
python3 ETL/schema/check_cron_image_inputs.py

# the image, by hand: ETL + website/build, an empty data/, nothing else
rsync -a --exclude=__pycache__ ETL /tmp/img/ && mkdir -p /tmp/img/data
cd /tmp/img && python3 ETL/events/transform/classify_taxonomy.py restore

# why no .dockerignore line can help
git check-ignore -v data/guard_registry.json

# the fingerprint that dates the running image
#   c99a0aeb2a070141 = f6ff3957, 2026-08-11: hash ETL/**/*.py + website/build/**/*.py
#   at that commit, sorted by path, content only

# the sector arithmetic, against a read-only copy
sqlite3 'file:data/db.sqlite?mode=ro' \
  "SELECT sector_taxonomy_method, COUNT(*) FROM companies GROUP BY 1"
```
