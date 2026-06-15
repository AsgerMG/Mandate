# Decision log

Running record of analytical, editorial and data decisions, newest first. Each entry: the
decision, why, and where it is implemented. Methodology mechanics live in `methodology.md`;
this file records the *choices*.

## 2026-06-12 · Investor brief and amount recovery

**D-20. /for-companies is the mirror of /investors, not a copy.** Same evidence base, same
house rules (findings stated, sourced claims, single-basis euros, no em-dashes), but the
founder/CFO point of view: ticket menu as a product catalogue, country machines as doors, the
momentum law as "start small, start now", a stage-sequenced raise playbook (pre-seed to exit),
and the policy shifts read as openings and traps. No new data pipeline: it reuses
investor_insights.json so the two pages can never drift apart numerically.

**D-17. IPCEI double counting is netted via `ipcei_linked`, keeping the approved ceiling.** The
same IPCEI aid exists twice in the corpus: as a Commission-approved ceiling on the `ipcei_*`
event (EUR 30.0bn) and as granted SATR/SUDOP tranches (344 rows, EUR 17.4bn). All tranche rows
are now flagged `ipcei_linked = 1` (netting pass in `backfill_ipcei_amounts_from_satr.py`,
title-matched, idempotent), and flagged amounts are excluded from the home-page headline total
(`analysis/run.py`) and from per-company indicative totals (`v_company_breadth`). Within-basis
analyses keep both views deliberately: the SATR rotation chart shows granted tranches, the IPCEI
family shows approved ceilings, and they are never summed together (D-05). Award *counts* still
include both rows; they are distinct administrative events.

**D-18. STEP seal shown as a certification chip in the company lookup.** `companies.step_flagged`
(Sprint 8 tagging) surfaces as a "STEP seal" badge.

**D-19. Two further seals are derived, not sourced.** The EIC/Horizon Seal of Excellence is
never published as a holder list, but several national schemes exclusively fund SoE holders
(Spain's CDTI "Sello de Excelencia" resolutions and BDNS direct-award lines, Slovakia's
recovery-plan SoE scheme, Bpifrance): any company paid under them provably holds the seal
(~80 companies, title-pattern derivation in `build_company_search.py`). IPCEI participation is
shown as a chip in its own right because the label has legal consequences (state-aid
obligations that follow the company into M&A). Chips assert only what an official funding
record proves; no third-party badge data.

**D-16. Findings must be data-native and stated, never left to the reader.** Every section of
`/investors` opens with a bold, quotable conclusion (the `Finding` component); charts are
evidence, not the message. Corpus-native headline stats (momentum law, Bosch harvesting, Future
Fund mortality, EIC speed) are computed in `build_investor_insights.py:build_stats`, not
hardcoded.

**D-15. The momentum law is a screening claim, not a causal claim.** P(next award | n awards)
rises 28.5% → 40.7% → 60.2% → 79.3%. We say explicitly that persistent company quality drives
most of it; for sourcing purposes causality is irrelevant. Causal language is reserved for the
cited RDD/SBIR literature (Howell 2017; Santoleri et al.).

**D-14. Every forward-looking statement carries a numbered source.** Policy claims (MFF EUR
409bn/131bn, SAFE EUR 150bn, CISAF, German EUR 500bn fund, Bpifrance Défense, TechEU) link to
the primary document. No unsourced speculation in Part II.

**D-13. Defence numbers are kept in three explicit buckets** so readers cannot conflate them:
EDF R&D grants (~EUR 1bn/yr, in our registers, matches official EUR 7.953bn budget), SAFE
(EUR 150bn loans to governments, structurally invisible to company registers), MFF 2028-34
envelope (EUR 131bn, fivefold). The register lag *is* the investment thesis.

**D-12. Energy-crisis rescues are excluded from all aid analytics.** Uniper (EUR 34.5bn) and
SEFE (EUR 6.3bn) recapitalisations plus one scheme-level renewables total (EUR 3bn booked to
Vercelli S.p.A.) are filtered via `SATR_OUTLIER_SQL`. A bailout is not industrial strategy.
Rows stay in the DB for traceability.

**D-11. Cleantech rotation is reported on both axes.** Counts rotate away from cleantech
(47% → 35%), euros do not (2024 peak EUR 13bn). Both are published side by side because they
describe different company types; choosing one would mislead.

**D-10. Amount-completeness doctrine: NULL means "not publicly recoverable", never "we did not
look".** Known zeros are stored as 0 (Horizon associatedPartner, unfunded JU associated-country
partners). Every remaining NULL block has a documented reason and recovery route
(methodology.md, "Amount-completeness doctrine").

**D-09. Redacted IPCEI amounts are backfilled from granted-aid trails, never estimated.**
SATR/TAM tranches under the IPCEI measure (explicit human-reviewed name mapping, basis
`ipcei_satr_granted` = lower bound; source rows flagged `ipcei_linked`). The SUDOP API serves
the same role for Poland. Cross-checks: SAP EUR 329.6m vs official EUR 325m (1.5%); EDF series
vs official budget (exact).

**D-08. SUDOP rows with a shifted column layout are realigned, not skipped** (an inserted
case-reference pushes fields one over; the EUR column then shows PLN). 41 legacy mis-parsed
amounts were nulled rather than approximated by FX.

**D-07. Grants to subsidiaries are recorded with a note, not re-pointed.** Poland's IPCEI-CIS
money went to Atende Industries sp. z o.o., not the listed parent Atende S.A.; the event stays
on the corpus company with the subsidiary named in the summary.

## 2026-06-11 · Analysis scoping and the first investor page

**D-06. The investor audience analysis targets four questions**: sourcing signal (stacked
approvals), capital-stack reading (signals vs anchors), sector rotation, the state on the cap
table. Chosen over corpus-describing statistics, which investors cannot act on.

**D-05. Euro aggregates never cross `grant_amount_basis` values.** Cross-basis totals appear
only as "indicative" with an explicit footnote (champions table).

**D-04. Champion lists use `entity_type='company'` only**, which forced the classify.py
research-org pattern additions (SINTEF, VTT/tutkimuskeskus, ülikool compounds, hoegsk
transliteration, CPI, LEITAT, IFP, Silicon Austria Labs, III-V Lab; UKRI and ICLEI as public
bodies). A champion list with universities in it is not credible to this audience.

**D-03. Notable-stakes tables show operating companies only, capped per holder.** Fund vehicles
(K/S, Komplementar, GPs, coöperatief, acquisition vehicles) are filtered by name pattern;
max four rows per holder so Tesi's exemplary disclosure does not crowd out the rest.

**D-02. Site pages follow FT/Economist house style**: Georgia serif headlines, EU blue #003399,
no em-dashes anywhere, conclusions in prose rather than chart captions.

**D-01. Tesla's EuBatIn NULL is a known gap, not missing data** (application withdrawn Nov
2021); recorded in the backfill script's KNOWN_GAPS so no one "fixes" it later.
