# Loop log

One line per improvement-loop iteration, newest first.

- **2026-06-15 · improve/20260615-dryrun · iter 7 (manual).** Physically netted the
  ADEME↔SATR-FR overlap (the follow-up the iter-3 audit promised). Migration 009 adds
  `is_duplicate` + `dup_reason` columns and refreshes `v_events` to exclude flagged
  rows; `scripts/flag_ademe_satr_duplicates.py` set the flag on 1,429 ADEME rows that
  duplicate SATR-FR (name + year ±1 + amount ±15%); `analysis/run.py` headline KPIs
  net `is_duplicate` alongside `ipcei_linked`. Result: corpus €269.2B → €267.0B,
  events 294,120 → 292,691, both matching the audit. SATR is canonical so the ADEME
  copy is dropped; reversible by clearing the flag. Verified: next build clean,
  freshness fresh, stop-gate silent. Files: scripts/migrations/{009_dedup_flag.sql,
  apply.py}, scripts/flag_ademe_satr_duplicates.py, analysis/{views.sql,run.py},
  docs/methodology.md, site/public/data/*.
- **2026-06-15 · improve/20260615-dryrun · iter 6 (manual).** Classifier audit +
  Phase 1 NACE coverage. User flagged Scaleway (cloud) misclassified as cleantech.
  Audit (`analysis/findings/classifier_audit.md`): 52.9% of companies are classed by
  the weakest mechanism (source default), and 49% of "cleantech" companies are
  cleantech mainly because ADEME funds them. Root cause for Scaleway: its NACE
  ("Rental and leasing of office machinery, equipment and computers") was unmapped, so
  it fell through to `ademe_aid → cleantech`. Phase 1: added 14 high-confidence NACE
  mappings (computing/hosting/rental-of-computers → digital; electrical equipment →
  deeptech; clearly non-tech → other). Isolated dry-run before applying: 3,448 flips,
  3,268 of them previously-unclassified register companies now bucketed, ~134 cleantech/
  life-sci corrected; Scaleway → digital. Applied via classify.py (0 first-time, matches
  dry-run exactly), site data rebuilt. Verified: next build clean, freshness fresh,
  stop-gate silent. Still open: 54,777 unclassified (Phase 1b), ADEME-only cleantech
  default (Phase 2). Files: scripts/classify.py, analysis/findings/classifier_audit.md,
  site/public/data/*.
- **2026-06-15 · improve/20260615-dryrun · iter 5 (manual).**
  P1: sector + country faceting on /companies. `build_company_search.py` now emits a
  facet index (per-country top-200, per-sector top-200, overall top-300, ranked by
  total funding) under `data/companies/facets/`. The client gained country + sector
  dropdowns: with no name typed they browse the facet shard (discovery), and they
  refine name-search results when a name is present. Founder Findability test passes:
  "cleantech in ES" returns 41 companies with no name typed. Records keep the full
  shape so the existing card/modal renders unchanged; +10MB shards, build deterministic
  (only manifest.json changed among existing shards). Verified: `next build` clean,
  freshness fresh, stop-gate silent, no em-dash.
  Files: scripts/build_company_search.py, site/components/investor/company-search.tsx,
  site/app/companies/page.tsx, site/public/data/companies/{manifest.json,facets/}.
- **2026-06-15 · improve/20260615-dryrun · iter 4 (manual).**
  P1: founder hand-off on /investors. Added an in-body banner under "For capital
  advisors and CFOs" and a closing CTA box, both linking /for-companies (the raise
  playbook) and /companies (the lookup). Resolves the founder-lens "zero in-body
  links / bounced at the door" flag. Verified: `next build` clean (all 7 routes
  prerendered, TypeScript passed), no em-dash, stop-gate silent.
  File: site/app/investors/page.tsx.
- **2026-06-15 · improve/20260615-dryrun · iter 3 (manual; nested loop quota-blocked).**
  P0: ADEME ↔ SATR-FR overlap audit. New `scripts/ademe_satr_overlap.py` matches the
  two FR sources on beneficiary name + grant year ±1 + amount ±15%. Result: of ADEME's
  €7.76bn, €0.50bn is sub-€100k (cannot appear in SATR), €7.25bn is overlap-eligible;
  ~€2.2bn (1,429 rows, 29.9% of eligible €) is a likely duplicate, name-only upper
  bound €4.75bn. Spot-check confirmed exact-cent matches (LAST MHYLE, CENERGY, etc.).
  ADEME never appears by granting-authority name in SATR-FR (France reports it under
  the parent ministry), so only value-level matching catches it. Documented in
  methodology.md (source line + new second-order caveat); FR cross-source sums read
  net of ~€2bn. Physical netting flag queued as a follow-up backlog item.
  Gates: numbers reproduced from db.sqlite, stop-gate silent, site data unchanged.
  Files: scripts/ademe_satr_overlap.py, analysis/findings/ademe_satr_overlap.md,
  docs/methodology.md, plans/improvement_backlog.md.
- **2026-06-15 · improve/20260615-dryrun · iter 2.**
  P0: reconcile the two SATR totals on /investors. Added bridging sentence to intro
  paragraph: EUR 169.5bn register total, EUR 44.7bn outlier exclusion (Uniper, SEFE,
  one scheme-level misattribution), EUR 124.8bn working total. All three verified
  from db.sqlite. Investor-lens PASS, founder-lens caught arithmetic rounding
  (fixed: one-decimal precision so 169.5 - 44.7 = 124.8 closes). "Bailouts" replaced
  with "outliers" per investor-lens (honest umbrella for non-bailout exclusion).
  Gates: stat-verifier VERIFIED, freshness fresh, stop-gate silent, no em-dash.
  File: site/app/investors/page.tsx.
- **2026-06-15 · improve/20260615-dryrun · iter 1 (supervised dry run).**
  P0: disambiguate the Air Liquide figure on /investors. The stat-verifier
  sub-agent caught an over-correction in the first draft (the "Air Liquide" brand
  has three IF awards across two legal entities, so "two awards totalling EUR 467m"
  was imprecise); simplified to labelling the basis "largest single grants" — all
  three figures (357m/262m/250m) verified as the genuine top-3 single IF awards.
  Gates: stat-verifier VERIFIED, freshness fresh, stop-gate silent, no em-dash.
  File: site/app/investors/page.tsx.
