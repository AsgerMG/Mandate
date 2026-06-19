# Improvement backlog

The queue the continuous-improvement loop burns down (see `RALPH.md` and
`docs/agent_architecture.md` §10). **One item per loop iteration.** Items are
ranked; the loop always takes the top unchecked, actionable item.

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

## P2 — coverage (source-scout refills this section)

- [ ] `[data][L]` Promote SPRIND from placeholder to company-level. Today the
  corpus holds only 20 `sprind_challenge` program placeholders (NULL amounts, no
  legal entities) — see `scripts/extract_sprind.py` docstring. Resolve each
  challenge's funded teams to legal entities + grant amounts via Bundesanzeiger
  (Federal Gazette grant decisions) and/or the SPRIND annual-report PDFs, then
  load company-level events. HARD: run the SATR-overlap gate first (SPRIND grants
  may surface in SATR-DE) and run it against the existing `sprind` ndb_distributor
  taxonomy. Gate: load-auditor CLEAN incl. methodology step 8; amounts each
  reproducible from `db.sqlite`; placeholders replaced or reconciled, not
  duplicated.

- [ ] `[data][L]` (source-scout) Identify the highest-tier-lift undocumented
  source for a Tier-C / EU-layer-only country; run the SATR-overlap gate; if it
  clears, load via the ship-a-source skill. Gate: load-auditor CLEAN incl.
  methodology step 8.

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
  /for-companies (raise playbook) and /companies (lookup). Closes the founder-lens
  "zero in-body links / bounced at the door" flag. `next build` clean, no em-dash.
  improve/20260615-dryrun (manual).
- [x] `[hygiene][data][M]` ADEME ↔ SATR-FR overlap audit: `scripts/ademe_satr_overlap.py`
  measures ~€2.2bn likely duplicate (1,429 rows, name+year±1+amount±15%), €4.75bn
  name-only upper bound; €0.50bn sub-€100k cannot overlap. Documented in
  methodology.md (source line + second-order caveat). FR cross-source sums read net
  of ~€2bn. Physical netting flag queued as follow-up. improve/20260615-dryrun (manual).
- [x] `[buy][narrative][S]` SATR totals reconciled on /investors: intro paragraph
  now bridges EUR 169.5bn register total, EUR 44.7bn outlier exclusion, EUR 124.8bn
  working total. improve/20260615-dryrun, iter 2. See plans/loop_log.md.
- [x] `[buy][narrative][S]` Air Liquide figure disambiguated on /investors —
  basis labelled "largest single grants" (357m/262m/250m verified top-3 single IF
  awards). improve/20260615-dryrun, iter 1. See plans/loop_log.md.
