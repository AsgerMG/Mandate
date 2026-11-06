# E2 data fixes (2026-11-06): prepared, NOT applied

Founder-facing data defects that founder-tier CI checks flag. Each is a write
to the production corpus, so none has been run. `prepare.py` reads the corpus
through the read-only role and regenerates the two files below.

| file | what |
|---|---|
| `dry_run_diff.txt` | every row touched: before -> after, and whether it is still in the state the fix was written for (all MATCH as of 2026-11-06) |
| `fixes.sql` | 10 guarded UPDATEs in one transaction ending in `ROLLBACK` |

| # | check it turns green | rows | change |
|---|---|---|---|
| 1 | `check_body_named_rows` | 3 of 4 | name -> the funder's own product name (`Lavrisikolån`, `Risikolån`, `Concours d'innovation i-Nov`), `name_source='curated'`, old name kept in `name_basis`. The i-Nov page 403s to automated reads: confirm the title by eye. `bpifrance_innovup_leader_idf` is NOT fixed: its source page no longer names it (owner decision) |
| 2 | `check_field_matches_demand` | 4 | Chips JU KDT national-partner rules quarantined (`intake_field_resolved='none'`, `value_spec=NULL`), the way `reference/gate_encoding_overrides.json` does it; old spec kept in `verify_note` |
| 3 | `check_country_gates` | 1 | `eit_digital_vap/g1_vip_location`: drop `Turkey` (outside the intake canon, so it matches no answer); old spec kept in `verify_note` |
| 4 | `check_applicant_identity` | 2 | `eligibility_text` reordered so the submitter leads, with a population label; same words, no new claims |

To apply (owner): read `dry_run_diff.txt`, change the last line of `fixes.sql`
to `COMMIT`, run it as `capital_app`, then make it durable so a rebuild does
not undo it: add #1 to `reference/programme_names.json`, #2 to
`reference/gate_encoding_overrides.json`, #4 to
`reference/applicant_identity_repairs.json` (`action: replace`). Then
`make data` (snapshot) and re-run the guards that publish verdicts.
