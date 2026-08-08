# Workstream BD — landing AS and AL, and the defect that survived being fixed twice

2026-08-08. Branch `wsBD-cloud-truth`. Merges `workstream-as-volume-sync` and
`workstream-al-corpus-of-record` into one line and closes the gaps that only
became visible when they were put together.

Neither predecessor's findings are re-derived here. Read
`workstream_as_one_corpus.md` for the store map and the migration sequence, and
`workstream_al_corpus_of_record.md` for the corpus-of-record argument. This
records what was true when the two met.

---

## 1. The first thing found was that one branch was not pushed

`workstream-as-volume-sync` existed only on this laptop — nine commits, the
volume push, both new guards, the schema-debt register. The brief said both
branches were pushed; one was not, and the agent that wrote it died on a spend
limit before it got there. `workstream-al-corpus-of-record` was two commits ahead
of its remote as well.

Both are now on origin. This is worth stating plainly because the workstream's
whole subject is that work does not count until it reaches a store nobody's
laptop owns, and half of it was sitting in exactly that condition.

---

## 2. The migration collision, four times

Both predecessors independently found that two functions were named
`apply_025`, so Python discarded the first and `025_scheme_end_date_basis.sql`
was unreachable through the runner. Both fixed it by renumbering to 026. They
renumbered **different files**:

| | AL | AS |
|---|---|---|
| moved to 026 | `declared_catchment` | `scheme_end_date_basis` |

And by the time either landed, main had given `026` to the capital_type
migration (`f4f3e75b`), which neither branch could see.

So the fix could not be taken from either branch, and the merges actively
re-created the defect:

1. **Original** — two `def apply_025`; `scheme_end_date_basis` unreachable.
2. **Merging AL** — its rename produced two `def apply_026`, capital_type
   shadowing `declared_catchment`. The merge silently undid the fix it carried.
3. **Merging AS** — the auto-merge renamed `scheme_end_date_basis`'s function to
   `apply_026`, where capital_type's already was.
4. Which also left `apply_025` undefined, so the dict raised `NameError` — the
   only one of the four that announced itself.

Resolved by giving the third migration an id free in every store. Final, and
matching what `schema_migrations` actually records on the live corpus:

    025  scheme_end_date_basis
    026  capital_type            (already stamped 026 on the live store)
    027  declared_catchment

`026` was verified against the store rather than taken from either branch's
reasoning: the local corpus has the `non_financial`/`undetermined` values in
`funding_instruments`' CHECK constraint, so the stamped `026` is capital_type's.
AS's note that `026` was `scheme_end_date_basis` applied out of band was correct
on AS's base and wrong by the time it merged.

### Why it kept happening, and what now stops it

`MIGRATIONS` is a hand-written dict of `"NNN": apply_NNN`. Two functions with
the same name are collapsed by Python **without a word**, and every structure
downstream is then well-formed: the dict has every id, each resolves to a
callable, nothing raises. The failure is a name collision in *source*, and
source is the only place it is still visible by the time anything runs.

`check_migration_ids()` in `apply.py` reads the file's own text for duplicate
`def apply_NNN`, cross-checks against the `.sql` files on disk, and reports gaps
in the sequence. It runs before any store is opened, on every invocation.
Negative-tested on all three shapes; it caught occurrence 3 in the act.

`--ids` is that check alone, opening no store. **CI runs this one.** `--check`
could not: `data/db.sqlite` is gitignored, so in CI it would connect to an empty
database, report every migration pending, fail every build, and be deleted — and
the collision would go back to being invisible. This repo has several checks that
were green while never executing; the point of `--ids` is to not add a fourth.

### And `apply.py all` no longer trusts the stamp

AL's `apply_all` ran only ids absent from `schema_migrations`; AS's ran every
one. AS's is right, and this repo is the proof: it holds stamps that are not
true — DDL applied by hand and stamped afterwards, and ids that moved under
stores which had already recorded them when two workstreams renumbered the same
collision. A store with a stamp and no column skips forever under AL's. Every
`apply_NNN` opens with its own existence test, so running all of them is a
column of skips on a current store and a repair on a lying one.

---

## 3. Two files, each the one definition, opposite answers

The substantive conflict was not textual. In the same week, unable to see each
other, the two workstreams each wrote a single source of truth for who owns the
corpus:

- `ETL/schema/store_of_record.json` (AS) — *"Postgres is the store of record;
  the laptop is a disposable client and the Railway volume is where the weekly
  cron happens to keep its working file."*
- `website/build/lib/corpus_stores.py` (AL) — *"railway-volume OF RECORD;
  postgres DERIVED — a published projection."*

Merging both would have left the repo with two files announcing themselves as
the one definition and disagreeing — the exact duplication this codebase keeps
paying for, arrived at by two agents each trying to remove it.

**Neither is wrong. They answer different questions**, and separating them is
the resolution:

| file | question | answer |
|---|---|---|
| `corpus_stores.py` | among the three stores, which one, if lost, could not be rebuilt? | **railway-volume.** 43 extractors read registers that republish a current file and keep no history; a withdrawn award is gone. |
| `store_of_record.json` | per table, which **engine** holds the authoritative copy, and what is in the way of Postgres? | sqlite for 11, postgres for 7, with a ratchet that may only fall. |

Postgres is the **destination**, not today's answer: `companies` and
`public_funding_events` — 163k and 311k rows, the actual corpus — do not exist
in it at all. Declaring it of record now would be an aspiration the checker then
enforces against code that has not moved.

Both satisfy the instruction that the corpus not live on one desk. The volume
and Postgres are both the cloud; the laptop is a disposable cache under either.

`store_of_record.json` now carries `sqlite_lives_on`, and
`check_store_of_record.py` **reads `corpus_stores.OF_RECORD` and fails if they
disagree**. Negative-tested. A comment saying "keep these in sync" would have
been the bug, not the fix.

---

## 4. A reader that assumed what only a writer creates

`check_corpus_census.ts` could not run at all after the merge:
`column "store" does not exist`. `publish_corpus_census.py` creates `store` and
`schema_state` with `ADD COLUMN IF NOT EXISTS` — so they arrive when the
**writer** next runs, on the weekly cron. Between landing and Sunday, every
machine got a hard failure from the check that exists to see the corpus.

- The reader asks `information_schema` first and degrades to a literal.
- Both columns are declared in `postgres_schema.sql`. The committed-DDL half of
  `check_store_schema.py` immediately reported them as *"created by a committed
  migration and NOT in the store"* — the guard working, unprompted.
- Closed by executing the `SCHEMA` text **committed in
  `publish_corpus_census.py`**, not DDL typed at a prompt. Hand-applied DDL is
  precisely what left this repo with stamps no store can reproduce. Additive and
  idempotent: `corpus_census` held 6 rows before and 6 after.

### Cold start, and a guard that arms itself

Every existing census predates `store`, so all six default to `'unknown'`.
Requiring a census against the corpus of record before the writer has ever run
once asks for evidence that cannot exist yet — and a check that fails for a
reason nobody can act on this week is a check people learn to skip, which is the
failure mode `check_corpus_census.ts` was rewritten to escape.

So while **no** census carries a store label, it is a note. The first weekly run
that records one arms it, and from then on a missing record-census means the
cron is writing somewhere other than where we believe. Nobody has to remember to
re-arm it. The same distinction is applied to `schema_state`: a row that predates
the column had nothing to record, a row that has the column and left it null did
not run the block, and only the second is a finding.

---

## 5. State verified at the moment of acting

Re-read rather than carried over, which is the discipline this whole line of work
exists to enforce.

| | |
|---|---|
| local `funding_instruments` | 1,088 |
| local `companies` | 163,538 |
| local `public_funding_events` | 311,355 |
| `schema_migrations` | 24 applied, 0 pending |
| `corpus_census` rows | 6, unchanged by this workstream |

Identical to AS's reading at 11:04 UTC. **The stores have not moved since AS
acted**, so the union AS proved still holds and no re-merge was needed. Migration
027 was applied to the local store: the column already existed, so it recorded
the stamp and changed nothing.

The volume was deliberately **not** woken. Waking the ETL service for a file
transfer clears the cron schedule — it happened for real — and nothing here
needed the volume's bytes. `verify_cron.py` confirms the schedule from Railway:
`0 3 * * 0` on both the service instance and the latest deployment. AS's
restoration held.

### Guards, run rather than assumed

| guard | result |
|---|---|
| `apply.py --ids` | ok — 24 migrations, every id reachable exactly once |
| `check_store_of_record.py` | ok — every table declared, budget 11, nothing rebuilds a Postgres-owned table from SQLite |
| `check_store_schema.py` (committed DDL) | ok |
| `check_store_schema.py --sqlite --postgres` | ok — no two stores disagree; 17 items in `schema_debt.json` |
| `tsc --noEmit` | clean |
| `check_corpus_census.ts` | DEGRADED + BEHIND |

`check_corpus_census` was run **on main** to establish the baseline: it fails
there with the identical two classes. This branch adds no failure and removes a
crash. Both remaining classes say one thing — no census has been taken over the
merged corpus — and the check's own advice is to let the weekly pipeline record
it rather than force one by hand. Deliberately not forced.

---

## 6. What remains, and it is not a cutover

AS's staged sequence stands and is not restated. Stage 0 is done and this
workstream closes it: one corpus, migrations applied by the pipeline, both
guards wired where they execute, the two definitions reconciled.

**Stage 1 is the next piece of work and it is half a day**: clear
`ETL/schema/schema_debt.json` to zero. 17 items — 14 columns and 3 tables — are
reachable by no committed migration, so `apply.py all` against an empty database
dies at 012 on `companies.parent_group`. Production cannot be rebuilt from
source, and until it can there is no definition of the shape a store should have,
which is why "the volume is behind" was invisible for three weeks.

Stages 2 through 4 are days, not hours, and the ordering matters: a Postgres
migration runner must exist before Postgres can be authoritative for anything,
and the five product tables must move before the events corpus, whose 43
extractors and SQLite-only `data/views.sql` are the bulk of the cost.

**The deploy is the step this project keeps skipping.** `railway_cron.py`,
`apply.py` and `publish_corpus_census.py` all changed here, and the ETL image has
no repo trigger — `verify_cron.py` reported the deployed image was built *before*
the last ETL commit. Migrations that reach main and never reach the image are the
condition this workstream was called to end.
