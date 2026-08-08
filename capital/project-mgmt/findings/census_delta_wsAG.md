# Workstream AG — the two census figures nobody could explain

Status: IN PROGRESS

## The reported deltas (census #3 -> #4, 2026-08-07)

```
events      297,933 -> 299,384    +1,451
capital      EUR 352.9B -> 408.4B  +EUR 55.6B
champions      9,365 ->   9,371        +6
companies    151,426 -> 150,868      -558
```

## First finding: these are not a time series

Read straight out of the `corpus_census` table in Railway Postgres:

| # | taken_at (UTC) | produced_by | run_outcome |
|---|---|---|---|
| 1 | 2026-08-07 16:08 | `local` | unknown |
| 2 | 2026-08-07 16:26 | `local` | ok |
| 3 | 2026-08-07 16:52 | `image-equivalent` | ok |
| 4 | 2026-08-07 17:51 | `etl-pipeline` | **failed at refresh_open_calls.py (rc=1)** |

Censuses #1, #2 and #3 carry byte-identical `kpis`. Recomputing
`corpus_kpis.compute_kpis()` against the local `data/db.sqlite` reproduces them
exactly. So #3 is a reading of the LOCAL store, taken on this laptop.
#4 is the only reading of the Railway VOLUME store.

The delta is therefore not "what the week's ETL did". It is the divergence
between two different databases.

WIP — decomposition to follow.
