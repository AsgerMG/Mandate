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
