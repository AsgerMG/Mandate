---
name: ship-a-source
description: The full, ordered checklist for adding a new public-funding data source to the corpus — from SATR-overlap gate through extraction, loading, registration, audit, and the mandatory methodology update. Use whenever loading a new data source so no registration step is dropped.
---

# Ship a source

Adding a source is not done when the rows land — it is done when the source is
**fully registered and documented**. Follow these steps in order. Do not skip the
methodology gate (step 8); `load-auditor` will fail the load without it.

## 0. Pre-flight: SATR-overlap gate (HARD RULE)
Before writing any extractor, measure or estimate overlap with the EU State Aid
Transparency Register and existing loads. Known collisions are pre-recorded
(Vinnova, Business Finland, BDNS⊃CDTI). If the source largely duplicates SATR,
stop — or scope to the non-overlapping slice (e.g. de minimis below the €100k
SATR floor). Consider invoking `source-scout` first to confirm the gap is real
and the source is in scope (direct-funding, Option A).

## 1. Extract
Write `ETL/extract/extract_<source>.py` following the existing extractor pattern.
Canonicalise every country through
`scripts/europe_scope.canonicalise_country()` — never write a raw country code.

## 2. Load
Load to `db.sqlite`. Confirm the `BEFORE INSERT` europe-scope trigger passes (no
out-of-scope rows rejected unexpectedly). Record before/after counts.

## 3. Register in views
Add the source to `analysis/views.sql` so it appears in `v_events` and any
relevant layer views. Reinstall views.

## 4. Coverage indicator
Run `python3 scripts/gen_coverage_indicator.py` and confirm the new source moves
the right country/instrument tier in `data/processed/coverage_indicator.json`.

## 5. Classification
Extend `ETL/transform/classify.py` if the source introduces new sector/instrument
vocab. Confirm no silent fall-through to "unknown".

## 6. Rebuild site data
Run `python3 scripts/build_site_data.py` (regenerates all `GENERATED` JSON) and
then `--check` to confirm freshness.

## 7. Audit
Invoke the `load-auditor` agent. Resolve every ISSUES item before proceeding.

## 8. Methodology gate (MANDATORY — cannot skip)
Update **`docs/methodology.md`**:
- a "Source coverage" entry for the new source;
- its **amount basis** declared in the limitations tiers (commitment / ceiling /
  disbursement / aid element) — this prevents illegal cross-family sums later;
- any new caveat in the correct limitations tier.
Add a dated entry to **`docs/decision_log.md`**, and a one-line pointer in the
memory index (`MEMORY.md`).

`load-auditor` treats a `source` present in `db.sqlite` with no `methodology.md`
mention as **LOAD INCOMPLETE**. The load is not done until this step is.

## 9. Done
Counts updated, views/coverage/classify/methodology all reflect the source,
audit clean. Now it can feed findings and pages.
