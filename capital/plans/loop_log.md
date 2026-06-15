# Loop log

One line per improvement-loop iteration, newest first.

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
