# Workstream Q — merging `workstream-l-es2` into `main`

Both branches carried hard-won correctness work in the same four files. The
merge was resolved region by region against the MERGE BASE, not by picking a
side, because "take theirs" and "take ours" would each have silently dropped a
guard that a specific defect had already been paid for once.

Merge base `d9fed89`. Result committed on `workstream-q-merge`.

## The method that made this decidable

For the dangerous file the useful question was not "which side looks newer" but
**"what does each side ADD to the base"**. Diffing `base->main` and `base->es2`
separately turns an argument into arithmetic: anything present in one derived
version and absent from the other is either an addition to keep or a
superseded line to drop, and which one it is is visible from the base.

## Conflict register

| Region | Winner | Why |
|---|---|---|
| `load_scheme_text.py` (4 regions) | **main, wholesale — proven safe** | See below. es2 contributes nothing unique to this file. |
| `publish_scheme_text_scoped.py` COLUMNS | **es2** | Adds `scheme_end_date`. Pure addition; main's side of the conflict was empty. |
| `fetch_tee_catalogue.py` rec.update | **main** | Adds `scheme_end_date` from `date_cloture`. The same pure addition, inverted; es2's side was empty. |
| `CONTINUE_HERE.md` header | **main + new material** | main's block is the newer rewrite and restates es2's in corrected form. Neither recorded Spain's own result, so section 5b was written to carry it. |

### Why `load_scheme_text.py` could be taken wholesale

This is the file the brief flagged as dangerous, and it is the one where taking
a side was actually correct — but only because it was checked rather than
assumed. The three-way diff shows es2 has exactly **11 lines main lacks**, and
every one of them is the OLDER behaviour that L-FR2 deliberately replaced:

- `text = rec.get("eligibility_text") or rec.get("description")` — the
  `has_text()` defect itself, the 86-record hole.
- `print("no DATABASE_URL ...; skipped the Postgres mirror"); return` — the
  printed shrug main replaced with a hard `SystemExit`.
- `if args.postgres and (updates or life)` — the opt-in mirror main replaced
  with publish-by-default.
- Two usage/help lines describing the opt-in flag.

main's version already contains every Spanish contribution to this file
(`lifetime_facts()`, `live_ids()`, `mirror_to_postgres()`, the two-pass
structure, `--country`) in identical text. **Nothing was dropped.**
`--postgres` is still accepted as a no-op, so es2-era invocations still work.

## Both lists, verified present

Checked mechanically on the merged tree, not by reading:

From **main / L-FR2** — publishing is the DEFAULT with `--sqlite-only` opting
out loudly; missing `DATABASE_URL` is a hard exit; `reconcile()` present and
exiting 1; `has_text()` no longer accepts `description`, with
`has_description_only()` reporting those records separately.

From **es2** — `scheme_end_date` in the publisher's `COLUMNS`;
`retract_unasserted_text.py`; `sa_number` read off fetch records in
`fetch_state_aid_cases.py`; only a PAST measure end date written in
`fetch_bdns_convocatorias.py`; `measure_sibling_by_country.ts` reusing the real
`publishableInstruments()`.

## Verification

1. `python3 -m compileall ETL/terms/` — clean.
2. `NO_PG=1 npm run check` — every check green EXCEPT `check_recall_floor`,
   which **fails identically on unmerged `main`** (pool 75% vs floor 90%,
   exact5 19% vs floor 20%, same numbers to the point). Pre-existing, and this
   merge touches no ranking code. See the note to workstream P below.
3. **`reconcile()` fires.** Blanked `eligibility_text` on two LV rows in
   Postgres that carry it in SQLite, then ran `--country LV --write`. LV is a
   no-op load (0 loadable, 7 already loaded) — i.e. exactly the France case a
   defaulted flag cannot catch. Result: `!! OUT OF SYNC: 2 of 20 rows`, the fix
   command printed with the offending ids, **exit 1**. Restored; the same
   command now prints `in sync: 20 rows` and exits 0.
4. **`scheme_end_date` publishes.** Blanked it on two LV rows in Postgres that
   hold it in SQLite, ran `publish_scheme_text_scoped.py --country LV`, both
   came back (`2025-12-30`, `2028-01-30`). Without es2's line in `COLUMNS` the
   publisher would have left them NULL — this is a direct test of the guard,
   not of the script in general.
5. **Coverage did not move**, which is the correct outcome for a merge:

   ```
                                    before      after
   ALL THREE J OMITTED mean class      3.9        3.9
   uniquely identified                 53%        53%
   CEILING @5                          82%        82%
   ceiling @1                          53%        53%
   ```

   The only difference is four ADDED facet lines (`catchment_*`), described
   below.

## Two things the next agent should know

**The L-REGION catchment lines came back.** `main` HEAD (`a2f1850`) removed the
`catchment_region` / `catchment_regions` / `catchment_source` lines from
`measure_sibling_coverage.ts` and `migrate_to_postgres.py`, explicitly because
they were "another agent's unlanded work" that arrived through a pull — a
statement about branch hygiene, not about correctness. `workstream-l-es2`
carries that work legitimately (it holds migration `025_declared_catchment.sql`
and `encode_declared_catchment.py`), so the merge re-introduces it. Checked
before keeping: **all three columns already exist in Postgres**, the merged
script runs, and the lines are measurement facets only — they change no
liveness or ranking semantics. They report `GEOGRAPHY + eligibility_text` at
mean class 3.7 / 58% uniquely identified, slightly better than the 3.9 / 53%
baseline.

**`load_scheme_text.py` is MONOTONIC and that is not fixed.** It skips ids that
already carry text, so a register that WITHDRAWS a claim can never be honoured
by re-running the loader. `retract_unasserted_text.py` is the answer and it is
now on main, but it is a separate script somebody has to remember to run. This
is the same shape of defect as the France one: the cheapest command to type
does not do the whole job.

## For workstream P (liveness rewrite)

P is rewriting the liveness rule after finding 290 instruments marked closed
from CALL windows, 163 of which awarded money after their supposed end date.
Nothing here changes liveness semantics. But everything here **writes the
column P is about to reinterpret**, so P and this work meet on
`scheme_end_date`:

- `load_scheme_text.py::lifetime_facts()` writes it from fetch records, through
  `COALESCE`, so anything already measured outranks it.
- `fetch_bdns_convocatorias.py` writes it from `fechaFinSolicitud`, and where
  BDNS refuses to date a call, from the authorising measure's end date — **only
  when that date is PAST**. The asymmetry is deliberate and P should preserve
  it: a measure that ended proves the call ended; a measure still running
  proves nothing about a call. Where the measure is still open the call stays
  undated and its text stays withheld.
- `fetch_tee_catalogue.py` writes it from the TEE catalogue's `date_cloture`.
- `publish_scheme_text_scoped.py` now PUBLISHES it, so these values reach the
  live read path where they did not before.
- `load_scheme_text.py::live_ids()` is a Python MIRROR of
  `publishableInstruments()`. **If P changes the TypeScript liveness rule,
  `live_ids()` diverges silently** — it is the cross-language duplicate this
  project has been burned by before, and it gates which rows get text at all.

Also for P: `measure_sibling_by_country.ts` reports **635 publishable** of
1,014, against the 721 stated in `CONTINUE_HERE.md`. If P's rewrite reopens
wrongly-closed instruments, both that number and the pool floor above should
move — the `check_recall_floor` pool failure (75% against a 90% floor) is
plausibly downstream of exactly the defect P is fixing, since a wrongly-closed
instrument is dropped from the candidate pool before ranking ever sees it.
Worth confirming rather than assuming: it would mean P's fix has a green build
waiting on the other side of it.
