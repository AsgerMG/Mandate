# Synthesis: What the EU's public-funding corpus actually says

Across 3,101 companies and €54.2B of EU public capital committed via seven instruments, three patterns stand out: the corpus is dominated by France's industrial primes and Nordic deep-tech, not the emerging startup ecosystems the funding is rhetorically targeted at; concentration within each instrument is severe (top-decile companies capture 32–82% of capital); and the much-discussed EIC → private-capital pipeline is empirically weak at 0.5% flow rate from EIC to EIB venture debt.

## The cohort

The 3,101 companies are distributed across 42 countries and seven sectors, but the distribution is deeply uneven. Life sciences (35%) and cleantech (30%) dominate by company count. France leads all countries with approximately 490 companies, driven by its dense ecosystem of defense primes and state-backed research organisations (CEA, ONERA, Thales subsidiaries). Nordic countries — Sweden, Finland, Denmark — punch well above their population weight, particularly in cleantech and life sciences, consistent with their strong EIC participation rates. Eastern Europe is structurally under-represented: Poland (1.0 companies per million) and Romania (1.1/M) sit roughly 10× below Estonia (21.4/M) or Luxembourg (18.6/M). This per-capita gap is not simply an innovation-ecosystem gap — it is also a consequence of the corpus's coordinator-only loading convention, which suppresses participant-only companies disproportionately in IPCEI and EDF, instruments where Eastern European companies more often appear as non-lead participants.

The average company in this corpus has 1.6 events, meaning a single interaction with one instrument family. Most companies touch the EU's funding machinery once and do not return. The 81 cross-instrument champions (2.6%) who appear across two or more families are a genuinely distinct cohort — but even among them, only four companies reach three instrument families (CEA, Lynred, SINTEF, Multiverse Computing).

## The champions

The 81 cross-instrument companies are not primarily startups. When ranked by total declared capital, the top three are THALES (€449M, 2 families: EIC+EDF), Fincantieri (€401M), and Airbus (€358M) — established defense-industrial primes, not emerging ventures. CEA, a French state nuclear-and-research body, is the most source-diverse (3 families), followed by Lynred (an infrared-sensor specialist with defense applications) and SINTEF (Norway's largest independent research institute). The champion cohort is 22% defense-sector vs 6% in the wider corpus — a 3.7× over-representation — while digital is almost absent (< 2%). This suggests the EU's cross-instrument funding pipeline is, in practice, a route for large national champions to accumulate across multiple programme envelopes, not a ladder for deep-tech startups to climb.

The strongest instrument co-occurrence is EIC+EDF (15 companies), confirming the defense-tech bridge. EIC+EIB (10 companies) is the second-strongest pair but represents only 0.5% of EIC-funded companies — making the oft-cited EU "EIC → venture debt" pipeline a marginal phenomenon rather than a systematic growth ladder.

## Concentration vs distribution

All seven instruments exhibit highly concentrated capital allocation. The EIT has the highest Gini (0.88): essentially all measured EIT capital flows to a handful of KIC hubs. IPCEI (0.69) and EDF (0.67) follow, consistent with project-based programmes where a handful of large industrial consortia dominate each call. The EIC — despite being the broadest instrument by company count — still has a Gini of 0.49, with its top decile capturing 32% of total EIC grant value. EIB Gini cannot be computed because debt amounts are systematically absent from the extracted data — a collection gap from Sprint 3 that remains unresolved.

The implication is that EU public funding does not spread thinly across the ecosystem. Even the EIC, designed as a "bottom-up" open competition, concentrates its awards. The tail of sub-€500K EIC grants is long, but the head of €15–17.5M EIC Accelerator awards distorts the distribution significantly.

## Time and policy shifts

Event volumes ramp sharply from 2021 to a 2023 peak (1,073 EIC events alone), then decline through 2024–2025 — partly a data-completeness artefact (2025 and 2026 entries are incomplete at extraction) and partly the EIC's natural cohort-intake cycle. Innovation Fund shows the clearest policy-driven growth: from 6 events in 2021 to 102 in 2024, tracking the surge in EU ETS carbon revenue that finances the fund. EDF is notably stable at 39–63 events per year, suggesting the defense programme operates on a predictable multi-year budget cadence rather than responding to political urgency in the data period.

All 317 IPCEI events have NULL dates — a structural gap in the dataset, not a political absence. IPCEI projects do not publish call-deadline or start-date data in machine-readable form.

## Gaps and biases

The coordinator-only loading convention is the largest systematic bias. Instruments like IPCEI, Chips JU, and EDF fund large consortia; only the named coordinator (typically the lead industrial prime or research organisation) appears in the corpus. Participant companies — which can number 10–30 per project — are absent. This means Germany is almost certainly the most under-represented large economy: German companies frequently appear as non-coordinator participants in IPCEI hydrogen and battery projects. The true Germany company count in these programmes likely exceeds the ~290 currently in the corpus.

The digital sector is structurally absent from most instruments in this corpus. EIC does fund software and AI companies, and 182 digital-classified companies appear in the dataset. But consumer software, SaaS, and purely digital-service companies are not targets of EDF, IPCEI, Innovation Fund, or Chips JU. Any claim that "this corpus represents Europe's tech ecosystem" is false — it represents Europe's hardware-intensive, energy-adjacent, and defense-adjacent funding-eligible ecosystem.

## What we don't know

1. **Follow-on private capital**: do STEP-flagged companies raise more private funding post-seal? No private-side data in this corpus. Requires Dealroom or Crunchbase enrichment — see `plans/backlog/private_side_paid_api_reference.md`.
2. **Outcome data**: which of the 3,101 companies are still operating? Which have exited? No survival or exit data available without private-side enrichment.
3. **IPCEI participant companies**: who are the non-coordinator participants in the 14 IPCEI projects? Partial data exists in public IPCEI project documentation but was not loaded.
4. **EDF participant companies**: the ~50% factsheet coverage gap from Sprint 6 means roughly half of EDF-funded companies are absent from the corpus.
5. **EIC Equity**: equity amounts (EIC Fund co-investment) are systematically NULL for most companies — the EIC Fund's portfolio is partially public but was not loaded.

## Hypotheses worth testing next

1. **STEP Seal → private round**: match the 623 STEP-flagged companies against Dealroom/Crunchbase to test whether seal-holding correlates with a private round within 12–24 months. Requires: Dealroom API (paid) or manual Crunchbase sampling. Tagged as high-priority in backlog.
2. **Defense-prime capture**: is the champion cohort's dominance by French primes a consequence of IPCEI's consortium-structure or EDF's procurement-adjacent eligibility rules? Requires: IPCEI participant-level data + EDF factsheet completion.
3. **Nordic efficiency**: Nordic countries achieve high per-capita representation despite no single large incumbent. Is this explained by EIC's bottom-up selection alone, or also by national co-funding programs (Business Finland, Vinnova, Innovation Fund Denmark) that are not in this corpus?
4. **Germany under-count**: quantify the coordinator-only suppression for Germany in IPCEI by loading participant data from IPCEI project documentation. Expected to at least double Germany's count.
5. **Post-2025 trajectory**: re-run B6 after Q4 2025 data is complete to confirm whether the observed 2024 dip is a trend or an artefact of partial-year extraction.
