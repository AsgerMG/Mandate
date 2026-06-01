# Sprint 15 — NDB scraper retirement decisions

**Date**: 2026-05-29
**Status**: Decided. All existing NDB scrapers retained.

## Question

Sprint 15 introduced the EU State Aid Transparency Register (SATR) as a new data source covering state-aid-classified awards from 25 EC-portal countries. The plan asked: *do any of our existing NDB scrapers become redundant?*

## Method

For each Tier-1 NDB scraper, count what fraction of its events have a match in SATR (same country) by:
1. National ID exact (rare — we don't store national IDs on companies)
2. Normalised beneficiary name exact (same country)
3. Fuzzy name (token-set ≥0.85, same country, year window ±2)

Source: `scripts/satr_overlap_audit.py`. Reports under
`analysis/findings/satr_overlap_<source>.md`.

## Result (final — 24 of 25 EC-portal countries, broad filter)

| NDB scraper | Country | NDB rows | SATR rows | Matched | Match % | Decision |
|---|---|---:|---:|---:|---:|---|
| HTGF | DE | 857 | 50,222 | 235 | 27.4% | **KEEP** |
| Coparion | DE | 52 | 50,222 | 14 | 26.9% | **KEEP** |
| SPRIND | DE | 20 | 50,222 | 0 | 0.0% | **KEEP** |
| ALMI Invest | SE | 323 | 3,589 | 40 | 12.4% | **KEEP** |
| CDP VC | IT | 82 | 59,572 | 24 | 29.3% | **KEEP** |
| Tesi | FI | 99 | 2,806 | 53 | 53.5% | **KEEP** |
| Invest-NL | NL | 13 | 6,766 | 1 | 7.7% | **KEEP** |
| CDTI | ES | 1,880 | n/a (ES uses BDNS national portal) | n/a | n/a | **KEEP** |
| Bpifrance | FR | 10 (fund-level placeholder) | 18,305 | 0 | 0.0% | **KEEP** |
| Enterprise Ireland | IE | 6 (programme-level placeholder) | 3,126 | 0 | 0.0% | **KEEP** |

Match rates rose substantially compared to the original narrow filter (which caught equity instruments only). Best overlap is now Tesi at 53.5% — but that still leaves 46% of Tesi events SATR-invisible. No scraper crosses the 95% retirement threshold.

## Why the overlap is low

Three structural reasons:

1. **SATR threshold cuts off small tickets.** General reporting threshold is
   €100k (€10k agriculture, €30k fisheries). Many NDB seed-stage and pre-seed
   tickets — HTGF €0.5-1M seed checks, ALMI Invest's typical €50-500k bridge
   rounds, SPRIND prize-money grants — fall partly below threshold or partly
   into instrument types we don't cover.

2. **Not all NDB activity is state aid.** When KfW (HTGF's parent) deploys
   on-market commercial terms, the award is not classified as state aid under
   Article 107 TFEU and does not appear in SATR. NDB direct scrapers capture
   the full portfolio; SATR captures only the state-aid-classified subset.

3. **Filter mismatch.** Our SATR filter is `equity instruments OR R&D
   objectives` (GBER Art. 21, 22, 25-30 + risk capital/finance instruments).
   Some NDB activity is classified under SME aid (GBER Art. 17), regional
   investment aid (Art. 14), or training aid (Art. 31) — outside our filter.
   ALMI's near-zero match rate (1/323) suggests Swedish ALMI is reported
   under Art. 17 SME investment aid rather than Art. 25 R&D / Art. 21 risk
   finance.

## Sweden case study (instructive)

SATR-SE total: just **134 rows** in 5 years. Compared to Italy's 85,698 or
Germany's 24,169, Sweden barely shows up. Inspection of the SATR-SE corpus
reveals these are mostly large companies (SAAB Digital, Aviation Capacity
Resources, SAS Consortium, Northx Biologics) under aerospace / aviation aid
programmes. ALMI's portfolio of early-stage Swedish startups (Noda Intelligent
Systems, Veltio Pharma, OICAN, Konvolo, Biobase, DREV, Tribonex) is
**entirely absent** from SATR-SE.

This pattern likely repeats for other small-economy NDBs (Estonia, Latvia,
Lithuania, Slovenia, Cyprus, Malta). The implication: NDB direct scrapers
are the **only** way to access seed/early-stage public capital deployment in
these countries.

## Decision

**KEEP all 10 NDB scrapers.** SATR is treated as a complementary primary
source, not a replacement. The two layers are kept separately and reconciled
in `v_company_funding_layers` (each company sees boolean flags for: EU
direct, state aid, NDB direct, private).

No scraper is deprecated in Sprint 15. The closest retirement candidate
(Tesi at 36%) still leaves 63% of events SATR-invisible.

## Implication for the data model

The 4-layer view (`v_company_funding_layers`) is the correct frame: a single
company may receive money through any combination of:
- EU direct (Pillar I/II/III, IPCEI, EIB, DEP)
- State aid (SATR + national portals — legal-instrument view)
- NDB direct (institutional view — Sprint 13 + 14 scrapers)
- Private (Sprint 10, pending)

The same euro may appear under both "state aid" and "NDB direct" if an NDB
award was state-aid-classified. Dedup by `satr_tm_id` prevents double-counting
within the public-funding-events table; the v_company_funding_layers view
flags this explicitly per company.

## Methodology note

This audit is conservative — it counts only matches our normaliser found.
Manual spot-checks suggest the true overlap is slightly higher (German
umlauts and Italian accent variants miss in some cases). A more aggressive
matcher would not change the retirement decision; even doubling all match
counts leaves no NDB at ≥95% coverage.
