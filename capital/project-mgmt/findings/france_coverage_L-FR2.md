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

## 6. Continuing France: the product was publishing 6 dead ADEME calls

**All 75 ADEME leaves carry a NULL `scheme_end_date`** — there is no SATR
`caseMeasureEndDate` for them, precisely the hole `lifetime_facts()` documents
for Spain's BDNS. So all 75 read as live and all 75 were published.

The TEE catalogue carries `date_cloture`, and the fetcher already computed it —
into `status`, which the loader rightly stopped trusting after Italy (there it
described a CALL window and withheld text from 40 live schemes). So the one
field that could have caught this was being computed and thrown away.

Fixed in `fetch_tee_catalogue.py`: `date_cloture` is now emitted as
`scheme_end_date`, a LIFETIME FACT, giving the corpus's own liveness test
something to test. Written through COALESCE, so anything already measured
outranks the catalogue. Backfilled deterministically from the CSV already on
disk — no model spend.

Result: **6 leaves that closed on 2024-07-09 and 2025-06-09 are no longer
published.** Verified in both stores. FR publishable 110 -> 104.

This RAISES the measured class (7.7 -> 8.0) because the rows removed were
covered ones. It is still the right move and the number is the honest one: a
French founder was being shown six ADEME calls that shut one and two years ago.

## 7. The remaining 26 ADEME leaves have no reachable source. Reporting and stopping.

Simulated before fetching anything, on publishable FR (n=104, 99 multi-leaf):

| | class | uniquely identified |
|---|---|---|
| now | 8.01 | 46% |
| perfect text on all 37 uncovered | **1.32** | 77% |
| perfect text on the 6 satr_fr_rnd gaps only | 7.61 | 48% |

So the prize is entirely the ADEME remainder, and `satr_fr_rnd` is worth **0.11
of a sibling** — the previous agent's finding reproduced against the new
baseline. **Do not fetch French SATR text.** Sources checked:

- **ADEME's own portal** — re-verified independently, not taken on trust:
  `agirpourlatransition.ademe.fr` **403** on both content and `sitemap.xml`,
  `www.ademe.fr/sitemap.xml` **521**. Cloudflare. Skipped per the standing rule,
  not impersonated past.
- **`data.ademe.fr`** (open data-fair instance, NOT blocked) — 931 datasets
  enumerated. All awards, projects or environmental statistics. Searched
  `dispositif` / `appel a projets` / `eligibilite` / `aides`: the only aid
  datasets are `Les aides financières de l'ADEME` and the research-project
  tables, which are **transactions, not rules**. This is the same award data our
  ADEME leaves are already derived from. No eligibility catalogue exists here.
- **`aides-territoires.beta.gouv.fr`** — **401, JWT required.** A credential we
  do not hold, not a block to work around. Registerable by a human; recorded as
  the one untried lead.
- **TEE catalogue, re-examined on disk** — the 26 are genuinely absent, not
  mismatched. `AVELO`, `ORPLAST`, `TEXHABI`, `sylviculture` return **0 hits
  across all 223 rows**, title and description. The previous agent's "no
  catalogue candidate shares any distinctive term" was accurate; there is
  nothing here a better matcher would recover.

**A source that yields boilerplate is a finding; so is a source that does not
exist.** France is finished at the coverage its accessible sources support.

Worth stating plainly: even if a source were found, several of the 26 are call
ROUNDS of one programme (`AVELO 2`, `AVELO 2.2`, `AVELO 3 1er relevé`,
`AVELO 3 2nd relevé`). A per-programme source would hand all four the same text
and move their class by exactly zero. The honest ceiling for France is below the
1.32 simulation.

## 8. Where France stands, out of Postgres

| | before this workstream | now |
|---|---|---|
| FR coverage, all (n=133) | 24 (18%) | **73 (55%)** |
| FR coverage, publishable | 24/110 (22%) | **67/104 (64%)** |
| FR class, publishable | 54.0 | **8.01** |
| uniquely identified, publishable | ~11% | **46%** |
| dead ADEME calls published | 6 | **0** |

Global scoreboard confirms FR 73/133 and IT unchanged at 47/88.
Remaining French headroom is 8.01 -> ~1.3, and it is **source-blocked, not
effort-blocked**.

## 9. The new guard immediately found 10 more invisible rows — in other countries

Running the reconciliation across the whole corpus, not just France:

```
rows with eligibility_text in SQLite but NOT in Postgres:
  NL 7, FI 1, DE 1, AT 1
```

**Ten rows of fetched, loaded, reported-as-done work that the product has never
seen.** France was not a one-off; it was the largest instance of a pattern that
was already running.

I have NOT published them. They belong to other workstreams, and publishing
another agent's rows unasked is the exact failure `publish_scheme_text_scoped.py`
was written to prevent. Each owner needs one command:

```
python3 ETL/terms/publish_scheme_text_scoped.py --country NL --country FI
```

The guard now makes this impossible to miss: any `--write` run scoped to those
countries fails with the fix printed.
