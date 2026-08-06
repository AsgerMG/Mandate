# L-FR2 — France coverage: recovery and continuation

Written as findings land, not at report time. Branch `workstream-l-fr2` off
`workstream-l-france`.

## 1. The lost commit was never lost. The DATABASE WRITE was.

`f4d840f` "France: ADEME's 76 leaves get per-programme eligibility" is present
on `workstream-l-france` and its code is intact. What did not happen is
publication. Measured at the start of this workstream:

| store | FR instruments | with `eligibility_text` |
|---|---|---|
| SQLite `data/db.sqlite` | 133 | **73** |
| Postgres (what the product reads) | 133 | **24** |

Broken down by scheme, the entire gap is one regime — ADEME, which carries an
empty-string `scheme_code`:

| scheme_code | leaves | SQLite w/ text | Postgres w/ text |
|---|---|---|---|
| `''` (ademe_aid) | 75 | 49 | **0** |
| SA.111723 | 14 | 13 | 13 |
| SA.111728 | 6 | 5 | 5 |
| SA.111726 | 4 | 4 | 4 |

The non-ADEME French rows were in sync. Only the rows `f4d840f` wrote were
missing. **The work was on disk the whole time, in the store nothing reads.**

Cause, exactly as flagged: `load_scheme_text.py` writes SQLite; the product,
`measure_sibling_coverage.ts` and every consumer read Postgres; `--postgres` is
opt-in and nothing fails when it is omitted.

## 2. Distinctness verified BEFORE publishing (the standing rule)

Over the 49 ADEME leaves carrying text in SQLite:

- **33 distinct texts** over 49 leaves
- most-shared text appears on **3** leaves (not 49 — so not regime boilerplate)
- mean length 746 chars
- `eligibility_source_url` / `eligibility_confidence` / `eligibility_fetched_at`
  populated on **49/49**, zero nulls

This is per-programme text. It passes the test that the ADEME fetch was most at
risk of failing.

## 3. Landed. Every number below came back out of Postgres.

Published with `publish_scheme_text_scoped.py --country FR` (scoped by country,
idempotent, never deletes) — not `migrate_to_postgres.py`, whose full
truncate-reinsert would have carried four other live agents' half-finished
SQLite rows into the product's read path.

`npx tsx website/frontend/scripts/measure_sibling_coverage.ts`, after:

```
eligibility_text over 40 chars: 318 of 1014 instruments
  FR    73/ 133  55%        <- was 24/133 18%
  IT    47/  88  53%        <- unchanged, as required
```

Per-country class, both populations (`scripts/measure_country_class.ts FR`,
added by this workstream — the existing scoreboard prints one global mean and
no country can see its own number in it):

| population | n | with text | multi-leaf | class body-only | class all-facets |
|---|---|---|---|---|---|
| FR all | 133 | 73 (55%) | 128 | 46.3 | **45.4 -> 7.4** |
| FR **publishable** | 110 | 73 (66%) | 105 | 54.3 | **54.0 -> 7.7** |

The before column is the pre-publish Postgres state replayed by blanking the
ADEME text, same code path as the after column.

`f4d840f`'s claim of 45.4 -> 7.4 is **confirmed**. It was true of SQLite the
whole time; it had simply never been true of the store the product reads.

Publishable count measured here is **739**, not the 721 in CONTINUE_HERE —
the predicate is date-dependent (rows close as dates pass) so the population
moves. Stated beside every number rather than pinned.

France is programme-fragmented exactly as briefed: `administering_body` alone
leaves a publishable French founder choosing between **54.3** siblings. Text is
the only lever, and it took the class to 7.7.

## 4. The fix: reconciliation, not a better-defaulted flag

Asked to either write both stores or fail loudly. I did both, because the flag
alone would not have prevented this incident.

**Publishing is now the default.** `--postgres` is accepted and ignored;
staging needs `--sqlite-only`, which ends by saying in as many words that
nothing a founder can see has changed. A missing `DATABASE_URL` was a printed
shrug that let the run exit 0; it is now a hard exit.

**But a defaulted flag still would not have saved France.** `mirror_to_postgres`
only pushes rows THIS RUN wrote. France's 49 leaves were already in SQLite, so
every later run — flag or no flag — classified them as "already loaded", mirrored
nothing, and exited 0. Three ways text ends up SQLite-only survive a defaulted
flag: an earlier sqlite-only run, a column written by a different script, and a
half-failed mirror.

So every `--write` run now ends by **reconciling the countries in scope**: any
row with `eligibility_text` in SQLite and not in Postgres fails the run, exit 1,
printing the exact fix. The question asked is not "did I remember to publish"
but "do the two stores now agree" — which has the same answer however the
divergence arose, and is asked against the live databases rather than against
the process's memory of what it did.

Tested by injecting the exact France failure — three FR rows blanked in Postgres
only, then a load that had nothing to write:

```
loaded 0 rows
!! OUT OF SYNC: 3 of 73 rows in FR carry eligibility_text in SQLite but NOT in Postgres.
   Fix: python3 ETL/terms/publish_scheme_text_scoped.py --country FR
EXIT=1
```

Running the advertised fix restored sync and the loader returned to exit 0.
**This is deliberately not a CI check** — it reads `data/db.sqlite` and a
DATABASE_URL secret, and no CI step may depend on gitignored data.

## 5. Second silent-loss bug, same family, found while testing the first

`has_text()` accepted a record whose prose sat in `description` when
`eligibility_text` was empty — but only `eligibility_text` is ever written to
the coverage column. Such a record passed the gate, was counted in "loaded N
rows", and left the coverage column NULL.

**86 records corpus-wide do this: FR 24, ES 17, IT 13, DE 12, BE 13**, plus
PL/HU/IE/SK. Every one was a load that reported work it had not done. I hit it
directly: my first `--write` said "loaded 4 rows" and FR coverage did not move,
because all four had prose only in `description`.

The gate now matches the write, and description-only records are counted and
reported under their own heading. **They are not promoted into
`eligibility_text`** — they are one-line statements of what a scheme IS
("Complément de rémunération pour l'éolien terrestre"), not of who may apply,
and filling the coverage column with them would manufacture coverage a founder
cannot use. That is the same boilerplate failure this workstream exists to avoid,
arriving through a different door.

Also cleaned: **23 FR rows carried `eligibility_confidence` with no text at all**
from earlier description-only loads. Provenance is meant to be honest, so
confidence and fetched_at were cleared on those rows in both stores.
