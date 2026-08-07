# Workstream AL — the corpus had no owner

2026-08-07. Branch `workstream-al-corpus-of-record`.

## Summary

The premise was right and the situation is worse than it looked. The corpus is
split across two SQLite stores that diverged in opposite directions — and the
divergence was not a lapse of discipline. **It was the only reachable state**,
because the only two channels between the stores both move the entire 645 MB
file with `--overwrite`. Whichever direction you run, the other store's work is
deleted. There has never been a code path in this repository by which an
instrument encoded on the laptop could reach the volume, or by which an award
gathered on the volume could reach the laptop, without destroying the other.

`make republish` — documented as *"THE one command that makes the website serve
the corpus the ETL produced"* — begins with that pull. Run today, before this
branch, it would have deleted 764 funding instruments and 2,350 encoded
eligibility gates that exist in no other store.

## 1. Confirming the premise

`corpus_census`, all five rows, read from Postgres directly:

| # | taken | produced_by | companies | events | capital | instruments | gates | frameworks | outcome |
|---|-------|-------------|-----------|--------|---------|-------------|-------|-----------|---------|
| 1 | 16:08 | local | 151,426 | 297,933 | €352.85B | 1,076 | 6,368 | 8 | unknown |
| 2 | 16:26 | local | 151,426 | 297,933 | €352.85B | 1,084 | 6,368 | 8 | ok |
| 3 | 16:52 | image-equivalent | 151,426 | 297,933 | €352.85B | 1,084 | 6,368 | 8 | ok |
| 4 | 17:51 | **etl-pipeline** | 150,868 | 299,384 | **€408.43B** | **322** | **4,018** | **10** | failed at refresh_open_calls.py |
| 5 | 18:52 | proof-local | 151,426 | 297,933 | €352.85B | 1,086 | 6,368 | 8 | unknown |

Row #4 is the only one taken inside the Railway container, against the volume's
SQLite. Every other row is the laptop's `data/db.sqlite`. The "+€55.6B, +1,451
events, −558 companies delta" is the gap between two databases, not the effect
of a run. Confirmed.

Row #4 also carries `coverage: OperationalError: no such column: tier` —
migration 020, applied on the laptop on 2026-08-01, had never reached the store
the pipeline actually runs against.

## 2. Why the guard could not see it

`check_corpus_census.ts` compared the site against `rows[0]` — the newest census
of *any* store. That was #5, a laptop probe taken an hour after the pipeline's.
So the site could be, and was, declared current against a corpus it does not
serve. Two further consequences of the same confusion between *who ran it* and
*which store it read*:

- SILENT derived the ETL cadence from `produced_by !== "local"`, which counted
  `image-equivalent` and `proof-local` — two laptop probes 20 minutes apart — as
  scheduled runs. A cadence of hours would have been derived from them, and the
  guard would then have failed SILENT on a perfectly healthy weekly refresh.
- DRIFTED compared the checkout's code fingerprint against those same laptop
  probes.

## 3. Schema drift: found, and worse than "migrations reach the laptop only"

Three separate defects, all live:

**(a) `apply_025` was defined twice.** The second definition
(`025_declared_catchment.sql`) shadowed the first, so `MIGRATIONS["025"]`
resolved to it and **`025_scheme_end_date_basis.sql` was unreachable through the
runner**. That is the column whose absence `check_corpus_currency.ts` records as
having cost 306 of 948 leaves and taken pool recall from 97% to 81%. On the
laptop it exists only because it was applied before the collision was created.
On any store that had not already received it by hand, it could never arrive.
Renumbered to 026.

**(b) `schema_migrations` on the laptop holds id `026`, applied 2026-08-07
18:57, with no file behind it anywhere in the repository.** DDL was applied by
hand and stamped. The renumbering in (a) retroactively gives that stamp a file
to stand behind, and the runner now reports any id it cannot produce as
`unknown` rather than ignoring it.

**(c) The schema does not travel through migrations at all, in the general
case.** Ten columns on `funding_instruments` are named by no migration —
`description`, `eligibility_text`, `eligibility_source_url`,
`eligibility_confidence`, `eligibility_fetched_at`, `route_status`,
`route_status_source`, `route_status_note`, `name_basis`,
`source_window_policy`. They arrive through self-healing `ALTER TABLE` embedded
in ordinary ETL scripts — `mark_offer_route.py`, `name_applicable_object.py`,
`merge_companies.py`, `classify.py`, `build_parent_groups.py`,
`backfill_end_date_basis.py`. That has the same shape as the original defect:
**the schema follows whichever SCRIPT ran, not whichever STORE matters**, and
those scripts run on the laptop. `source_window_policy` is referenced nowhere
else in the repository at all.

Nothing in the repo ever invoked `apply.py`. It was a hand-run tool, one
migration at a time, against whatever `DB` resolved to on that machine.

## 4. The decision: one corpus of record

Written up in full, with the argument, in `website/build/lib/corpus_stores.py`.
In short — the test is not *who runs the pipeline* or *who the product reads*,
it is **which store, if lost, could not be rebuilt**:

- **local** lost → rebuild from the volume (events) and Postgres (instruments).
- **postgres** lost → rebuild by re-running `make eligibility`. Fully.
- **volume** lost → the events cannot be rebuilt. The 43 extractors read
  registers that republish a *current* file and keep no history; a withdrawn
  award is gone. Irrecoverable.

So the volume is of record for events, unambiguously. And it must take the
instruments too, because the alternative is the state found today: the only
complete instrument corpus is a gitignored file on one laptop, and the repo's
own documented commands overwrite it. Postgres cannot take that role — it is a
lossy projection by design (`funding_instrument_sources` publishes 2 of its
columns; gate and clause surrogate ids are re-issued on every truncate-and-
reload). A store that cannot reproduce what it received is a publication, not a
record.

    railway-volume   OF RECORD.  Every table, every column, on a persistent volume.
    postgres         DERIVED — a published projection of the instrument subset.
    local            DERIVED — a working copy. Authoring happens here; work does
                     not COUNT until it has been promoted to the record.

### The property that is guarded

Not "the stores must be equal" — the record legitimately runs ahead of every
derived store between a Sunday cron and the next pull. The rule is directional:

> **No derived store may hold a row the corpus of record lacks.**

Behind is stale: ordinary, and fixable by syncing. **Ahead** means a store holds
the only copy of something, and the next sync in either direction destroys it.
The tolerance is stated and it is zero, in that one direction. It is measured
**per table family**, never in aggregate, because the two halves drift
oppositely — on 2026-08-07 the volume was 1,451 events ahead and the laptop 764
instruments ahead, so any total would have shown two stores comfortably close
together with both halves wrong.

## 5. What was built

| | |
|---|---|
| `website/build/lib/corpus_stores.py` | the one definition of which store owns what, and the argument for it. Stdlib only, so the ETL image can import it; emits JSON so the TypeScript guard reads the same map rather than restating it. |
| `migrations/apply.py` | `all` and `--check` modes; the shadowed 025 renumbered to 026; ids recorded with no file behind them reported as `unknown` instead of ignored. |
| `railway_cron.py` | applies migrations as its FIRST step. This is the whole of why the volume was three weeks behind. |
| `publish_corpus_census.py` | records **which store** it read (derived from the environment, not labelled by hand) and that store's migration state. |
| `check_corpus_census.ts` | asks every question of a *named* store. STALE compares against the record; SILENT derives cadence from the record; new **DIVERGED** and **SCHEMA** classes. |
| `reconcile_stores.py` | union-merge between two stores on each table's own identity. Fills NULLs; resolves two-sided conflicts in favour of the family's owner and prints the displaced value. **There is no mode in which it deletes a row.** |
| `pull_db.py` | downloads to a sidecar, compares, and refuses to swap when the local store holds rows the record lacks. Three named choices; no default that loses data. |
| `push_local.py` | delegates its pull instead of carrying a second copy of it, and refuses `--skip-pull` combined with a push. |

DIVERGED and SCHEMA are deliberately inside `check_corpus_census.ts` rather than
in a new checker. It is the same problem one level down and the census is
already the channel; a second mechanism beside it would be a second thing to
keep in sync, which is the defect this repo keeps paying for.
