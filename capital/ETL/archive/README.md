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
