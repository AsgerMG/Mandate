# ETL/archive: records of work done against the retired SQLite store

Until 2026-11-05 the capital corpus lived in two SQLite files (`data/db.sqlite`
and the Railway volume's copy, plus `data/signals.sqlite` for the news layer).
It now lives only in schema `capital` of the Mandate Postgres
(`ETL/lib/store.py`).

Every file here ran against that SQLite store and is kept as the **record** of
what it measured or changed: a workstream measurement (`_ws*`), a probe or proof
of concept, or a one-time backfill/load whose effect is already in the corpus
(and so in Postgres, which was loaded from it row for row). They are not
maintained, they are not ported, and none of them will run as-is: they open
`sqlite3` on a path that no longer holds the corpus.

Do not delete them, and do not run them. If one of them turns out to be needed
again, port it to `store.py` and move it back to where it came from; the path
under `archive/` mirrors the original (`archive/terms/x.py` was `ETL/terms/x.py`;
`archive/website/frontend/scripts/` was `website/frontend/scripts/`).

`ETL/schema/check_store_of_record.py` exempts this directory, and only this
directory, from the rule that nothing under `capital/` may `import sqlite3`.

What is here, by kind:

* Workstream measurements: `terms/_wsay_*`, `_wsbq_*`, `_wsey_*`, `_wshc_*`,
  `_wsih_*`, `_wsit_*`, `website/frontend/scripts/_wsgz_record_families.py`.
* One-time backfills: `events/extract/backfill_bdns_scheme_id.py`,
  `events/transform/backfill_*.py`, `terms/backfill_end_date_basis.py`.
* One-time loads (Sprint 18/19 batches, the EIC Data Hub export, the STEP Seal
  file): `events/load/load_eic.py`, `load_ju_batch.py`, `load_portfolio_batch.py`,
  `reload_ju_org_level.py`, `events/transform/reclassify_equity_class.py`,
  `events/transform/tag_step.py`.
* Probes and proofs of concept from the merge/dedupe design:
  `events/transform/gleif_probe.py`, `analyze_merge_signals.py`,
  `sanity_check_merge.py`, `splink_dedupe.py`.
* The news layer's SQLite schema: `intelligence/load/signals_schema.sql`
  (now `ETL/schema/corpus_schema.sql`, the `signals_*` tables).

## E2 archive, 2026-11-06: ETL/terms workstream one-offs

Moved by E2 (archive and CI). No kept file imports any of them and nothing
invokes them; the filename appears only in prose. Their `sys.path` and file paths still assume `ETL/terms/`: to run one,
`git mv` it back first.
`ETL/terms/_wsgu_corrections.py` stays: `apply_gate_encoding_corrections.py`
tells the operator to run its `--check`.

| script | evidence it is unreached |
|---|---|
| `_wsay_axes.py` | named by no kept file |
| `_wsay_ceilings.py` | named by no kept file; otherwise used only by other archived scripts (_wsaz_bands.py, _wsba_relabel_check.py, _wsba_tech_answerable.py) |
| `_wsay_label_axes.py` | named by no kept file; otherwise used only by other archived scripts (_wsay_ceilings.py, _wsba_relabel_check.py, _wsba_tech_answerable.py) |
| `_wsay_own_gates.py` | named by no kept file |
| `_wsaz_bands.py` | named by no kept file |
| `_wsba_relabel_check.py` | named by no kept file |
| `_wsba_tech_answerable.py` | named by no kept file |
| `_wsce_adjudicate.py` | named by no kept file |
| `_wsig_corrections.py` | named by no kept file |
| `_wsit_arms.py` | named by no kept file |
| `_wsit_content.py` | named by no kept file |
| `_wsiu_source_check.py` | named by no kept file |

## E2 archive, 2026-11-06: the two-store sync tooling

Until 2026-11-05 the corpus had two copies, the laptop's `data/db.sqlite` and
the Railway volume's, and this tooling moved it between them. There is one
store now (PLATFORM.md), so the tooling, its tests and the artefacts that
protected the SQLite copy are archived. What each did, and why it is unreached:

| archived | was | evidence it is unreached |
|---|---|---|
| `events/extract/pull_db.py`, `pull_db_side.py` | download the volume's db.sqlite (overwrite / to a side file) | called only by `make pull-db`/`republish` (targets removed) and by each other |
| `events/extract/push_local.py`, `push_db_verified.py` | upload the laptop corpus to the volume | `make push` / `make push-db` only (removed) |
| `lib/merge_volume_into_local.py`, `lib/diff_stores.py` | union / diff the two stores | `make pull-db` and `schema/consolidate/union_stores.py` only |
| `events/load/reconcile_stores.py`, `promote_to_record.py` | reconcile / promote between stores | imported only by the files above; `promote_to_record` was also the "unlisted replacer" `check_store_of_record.py` failed on |
| `events/load/instrument_ledger.py` | export/verify `corpus-ledger/` | its `checksums` was a CI step (removed) |
| `events/load/corpus_vault.py` | snapshot two SQLite tables with a shrink guard | `make vault` (removed), a CI `selftest` step (removed), and a launchd job that runs the copy in the OLD `~/Wincent` checkout, not this one |
| `events/load/backup.py` | copy db.sqlite + data/ to local and iCloud | `make backup`, now `ETL/lib/backup_postgres.py` |
| `events/load/test_overwrite_guard.py`, `test_overwrite_refusal.py`, `test_promotion_is_inserts_only.py` | tests of the sync's refusals | test archived code only; two were CI steps (removed) |
| `lib/test_wake_rolls_back.py` | test of `railway_service.wake()` | tests archived code only |
| `lib/railway_service_wake_restore.py` | `wake()`, `restore()` and `_instance_status()`, cut from `ETL/lib/railway_service.py` | called only by the sync scripts above; what `verify_cron.py` and `trigger_etl_now.py` use stays in `railway_service.py` |
| `schema/consolidate/` | the one-time SQLite -> Postgres load (`load_into_postgres.py`) and union (`union_stores.py`) | done on 2026-11-05; nothing invokes either. Cited by PLATFORM.md and store.py as the record of the last reconciliation |

Moved alongside, outside ETL: `capital/archive/corpus-ledger/` (see its README).

`store_of_record.json` listed the four transfer scripts under `replacers`; the
block as it stood:

```json
"replacers": {
    "ETL/events/extract/push_db_verified.py": {
      "proves_superset": true,
      "why": "proves the local corpus is a superset of the volume, table by table and key by key, from both files at the moment it runs, and reads the volume back afterwards"
    },
    "ETL/events/extract/pull_db_side.py": {
      "proves_superset": false,
      "why": "downloads to a path the caller names and REFUSES when that path is the local corpus, so it cannot replace a store of record even though it holds the flag"
    },
    "ETL/events/extract/pull_db.py": {
      "proves_superset": false,
      "why": "downloads the volume straight over data/db.sqlite with --overwrite. Correct only while the volume is ahead of the laptop, which is not a property anything checks. Superseded for the pull direction by pull_db_side.py + merge_volume_into_local.py."
    },
    "ETL/events/extract/push_local.py": {
      "proves_superset": false,
      "why": "ends in a bare upload --overwrite of the laptop corpus onto the volume. Superseded by push_db_verified.py, which does the same transfer with the proof in front of it."
    }
  }
}
```

The Makefile targets removed (kept verbatim):

```make
# The broad ETL pipeline (43 funder/registry extractors, classify, sanity)
# runs on a weekly Railway cron against a Railway-resident volume, not locally.
# This brings that corpus down for local interactive work (eligibility research,
# ad-hoc analysis). Run before any session that needs fresh data.
#
# It is a UNION, not an overwrite. It used to be `pull_db.py`, which downloads
# straight over data/db.sqlite -- correct only while the volume is ahead of the
# laptop, which is a property nothing established. On 2026-08-07 it was false in
# the other direction and one `make pull-db` would have replaced 1,088
# instruments with 322, silently and with no undo. So: fetch to a side file the
# local corpus is not, then INSERT OR IGNORE the rows the laptop lacks. Rows the
# laptop already has are left exactly as they are.
#
# `pull_db.py` is still there for the case where you genuinely mean to discard
# local state. Read its header first.
# ── WHY THIS IS SCOPED ─────────────────────────────────────────────────────
# The unscoped merge REFUSES, every time, and correctly: keying on `id` across
# these two stores finds 4 collisions and 188 aliases -- four EU joint
# undertakings whose ids mean a different administering body on each side, and
# 174 eligibility gates that are the same rule under two ids. A blind union
# would silently duplicate the gates and take the SHORTER of the two fund names.
#
# `companies` and `public_funding_events` are the two tables the weekly cron
# actually adds to, and both audit clean: 0 collisions, 0 aliases. So the pull
# takes exactly those, and anything else that diverges is a decision somebody
# has to make with the audit in front of them rather than a transfer.
#
# 2026-08-19: an unscoped `make pull-db` inside a script was read as a fatal
# error and stopped the promotion it was the first step of. The refusal is the
# guard working; scoping it is what makes the target usable.
pull-db:
	python3 ETL/events/extract/pull_db_side.py /tmp/volume-db.sqlite
	python3 ETL/lib/merge_volume_into_local.py /tmp/volume-db.sqlite \
	    --only companies,public_funding_events --write

# The other half of the automation split: everything that can't run on
# Railway (cloud-blocked NETWORK sources + MANUAL sources with a file
# dropped in data/manual_inbox/). Pulls fresh, runs what it can locally,
# classifies + sanity-checks, pushes the result back. See
# ETL/events/extract/push_local.py for exactly what runs and what's excluded.
push:
	python3 ETL/events/extract/push_local.py

# The safe half of `push`, on its own: no sources, no LLM spend, just the
# corpus onto the volume with the superset proof in front of it and a readback
# behind it. This is the one to reach for after local instrument work.
.PHONY: push-db
push-db:
	python3 ETL/events/extract/push_db_verified.py --write
```
