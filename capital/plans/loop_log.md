# Loop log

One line per improvement-loop iteration, newest first.

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
