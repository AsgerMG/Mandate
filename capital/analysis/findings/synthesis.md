# Synthesis: what the EU public-funding corpus actually says

Across 21,689 companies and €76.9B of public capital committed via the nine main EU funding instruments and the national development banks of seven member states, three patterns stand out. The corpus is dominated by Horizon Europe Pillar II at a scale that dwarfs every other instrument by a factor of seven. Concentration within each instrument is severe: the top decile of companies captures between 32 and 100 percent of measurable capital. And the bridge from EU programme grants into follow-on private debt or equity is empirically narrow, with only a handful of percent of EIC-funded companies ever surfacing at the EIB.

## The cohort

The 21,689 companies sit across 53 countries and eight sectors, but the distribution is steeply uneven. Cleantech (8,592 companies) and life sciences (4,794) dominate by company count, together accounting for more than 60 percent of the corpus. Spain leads on company count with 3,379, narrowly ahead of Germany (2,633), Italy (1,759), and France (1,681). The Spanish lead is largely an artefact of the national development bank CDTI, which contributes 1,741 of Spain's Spanish-origin entries. Outside the headline figures the per-capita ranking tells a different story: Iceland (132.5 companies per million residents), Cyprus (124.6), and Luxembourg (120.0) anchor the top of the league, while France (24.6), Bulgaria (28.4), and Italy (29.8) sit at the bottom of the developed-economy sample.

The average company touches the EU funding machinery 2.7 times. Most companies appear in only one instrument family. The 1,564 cross-instrument champions (7.2 percent) who appear in two or more families form a structurally distinct cohort.

## The champions

The companies-only view, which strips out research organisations and public bodies, surfaces 734 cross-instrument champions. The most source-diverse champion is SINTEF AS, a Norwegian research institute formally classified as a company, which appears across five families (EIC, Chips JU, EDF, Horizon EU Partnerships, Horizon EU Pillar II) for €252 million in total declared capital. VTT in Finland and Multiverse Computing in Spain also reach five families. The pattern is consistent: cross-instrument breadth correlates with research-organisation status or with deep-tech specialisation, not with conventional startup metrics such as venture-backed status or revenue scale.

The strongest pairwise instrument co-occurrence is EIC together with Horizon Europe Pillar II at 444 companies. The next strongest pair is EIC together with Horizon EU Partnerships at 68 companies. The much-discussed EIC-to-EIB pipeline appears only 10 times in the corpus: 10 of the 2,188 EIC-funded companies reach EIB venture debt, a 0.5 percent flow rate.

## Concentration

All ten instrument families exhibit concentrated capital allocation. The EIT KIC programme has a Gini coefficient of 0.98 and a top-decile share of 100 percent: essentially every measurable euro of declared EIT capital concentrates in a handful of KIC hub entities. Horizon Europe Pillar II, despite being the broadest programme by company count, still has a Gini of 0.80 with a top-decile share of 72 percent. The national development banks roll up to a Gini of 0.76 and a top-decile share of 63 percent, similar in shape to the EU-level instruments rather than markedly more distributed. The EIC and the Horizon EU Partnerships are the flattest distributions at a Gini of 0.49 each, with top-decile shares of 32 to 37 percent.

The implication is that EU public funding does not spread thinly. Even instruments designed as bottom-up open competitions concentrate their awards. The tail of small EIC Pathfinder grants is long, but the head of EIC Accelerator awards in the €15 to 17.5 million range distorts the EIC distribution sharply. EIB cannot be measured on the same axis because debt amounts are systematically absent from the extracted data.

## Gaps and biases

The coordinator-only loading convention for IPCEI, Chips JU, EDF, and the EIT programme remains the largest systematic bias in the corpus. These instruments fund large consortia where only the named coordinator surfaces in the data. Horizon Europe Pillar II is loaded at organisation level rather than coordinator-only, and that single decision is why Pillar II accounts for 16,856 of the 21,689 companies. Germany is plausibly under-counted in the coordinator-only instruments because German companies frequently appear as non-lead participants in IPCEI hydrogen and battery projects.

The digital sector remains structurally absent from most of the corpus by design. EIC funds software and artificial-intelligence companies, but consumer software, pure-play SaaS, and platform companies are not eligible for EDF, IPCEI, the Innovation Fund, or Chips JU. The corpus represents Europe's hardware-intensive, energy-adjacent, and defence-adjacent funding-eligible cohort. It is not a proxy for the European technology market as a whole.

IPCEI events all have NULL dates. The IPCEI programme does not publish call-deadline or project-start data in machine-readable form. That data gap removes 317 IPCEI events from every time-based analysis.

## What we do not know

1. Follow-on private capital. Do STEP-flagged companies raise more private funding after receiving the seal? No private-side data in this corpus. Requires a Dealroom or Crunchbase enrichment pass.
2. Outcome data. Which of the 21,689 companies are still operating? Which have exited? No survival or exit signal in the data.
3. IPCEI participant companies. Who are the non-coordinator participants in the 14 IPCEI projects? Partial data exists in public project documentation but was not loaded.
4. EDF participant companies. The factsheet coverage gap means roughly half of EDF-funded companies are absent from the corpus.
5. EIC Fund equity. Equity amounts from EIC Fund co-investment are systematically NULL for most companies. The EIC Fund portfolio is partially public but was not loaded.

## Hypotheses worth testing next

1. STEP Seal as a predictor of private follow-on. Match the 623 STEP-flagged companies against Dealroom or Crunchbase to test whether seal-holding correlates with a private round within 12 to 24 months.
2. National development bank overlap with EU instruments. Quantify what share of national development bank recipients also appear in EU-level programmes, and whether national programmes route into or away from EU follow-on funding.
3. Germany undercount. Quantify the coordinator-only suppression for Germany in IPCEI by loading participant data from project documentation. The undercount is plausibly large.
4. Sector divergence between national and EU programmes. The national development bank cohort skews toward cleantech and life sciences in similar proportions to Horizon Europe Pillar II, but differs sharply from IPCEI and EDF. Worth quantifying.
5. Post-2025 trajectory. Re-run the time-dynamics analysis after Q4 2025 data is complete to confirm whether the observed late dip is a trend or an artefact of partial-year extraction.
