# Improvement backlog

A ranked queue of improvement work. Take the top unchecked, actionable item.
(The agent/loop names left in older items below are just labels for the *kind*
of work — the custom-agent harness has been retired in favour of native Claude
Code `/` commands.)

Tags: `[buy]` buy-side investor · `[sell]` sell-side/corp-dev · `[startup]`
`[scaleup]` `[incumbent]` company stages · `[data]` coverage · `[analysis]`
finding · `[narrative]` page/copy · `[hygiene]` integrity/docs. Effort: S/M/L.

How an item is written: a one-line outcome + the file(s) + the gate that proves
it done. Vague items are not actionable — the loop will skip and flag them.

## P0 — correctness / credibility (do first)

- [x] `[buy][narrative][S]` Reconcile the two SATR totals shown on /investors
  (€124.8bn outlier-filtered vs €169.5bn register total) with one explanatory
  sentence. **Done** improve/20260615-dryrun iter 2.
- [x] `[hygiene][data][M]` ADEME SATR-FR overlap audit. **Done** (see Done section):
  ~€2.2bn likely duplicate, €4.75bn name upper bound, documented in methodology.
- [x] `[hygiene][data][M]` Physically net the ADEME ↔ SATR-FR overlap. **Done**
  (see Done): migration 009 `is_duplicate` flag + `v_events`/headline exclusion;
  1,429 rows / €2.17bn netted; corpus €269.2B → €267.0B.

## P1 — founder journey (smoke-test findings)

- [x] `[startup][scaleup][incumbent][narrative][S]` Founder hand-off on /investors.
  **Done** (see Done section): in-body banner at the CFO playbook + closing CTA, both
  linking /for-companies and /companies.
- [x] `[startup][scaleup][narrative][M]` Sector + country faceting on the company
  lookup. **Done** (see Done section): country + sector dropdowns browse a new facet
  index; "cleantech in ES" returns 41 companies with no name typed.

## P2 — coverage

- [ ] `[data][L]` **SPRIND Phase B — load + register the Projects portfolio.**
  Phase A is DONE and staged (no DB writes): `ETL/extract/extract_sprind.py` rewritten
  to parse the Nuxt/Strapi payload → 198 ventures in `data/processed/sprind_projects.csv`
  (197 in-scope, source=`sprind_project`, instruments equity/grant, amounts NULL by
  design); SATR-overlap gate measured in `project-mgmt/findings/satr_overlap_sprind.md`
  (46/197 exact SATR-DE matches → matcher must LINK not duplicate; no money
  double-count since amounts NULL). **GATED: do NOT run until the deterministic
  merge pipeline + name mergers are solid** (`plans/deterministic_merge_pipeline.md`,
  see [[project_data_hygiene_merge]]) so ~150 new company rows don't pollute the
  dedup pass — pick this up "later when the data pipelines are more solid". When
  unblocked: `python3 ETL/extract/extract_sprind.py --load-db`, then work the
  add-a-source checklist — reinstall `data/views.sql`, regenerate the coverage
  indicator, run `ETL/transform/classify.py` and `website/build/build_site_data.py`,
  pass post-load QA (`ETL/load/qa/sanity_check.py`), and update
  `project-mgmt/methodology.md` + `decision_log.md`. Gate: QA clean and the new
  source family documented in methodology (the Stop-hook methodology gate);
  the 20 `sprind_challenge` placeholders retained not repurposed.

- [ ] `[data][L]` Identify the highest-tier-lift undocumented source for a Tier-C /
  EU-layer-only country; run the SATR-overlap gate; if it clears, load it following
  the add-a-source checklist (SATR-overlap gate → extractor → loader → views +
  coverage + classify → methodology). Gate: post-load QA clean and the source family
  documented in methodology.

## Done (loop appends here)

<!-- loop moves completed items here with the commit SHA -->
- [x] `[startup][scaleup][narrative][M]` Sector + country faceting on /companies:
  build_company_search.py now emits a facet index (per-country top-200, per-sector
  top-200, overall top-300 by funding) under data/companies/facets/; the client adds
  country + sector dropdowns that browse with no name typed and refine name results.
  "cleantech in ES" returns 41 companies. +10MB shards. `next build` clean, no em-dash.
  improve/20260615-dryrun (manual).
- [x] `[startup][scaleup][incumbent][narrative][S]` Founder hand-off on /investors:
  in-body banner under "For capital advisors and CFOs" + closing CTA box, both linking
  /for-companies (raise playbook) and /companies (lookup). Closes the
  "zero in-body links / bounced at the door" gap. `next build` clean, no em-dash.
  improve/20260615-dryrun (manual).
- [x] `[hygiene][data][M]` ADEME ↔ SATR-FR overlap audit: `ETL/load/qa/ademe_satr_overlap.py`
  measures ~€2.2bn likely duplicate (1,429 rows, name+year±1+amount±15%), €4.75bn
  name-only upper bound; €0.50bn sub-€100k cannot overlap. Documented in
  methodology.md (source line + second-order caveat). FR cross-source sums read net
  of ~€2bn. Physical netting flag queued as follow-up. improve/20260615-dryrun (manual).
- [x] `[buy][narrative][S]` SATR totals reconciled on /investors: intro paragraph
  now bridges EUR 169.5bn register total, EUR 44.7bn outlier exclusion, EUR 124.8bn
  working total. improve/20260615-dryrun, iter 2.
- [x] `[buy][narrative][S]` Air Liquide figure disambiguated on /investors —
  basis labelled "largest single grants" (357m/262m/250m verified top-3 single IF
  awards). improve/20260615-dryrun, iter 1.
