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
- [ ] `[hygiene][data][M]` Physically net the ADEME ↔ SATR-FR overlap: add an
  `ademe_satr_dup` flag (mirroring `ipcei_linked`) on the ~1,429 likely-duplicate
  ADEME rows so corpus and FR totals can exclude it at query/build time. Files:
  migration, scripts/build_*.py. Gate: corpus total drops ~€2bn; load-auditor clean.

## P1 — founder journey (smoke-test findings)

- [ ] `[startup][scaleup][incumbent][narrative][S]` Add a founder hand-off on
  /investors → /for-companies and /companies (in-body banner + closing CTA);
  today there are zero in-body links. Files: site/app/investors/. Gate:
  founder-lens no longer flags "bounced at the door".
- [ ] `[startup][scaleup][narrative][M]` Add sector + country faceting to the
  company lookup (data already carries `r.s`/`r.c`); enables discovery, not just
  name search. Files: site/components/.../company-search.tsx. Gate: founder-lens
  Findability test passes for "who funds cleantech seed in ES?".

## P2 — coverage (source-scout refills this section)

- [ ] `[data][L]` (source-scout) Identify the highest-tier-lift undocumented
  source for a Tier-C / EU-layer-only country; run the SATR-overlap gate; if it
  clears, load via the ship-a-source skill. Gate: load-auditor CLEAN incl.
  methodology step 8.

## Done (loop appends here)

<!-- loop moves completed items here with the commit SHA -->
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
