# Archived recall sets

Moved here by E2 on 2026-11-06, out of `web/lib/intelligence/`. The answer keys
the product grades on are `__recallSetDescribed.json` (ACTIVE) and
`__recallSetDoors.json` (STAGED), both still beside the code. These five are
the earlier links of the chain that produced them:

    __recallSet.json -> Enriched -> Repaired -> Plus -> Composed -> Doors -> Described

Four are retired for a defect (`RETIRED_RECALL_SETS` in
`web/scripts/recallSet.ts` says which); Composed is not defective, it is the set
every figure published before 2026-08-09 was measured on. None is read by the
site, by a check, or by a pipeline. `loadRecallSet()` still loads one from here
when asked by name (`SET=__recallSetComposed.json`), and still prints the
retirement warning.

Evidence they are unreached: every mention outside `web/scripts/recallSet.ts`
is a comment or docstring (checked across all tracked code, 2026-11-06), except
the ETL tools that BUILT them (`ETL/terms/enrich_recall_set.py`,
`repair_recall_attribution.py`, `extend_recall_set.py`), whose CLI defaults
name them; those tools are run by hand only, by no pipeline.

## Their `manual_artifacts` waivers, as they stood in data/guard_registry.json

They were removed from the registry with the files, because a waiver for an
artifact that is no longer committed beside the code waives nothing.

```json
{
  "__recallSet.json": {
    "waives": [
      "producer",
      "regeneration"
    ],
    "reason": "A PINNED holdout, not a build product. Its whole value is that it does not move: every recall figure this repo has published is a measurement against this exact set, so putting it on `make refresh` would silently re-cut the ground truth under the floors (pool 93 / EXACT@5 22 / REGIME@5 80) and make a run's number incomparable with the run before it. Re-cut deliberately, by a person, with the effect measured and written down. Staleness IS watched: check_recall_floor.ts reports ABSENT pairs -- answers naming an instrument the corpus no longer holds -- on its own line every run, through the one loader scripts/recallSet.ts.",
    "review": "2026-10-31"
  },
  "__recallSetComposed.json": {
    "waives": [
      "producer",
      "regeneration"
    ],
    "reason": "A PINNED holdout, not a build product. Its whole value is that it does not move: every recall figure this repo has published is a measurement against this exact set, so putting it on `make refresh` would silently re-cut the ground truth under the floors (pool 93 / EXACT@5 22 / REGIME@5 80) and make a run's number incomparable with the run before it. Re-cut deliberately, by a person, with the effect measured and written down. Staleness IS watched: check_recall_floor.ts reports ABSENT pairs -- answers naming an instrument the corpus no longer holds -- on its own line every run, through the one loader scripts/recallSet.ts.",
    "review": "2026-10-31"
  },
  "__recallSetEnriched.json": {
    "waives": [
      "regeneration"
    ],
    "reason": "A PINNED holdout, not a build product. Its whole value is that it does not move: every recall figure this repo has published is a measurement against this exact set, so putting it on `make refresh` would silently re-cut the ground truth under the floors (pool 93 / EXACT@5 22 / REGIME@5 80) and make a run's number incomparable with the run before it. Re-cut deliberately, by a person, with the effect measured and written down. Staleness IS watched: check_recall_floor.ts reports ABSENT pairs -- answers naming an instrument the corpus no longer holds -- on its own line every run, through the one loader scripts/recallSet.ts.",
    "review": "2026-10-31"
  },
  "__recallSetPlus.json": {
    "waives": [
      "producer",
      "regeneration"
    ],
    "reason": "A PINNED holdout, not a build product. Its whole value is that it does not move: every recall figure this repo has published is a measurement against this exact set, so putting it on `make refresh` would silently re-cut the ground truth under the floors (pool 93 / EXACT@5 22 / REGIME@5 80) and make a run's number incomparable with the run before it. Re-cut deliberately, by a person, with the effect measured and written down. Staleness IS watched: check_recall_floor.ts reports ABSENT pairs -- answers naming an instrument the corpus no longer holds -- on its own line every run, through the one loader scripts/recallSet.ts. Producer is ETL/terms/extend_recall_set.py, which binds the filename as a CLI default (`--out`) rather than to a written path, so the tie is real but not visible from the source; that is worth fixing when the file is next touched.",
    "review": "2026-10-31"
  },
  "__recallSetRepaired.json": {
    "waives": [
      "regeneration"
    ],
    "reason": "A PINNED holdout, not a build product. Its whole value is that it does not move: every recall figure this repo has published is a measurement against this exact set, so putting it on `make refresh` would silently re-cut the ground truth under the floors (pool 93 / EXACT@5 22 / REGIME@5 80) and make a run's number incomparable with the run before it. Re-cut deliberately, by a person, with the effect measured and written down. Staleness IS watched: check_recall_floor.ts reports ABSENT pairs -- answers naming an instrument the corpus no longer holds -- on its own line every run, through the one loader scripts/recallSet.ts.",
    "review": "2026-10-31"
  }
}
```
