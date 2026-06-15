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

- [ ] `[buy][narrative][S]` Reconcile the two SATR totals shown on /investors
  (€124.8bn outlier-filtered vs €169.5bn register total) with one explanatory
  sentence. Files: site/app/investors/. Gate: stat-verifier confirms both and the
  bridge (€169.5bn − ~€45bn rescues = €124.8bn).
- [ ] `[hygiene][data][M]` ADEME SATR-FR overlap audit: measure duplication
  between `ademe_aid` and SATR-FR; document the overlap and whether FR sums need
  de-duplication. Files: scripts/satr_overlap_audit.py (extend), docs/methodology.md.
  Gate: load-auditor clean; methodology updated.

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
- [x] `[buy][narrative][S]` Air Liquide figure disambiguated on /investors —
  basis labelled "largest single grants" (357m/262m/250m verified top-3 single IF
  awards). improve/20260615-dryrun, iter 1. See plans/loop_log.md.
