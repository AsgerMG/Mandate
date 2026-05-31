# Methodology

Living reference for analytical and engineering choices in this project. New decisions extend the relevant topic section; the decision log at the bottom dates major changes.

## Research framing

**Question**: Does EU-directed public capital predict private follow-on investment in European tech?

**Framing**: Descriptive only, "predict", never "cause". Public funding selection is non-random (calls have eligibility criteria, applicants self-select, panels score on quality), so observed correlations with downstream outcomes cannot be read as treatment effects. The brief reports conditional patterns, not causal claims.

## Geographic scope

**40 countries**: EU27 + EFTA (NO, CH, IS, LI) + UK + Western Balkans (AL, BA, ME, MK, RS, XK) + Eastern Partnership in study scope (UA, MD).

Authoritative list: [data/europe_scope.json](../data/europe_scope.json). Full rationale, per-country exclusion reasoning, and the enforcement architecture are documented in [europe_scope.md](europe_scope.md).

Israel, Turkey, and the Caucasus are Horizon-associated but **out of scope** — the study is titled "Where Europe's public capital actually goes" and the scope reflects that geographically.

### Enforcement — three layers (Sprint 14, 2026-05-29)

The scope is held by three defences working together. Adding a country requires editing **three** files; see "When to revise the scope" in [europe_scope.md](europe_scope.md).

1. **Pre-insert filter in extractors** — [scripts/europe_scope.py](../scripts/europe_scope.py) exports `canonicalise_country()`. Every extractor should call it on the country code before INSERT, mapping source-data aliases (EL→GR, UK→GB, PO→PL, SW→SE, GL→DK) and skipping rows that return `None` (out of scope). Self-test: `python3 scripts/europe_scope.py`.
2. **Database `BEFORE INSERT` / `BEFORE UPDATE` triggers** — `trg_companies_country_scope` and `trg_companies_country_scope_update` in [schema.sql](../scripts/schema.sql). Fire on every write to `companies.country`; any out-of-scope value `RAISE(ABORT, ...)` with a message pointing at this doc and the helper module. Cannot be bypassed by a forgetful extractor.
3. **View-time filter** — `v_european_companies` in [analysis/views.sql](../analysis/views.sql), inner-joined into `v_events`. Belt-and-braces in case the triggers are ever disabled for a raw-SQL bulk import.

The DQ block "Europe scope integrity" in [sanity_check.py](../scripts/sanity_check.py) must show zero on all three checks (out-of-scope rows, lingering aliases, triggers installed). Run after every loader.

### Destructive corpus clean-up (2026-05-29)

Out-of-scope rows were `DELETE`d from the live DB on 2026-05-29: 1,639 companies + their 2,527 events + 3,834 `classify_audit` rows. Aliases were canonicalised in place (98 `UPDATE`s). Pre-Sprint-14 DB backed up at `/tmp/eit_data_backup/db.sqlite.pre-europe-scope.bak`.

Three in-scope countries (Malta, Liechtenstein, Kosovo) are too small for the bundled 110m world topology and render on the map as labelled dot markers rather than shape fills. The KPI count "40 countries" is the in-scope count, not the rendered-shape count.

## Time horizon

**Period**: 2021 to 2026, scoped to the current Horizon Europe / MFF cycle.

**2025 caveat**: Call cycle still running when the data was pulled (2026-05-20). Only 41 EIC Accelerator coordinators visible for 2025 so far; treat as partial. Primary analysis universe is 2021 to 2024 with 2025 noted as incomplete.

## Identifiers and deduplication

**Canonical company ID**: PIC (EU Participant Identification Code): the EU's stable, registered identifier across all Horizon-funded programmes. Used as the primary dedup key.

**One row per company, many event rows**: A company appearing in multiple EIC programmes (Pathfinder → Transition → Accelerator), or across multiple EU instruments, gets one row in `companies` and multiple rows in `public_funding_events`. This makes the "multi-instrument winner" pattern queryable without join gymnastics.

**Companies without PIC**: Fall back to canonical name matching for non-EIC sources where PIC may not be reported. Match confidence and method are recorded on the company row (`match_confidence`, `match_method`).

## Schema choices

**Three core tables**: `companies` (deduplicated entities), `public_funding_events`, `private_funding_events`. Full definition in [schema.sql](schema.sql).

**Grant-only for v1**: EIC Fund equity tickets (up to €10M per company) are reported separately and are not in the EIC Data Hub export. The `equity_amount_eur` column exists on `public_funding_events` but is NULL for current EIC rows. Pulling the EIC Fund portfolio list is a v2 task.

**`entity_type` left blank initially**: All rows start at `"unknown"`. Populated via LLM classification on name + project summary during enrichment (startup / sme / large_corp / research_org / consortium / public_body).

## Source coverage

| Source | Status | Notes |
|---|---|---|
| EIC Accelerator | ✅ Loaded | 707 coordinator companies / 712 events: the core startup universe |
| EIC Pathfinder | ✅ Loaded | 1,289 companies: early-stage research consortia |
| EIC Transition | ✅ Loaded | 407 companies: research-to-market bridge |
| IPCEI | ✅ Loaded | 317 funding events / 302 distinct companies (11 decisions) |
| EIB venture/growth | ✅ Loaded | 153 events / 151 distinct borrowers: debt instrument tracked via `debt_amount_eur` |
| Innovation Fund | ✅ Loaded | 246 events / 237 beneficiaries across 20 sub-calls (2020 to 2024) |
| Chips JU / KDT JU | ✅ Loaded | 60 KDT-era coordinator events (2020 to 2023; CORDIS supplement Sprint 11 filled the KDT-2023 gap from 4 → 23 events; chips-ju.europa.eu OData first pass + CORDIS open-data second pass). Chips JU Chips Act to era calls still not published in the portal as of 2026-05-25. |
| Clean Hydrogen Partnership (CHP) | ✅ Loaded | 142 coordinator events (2022 to 2025) across `HORIZON-JTI-CLEANH2-*` and `HORIZON-JU-CLEANH2-*` topic codes via the CORDIS open-data dump (Sprint 11). |
| IHI JU (Innovative Health Initiative) | ✅ Loaded | 56 coordinator events (2022 to 2025) via CORDIS open-data (Sprint 11). IHI is the IMI2 successor under Horizon Europe. Research-org-heavy by programme design (hospitals, universities). |
| EuroHPC JU | ✅ Loaded | 22 R&I coordinator events (2021 to 2024) via CORDIS open-data (Sprint 11). Infrastructure-stream (supercomputer procurement) deliberately excluded per Tier 3 scope principle. |
| EDF (European Defence Fund) | ✅ Loaded | 143 coordinator events across 8 call/strand combinations (2021 to 2024 RA+DA; 2025 partially downloaded). Introduced `defense` sector label. |
| EIT KICs | ✅ Loaded | All 8 KICs. EIT Digital + Manufacturing (Sprint 7) + InnoEnergy Highway 2021 to 2024 (40 events) + Health Catapult 2022 to 2025 (105 events) + Climate-KIC CDR 2022/2023 + ASA 2024 + Clean Cities Spain 2024 (72 events) + Urban Mobility 2022/2023/2024 + portfolio (227 events) + RawMaterials portfolio (8 events) + Food RFS 2021 to 2025 (63 events). Total: 614 EIT events. |
| Horizon Europe Pillar II Clusters (CL1/CL3/CL4/CL5/CL6) | ✅ Loaded | Sprint 12: 49,433 organisation-level events across 3,145 projects (2021-Mar 2025), €19.5B EU contribution. Granularity is per-(project, organisation) rather than coordinator-only (Option A). CORDIS publishes `ecContribution` per participant explicitly. `coordinator_only=1` preserved on the lead row of each project so existing lead-only analytics keep working. CL2 (Culture/Creativity/Society) excluded: low industrial-policy signal. JU-derived topics (`HORIZON-JU-IHI-*`, `HORIZON-JU-CHIPS-*`, `HORIZON-EUROHPC-*`, `HORIZON-KDT-*`, `HORIZON-J*-CLEANH2-*`) deduplicated against Sprint 11 ingestions. |
| Eurostars | ❌ Dead end | Eurostars-3 (2021+, EUREKA-administered). CORDIS API: 0 results (EUREKA, not CORDIS). eurostars-eureka.eu: HTTP 403 Forbidden. No accessible machine-readable source. Stub import in classify.py for future enrichment if EUREKA publishes open data. |
| Clean Hydrogen Partnership | 🔜 Deferred | Reclassified from "dead end" 2026-05-25 after retry. CHP projects ARE indexed in CORDIS under topic codes `HORIZON-JTI-CLEANH2-YYYY-NN-NN` (e.g. CLEANER 101137799, HI2 Valley 101192356). No bulk-search endpoint accessible via WebFetch, but per-project pages are fully populated. Building a `scripts/extract_chp.py` that enumerates topic codes is the Sprint 11 task. |
| STEP seal | ✅ Loaded | Tagging cross-cut, not a new source. Boolean flag on `companies.step_flagged` where the company holds the STEP Sovereignty Seal. 623 companies tagged (20.1% of corpus). |
| **SATR (EU State Aid Transparency Register)** | ✅ Loaded (Sprint 15) | 122,814 events / 75,195 SATR-only companies across 24 EC-portal countries (2021-01-01 to 2026-05-29). Filter: innovation + IPCEI + Net-Zero (GBER Art. 21-30, 36-49 + IPCEI AR79411 + notified AR79xxx). 169,243 COVID/TCTF emergency aid rows filtered at staging by multilingual title regex. See `analysis/findings/q09_state_aid.md`. Slovenia (gov.si), Poland (SUDOP), Romania (REGAS) use national portals — deferred. Spain uses BDNS — already covered via `extract_cdti.py`. |
| **Central NDB registers (Sprint 16)** | ✅ Partially loaded | Pivot from per-NDB Playwright scrapes to **central data registers** (data.gouv.fr Opendatasoft, Drupal-Views server-rendered HTML, Google Sheets). Loaded: Bpifrance i-Nov (753 events €518M, FR), Bpifrance PM'up IDF (96 events €50M, FR), Innovationsfonden (3,313 events €892M, DK), EIFO Venturelisten co-invest (131 events €1.24B round volume, DK). Carry-over: ES BDNS extension to ENISA/COFIDES, NL RVO Projectendatabase (Playwright), IT RNA monthly XML, PL SUDOP. **See "What we cannot see: commercial-conform NDB equity" below.** |
| Dealroom enrichment | 🔜 Future | Right-hand side variable: private follow-on funding, headcount, status. Matches DB companies to Dealroom IDs and populates `private_funding_events`. |

### What we cannot see: commercial-conform NDB equity (Sprint 16 finding)

A structural blind spot in this corpus, made explicit so any downstream analysis acknowledges it.

**Article 107 TFEU defines state aid as a transfer of public resources that confers an "advantage" to undertakings on selective terms.** When a national development bank (NDB) invests at market terms — pari passu with private co-investors, at commercial rates, in commercially viable companies — there is **no advantage**, therefore **no state aid**, therefore **no publication obligation** under SATR or any national state-aid register.

This is the regime that governs the bulk of NDB equity activity by volume:

| NDB | Annual deployment | Visibility in this corpus |
|---|---|---|
| Bpifrance equity (FR) | ~€2-3bn/yr direct equity tickets | ❌ Not in SATR; not on bpifrance.fr as structured data (Cloudflare-protected) |
| KfW Capital LP commitments (DE) | ~€500M-1bn/yr to ~80 German+EU VC funds | ❌ Pari passu LP, not state aid; published only as fund-list logos |
| CDP Equity strategic holdings (IT) | ~€10bn AUM (Eni, Snam, Saipem, etc.) | ❌ Strategic equity in listed Italian champions; not state aid |
| EIFO equity tickets (DK) | ~€500M-1bn/yr venture co-invest | ❌ Pari passu venture co-investment; Venturelisten captures round membership but not EIFO ticket size |

**What this corpus *does* catch via SATR + national registers:**
- All NDB grants, soft loans, guarantees with subsidy element (these are state aid by Art. 107).
- All de-minimis aid below thresholds (published under separate Commission obligations).
- All notified state aid above €100k (mandatory disclosure under Regulation 651/2014 Art. 9).
- Bpifrance grant programmes (i-Nov, PM'up, France 2030 grants — all SATR-published, see Sprint 16).
- KfW grant programmes (in SATR DE 645+ events).
- CDP debt-with-aid-element programmes (in SATR IT via Mediocredito Centrale 14k+ events).

**What this corpus does NOT catch and cannot catch via central registers:**
- Commercial-conform equity / quasi-equity tickets where NDB takes a pari-passu position with private LPs.
- Pure market-conform debt (no subsidy element).
- LP commitments from NDB-of-NDBs vehicles (KfW Capital → VC funds, CDP VC fund-of-funds, Bpifrance France Investissement → funds).

**Workarounds for downstream researchers who need the equity layer:**
1. **Annual report PDFs** — every NDB publishes named portfolio companies in annual report appendices. LLM-PDF parsing would recover ~80% of named tickets for a multi-week effort per NDB.
2. **Dealroom / Pitchbook / Crunchbase** — commercial round-level data with investor syndicates. Filter to rows where the NDB name appears as investor. This is the cleanest right-hand side for follow-on analysis (already on the Sprint roadmap as the next major enrichment after the supply side is complete).
3. **EIF Annual Transparency Report** — for the LP layer of EIF-backed funds (covers part of KfW Capital, CDP VC, Saminvest).
4. **InvestEU Operations Register** — for InvestEU-co-financed NDB operations.

This blind spot is not a bug in this corpus; it is a consequence of the EU's competition-law boundary between subsidised and market-conform public capital. Any "share of public capital reaching innovative companies" calculation built on this corpus undercounts the equity layer by design.



**Sprint ordering rationale**: complete the supply side (LHS) fully before enrichment (RHS). EDF first because it forces the defense-label decision; EIT KICs second because it closes the HE company-facing gap; STEP third as a small tagging pass; Dealroom last because its design will be informed by a finished supply side.

**Primary analysis universe**: EIC Accelerator coordinators. They are the cleanest "startup" subset: coordinator role excludes consortium participants, and Accelerator is the only EIC programme aimed squarely at single companies (vs. multi-partner research projects).

### Horizon Europe coverage: what's loaded, what isn't, and why

Horizon Europe (HE) is the EU's flagship R&D programme, €95.5bn budget for 2021 to 2027, structured into three pillars plus partnerships and the EIT. This tracker loads HE **selectively**: we cover the slices where companies are the primary beneficiaries, and exclude the slices where individual researchers or academic-led consortia are. Stating the inclusion/exclusion choice per HE component so it can be contested:

| HE component | What it funds | In tracker? | Reasoning |
|---|---|---|---|
| **Pillar 1: ERC grants** | Individual researcher grants (~€2.4bn/yr) | ❌ Out of scope | Almost entirely academic individuals at universities. Company applicants are vanishingly rare. Outside the "EU funds companies" research question. |
| **Pillar 1: MSCA fellowships** | Researcher mobility/fellowships | ❌ Out of scope | Individual researchers, no company funding mechanism. |
| **Pillar 1: Research Infrastructures** | Large-scale shared scientific facilities | ❌ Out of scope | Builds facilities, doesn't fund companies. |
| **Pillar 2: Cluster 1 to 6 collaborative R&D** (Health, Culture, Civil Security, Digital, Climate, Food) | Multi-partner research consortia (~€53bn total: the biggest HE pot) | ✅ Loaded (CL1/CL3/CL4/CL5/CL6, Sprint 12); CL2 excluded | Sprint 12 reframed the original scoping decision. CORDIS publishes per-organisation `ecContribution` explicitly, so company-direct funding *is* recoverable: and Clusters 3/4/5 collectively are the single largest direct-to-company innovation channel for strategic-resilience analysis (semis, cleantech, civil security, dual-use). Loaded at (project, organisation) granularity with `coordinator_only` preserved for lead-only views. CL2 (Culture/Creativity/Society) excluded: low industrial-policy signal, academia-dominated. Pillar I (ERC/MSCA/RI) remains out: academic individuals, no company funding. |
| **Pillar 2: EU Missions** (Cancer, Climate Adaptation, Cities, Soil, Oceans, €1.8bn) | Mission-specific consortia | ❌ Out of scope | Small budget, same consortium pattern as Cluster grants, no clean company-coordinator subset. |
| **Pillar 3: EIC** (Accelerator, Pathfinder, Transition) | Startup-focused grants + EIC Fund equity | ✅ Loaded | The core of our corpus. EIC Accelerator coordinators = the cleanest "company funded by EU" cohort. |
| **Pillar 3: EIT KICs** (8 thematic Knowledge & Innovation Communities) | Startup acceleration programmes funded by EIT | ✅ Loaded | All 8 KICs loaded (Sprint 7 + Sprint 10): 358 events, ~320 distinct companies. EIT Digital + Manufacturing (Sprint 7); InnoEnergy, Health, Climate-KIC, Urban Mobility, RawMaterials, Food (Sprint 10). EIT-Digital × EIC overlap: 11.8% (6/51 companies). ECSEL JU (2014 to 2021) out of time-window: succeeded by KDT/Chips JU from 2021. |
| **HE Partnership: Chips JU / KDT JU** | Semiconductor R&D consortia (Cluster 4) | ✅ Loaded | Coordinator-only (Option A). |
| **HE Partnership: Clean Hydrogen JU (CHP)** | Green hydrogen R&D consortia | ✅ Loaded | Sprint 11: 142 coordinator events via CORDIS open-data dump. Coordinator-only (Option A). |
| **HE Partnership: IHI JU** | Innovative Health Initiative (IMI2 successor) | ✅ Loaded | Sprint 11: 56 coordinator events via CORDIS open-data dump. Hospital/university-heavy coordinator profile (research_org > company). |
| **HE Partnership: EuroHPC JU (R&I stream)** | HPC software, applications, training | ✅ Loaded | Sprint 11: 22 R&I coordinator events via CORDIS open-data dump. Infrastructure stream (supercomputer procurement) excluded by Tier 3 scope. |
| **Other HE Partnerships** (SESAR JU, Europe's Rail JU, BBI/CBE JU) | Domain-specific R&D consortia | ❌ Deferred | Same consortium-pattern limitation as Cluster grants. No immediate plan; revisit if Dealroom enrichment reveals signal. |

### Non-HE EU instruments: what's in and out

| Instrument | What it funds | In tracker? | Reasoning |
|---|---|---|---|
| **IPCEI** | State-aid for cross-border industrial projects | ✅ Loaded | 11 IPCEI decisions across micro-electronics, batteries, hydrogen, cloud, health. Outside HE: operates as state-aid notifications. |
| **Innovation Fund** | ETS revenue to funded climate/energy projects | ✅ Loaded | 20 sub-calls 2020 to 2024. Outside HE: funded by EU Emissions Trading System revenues. |
| **EIB venture/growth debt** | Direct EIB venture-debt loans | ✅ Loaded | Debt instrument. Outside HE. EIB is a separate financial institution. |
| **EDF (European Defence Fund)** | Defense R&D & capability development (€8bn 2021 to 2027) | ✅ Loaded | Outside HE. 143 coordinator events (2021 to 2024). Introduced `defense` sector label. |
| **EU4Health** | Health policy programme | ❌ Out of scope | Mostly policy/regulator funding, not company grants. |
| **Digital Europe Programme (DEP)** | AI, cybersecurity, supercomputing capacity-building | ❌ Out of scope for v1 | Funds testing facilities, skills, and deployment infrastructure rather than company R&D. Could revisit if v2 broadens scope. |
| **Connecting Europe Facility (CEF). Digital** | Cross-border digital infrastructure | ❌ Out of scope | Infrastructure operators, not startups. |
| **Single Market Programme** | SME competitiveness | ❌ Out of scope | Scattered small grants; no clean cohort. |
| **National-level subsidies** (DE Investitionszulage, FR aides aux entreprises, IT credito d'imposta, etc.) | National R&D and capex grants | ❌ Out of scope | EU-level tracker by design. National data would require 27 separate extractors. |

### Coverage gaps: state after Sprint 12 complete

After EDF, all 8 EIT KICs, the Sprint 11 JU loads (CHP/IHI/EuroHPC), and the Sprint 12 Pillar II ingestion (CL1/CL3/CL4/CL5/CL6), the tracker covers:
- ✅ 100% of HE Pillar 3 EIC (Accelerator + Pathfinder + Transition)
- ✅ All 8 EIT KICs (Sprint 7 partial + Sprint 10 completion)
- ✅ HE Pillar II Global Challenges Clusters CL1/CL3/CL4/CL5/CL6 (Sprint 12; CL2 deliberately excluded)
- ✅ HE Partnerships: Chips JU + Clean Hydrogen + IHI + EuroHPC
- ✅ All major non-HE company-targeted EU instruments (IPCEI, IF, EIB-VD, EDF)
- ✅ STEP Sovereignty Seal cross-cut tagging (623 companies)

It will NOT cover:
- ❌ HE Cluster 2 (Culture, Creativity, Society): low industrial-policy signal, academia-dominated
- ❌ Eurostars: dead end (EUREKA not on CORDIS; eurostars-eureka.eu 403 Forbidden)
- ❌ Other HE Partnerships beyond those loaded (SESAR, Europe's Rail, BBI/CBE): deferred
- ❌ Pillar 1 (ERC, MSCA, Research Infrastructures): by design
- ❌ Capacity-building / infrastructure programmes (DEP, CEF, EU4Health): not direct company R&D funding
- ❌ National-level subsidies: out of EU-level scope

### Tier 2: known gaps with lower direct-funding signal

These sources are acknowledged but deliberately excluded. They carry weaker "company received EU funding" signal than Tier 1 sources and/or are inaccessible in structured form.

| Source | Why excluded | Revisit trigger |
|---|---|---|
| HE Pillar 2 collaborative R&D (Clusters 1 to 6) | Companies appear as consortium partners, not primary beneficiaries; coordinator role typically goes to universities/research orgs; weak direct-funding signal | If future analysis needs broad HE coverage including consortium partners |
| Digital Europe Programme (DEP) | Funds testing infrastructure, capacity-building, and skills: not direct company R&D grants; beneficiaries are facility operators and training providers | If DEP deployment calls produce company-level grant data |
| EIC Fund equity investments | Tracked separately from EIC grants; portfolio is public but not machine-readable as of 2026-05-25; `equity_amount_eur` column exists for future enrichment | When EIC Fund publishes a structured portfolio export |
| ECSEL JU (2014 to 2021) | Pre-period: all ECSEL calls have project start dates in 2014 to 2020, outside the 2021 to 2026 HE window | If the analysis scope expands to the full 2014 to 2026 lifecycle |
| EU Missions (Cancer, Climate Adaptation, Cities, Soil, Oceans) | Small budgets (~€1.8bn total), same consortium-partner pattern as Cluster grants, no clean company-coordinator subset |, |
| Eurostars | EUREKA-administered, not CORDIS-indexed; eurostars-eureka.eu 403 Forbidden; no accessible machine-readable export as of 2026-05-25 | If EUREKA publishes open beneficiary data |
| EU Funding & Tenders Portal Eurostars retry | Sprint 10 dead end; revisit if Eurostars publishes structured data | If EUREKA publishes a beneficiary dump |

### Scope principle: direct investments only

This tracker covers **direct** EU investment relationships only. A "direct" relationship means an EU institution or programme awards funding: grant, equity, or debt: in which the named company is the direct counterparty. The following structures are **explicitly out of scope** because the EU's direct counterparty is an intermediary, not the company:

| Out-of-scope structure | Examples | Reason |
|---|---|---|
| **Fund-of-fund / guarantee programmes** | InvestEU (EU guarantee → EIB/national bank → company); EIF (EU capital → VC fund → portfolio company) | EU's counterparty is the financial intermediary; the company has no direct contractual relationship with the EU budget |
| **Member-state-administered structural funds** | ERDF, ESF+, Cohesion Fund | Administered via 27 member-state managing authorities; no unified EU-level beneficiary registry; would require 27 separate national extractors |
| **Intermediated bank lending** | EIB loans to commercial banks for on-lending to SMEs | The borrower in the EIB project database is the commercial bank, not the SME |
| **National-level subsidies** | DE Investitionszulage, FR BPI grants, IT credito d'imposta | EU-level tracker by design; national subsidy data varies enormously in structure and availability |

**Note on EIB Venture in this DB**: the EIB venture-debt and InvestEU VD rows already loaded are *direct* EIB-to-company loans where the company is the named borrower on the EIB project page: not intermediated. The EIB's fund-of-fund instruments (EIF, EGF VDC, intermediated SME lending) were excluded during Sprint 3 on the same principle.

### How to read a "company received EU public funding" claim against this DB

A claim that a company "received EU public funding" against this tracker means the company appears in at least one of: EIC (Accelerator/Pathfinder/Transition), IPCEI direct-partner list, EIB venture-debt portfolio, Innovation Fund coordinator list, Chips JU / KDT JU coordinator list, EDF leaders list (post-Sprint 6), or EIT KIC-funded list (post-Sprint 7). It does **not** mean they received funding via *every* EU mechanism: they may also have received Cluster collaborative funding, ERC grants, national subsidies, or DEP capacity-building funds **not tracked here**. Any analytical claim from this DB carries this scope qualifier.

## Known limitations

The following are intentional choices or documented data gaps that shape: and limit: the precision of any analytical claim built on this corpus. None are corpus defects; all are known.

### Structural blind spot: commercial-conform NDB equity (Sprint 16)

**Article 107 TFEU defines state aid as a transfer of public resources that confers an "advantage" to undertakings on selective terms.** When a national development bank invests at market terms — pari passu with private co-investors, at commercial rates, in commercially viable companies — there is **no advantage**, therefore **no state aid**, therefore **no publication obligation** under SATR or any national state-aid register.

This is the regime that governs the bulk of NDB equity activity by volume:

- **Bpifrance equity (FR)** — ~€2-3bn/yr direct equity tickets. Not in SATR; bpifrance.fr Cloudflare-protected.
- **KfW Capital LP commitments (DE)** — ~€500M-1bn/yr to ~80 German+EU VC funds. Pari passu LP, not state aid.
- **CDP Equity strategic holdings (IT)** — ~€10bn AUM in Eni, Snam, Saipem, Fincantieri. Strategic equity; not state aid.
- **EIFO equity tickets (DK)** — ~€500M-1bn/yr venture co-invest. Pari passu venture co-investment.

The corpus catches NDB **grant**, **soft-loan**, and **subsidy-element** activity (Bpifrance i-Nov + PM'up, KfW federal disbursements, CDP Mediocredito Centrale, EIFO via Innovationsfonden, etc.). It does NOT catch the commercial-conform **equity / quasi-equity** layer. Any "share of public capital reaching innovative companies" calculation built on this corpus undercounts the equity layer by design.

Recovery paths (for downstream researchers who need the equity layer):
1. **Annual report PDFs** — every NDB publishes named portfolio companies in annual report appendices. LLM-PDF parsing would recover ~80% of named tickets for a multi-week effort per NDB.
2. **Dealroom / Pitchbook / Crunchbase** — commercial round-level data with investor syndicates. Filter to rows where the NDB name appears as investor. Cleanest right-hand side for follow-on analysis.
3. **EIF Annual Transparency Report** — for the LP layer of EIF-backed funds (covers part of KfW Capital, CDP VC, Saminvest).
4. **InvestEU Operations Register** — for InvestEU-co-financed NDB operations.

### Operational data-quality caveats

The following are intentional choices or documented data gaps that affect the precision of any private-side attribution work built on this corpus.

1. **Coordinator-only loading convention (Option A)**. For IF / Chips JU / EDF / EIT we load the lead coordinator (or direct partner for IPCEI), not the full consortium. Confirmed by the STEP Seal match (Sprint 8): of 4,069 unique seal-holders, only 623 (~15%) appear in our DB: the other 85% are consortium participants in projects whose coordinator we did capture. Sprint 9 private-side enrichment therefore covers the coordinator cohort, not the long tail of consortium members. If a researcher needs full-consortium coverage, the public funding source data (EU Funding & Tenders Portal partner exports) would need to be re-loaded.
2. **Website coverage is cliff-shaped**, 73% overall (2,263/3,101) but EIC=100%, EDF=15%, chips_ju=32%, eib=11%, eit=8%, IF=3%, IPCEI=2%. Private-side matching that depends on `name+country+website` will work well on the EIC cohort and degrade on the non-EIC families. Backfill from `project_summary` URLs is planned for Sprint 9.
3. **186 residual `entity_type='unknown'` (6%)**: intentionally left for Sprint 9 to resolve as a side-effect of private-side matching. Mostly EIC Pathfinder/Transition project-vehicle names that pattern-matching cannot resolve.
4. **2 dedup pairs flagged `needs_human_review`**. Bormioli Luigi ES/IT, Holcim RO/DE (both Innovation Fund). Parent-vs-subsidiary distinction expected to surface in private-side data; defer until then.
5. **IPCEI multi-partner sister entities kept separate by design**. A multinational receiving IPCEI aid in BE + FR + IT is three legally distinct state-aid awards (NOMAGIC convention, Sprint 4). If a private-side source returns one Dealroom-style record per parent group, attribution will need to decide per-analysis whether to roll up or attribute proportionally.
6. **Documented data gaps that won't grow**, 7 IF events have NULL `grant_amount_eur` (no published fiche), KDT-2023 portal is partial (€38M loaded vs ~€240M expected), and three IPCEI press-release totals are redacted by the Commission (Microelectronics-2018, Batteries, EuBatIn). All flagged in their respective decision-log entries.
7. **STEP Seal is company-level, not event-level**. The Commission's seal export carries proposal titles but no Horizon project numbers, so we tag `companies.step_flagged` and not `public_funding_events.step_flagged`. A `event_step ≈ (company.step_flagged AND project_year >= 2024)` proxy is reasonable for time-bounded analyses.
8. **The 84 cross-instrument winners are the highest-signal cohort**. Companies appearing across two or more source families are the cleanest set for cohort comparison ("EIC+EIB" vs "EIC only"). Sprint 9 should prioritise this cohort for matching-quality validation. **Note**: earlier drafts cited "THALES 9 sources, CEA 8, Airbus 7": those were raw `source` value counts (e.g. `edf_ra_2021` and `edf_da_2021` counted separately), not source-family counts. After normalization into the 7 canonical families: top by families = CEA FR (3: eic+chips_ju+edf), Lynred FR (3: ipcei+chips_ju+edf), SINTEF NO (3: eic+chips_ju+edf); top by committed capital = THALES FR (2 families, 30 events, €449M). Corrected in Sprint 9 EDA (see Decision log entry 2026-05-23).

## Data quality choices

**CSV parsing**: The EIC Data Hub export embeds multi-line summaries with unescaped quotes that break standard parsers. The loader stitches continuation lines into their parent record by matching `"<digits>";` (the PIC pattern) at line start. See [load_eic.py](load_eic.py).

**Skipped rows**: ~157 rows (~4%) drop on parse because the stitching heuristic doesn't recover every malformed record. Mostly long Pathfinder summaries. Acceptable for v1; note in any published counts.

**Free-text sector field**: The raw `Sectors` column is comma-separated free text with hierarchical and overlapping labels (e.g. "Medical Technologies, Non-invasive Medical Devices"). Stored verbatim in `public_funding_events.sector_tags_raw`; normalized via the taxonomy below into `companies.sector_inferred`.

**UK eligibility caveat**: UK lost Horizon access mid-2023 and only rejoined some programmes later. UK is under-represented (10 Accelerator coordinators) relative to its actual tech share. Footnote required in any country-level analysis.

## Sector taxonomy

Each company is classified into exactly one of seven normalized labels in `companies.sector_inferred`. The raw multi-tag string remains in `public_funding_events.sector_tags_raw` for traceability.

### Labels

| Label | What it covers |
|---|---|
| `life_sciences` | Medical devices (invasive/non-invasive), imaging, diagnostics, digital health, therapeutics & biologics, health biotech, regenerative medicine |
| `defense` | Weapons systems, military electronics, secure military comms, military aerospace, naval combat systems, armoured vehicles, ammunition, defense-specific cyber capabilities |
| `deeptech_hardware` | Quantum (computing + sensing), photonics, semiconductors, HPC, advanced materials, advanced manufacturing, metrology, comms hardware |
| `cleantech` | Energy (generation/storage/efficiency/grids), carbon & GHG, circular economy, climate tech, water management, waste, green buildings |
| `space` | Launch vehicles, spacecraft, propulsion (space-tagged), in-space services, space situational awareness |
| `digital` | AI/ML, software & services, data analytics, robotics: only when no domain label above applies |
| `other` | Agrifood, mobility, telecom, social innovation, creative industries |

### Core principle

**Use-domain beats technology enabler.** A company doing "AI for drug discovery" is `life_sciences`, not `digital`. A "quantum sensor for medical imaging" company is `life_sciences`, not `deeptech_hardware`. The `digital` and `deeptech_hardware` labels apply only when there is no clear end-use domain.

### Overlap resolution: priority order

When raw tags span multiple labels, apply the first matching rule:

1. Any space tag → `space`
2. Any medical/health tag → `life_sciences`
3. Any defense tag → `defense`
4. Any energy/climate/carbon/circular-economy/water/waste tag → `cleantech`
5. Mobility/aviation without space tag → `other`
6. Agrifood/agriculture → `other`
7. Quantum/photonics/semiconductors/HPC/advanced materials/advanced manufacturing → `deeptech_hardware`
8. AI/software/data/robotics → `digital`
9. → `other`

Note: `space` outranks `defense` so that space-launch or satellite projects (even military reconnaissance) are classified as `space`. EDF-funded space projects with "Defence Space" capability area will land in `space` per this order: this is intentional.

### Known tensions

- **Dual-use**: A company doing AI-for-medical-imaging that *could also* serve a military client stays `life_sciences`; only companies whose primary funded project is explicitly defense-purpose go to `defense`. EDF funding is the primary signal: any EDF coordinator is classified as `defense` regardless of other instrument overlap. A future `dual_use` boolean column can layer in if cross-cutting analysis is needed.
- **Cross-cutting biotech**: "Industrial Biotech & Biomanufacturing" can be cleantech (biofuels, bioremediation) or deeptech (precision fermentation for materials). Rule 4 resolves it: cleantech wins if a climate tag is present.
- **AI-heavy companies without domain tags**: A company tagged only "Artificial Intelligence" lands in `digital`. If they're really an AI drug discovery company, we rely on the LLM classification pass over `project_summary` to catch the missing domain tag.
- **Multi-domain research organisations**: For institutions like IMEC, CEA, Fraunhofer, SINTEF, or large universities whose work spans every sector, the first-EIC-tag-wins priority rule lands on whichever downstream use-domain happened to appear in their first EIC project (e.g. IMEC → `life_sciences` via a bio-electronics Pathfinder project, even though IMEC's primary discipline is semiconductors). The methodology's "use-domain beats technology enabler" rule was designed for single-domain companies and doesn't fit research orgs whose *primary discipline IS the technology enabler*. The most egregious cases (IMEC entities) are corrected via `MANUAL_SECTOR_OVERRIDES` in `classify.py`; broader research_org sector_inferred values should be interpreted with caution. A proper fix would be a separate sentinel for multi-domain orgs, deferred to a future taxonomy revision.

### Why seven labels and not more

We considered a 9 to 10 label taxonomy (separate `agrifood_biotech`, `mobility`, `built_environment`, `advanced_manufacturing`). Collapsed because (a) per-label volumes are small individually, (b) the analytical question: does EU public capital signal private follow-on: is best assessed at the level of broad investor categories rather than vertical sub-sectors, and (c) finer-grained labels are easy to layer in later as sub-categorizations of the broad ones. `defense` was added in Sprint 6 when EDF loading made it the only remaining label forced by a programme with no existing sector home.

## Classification implementation

Sector and entity-type classifiers are deterministic Python: no LLM in the loop. See [classify.py](classify.py).

**Sector**: For each company, collect unique tags across all events, then apply the priority rules. Resolution order:

1. **CORDIS-style tag set** match (SPACE_TAGS, LIFE_SCIENCES_TAGS, DEFENSE_TAGS, CLEANTECH_TAGS, DEEPTECH_TAGS, DIGITAL_TAGS) — Horizon Europe / EIC native tag vocabulary.
2. **NACE-code mapping** (Sprint 15) — SATR rows store NACE Rev. 2 descriptions in `sector_tags_raw` (e.g. "Manufacture of pharmaceutical preparations" → life_sciences). The NACE classifier collects all NACE hits across linked events and applies the same priority order as the tag classifier (space > life_sciences > defense > cleantech > deeptech > digital > other). See `NACE_TO_SECTOR` in `classify.py`.
3. **Keyword fallback** on `project_title + project_summary` (CORDIS programme topics, EIB project summaries, NDB portfolio descriptions).
4. **Source-family fallback** for sources with intrinsic sector mapping (IPCEI source → sector, Innovation Fund → cleantech, Chips JU → deeptech_hardware, EDF → defense, NDB-specific dicts).

Post-Sprint-15: ~67% of the corpus is sector-classified into one of seven labels; the remaining 33% is split between explicit "other" (NACE indicates non-tech sector — hotels/construction/etc, 21%) and "unclassified" (NACE generic enough to be ambiguous — "Other manufacturing", "Treatment and coating of metals", 33%). The unclassified bucket can be queried out for innovation-focused analyses.

> **Loader→classifier ordering**: `classify.py` must be re-run after any loader that inserts new `companies` rows. It is idempotent and re-reads all sources off `public_funding_events`. (Caught on Day 3 follow-up: IPCEI rows initially landed as `unclassified` because the classifier wasn't re-run post-extraction.)

**Entity type**: Three-bucket scheme (`research_org` / `company` / `other`), populated by deterministic name-based regex. Priority order: research_org > public body (other) > company. Granular splits (startup / SME / large_corp / consortium) are deferred to a later enrichment pass: they require Dealroom or EU registry data anyway.

- `research_org`: name matches research/academic patterns. Multilingual coverage: university stems (English, Spanish/Portuguese, German, Italian, Nordic, Polish "Uniwersytet", Slovak "Univerzita", Greek "Panepistimio", Hungarian "Egyetem", Icelandic "Háskóli", Finnish "Korkeakoulu"), Hochschule, polytechnic variants, college, "institut(e)" anywhere in name (catches compounds like "AgroBioInstitute"), Italian "istituto", Czech "ústav", named bodies (Fraunhofer, Max Planck, Helmholtz, Leibniz, CNRS, CSIC, CEA, TNO, VITO, CIEMAT, INSERM, DKFZ, MRC, IMEC), foundations (Stichting, Stiftung, Fondazione, Fundación, Fundação), hospitals/clinical research (Hospital, Hôpital, Ospedale, Krankenhaus, Klinik, Clinique, Hospice, Hopitaux, Italian Azienda Ospedale/Socio-Sanitaria), German Forschung\*, Belgian Studiecentrum, ERIC (European Research Infrastructure Consortium), Belgian VZW/IVZW/AISBL non-profits, synchrotron facilities.
- `other`: public bodies: ministries (multi-language), agencies (Agence/Agencia/Agentur/Agenzia/Agency), regional authorities, municipalities, health services (Servicio de Salud, Servizio Sanitario), European Commission.
- `company`: recognised corporate legal forms (multilingual): GmbH/gGmbH/AG/KG/UG/Gesellschaft (DE), BV/NV (NL/BE), SAS/SARL/SA/SCA (FR), SRL/SpA/SCPA + long forms (IT), SL/SLU/SAU (ES), Lda/CRL (PT), Ltd/PLC/LLC/Inc/Corp (Anglo/US), AB/ApS/A/S/AS (Nordic), Oy/Oyj/hf/ehf (FI/IS), DOO/DD (SI), UAB (LT), OOO (RU), SRO (CZ), sp. z o.o./Spolka Akcyjna (PL), EE/IKE (GR), Zrt/Kft/Nyrt (HU), SE (Societas Europaea). Plus Accelerator coordinator → company (Accelerator programme is SME-only by eligibility).
- `unknown`: names without any of the above signals. Mostly companies that don't carry a legal-form suffix (e.g. "PASQAL", "POIETIS", "EDF"). Defer to enrichment pass.

Current distribution (post-IPCEI, 2,484 companies): 1,407 company (57%), 585 research_org (24%), 9 other (0.4%), 483 unknown (19%). The unknown share grew from 10% (EIC-only) to 19% because IPCEI direct-partner names in the Commission PDFs often appear without legal-form suffixes (e.g. "Infineon", "Bosch", "Globalfoundries", "Carl Zeiss"). These are obviously corporates but get deferred to the same enrichment pass as the EIC suffix-less names.

## IPCEI extraction

### Scope (v1)

Eleven Commission state-aid decisions in scope.

> **⚠️ COUNTING METHODOLOGY. REVIEW REQUIRED**
>
> The "Direct partners" column below counts **distinct companies** as named in each Commission decision, which is how the Commission itself reports the figure. Our database, however, stores **one row per (company, member-state) funding event**, because a company like Solvay receiving aid in BE, FR, and IT is genuinely three separate state-aid awards. This means `ipcei_partners.csv` will always have *more rows* than the partner counts here: e.g. Batteries has 17 distinct companies but 23 funding-event rows.
>
> **Before relying on this table for any published count, verify whether you mean distinct companies or funding events.** The right validation for extraction quality is the per-IPCEI aid-sum against the Commission press-release headline figure, not the row count. The "Funding rows (extracted)" column was added 2026-05-20 to make this explicit; it will be filled in after the CSV checkpoint is complete.

| IPCEI | Year | SA case | Direct partners (distinct co.) | Funding rows (extracted) | Aid extracted | Press-release total | Sector |
|---|---|---|---|---|---|---|---|
| Microelectronics | 2018 | SA.46705 (FR coord) | 32 | 27 | redacted | €1.75bn | `deeptech_hardware` |
| Microelectronics & Communication Tech (ME/CT) | 2023 | SA.101129 | 56 | 68 | €8.13bn | €8.1bn ✓ | `deeptech_hardware` |
| Batteries (first wave) | 2019 | SA.54794 (FR coord) | 17 | 23 | redacted | €3.2bn | `cleantech` |
| European Battery Innovation (EuBatIn) | 2021 | SA.55831 (DE coord) | 42 | 40 | redacted | €2.9bn | `cleantech` |
| Hy2Tech | 2022 | SA.64647 (DE coord) | 35 | 41 | €5.42bn | €5.4bn ✓ | `cleantech` |
| Hy2Use | 2022 | SA.64650 (NL coord) | 29 | 31 | €5.12bn | €5.2bn ✓ | `cleantech` |
| Hy2Infra | 2024 | SA.102825 (DE coord) | 32 | 31 | €5.21bn | €6.9bn (1 redacted) | `cleantech` |
| Hy2Move | 2024 | SA.104676 (DE coord) | 11 | 13 | €1.44bn | €1.4bn ✓ | `cleantech` |
| Cloud (CIS) | 2023 | SA.102517 (DE coord) | 19 | 19 | €0.75bn | €1.2bn (6 redacted) | `digital` |
| Med4Cure | 2024 | SA.104974 (FR coord) | 13 | 14 | €0.82bn | €1.0bn (5 redacted) | `life_sciences` |
| Tech4Cure | 2025 | SA.113212 (FR coord) | 10 | 10 | €0.40bn | ~€1.0bn | `life_sciences` |
| **Total** | | | **~296** | **317** | **, ** | **, ** | |

The press-release "direct partners" counts sum to ~296 across the 11 IPCEIs, but our DB lands at **302 distinct companies** post-load. The +6 gap is a mix of (a) Commission press releases occasionally rounding or omitting late-added partners that the PDF tables still enumerate, and (b) name-normalisation cases where what the press release calls one corporate group appears as two distinct legal entities in the PDF (e.g. a parent + a project-vehicle subsidiary). Aid-sum validation, not row count, remains the primary correctness signal.

**Hy2Infra gap (€5.21bn extracted vs €6.9bn press release, −24%)**: only 1 row redacted in the PDF, but it is a single very large anchor partner (likely steel/H2 industrial decarbonisation). Per-row max in the extracted set is €574m (Energie Salentine), so a single redacted row hiding ~€1.7bn is plausible. Flag any Hy2Infra-level aggregation as conservative until the partner is identified manually.

### Direct partners only (v1 decision)

IPCEIs distinguish **direct partners** (large named beneficiaries who receive aid directly, typically 5 to 20 per IPCEI) from **indirect partners** (downstream SMEs and sub-suppliers). For v1 we load **direct partners only** because:

1. Direct partners carry the signal we want: they are the named recipients of EU public capital
2. Direct-partner data is well-documented in every Commission decision; indirect-partner lists are often summarised (e.g. "approx. 200 SMEs across 12 member states") rather than enumerated
3. Indirect partners are typically already captured by Horizon programmes (EIC, etc.) where they appear with PIC codes
4. Tractable extraction surface: landed at 317 funding-event rows / 302 distinct companies once all 11 PDFs were processed (initial estimate ~80 to 120 was off by roughly 3×; the legacy PDFs name more partners per IPCEI than expected)

If a research question later requires indirect-partner detail, we can re-extract per IPCEI on demand.

### Schema mapping

| Field | IPCEI value |
|---|---|
| `source` | `ipcei_micro`, `ipcei_batteries`, `ipcei_eubatin`, `ipcei_hy2tech`, `ipcei_hy2use`, `ipcei_mect`, `ipcei_cloud`, `ipcei_hy2infra`, `ipcei_hy2move`, `ipcei_med4cure`, `ipcei_tech4cure`: canonical list is `PROGRAM_META` in [extract_ipcei.py](extract_ipcei.py). Note: old placeholder `ipcei_health` and suffix-year variants (`_2018`, `_2019`, `_2021`, `_2023`) are retired. |
| `role` | `direct` (new role value; EIC uses `coordinator`/`participant`) |
| `call_id` | SA case number (e.g. `SA.46705`) |
| `grant_amount_eur` | Approved aid ceiling (note: ceiling, not necessarily disbursed) |
| `sector_tags_raw` | Empty (IPCEIs don't tag like EIC); sector_inferred set directly per IPCEI |
| `raw_source_url` | URL of the Commission decision PDF |

### Two-layout extraction strategy

PDFs fall into two families handled separately in `extract_ipcei.py`:

**Modern (2022+):** Tables captioned `Table N, <Country>, Financial figures in EUR million`. State-aid column is nominal EUR. Amounts are explicit numbers (e.g. `18.77`) with some range-redacted cells (`[10 to 20]`). Multiplied by 1,000,000 to store as EUR.

**Legacy (2018 to 2021):** Tables captioned `Table N: <Country>, State aid per company in 1000 €`. Amounts mostly redacted (`[…]`) or expressed as ranges (`[6 000 to 10 000]`) in thousands of EUR. Where no amount is extractable, `aid_amount_eur` is NULL and `aid_amount_raw` retains the original cell text for traceability. Sweden Batteries row is in SEK and stored as-is with `aid_amount_eur = NULL`.

Country attribution is resolved in priority order: (1) explicit table caption below the table, (2) top of the next page, (3) caption above the table. For Hy2Infra, project codes (e.g. `DE43A`) override caption-derived country.

### Redacted-amount handling

When an amount is `[…]` or fully redacted, `aid_amount_eur` is NULL and `aid_amount_redacted = 1`. When an amount is a range (`[6 000 to 10 000]`), the midpoint is **not** imputed, `aid_amount_eur` is NULL and `aid_amount_is_range = 1` with the raw string preserved. This is conservative: any aggregation over `grant_amount_eur` must account for the NULL rows.

### Matching strategy

IPCEI PDFs do **not** carry PIC codes (PIC is Horizon-specific). Match against existing `companies` by canonical_name + country:
- Exact normalised-name match within same country → link to existing `companies.id` (multi-instrument winner pattern)
- Fuzzy match (SequenceMatcher ratio ≥ 0.92, same country) → link with `match_confidence='medium'`
- No match → insert new row, `match_method='ipcei_pdf'`, `pic=NULL`

**Day-3 results (2026-05-20):** 317 events loaded, 302 distinct companies. 7 matched to existing EIC companies (exact); 295 new IPCEI-only companies inserted. See `data/processed/ipcei_match_summary.csv` for row-level match details.

## EIB venture debt extraction

### Scope

EIB direct venture-debt and growth-finance loans to European corporate borrowers, 2021-01-01 to 2026-05-20. Instruments included:

- **EGF VD** (European Guarantee Fund Venture Debt, 2021 to 2022): EIB direct loans under the COVID-19 EGF window, tagged `(EGF VD)` in EIB project titles
- **InvestEU VD windows** (2022+): `IEU LS` (Life Sciences), `IEU TI` (Thematic Innovation), `IEU FT` (Future Tech), `IEU GT / GT2 / GT3` (Green Deal/Green Tech), `IEU SIW` (Sustainable Investments Window), `IEU G` (Growth): tagged `(IEU XX)` in project titles
- **IDGF** (Innovation & Digitalisation Growth Finance): older programme, tagged `IDGF` in project titles

Instruments **excluded**:
- EIF (European Investment Fund): fund-of-funds, money goes to VC funds not directly to companies
- EGF VDC (Venture Debt Co-investment): vehicle-level instruments, not direct corporate loans
- EIB intermediated lending (loans to banks who on-lend to SMEs): borrower is the bank
- Framework / programme-level entries (`PL` suffix) and Lending Envelopes (`LE I/II/III`)
- Projects with `amount_approved_eur > €200M` (programme allocations, not individual loans)
- Multi-country entries (country code `C7` or non-ISO-2 country fields)

### Schema mapping

| Field | EIB value |
|---|---|
| `source` | `eib_venture` for all instruments (EGF VD and InvestEU VD cannot be reliably distinguished at the event level from title alone; unified under one source label) |
| `role` | `borrower` |
| `call_id` | EIB project number (e.g. `20230920`) |
| `project_title` | EIB project title as published (e.g. `SNIPR BIOME RDI (IEU TI HERA)`) |
| `project_summary` | Short EIB project description (from API; used for keyword-based sector classification) |
| `project_started` | Signature date (from EIB `additionalInformation` field) |
| `debt_amount_eur` | Approved loan amount in EUR (from EIB `additionalInformation[2]`): never stored in `grant_amount_eur` |
| `sector_tags_raw` | EIC-compatible tag derived from EIB sector label via `EIB_SECTOR_TAGS` map (e.g. EIB "Energy" → `"Energy"` which `classify.py` maps to `cleantech`); empty string for broad sectors (Industry, Services) where keyword fallback on `project_summary` is used instead |
| `raw_source_url` | `https://www.eib.org/en/projects/all/{project_id}` |

### Sector mapping rationale

EIB publishes one of ~8 broad sector labels per project (Energy, Health, Industry, Services, Transport, Telecom, Agriculture/fisheries/forestry). The `classify.py` CLEANTECH_TAGS set already contains `"Energy"`, and LIFE_SCIENCES_TAGS contains `"Health Biotechnology"`. For other EIB sectors, the sector is inferred from keyword matching over `project_summary`:

| EIB sector | sector_tag stored | classify.py outcome |
|---|---|---|
| Energy | `"Energy"` | `cleantech` via CLEANTECH_TAGS |
| Health | `"Health Biotechnology"` | `life_sciences` via LIFE_SCIENCES_TAGS |
| Telecom | `"Data & ICT"` | `digital` via DIGITAL_TAGS |
| Industry | `""` (empty) | keyword fallback on description |
| Services | `""` | keyword fallback on description |
| Transport | `""` | keyword fallback on description |
| Agriculture, fisheries, forestry | `""` | keyword fallback on description |

### Matching strategy

EIB borrowers do not carry PIC codes. Match against existing `companies` by canonical_name + country, following the same strategy as `extract_ipcei.py`:
1. Normalise borrower name: strip legal-form suffixes, punctuation, lowercase
2. Exact normalised-name match within same country → `match_confidence='high'`
3. Fuzzy match (SequenceMatcher ratio ≥ 0.92, same country) → `match_confidence='medium'`
4. No match → insert new row, `match_method='eib'`, `pic=NULL`, `match_confidence='unmatched'`

Borrower names are scraped from individual EIB project detail pages (the "Promoter, financial intermediary" field). Title-derived fallback (strip framework suffix) is used for the few pages that fail to resolve. The fallback also strips "TECHEU VD " prefixes from the newer 2024 to 2026 loan titles.

### Validation results

See Day 4 in [notes.md](notes.md) for post-load numbers and multi-instrument winners.

## Innovation Fund extraction

EU Innovation Fund grant-signed projects (calls 2020 to 2024) loaded from CINEA project fiche PDFs. Scope: 20 sub-call tracks across 5 call years (Large-scale, Small-scale, Medium-scale, Manufacturing, Pilots, Battery, H2 Bank Auction).

**IF25 exclusion**: All IF25 projects remain in "Invited to grant agreement preparation" status as of 2026-05-21. They will be added once grant agreements are signed.

**Source**: `climate.ec.europa.eu/eu-action/eu-funding-climate-action/innovation-fund/innovation-fund-projects_en` project table + individual CINEA project fiche PDFs (`data/raw/innovation_fund/fiches/`).

**PDF parsing**: All IF fiches use a two-column layout (project summary left, metadata right). `pdfplumber.extract_text()` on the full page interleaves both columns. Fix: `page.crop((width/2, 0, width, height))` to isolate right-column metadata. Two amount field name variants exist: "AMOUNT OF INNOVATION FUND GRANT" (2020 to 2022) and "AMOUNT OF THE INNOVATION FUND GRANT" (2021+); parser handles both.

**Schema mapping**:
- `source`: `innovation_fund_{track}_{year}` (20 values; see `CALL_TO_SOURCE` in `extract_innovation_fund.py`)
- `role`: `direct`
- `grant_amount_eur`: from fiche COORDINATOR / AMOUNT fields; NULL for 7 projects with no published fiche
- `debt_amount_eur`: NULL (grant instrument only)
- `sector_tags_raw`: `"Energy, {category}, {sector}"` from the climate.ec.europa.eu category and project-level sector (e.g. `"Energy, Energy-intensive industries, Cement & lime"`). The leading `'Energy'` tag triggers `CLEANTECH_TAGS` membership in the classifier; the trailing tags enable sub-sector SQL queries (`WHERE sector_tags_raw LIKE '%Hydrogen%'`, etc.). `IF_SOURCE_SECTOR` in `classify.py` (imported from the extractor) is the final fallback.
- `project_started`: call award date (see `CALL_TO_SOURCE`)

**Company matching**: exact normalize → fuzzy SequenceMatcher ≥ 0.92 → new insert with `match_method='innovation_fund'`.

**Sector**: all IF sources → `cleantech` via `IF_SOURCE_SECTOR` in `classify.py`. No manual overrides needed.

## Chips JU / KDT JU extraction

Chips JU (formerly KDT JU) awarded projects loaded from the chips-ju.europa.eu portal's OData API. Scope (v1): 35 KDT JU projects across call years 2020 to 2023 (the JU portal labels both ECSEL-transition and Chips Act-era projects under `shv_jueratype=920810000`; the predecessor ECSEL JU is filtered out by the same field). Option A (coordinator only): the OData API does NOT expose the full beneficiary list per project, only the lead institution.

**Source**: `https://www.chips-ju.europa.eu/_api/shv_webprojectses?$filter=shv_jueratype%20eq%20920810000`: a Dynamics 365 / PowerApps portal OData endpoint discovered from the page source of `/projects/`. Returns clean JSON; no PDF parsing required. Cached to `data/raw/chips_ju/chips_ju_projects.json`.

**Scope decisions**:
- **Call year 2020 included** (2 projects): the portal labels them KDT and both started in 2021 (within the project's 2021+ time window). They represent the KDT JU's transition projects (ASML's ID2PPAC, SIOUX's IMOCO4.E).
- **KDT-2023 incomplete** (4 of ~25 expected projects): the portal was still being populated as of 2026-05-21 (SMARTY added Oct 2025). Re-running the extractor is idempotent and will pick up the rest once published. Per-call grant sum is €38.2M vs an expected ~€240M budget: flag this gap when reporting KDT-2023 totals.
- **Chips JU 2024+ R&D calls not in scope**: the first Chips JU-branded calls (under the Chips Act mandate, post-2024) are not yet published in the portal; the `shv_jueratype` enum has no Chips JU value yet, only KDT and ECSEL.
- **Pillar 1 manufacturing subsidies excluded**: state-aid notifications, not a Chips JU call: partially covered by IPCEI MECT/Microelectronics already.

**Schema mapping**:
- `source`: `chips_ju_kdt_{2020..2023}` (one per call year)
- `role`: `direct`
- `grant_amount_eur`: `shv_totalinvestment` from the portal, **total JU public funding** (EU + member-state contributions combined; the EU-only share is roughly half but is not published per project, same caveat as IPCEI state-aid totals)
- `debt_amount_eur`: NULL (grant instrument only)
- `sector_tags_raw`: `"Semiconductors, {category}"` where category is the chips-ju impact-area field (Digital Industry, Digital Society, etc.). `"Semiconductors"` added to `DEEPTECH_TAGS` in `classify.py` so tag-match resolves directly without falling through to source-sector mapping.
- `project_started`: `shv_startdate` from the portal
- `raw_source_url`: project detail page in the portal

**Coordinator-country derivation**: the portal exposes the full list of participating consortium countries (`shv_countries`) but NOT a separate coordinator-country field. Country is derived from the institution name using three tiers: (1) explicit country mention ("GERMANY", "AUSTRIA", "NEDERLAND": case-insensitive); (2) language-specific institution patterns (POLYTECHNEIO → GR, SCUOLA SUPERIORE → IT, COMMISSARIAT → FR, SINTEF → NO, etc.); (3) hardcoded org overrides for multi-country corporates (ASML→NL, INFINEON…AG→DE, AVL LIST GMBH→AT). Result is validated against the consortium-country list. After exact/fuzzy/prefix match against the existing `companies` table, matched rows inherit the canonical country, so derivation only fires for new inserts.

**Company matching**: exact (normalised name + country) → name-only exact (when country can't be derived) → **prefix match** (existing name is a whole-word prefix of new name, ≥4 chars, same country) → fuzzy SequenceMatcher ≥ 0.92 → new insert with `match_method='chips_ju'`. The prefix tier was added specifically for Chips JU and is the key entity-resolution improvement of this sprint: IPCEI MECT/Micro stored shortened names ("ASML", "Infineon", "Bosch") while Chips JU uses full legal names ("ASML NETHERLANDS B.V.", "INFINEON TECHNOLOGIES AG"); fuzzy ratio is too low to bridge these but prefix is exact.

**Sector**: all Chips JU sources → `deeptech_hardware` via two paths: (1) `"Semiconductors"` tag added to `DEEPTECH_TAGS` so the tag-match path resolves directly; (2) `CHIPS_JU_SOURCE_SECTOR` in `extract_chips_ju.py` (imported by `classify.py`: single source of truth, same pattern as `IF_SOURCE_SECTOR`) as a fallback for any tag-less row. Multi-source Chips JU companies (e.g. CEA. EIC Pathfinder/Transition + Chips JU) keep their primary EIC-derived sector per the methodology's priority order (Space > Life Sciences > Cleantech > Deeptech > Digital); this is by design.

**Methodological caveats** (same as Innovation Fund Sprint 4 under Option A):
1. **Coordinator-only capture**: undercounts companies reached. Each KDT JU project is a 5 to 40 partner consortium; only the lead institution is captured. Cross-instrument "number of companies reached" comparisons must caveat that Chips JU figures count only coordinators.
2. **Country = coordinator HQ**: not project location. CEA coordinating a project executed across multiple sites would still be FR in our DB.
3. **`shv_totalinvestment` = combined JU public funding**: not EU-only. KDT JU is a public-public partnership; the figure combines EU (Horizon Europe) and national member-state contributions to the JU. The EU-only split is roughly 50% but is not published per project. Comparable to IPCEI state-aid totals (also combined cross-jurisdiction). When reporting "EU contribution", apply the ~50% rule of thumb or note the methodology caveat.
4. **KDT-2023 incomplete**: silent undercount in 2023 totals. Re-check periodically and re-run the extractor (idempotent).

## EDF extraction

European Defence Fund awarded projects (2021 to 2025 calls) loaded from individual per-project PDF factsheets published on `defence-industry-space.ec.europa.eu`. Scope (v1): coordinator only (Option A): same convention as IF and Chips JU. **276 coordinator events loaded across all 10 source IDs (RA + DA for each of call years 2021 to 2025), 97% coverage.**

**Data source**: Per-project factsheet PDFs hosted on the EDF results pages at `defence-industry-space.ec.europa.eu`. Each PDF contains: project acronym, title, call title, topic/capability area, duration, activity types, estimated total cost, maximum EU contribution (page 1), and a consortium member table with "(Coordinator)" marker (page 2+). No OData API or structured export is available: factsheets are the only machine-readable source for EDF. **285 factsheet URLs catalogued across all call years 2021 to 2025; 276 successfully parsed and loaded; 8 missed (4 EDF 2025 still rate-limited, 4 real-PDF parse failures likely needing OCR).** Coverage by year: EDF 2021 (59/60), EDF 2022 (39/41), EDF 2023 (60/61), EDF 2024 (63/63), EDF 2025 (55/59). Initial load (no per-request delay) achieved only 50% coverage because the EC server rate-limited the domain and returned HTML "Sorry" pages disguised as ~40KB PDFs; the `_is_real_pdf()` magic-byte check plus a `--sleep=N` CLI flag recovered the remainder on a second run.

**RA/DA determination**:
- EDF 2022 to 2025: "Call title" field states "Research actions" or "Development actions" explicitly.
- EDF 2021: "Call title" is the capability area (e.g. "Avionics and advanced air combat"). Infer from "Type(s) of activities": if "Generating knowledge" or "Integrating knowledge" → RA; if "Prototyping" / "Testing" without knowledge-generation activities → DA; plain "Studies" / "Studies; Design" defaults to DA.

**PDF parsing**: EDF factsheets use a two-column table on page 2+ (company name left, country right). The PDF text extractor (pdfplumber) sometimes fuses the last word of the company name with "(Coordinator)" into a single token (e.g. "FRANCE(Coordinator)"). The extractor uses `extract_words()` with x-position thresholds to reconstruct the two-column layout, handles multi-line company names (spanning up to ~45px above the "(Coordinator)" word), and strips the fused suffix to recover the full name. Country is extracted from the right column (x > 65% of page width) within the same y-window.

**Amount**: "Maximum EU contribution" from page 1 → `grant_amount_eur`. "Estimated total cost" (EU + national co-funding) is NOT stored: same caveat as Chips JU `shv_totalinvestment` and IPCEI state-aid totals. EDF-DA projects have member-state co-funding of 20 to 80%; our stored amount is the EU-contribution ceiling only.

**Schema mapping**:
- `source`: `edf_ra_<year>` or `edf_da_<year>` (10 values for call years 2021 to 2025, all populated)
- `role`: `direct` (consistent with IF and Chips JU Option A convention; `coordinator` label reserved for EIC where the role distinction is meaningful at event level)
- `grant_amount_eur`: EU contribution ceiling from factsheet
- `debt_amount_eur`: NULL (grant instrument)
- `sector_tags_raw`: `"Defense, {capability_area}"` where capability area is the topic/call title from the factsheet (e.g. `"Defense, Sensors"`, `"Defense, Ground Combat"`). The leading `"Defense"` tag triggers `DEFENSE_TAGS` membership in the classifier.
- `project_started`: awarded date per call year (approximate; varies within a year as grant agreements are signed)

**Coordinator-country derivation**: EDF factsheet tables explicitly state the country on the same row. Country names are converted to ISO2 via a lookup table; for the few cases where the extractor cannot isolate the country from the PDF layout, `_derive_country_from_name()` applies a 3-tier heuristic (explicit country mention in name → language patterns → hardcoded org overrides for known defense primes). 0 NULL country after load (1 case. CYBERNETICA AS: fixed manually to EE).

**Company matching**: exact (normalised name + country) → name-only exact → prefix (existing name is a whole-word prefix of new name, ≥4 chars, same country) → fuzzy SequenceMatcher ≥ 0.92 → new insert with `match_method='none'`. The prefix tier was critical for bridging defense-prime name variants across instruments.

**Sector**: all EDF sources → `defense` via two paths: (1) `"Defense"` tag in `DEFENSE_TAGS` membership check (primary path; every EDF row has `sector_tags_raw` starting with `"Defense"`); (2) `EDF_SOURCE_SECTOR` dict in `extract_edf.py` (imported by `classify.py`, same single-source-of-truth pattern as `IF_SOURCE_SECTOR` and `CHIPS_JU_SOURCE_SECTOR`) as a fallback. Multi-source EDF companies (e.g. Thales, CEA, SINTEF: also in EIC/IPCEI/Chips JU) retain their primary existing sector per the methodology's priority order (Space > Life Sciences > Defense > …); this is by design.

**Methodological caveats**:
1. **Coordinator-only capture**: each EDF project consortium has 5 to 25+ partners; only the lead is loaded. The "number of EDF-funded companies" count is a coordinator count, not a full beneficiary count.
2. **Coverage near-complete (97%)**, 9 of 285 EDF factsheets remain unloaded: 4 EDF 2025 URLs still rate-limited (idempotent re-run will pick them up), 4 real-PDF parse failures across 2021 to 2023 (likely scanned-image factsheets needing OCR), 1 NULL grant amount.
3. **Amount = EU contribution ceiling**: not necessarily disbursed; not the total project cost. EDF-DA projects have co-funding obligations (20 to 80% national contribution).
4. **EDF 2021 RA/DA split imprecise**: the call title in EDF 2021 factsheets does not label RA vs DA explicitly. Activity-type heuristic is best-effort; 3 borderline projects (activity types = "Studies" only) defaulted to DA.
5. **PADR/EDIDP out of scope**: predecessor defense programmes (PADR 2017 to 2019, ~€90M, ~18 projects; EDIDP 2019 to 2020, ~€500M, ~62 projects) predate the tracker's 2021+ time window. Could be added in a future mini-sprint.
6. **Duplicate company rows for same legal entity**: defense primes sometimes appear under slightly different names across call years (e.g. "LEONARDO S.p.A." vs "LEONARDO -SOCIETA PER AZIONI"). These map to separate rows despite being the same company. The prefix matcher resolved most but not all cases; review during Dealroom enrichment.

## EIT KIC extraction

EIT Digital (rebranded to 28digital.eu in 2025) and EIT Manufacturing (ASBL, ceased operations 10 April 2026 but pages remain online) loaded in Sprint 7. All company data compiled from web-fetched pages into hardcoded Python lists in `extract_eit.py`: no live HTML parser: because page structures are inconsistent and N is small enough to curate manually.

**EIT Digital scope**: 6 sources. Champions cohorts 2021 to 2025 (called "EIT Digital Challenge" until 2023, renamed "Champions" from 2024; all unified as `eit_digital_champions_<year>`) + EIC to EIT Digital Venture Acceleration Programme 2022 (`eit_digital_vap_2022`). Total: 51 events.

**EIT Manufacturing scope**: 4 sources: investment portfolio (21 companies, equity undisclosed, `eit_manufacturing_investments`) + BoostUp! competition winners 2021, 2023, 2024 (17 sources with cash prizes €2.5K to €50K, `eit_manufacturing_boostup_<year>`). BoostUp 2022 excluded, 8 winners at €20K each but winner names not published. Total: 48 events.

**Schema mapping**:
- `source`: 10 source IDs (`eit_digital_champions_{2021..2025}`, `eit_digital_vap_2022`, `eit_manufacturing_investments`, `eit_manufacturing_boostup_{2021,2023,2024}`)
- `role`: `portfolio_company` (new role value for EIT rows)
- `coordinator_only`: `1` for all rows (single-company participation, no consortium)
- `grant_amount_basis`: 3 new labels, `eit_kic_support` (Champions/VAP: no cash, support services only), `eit_kic_grant` (BoostUp cash prizes), `eit_kic_equity` (investment portfolio, amount undisclosed)
- `project_title`: truncated description (first 200 chars); `project_summary`: full description + notes
- `sector_tags_raw`: empty string for all rows; `EIT_KIC_SOURCE_SECTOR` dict in `extract_eit.py` (imported by `classify.py`) provides source-level fallback (`digital` for EIT Digital sources, `deeptech_hardware` for EIT Manufacturing)

**Company matching**: same 5-tier matcher as Chips JU/EDF: exact (name+country) → exact name-only → **forward prefix** (existing name is whole-word prefix of new) → **reverse prefix** (new name is whole-word prefix of existing, added Sprint 7 to handle EIT short names vs. long EIC legal names) → fuzzy (≥0.92 threshold) → new insert. The reverse-prefix tier was added because 3 EIT short names (`Plexigrid`, `Ekkono`, `Orange Quantum Systems`) failed to match existing EIC legal-form names (`PLEXIGRID SOCIEDAD LIMITADA`, `EKKONO SOLUTIONS AB`, `ORANGE QUANTUM SYSTEMS OPERATIONAL BV`); 3 duplicate rows were detected via `data/processed/eit_match_summary.csv` and merged via SQL.

**EIT Digital × EIC overlap**: 6 of 51 EIT Digital companies also appear in EIC (11.8%). Sprint plan gate was ≥20%; the shortfall reflects small per-year cohorts (3 to 13 champions) and a niche-vertical bias (not every EIT Digital winner is in the EIC-fundable life-sciences / deeptech space). Full overlap list: Connecting Food (FR), Multiverse Computing (ES), GrayMatters Health (IL), Ekkono Solutions AB (SE), Plexigrid (ES), Orange Quantum Systems (NL).

**EIT Manufacturing multi-instrument winners**: 3 companies appear in both investments and BoostUp (ChainTraced DE, DREV SE, Litech NO). FAIRMAT SAS (FR) appears in both EIT Manufacturing BoostUp and EIB venture debt.

**Methodological caveats**:
1. **Hardcoded data**: company lists were compiled 2026-05-21 (Digital/Manufacturing) and 2026-05-25 (remaining 6 KICs) from source pages. New cohorts require a manual data update to `extract_eit.py`; no live web dependency.
2. **EIT Digital amounts = no cash**. Champions and VAP programmes offer support services, not grants. `grant_amount_eur` is NULL for these rows by design (`eit_kic_support` basis).
3. **BoostUp 2022 excluded**. EIT Manufacturing BoostUp 2022 grand-final winners (8 companies, €20K each) were not published on the website.
4. **EIT Manufacturing ceased operations**. ASBL wound down 10 April 2026; website is a frozen snapshot. The investment portfolio date is approximate (`2023-01-01`).
5. **EIT InnoEnergy basis = `eit_kic_equity`**. Highway portfolio is an equity investment programme; amounts are undisclosed. Companies without a country ISO code are stored with `country=""`.
6. **EIT Urban Mobility partial**: portfolio page uses JavaScript alpha-filter; only A-D section visible via static WebFetch (23 companies). Full portfolio likely larger; re-run with a JS-capable scraper to complete.
7. **EIT Climate-KIC country coverage poor**. CDR boot camp October 2022; only 7 of 22 companies have a determinable country from public sources.
8. **EIT Health Catapult edition mapping**. Edition 6=2022 cycle, 7=2023, 8=2024, 9=2025. Edition 5 (2020-21 cycle) had no accessible public winner list; `eit_health_catapult_2021` source exists in `CALL_TO_SOURCE` but has zero company rows.

## Horizon Europe Pillar II extraction (Sprint 12)

Implemented in `scripts/extract_cordis_pillar_ii.py`. Reads the CORDIS open-data dump at `data/raw/cordis/` (project + organisation + topics CSVs, same dump shared with Sprint 11's `extract_cordis.py`) and emits per-organisation events for the five in-scope clusters.

**Scope**:

| Cluster | Topic prefix | Default sector | Projects (post-2021) | Events | EU contribution |
|---|---|---|---:|---:|---:|
| CL1 Health (excl. IHI) | `HORIZON-HLTH-` | `life_sciences` | 429 | 6,933 | €3.76B |
| CL3 Civil Security | `HORIZON-CL3-` | `defense` | 192 | 3,106 | €0.82B |
| CL4 Digital, Industry & Space | `HORIZON-CL4-` | `digital` | 939 | 13,201 | €5.75B |
| CL5 Climate, Energy & Mobility | `HORIZON-CL5-` | `cleantech` | 932 | 14,335 | €5.51B |
| CL6 Food, Bioeconomy, Natural Resources | `HORIZON-CL6-` | `other` | 653 | 11,858 | €3.72B |
| **Total** |, |, | **3,145** | **49,433** | **€19.55B** |

CL2 (Culture, Creativity, Society) excluded: low industrial-policy signal, academia-dominated, out of scope for the strategic-resilience question that motivated Sprint 12.

**Granularity (deviation from coordinator-only Option A)**: per `(project, organisation)` rather than coordinator-only. CORDIS publishes per-participant EU contribution (`ecContribution`) explicitly; we keep it. The `role` column preserves CORDIS values (`coordinator` / `participant` / `thirdParty` / `associatedPartner`); `coordinator_only` is `1` for lead rows and `0` otherwise so existing lead-only analytics continue to work without modification.

**JU dedup**: Projects whose topic codes intersect any of `HORIZON-JU-IHI-*`, `HORIZON-JU-CHIPS-*`, `HORIZON-EUROHPC-*`, `HORIZON-KDT-*`, `HORIZON-JTI-CLEANH2-*`, `HORIZON-JU-CLEANH2-*` are skipped entirely: those JUs were already loaded in Sprint 11 via `extract_cordis.py` / `extract_chips_ju.py`. Validated: zero CL1 events carry a `HORIZON-JU-IHI-*` topic; zero CL4 events carry `HORIZON-JU-CHIPS-*` / `HORIZON-EUROHPC-*` / `HORIZON-KDT-*` topics.

**Schema mapping**:
- `source`: `horizon_eu_cl{1,3,4,5,6}_{year}` where year = project `startDate` year (2021 to 2025)
- `role`: lowercased CORDIS role; `coordinator_only=1` only for coordinator rows
- `project_number` = CORDIS project id; `call_id` = `f"{source}_{pid}_{org_id}"` for idempotent re-runs
- `grant_amount_eur` = CORDIS `ecContribution` per organisation (clean EU money per company)
- `total_project_cost_eur` = CORDIS `totalCost` (project-level, repeated across org rows; downstream rollups must avoid double-summing)
- `sector_tags_raw` = topic code (e.g. `HORIZON-CL4-2023-DIGITAL-EMERGING-01`); these are not in our tag dictionaries by design, so classifier falls through to keyword + source-fallback
- `grant_amount_basis = "horizon_eu_grant"` (single basis label for all five clusters: same instrument, different topical clusters; cluster distinction lives in the `source` field)
- `raw_source_url` = `https://cordis.europa.eu/project/id/{pid}`

**Company matching. PIC-first**: CORDIS `organisationID` is the PIC. Of the 2,188 existing PICs in the DB, 2,174 are present in CORDIS: so the join is canonical for most participating orgs already in the corpus. Match order: `pic` → exact (name+country) → exact name-only → forward prefix → reverse prefix → fuzzy ≥0.92 → new insert. PIC-matched new companies inserted with `match_confidence='high'`; name-only fallback inserts with `match_confidence='medium'`. Where an existing company lacked a PIC and CORDIS provided one, the PIC is backfilled (250 backfills across the five cluster loads).

**Classifier fall-through fix (latent bug, surfaced in Sprint 12)**: Pre-Sprint-12 `classify_sector` returned `"other"` whenever any `sector_tags_raw` strings existed but none matched a tag dict. CORDIS topic codes are tag-like strings outside our taxonomy, so all 49,433 Pillar II events would have locked their companies into `"other"`. Fix: when tags are present but none recognised, fall through to keyword classification on project title+summary and then to the source-sector fallback. This also (correctly) re-classified Sprint 11 CHP/EuroHPC companies that had been incorrectly locked into `"other"` for the same reason.

**Sector vocabulary**: deliberately reusing the existing seven-label taxonomy (`cleantech`, `deeptech_hardware`, `defense`, `digital`, `life_sciences`, `space`, `other`). The plan's `defense_dual_use`, `digital_ai`, `agritech_food` sub-labels are **not** introduced: instead, the cluster-default sector via `HORIZON_EU_CL{1,3,4,5,6}_SOURCE_SECTOR` dicts in `extract_cordis_pillar_ii.py` provides the fallback when keyword text doesn't fire. The dual-use signal for CL3 is preserved by the source ID (`horizon_eu_cl3_*`), not by a new sector label.

**Validation results** (post-load, 2026-05-26):
- G1 Baseline before load: 3,633 companies / 5,733 events
- G2 Dates: zero NULL `project_started` on Pillar II events
- G3 Sectors: zero new `unclassified` after `classify.py` re-run (5 pre-existing EIC unclassifieds untouched)
- G4 Dedup: 90 candidate pairs flagged by `audit_dedup.py`; 7 recommended merges (name-variants like `KNORR-BREMSE` vs `KNORR BREMSE`, `SAP` vs `SAP SE`) deferred to Sprint 13, 0.04% of corpus, not load-blocking. 2 needs-review pairs both Holcim/Bormioli sister entities across countries (per Sprint 8 rule: keep separate).
- G6 JU non-overlap: zero CL1 events carry `HORIZON-JU-IHI-*`; zero CL4 events carry `HORIZON-JU-CHIPS-*` / `HORIZON-EUROHPC-*` / `HORIZON-KDT-*`
- Cross-instrument: 24 companies appear in both Chips JU and CL4 (expected. CEA, IMEC, Atos/Eviden, Infineon, BSC class)

**Methodological caveats**:
1. **Org-level granularity is a deviation from the JU coordinator-only convention.** Per-event sums are still per-(project, org), so totals across `coordinator_only=1` ∪ `coordinator_only=0` rows for a single project will overcount the project. Use `WHERE coordinator_only=1` for project-count rollups; use full event set for participant-aware company counts. `total_project_cost_eur` is project-level repeated across org rows: never sum across org rows for total cost; max-per-project or join-via-coordinator.
2. **`thirdParty` and `associatedPartner` rows are loaded but rarely receive EU money.** They appear with `coordinator_only=0` like participants. Filter on `role IN ('coordinator','participant')` for direct-money analytics.
3. **High research-org proportion in CL1 (Health).** ~60 to 70% of CL1 organisations are hospitals/universities: expected for biomedical consortia. The `entity_type` classifier flagged 3,006 new research orgs in this load.
4. **CL6 (Food/Bioeconomy) sector defaults to `other`.** No new `agritech_food` sector was introduced. Companies whose project text triggers cleantech keywords (`bioremediation`, `biorefiner`, etc.) classify as cleantech; rest land in `other` via cluster fallback.
5. **Topic-code `sector_tags_raw` is opaque to the classifier.** It exists for traceability only: keyword classification on project text drives sector inference. If a downstream analysis needs finer-grained topic mapping (e.g. CL4 space sub-cluster → `space`), extend `extract_cordis_pillar_ii.py` to emit semantic tag-leaders mapped from topic-code substrings.
6. **2025 cohort is partial.** Only 339 events tagged 2025 across all five clusters: most 2025 calls hadn't signed by the dump date. Re-run with a fresh CORDIS dump quarterly.
7. **JU non-overlap is project-level, not topic-level.** A project tagged under both `HORIZON-CL4-*` and `HORIZON-JU-CHIPS-*` is skipped entirely from CL4, not just for the JU-tagged organisation. This is correct for direct-money dedup but may slightly understate CL4 footprint where a project legitimately spans Chips JU + a non-JU CL4 call.

## Enrichment plan (pending)

- **Granular entity refinement**: Split `company` into startup / sme / large_corp via Dealroom or EU Funding & Tenders Portal lookup by PIC. Same lookup can resolve the 221 remaining `unknown`.
- **Match enrichment**: Dealroom / Crunchbase / LinkedIn matching for the 1,374 companies to enable downstream private-funding event enrichment.

## Decision log

- **2026-05-20**. Project structure, PIC as canonical company ID, three-table schema, grant-only for v1
- **2026-05-20**. EIC Accelerator/Pathfinder/Transition loaded; primary analysis universe = Accelerator coordinators
- **2026-05-20**. Sector taxonomy: six labels (`life_sciences`, `deeptech_hardware`, `cleantech`, `space`, `digital`, `other`) with use-domain-over-technology priority and ordered overlap-resolution rules
- **2026-05-20**. Sector + entity_type classifiers implemented deterministically in [classify.py](classify.py). All 2,189 companies classified by sector. Entity type: 707 startups (Accelerator coordinators), 361 research_orgs (name pattern match), 1,121 still `unknown` pending LLM refinement.
- **2026-05-20**. Adopted 3-bucket entity scheme (`research_org` / `company` / `other`) for v1. Granular startup/SME/large_corp split deferred: requires Dealroom or EU registry data anyway. Heuristics expanded with multilingual coverage (research stems for 12+ languages; corporate suffixes for 15+ jurisdictions). Final entity_type distribution: 1,374 company, 585 research_org, 9 other (public bodies), 221 unknown (~10%, mostly suffix-less company names).
- **2026-05-20**. IPCEI extraction complete. 317 funding-event rows loaded across 11 decisions; 302 distinct companies; 7 matched to existing EIC records, 295 new. Aid sums validate within ±3% for all modern-format programs with non-redacted amounts (Hy2Tech €5.42bn vs €5.4bn, Hy2Use €5.12bn vs €5.2bn, MECT €8.13bn vs €8.1bn, Hy2Move €1.44bn vs €1.4bn). Legacy amounts (Micro, Batteries, EuBatIn) fully redacted in PDFs. NULL in DB. **Decision**: Benchmark counts updated from "distinct companies" to "funding-event rows" (see IPCEI scope table and flagged callout above); use aid-sum validation as primary correctness signal going forward.
- **2026-05-20 (sprint-2 hygiene pass)**: (a) Found classifier was never re-run after IPCEI load; 295 new rows had sat as `sector=NULL→unclassified` and `entity_type=unknown`. Extended `classify.py` with an `IPCEI_SOURCE_SECTOR` map (kept in sync with the IPCEI scope table) and added `sources` parameter to `classify_sector` so IPCEI-only companies resolve via source→sector after EIC tags and keyword fallback fail. Re-ran cleanly. (b) Aligned schema.sql column comments to the v1 6-label sector taxonomy and 3-bucket entity scheme. (c) Corrected README counts (707 distinct Accelerator coordinators / 712 events; project structure flattened to repo root) and fixed stale "~80 to 120 direct-partner rows" estimate (actual: 317). (d) Reconciled the +6 gap between press-release "~296 distinct partners" and DB's 302 distinct IPCEI companies, and noted the Hy2Infra −24% aid-sum gap is plausibly one large redacted anchor partner. Final counts: 2,484 companies, sectors fully populated (1,032 life_sciences / 677 cleantech / 482 deeptech_hardware / 146 space / 111 digital / 36 other), entity_type 1,407 company / 585 research_org / 9 other / 483 unknown.
- **2026-05-20 (sprint-3 EIB load)**. EIB venture-debt loaded. 153 events, 151 distinct borrowers, 16 matched to existing EIC companies, 135 new inserts; total committed debt €3,590M. `debt_amount_eur` column added to `public_funding_events`; `role='borrower'` used (not `coordinator`/`participant`/`direct`). Zero NULL `debt_amount_eur`, zero `grant_amount_eur` populated for EIB rows. Final counts: 2,619 companies (1,086 life_sciences / 711 cleantech / 499 deeptech_hardware / 150 space / 137 digital / 36 other), zero unclassified. **Workarounds / items needing future review:**
  1. **EIB scraper uses `subprocess.run(['curl', ...])`** instead of Python `urllib`: macOS Python SSL certificate store does not trust the EIB root CA, causing `CERTIFICATE_VERIFY_FAILED`. The curl workaround uses the system keychain. *Review if running on Linux CI or a new machine: curl must be present, or certificate verification must be configured for Python's ssl module.*
  2. **EIB sector_tags_raw is empty for Industry / Services / Transport borrowers**. EIB's broad sector labels give no useful signal for these categories, so `sector_tags_raw` is stored as `''` and classification falls entirely to keyword matching on `project_summary`. This required adding 50+ new keyword entries to `classify.py` to reach zero unclassified. *Proper fix: run a richer keyword pass inside `extract_eib.py` at load time and store explicit EIC-compatible tags in `sector_tags_raw`, reducing future dependency on keyword volume in the classifier.*
  3. **`MANUAL_SECTOR_OVERRIDES` dict** in `classify.py` (4 entries): used both for unclassifiable cases (NOMAGIC INC, RDI-only description) and to correct keyword-fallback misclassifications that violate the use-domain-over-technology rule (STARK FUTURE SL → cleantech, IN OVO HOLDING BV → other, CROWDFARMING SL → other). Applied AFTER `classify_sector` so it overrides, not just falls back. NOMAGIC INC is also the same company as NOMAGIC SP ZOO (separate legal entities) but the fuzzy-match threshold (≥0.92) didn't merge them. *Review when enriching with Dealroom: if both NOMAGIC entities resolve to the same Dealroom ID, merge them. If this dict grows past ~10 entries, refactor the classifier (e.g. pre-classification in `extract_eib.py` at load time, storing explicit `sector_tags_raw`).*
  4. **Two orphan company rows deleted** during classifier cleanup (DB IDs 2620 to 2621: "SQIM MYCELIUM TECHNOLOGY DEMO PLANT", "AMSILK ADVANCED MATERIALS"): project titles stored as company names, no linked events, and no clear origin. Legitimate rows (SQIM SRL id=2606, AMSILK GMBH id=2607) were unaffected. *Root cause: suspected race condition during an earlier CSV rebuild run. `sanity_check.py` now contains a `DQ: orphan companies` query that surfaces any future occurrence without auto-deleting. The `(source, call_id)` duplicate guard on `public_funding_events` prevents duplicate events but does not prevent duplicate `companies` rows if name normalisation produces a different canonical name on re-run: fixing this properly requires dedup on insert into `companies`.*
- **2026-05-20 (sprint-3 follow-up review)**. Reviewed Sprint 3 output against methodology. Three keyword-fallback misclassifications corrected via `MANUAL_SECTOR_OVERRIDES` (use-domain-over-technology rule from sector taxonomy): STARK FUTURE SL (electric motorbikes) deeptech → cleantech, IN OVO HOLDING BV (poultry agribusiness) life_sciences → other, CROWDFARMING SL (agrifood marketplace) digital → other. Added 3 DQ queries to `sanity_check.py`: orphan companies, unclassified count, manual-override audit. Final sector distribution: 1,085 life_sciences / 712 cleantech / 498 deeptech_hardware / 150 space / 136 digital / 38 other. Sprint-3 deliverable signed off; outstanding follow-ups (pre-classification in loaders; companies-table dedup on insert) deferred to a future architecture sprint.
- **2026-05-21 (sprint-4 Innovation Fund load)**. EU Innovation Fund grant-signed projects (calls 2020 to 2024) loaded from CINEA project fiche PDFs. 246 events across 20 sub-calls; 237 distinct beneficiaries; 8 cross-instrument matches (6 EIC, 1 IPCEI, 1 EIB), 229 new inserts. `role='direct'`, `grant_amount_eur` from fiche PDF (NULL for 7 projects without a published fiche). **IF25 excluded**: all projects still in "Invited to grant agreement preparation" status; will be added when grant signatures are announced. `IF_SOURCE_SECTOR` map added to `classify.py` (all IF sources → cleantech). Zero unclassified after re-run. Final counts: 2,848 companies (1,085 life_sciences / 942 cleantech / 498 deeptech_hardware / 150 space / 136 digital / 37 other). **Data note**: 7 projects have no published fiche on climate.ec.europa.eu (all from hbank_2024, msp_2024, mfg_2024, lsp_2022); coordinator and amount are NULL for these rows. One fiche (CapturEste, ID 101191951) returns HTML instead of PDF: loaded using alternate CINEA ID 101190951. **Extractor note**: `extract_innovation_fund.py` uses right-column PDF crop (`page.crop((width/2, 0, width, height))`) because pdfplumber returns interleaved left/right column text on the two-column fiche layout; the crop eliminates left-column body text from the metadata fields. Same `subprocess.run(['curl', ...])` SSL workaround as EIB extractor.
- **2026-05-21 (sprint-4 post-sign-off cleanup)**. Two pieces of technical debt from the IF load addressed before they could compound:
  1. **`sector_tags_raw` upgraded from placeholder `'Energy'` to `"Energy, {category}, {sector}"` per row**: preserves the climate.ec.europa.eu category and project-level sector (Cement & lime, Hydrogen, Refineries, etc.) for direct SQL sub-sector queries while keeping the `'Energy'` prefix so the classifier's CLEANTECH_TAGS membership check still fires. Verified: `SUM(grant_amount_eur) WHERE sector_tags_raw LIKE '%Hydrogen%'` returns €1.6bn across 30 events; `'%Cement%'` returns €3.1bn across 24 events; `'%Storage%'` returns €1.8bn across 39 events. No regression in classifier output (still 942 cleantech, zero unclassified).
  2. **`IF_SOURCE_SECTOR` deduplicated**, `classify.py` now imports `IF_SOURCE_SECTOR` from `extract_innovation_fund.py` rather than maintaining a parallel copy. Adding a new IF sub-call now requires only updating `CALL_TO_SOURCE` in the extractor. Also housekeeping: removed empty per-call sub-directories under `data/raw/innovation_fund/` (everything ended up in `fiches/`); deleted leftover `/tmp/batch_download_fiches.py`. Kept the CINEA reference PDFs (pre-selection lists, statistics, annexes) in `lsp_2020/`, `lsp_2021/`, `ssp_2020/` as data lineage. Reload (delete-and-reinsert IF events, re-run classifier) confirmed clean: 2,848 companies / 4,559 events / zero unclassified / zero orphans.
- **2026-05-21 (sprint-5 Chips JU / KDT JU load)**, 35 KDT JU coordinator events loaded across call years 2020 to 2023 from the chips-ju.europa.eu OData API (`/_api/shv_webprojectses`, discovered from the projects page source). Per-call counts: kdt_2020=2 (€138.5M), kdt_2021=13 (€462.6M, matches published ~€455M JU budget within 2%), kdt_2022=16 (€609.4M, matches ~€617M within 2%), kdt_2023=4 (€38.2M, **INCOMPLETE**: expected ~€240M / ~25 projects, portal still being populated as of 2026-05-21, idempotent re-run will pick up the rest). Option A (coordinator only): the API does NOT expose the full consortium beneficiary list. **Schema**: no migration. `source=chips_ju_kdt_<year>`, `role=direct`, `grant_amount_eur=shv_totalinvestment` (total JU public funding = EU + national member-state contributions combined, not EU-only; same convention as IPCEI state-aid totals), `sector_tags_raw="Semiconductors, {portal_category}"`. **Classifier**: `"Semiconductors"` added to `DEEPTECH_TAGS` in `classify.py`; `CHIPS_JU_SOURCE_SECTOR` added to `extract_chips_ju.py` (imported by classify, same single-source-of-truth pattern as `IF_SOURCE_SECTOR` after Sprint 4 cleanup). **Match results**: 13 exact + 8 prefix + 1 fuzzy + 13 new inserts. **Prefix-match tier** (new this sprint) bridges IPCEI MECT/Micro shortened names ("ASML", "Infineon", "Bosch", "Lynred") to Chips JU full legal names ("ASML NETHERLANDS B.V.", "INFINEON TECHNOLOGIES AG"): fuzzy ratio was too low (~0.6); the prefix tier requires the existing normalized name to be ≥4 chars and a whole-word prefix of the new name (same country). This is a meaningful entity-resolution improvement that also reduces the duplicate-row backlog from prior IPCEI loads. **Final counts**: 2,861 companies (1,085 life_sciences / 942 cleantech / 511 deeptech_hardware / 150 space / 136 digital / 37 other), zero unclassified, 12 distinct Chips JU multi-instrument winners (4 with IPCEI: ASML, Infineon, Lynred, IMEC; 8 with EIC Pathfinder/Transition: AVL, CEA, CNIT, Infineon-AT, Lulea, SantAnna, SINTEF, plus IMEC). **Coordinator-country derivation**: 3-tier heuristic (explicit country mention → language patterns → hardcoded org overrides), validated against the participating-countries field; 100% coverage on the 35 rows. **Caveats** (4): coordinator-only capture, country=HQ, total-funding-not-EU-only, KDT-2023 incompleteness: same patterns as IF Sprint 4 under Option A, see [`project_innovation_fund_workarounds.md`](memory) items 1 to 3 which apply equally here.
- **2026-05-21 (sprint-6 taxonomy revision)**. Sector taxonomy expanded from 6 to 7 labels. Added `defense` between `life_sciences` and `cleantech` in the priority order (Space > Life Sciences > Defense > Cleantech > Deeptech > Digital > Other). Retroactive classifier pass over all 2,861 existing companies before EDF load: 7 companies flipped to `defense` via `DEFENSE_KEYWORDS` fallback (companies with defense-focused descriptions in historical EIC/IPCEI/EIB/IF rows). No false positives identified; flipped list comprises defense-oriented research institutions and one dual-use systems company. `DEFENSE_TAGS` and `DEFENSE_KEYWORDS` added to `classify.py`; schema.sql sector_inferred comment updated to 7 labels.
- **2026-05-21 (sprint-7 EIT KIC load)**. EIT Digital (28digital.eu) and EIT Manufacturing loaded: 99 events, 96 distinct companies, 87 new company inserts. 3 new `grant_amount_basis` labels (`eit_kic_support`, `eit_kic_grant`, `eit_kic_equity`). New `role='portfolio_company'` value. Reverse-prefix tier added to `match_companies()` in `extract_eit.py` (catches EIT short names vs. pre-existing EIC long legal names). 3 duplicate rows merged via SQL post-load (Plexigrid/Ekkono/Orange Quantum). EIT Digital × EIC overlap: 11.8% (6/51 companies, below 20% gate; documented). 87 first-time sector assignments; 0 stale timestamps. Sector distribution of new EIT companies: digital=48, deeptech_hardware=32, life_sciences=9, cleantech=6, defense=1. Final counts: 3,107 companies / 4,969 events.
- **2026-05-21 (sprint-6 EDF load)**, 143 EDF coordinator events loaded across 8 source IDs (edf_ra/da_2021 to 2024) from 143 successfully parsed factsheet PDFs (out of 284 catalogued; 141 rate-limited by the EC server: idempotent re-run will pick these up). **Match results**: 26 exact + 1 exact_name_only + 21 prefix + 6 fuzzy + 89 new inserts (match_method='edf'). **Final counts**: 2,950 companies (1,084 life_sciences / 941 cleantech / 507 deeptech_hardware / 149 space / 136 digital / 96 defense / 37 other), zero unclassified. **Grant sums** (EU contribution ceilings, partial due to download coverage): edf_da_2021 €827M/29, edf_ra_2021 €335M/30, edf_da_2022 €496M/15, edf_ra_2022 €312M/24, edf_da_2023 €337M/9, edf_ra_2023 €216M/18, edf_da_2024 €422M/11, edf_ra_2024 €118M/7. Total loaded: €3.06B across 143 events (~50% coverage of total call budgets). **Top coordinator countries**: FR=44, ES=27, DE=13, GR=13, IT=12. **31 cross-instrument winners** (EDF + at least one other source), including Thales (7 EDF events + EIC), CEA (7 events + EIC + Chips JU), Airbus (5 EDF + IPCEI MECT), Lynred (IPCEI + Chips JU + EDF), SINTEF (EIC + Chips JU + EDF). **Taxonomy note**: EDF-DA projects have co-funding obligations (20 to 80% national contribution); stored amount is EU contribution ceiling only, not total project cost. **Coverage note**: 141 factsheets rate-limited on first run; no data quality issue with the 143 parsed: re-run after server cooldown.
- **2026-05-22 (sprint-8 STEP Seal tagging)**. Commission published a `SEAL - data set` Excel export (5,722 award rows across 4,069 unique applicants, programmes HORIZON/DIGITAL/EDF/InnovFund/EU4H, sectors Digital/deep tech / Biotech / Cleantech). User dropped the file into the repo on 2026-05-22; loaded via new [`scripts/tag_step.py`](../scripts/tag_step.py) into `data/raw/step/seal_data_set.xlsx`. **Match strategy**: single-tier exact `(normalize_name, country_iso2)` with `EL↔GR` and `UK↔GB` country aliases (the DB carries both members of each set in different rows). **Result**: 623 distinct companies matched (20.1% of 3,101) → `companies.step_flagged=1`. Per-source-family STEP coverage: chips_ju 10/25 (40%), edf 78/192 (41%), innovation_fund 88/236 (37%), eic 468/2188 (21%), eib 15/151 (10%), eit 4/96 (4%), ipcei 10/301 (3%). **The original Sprint 8 plan assumed EDF + IPCEI were out-of-STEP-scope by design; the actual seal data refutes that for EDF** (defense projects under STEP's "deep tech" pillar are routinely seal-tagged) and confirms it broadly for IPCEI (state-aid notifications operate outside the seal mechanism: the 10 IPCEI seal-holders are direct partners with parallel Horizon projects). **Idempotent**: re-runs flip zero rows; revoked-flag cleanup also runs so the column stays reproducible from the input file. **Event-level NOT tagged**: the seal export has proposal titles but no Horizon project numbers, so per-event mapping would be unsafe; `public_funding_events.step_flagged` column NOT added (deferred until per-project IDs are available). Output: [`data/processed/step_match_summary.csv`](../data/processed/step_match_summary.csv) (one row per matched company with programmes, sectors, any-funded flag).
- **2026-05-23 (sprint-9 EDA + findings site)**. Read-only exploratory data analysis over the 3,101-company corpus. Created `analysis/views.sql` (3 idempotent SQL views: `v_events`, `v_company_breadth`, `v_country_sector_family`), `analysis/helpers.py` (shared DB/JSON utilities), `analysis/run.py` (orchestrator), 15+ SQL queries in `analysis/queries/`, 8 analysis findings in `analysis/findings/q0*.md`, and `analysis/findings/synthesis.md`. 9 JSON output files written to `site/public/data/`. Built a static Next.js 16.2.6 site (Tailwind v4, Recharts 3, App Router) with 15 routes at `site/`: all prerender cleanly to `site/out/`. **Gate B2 corrected**: prior limitation #8 claimed "THALES 9 sources, CEA 8, Airbus 7": these counted raw source IDs, not the 7 canonical source families. Post-normalization: top-3 by families = CEA FR / Lynred FR / SINTEF NO (each 3 families); top by capital = THALES FR (2 families, €449M). **Key findings**: EIT most concentrated (Gini=0.88); EIC most egalitarian (Gini=0.49); EIC leads STEP adoption (75.7%); IPCEI NULL dates = all 317 events have no `event_year` (absent from time-series by design); top per-capita countries = IS / EE / LU / FI / DK. DB unchanged (read-only sprint: no `UPDATE`/`INSERT`/`DELETE` on corpus tables).
- **2026-05-22 (sprint-8 corpus audit)**. Workstream B (corpus bulletproofing) executed; workstream A (STEP Seal tagging) initially deferred, then completed same day after user dropped Commission seal export into repo. **B1 dedup**: 40 candidate pairs across 36 normalized-name collision groups; 6 merges applied (3 same-country, 3 EL↔GR alias), 32 keep_separate (IPCEI multi-partner sister-entity pattern per Sprint 4 NOMAGIC convention), 2 needs_human_review (Bormioli Luigi ES/IT, Holcim RO/DE): gate ≤5 PASS. Companies 3,107 → 3,101; events unchanged 4,969. New artefact: [`scripts/audit_dedup.py`](../scripts/audit_dedup.py) + [`data/processed/dedup_candidates.csv`](../data/processed/dedup_candidates.csv). **B2 unknowns**: shrunk 705 → 186 (22.7% → 6.0%) via two-tier strategy: (1) name-pattern extensions in `classify.py` covering non-English research-org markers (Dutch `ziekenhuis`, Czech `nemocnice`, Greek `idryma`/`ethniko`/`erevnas`, German `deutsches zentrum`, Italian/Spanish `consiglio nazionale delle ricerche`/`consejo superior de investigaciones`, French `recherches`/`commissariat`, Demokritos/ONERA/INESC) and corporate markers (Turkish `sirketi`, Greek `etaireia`, Belgian `bvba/sprl`, trailing brand nouns, trailing country tags); (2) **source-family fallback**: rows with no name match resolve to `company` if any source is in `{ipcei, innovation_fund, eit, chips_ju}` (these programmes accept only corporate beneficiaries by design). EDF intentionally excluded from fallback (defense calls include research orgs). 524 flips, 6 already-classified rows corrected (CSIC, CSEM, IDRYMA, etc.: all genuine research orgs previously mis-flagged as company). Wikidata lookup approach rejected per "all-or-nothing per gate" policy. **B3 country**: 7 EDF rows resolved from name patterns + 11 EIT Manufacturing rows resolved via web search; 18 → 0 NULL. **B4 sector**: classify.py idempotent (0 flips on no-input change); 50-row stratified spot-check 48/50 = 96% concordance ≥ 90% gate; MANUAL_SECTOR_OVERRIDES (6 entries) all still serve original purpose. **B5 totals**: every source family within ±5% of published or documented gap (IPCEI redacted partners, Hy2Infra/Cloud/Med4Cure aid-sum gaps from redactions, KDT-2023 incompleteness). **B6 PIC integrity**: 0 violations, 0 orphans; website coverage 73% (2,263/3,101) skewed heavily to EIC (100%); backfill for non-EIC families deferred to Sprint 9 alongside Dealroom matching. **All sanity_check.py DQ gates remain green.** Output: [`data/processed/pre_dealroom_health_report.md`](../data/processed/pre_dealroom_health_report.md). Final counts: 3,101 companies (1,090 life_sciences / 941 cleantech / 529 deeptech_hardware / 173 defense / 182 digital / 149 space / 37 other), entity_type 2,233 company / 674 research_org / 8 other / 186 unknown.
- **2026-05-25 (sprint-11 Tier 2 coverage + CORDIS open-data adoption)**. Closed three Tier 2 / HE partnership gaps in one extractor by adopting the CORDIS open-data dump (`https://cordis.europa.eu/data/cordis-HORIZONprojects-csv.zip`, 32MB, 21,196 projects). New unified extractor `scripts/extract_cordis.py` filters by topic-code prefix and emits per-family CSVs (CHP / IHI / EuroHPC / KDT supplement). **Result**: CHP 142 events / 4 source-years (2022 to 2025) / €894.8M; IHI JU 56 events / 4 source-years / €708.1M; EuroHPC JU R&I stream 22 events / 4 source-years / €215.9M; KDT supplement 25 additional events (Chips JU `chips_ju_kdt_2023` jumped 4 → 23, closing the 2026-05-21 Sprint 5 methodology gap that flagged €38M-vs-€240M expected). Same 5-tier matcher; CHP added 49 new companies, IHI 17, EuroHPC 1, KDT supplement 7 (most coordinators were already in DB as research orgs from EIC/Chips JU overlaps). **Refresh stream (E1 to E4)**: Chips JU OData re-run returned same 35 events (portal unchanged); IF re-run returned same 246 events (7 NULL fiches still unpublished + IF25 still in "Invited to GA prep" status: final awards Q4 2026 per CINEA); EDF 2025 second-pass picked up 4 newly-resolved factsheets (€55M); EIB API returned 504 (skip; restore cache). **EIT thin-source backfill (D)**: InnoEnergy 2024 PDF named only Geolinks + Repono (already loaded); RawMaterials URLs all 404'd; Crunchbase 403'd. Backfill yields nothing without Playwright/headless scraping: declared best-effort and documented. **Orphan cleanup**: 4 orphan rows surfaced during KDT supplement load (matcher created new companies for events that then got dedup'd at `(source, call_id)` level). Deleted; root cause is that the extractor inserts company before checking event dedup. Same risk pattern as Sprint 3 (EIB load); add `companies.id` cleanup to the per-extractor finally-block as a follow-up. **Hydrogen Onsite merge**: 1 new merge candidate flagged by `audit_dedup.py` post-load. HYDROGEN ONSITE SL (EIC) vs HYDROGEN ONSITE (CHP): merged via direct SQL. **Final counts**: 3,633 companies / 5,733 events (3,561 → 3,633, +72; 5,484 → 5,733, +249). Zero NULL dates / zero unclassified / 2 dedup `needs_human_review` unchanged. **Classify.py**: `CHP_SOURCE_SECTOR`, `IHI_SOURCE_SECTOR`, `EUROHPC_SOURCE_SECTOR` imported from `extract_cordis.py` (single source of truth; populated at import time by scanning topics.csv). **Methodology shift**: CORDIS open-data dump is now the canonical source for Horizon Europe partnerships that don't have a dedicated portal API. Future Tier 2 / partnership extensions (e.g. SESAR JU, Europe's Rail JU) can reuse `extract_cordis.py` by adding to `FAMILIES`.
- **2026-05-25 (sprint-10 backfill, post-review)**. User-flagged the initial Sprint 10 load as thin against expected ranges (231 new companies vs 200 to 670 expected) and pushed back on signing off. Backfill executed same day: EIT Urban Mobility (62+86+63 startups across 2022/2023/2024 cohorts, replacing the 23-row JS-limited portfolio capture); EIT Climate-KIC (Amazon Sustainability Accelerator 2024 = 16, Carbon Removal ClimAccelerator 2023 = 22, Clean Cities Spain 2024 = 12: moves Climate-KIC from a single 22-row boot camp to 4 programmes); EIT InnoEnergy 2024 (2 named portfolio additions out of 14: remaining 12 not publicly disclosed by name); CHP reclassified from "dead end" to "Sprint 11 deferred" after confirming CORDIS does index CHP projects under `HORIZON-JTI-CLEANH2-YYYY-NN-NN` topic codes (CLEANER 101137799, HI2 Valley 101192356 verified). +256 new events / +229 new companies on top of initial load. **Final Sprint 10 total**: 3,101 → 3,561 companies (+460), 4,969 → 5,484 events (+515). Mid-range of expected window. Sector growth: cleantech +110, life_sciences +103, other +212 (Urban Mobility). Zero NULL dates / zero unclassified / 0 new dedup merges. Lessons: (a) JS-filtered portfolio pages must be addressed with cohort-announcement URLs not the portfolio page itself; (b) the plan's "<10 per call year → skip" rule is sound but the discovery step should test multiple CORDIS URL patterns before declaring a programme inaccessible.
- **2026-05-25 (sprint-10 Tier 1 coverage completion)**. Closed three remaining Tier 1 data gaps. **Workstream A (6 EIT KICs)**: Extended `scripts/extract_eit.py` with 15 new programme×year constants: EIT InnoEnergy Highway (2021/22/23, equity portfolio), EIT Health Catapult (editions 6 to 9 = 2022 to 2025, acceleration + cash prizes for winners), EIT Climate-KIC CDR boot camp (2022), EIT Urban Mobility portfolio, EIT RawMaterials portfolio, EIT Food Rising Food Stars (2021/22/23/24/25). 358 total EIT events (up from 99 in Sprint 7). **Match results**: 107 exact + 13 exact_name_only + 7 reverse_prefix + 231 new inserts; 99 skipped as duplicates. **Final corpus after Sprint 10**: 3,332 companies / 5,228 events. **Sector distribution**: cleantech=1005 / deeptech_hardware=537 / digital=190 / defense=173 / space=153 / other=84 / life_sciences (included in total). 231 first-time sector assignments; 231 entity_type transitions unknown→company. Zero unclassified; zero NULL project_started; zero stale sector timestamps. **Workstream B (Eurostars)**: dead end: eurostars-eureka.eu HTTP 403, CORDIS API 0 results (EUREKA-administered, not CORDIS-indexed). Stub `EUROSTARS_SOURCE_SECTOR` import added to `classify.py`. **Workstream C (Clean Hydrogen Partnership)**: dead end: clean-hydrogen.europa.eu HTTP 404, CORDIS API 0 results. Stub `CHP_SOURCE_SECTOR` import added to `classify.py`. **Workstream D (methodology)**: source coverage table updated to all 8 KICs loaded; Eurostars/CHP marked ❌ dead end; HE table updated; Tier 2 table added (DEP, EIC Fund, ECSEL JU, Eurostars, CHP, EU Missions, HE Cluster RIA); Tier 3 / scope principle section added (fund-of-fund/intermediated/national structures explicitly out of scope). **ECSEL JU boundary formalised**: all ECSEL calls have project start dates in 2014 to 2020; out of the 2021 to 2026 HE time window by design; succeeded by KDT/Chips JU from 2021.

- **2026-05-29 (sprint-14 Europe-scope filter + destructive corpus clean-up + DB trigger)**. Defined the canonical study scope as 40 countries (EU27 + EFTA + UK + Western Balkans + Ukraine + Moldova) in [data/europe_scope.json](../data/europe_scope.json). Israel (160 cos), Turkey (237), Caucasus (~20), and Horizon open-call leakage (Tunisia, South Africa, US, Greenland; 6 rows total) dropped. Source aliases canonicalised: EL→GR, UK→GB, PO→PL, SW→SE, GL→DK. **Three-layer enforcement**: (1) [scripts/europe_scope.py](../scripts/europe_scope.py) `canonicalise_country()` helper for extractors to call pre-INSERT; (2) `trg_companies_country_scope` and `trg_companies_country_scope_update` `BEFORE INSERT/UPDATE` triggers in [scripts/schema.sql](../scripts/schema.sql) that `RAISE(ABORT, ...)` for out-of-scope country codes so future scrapes that skip the helper fail loudly; (3) defensive `v_european_companies` view + `v_events` inner-join in [analysis/views.sql](../analysis/views.sql) so even raw-SQL imports that bypass the trigger don't reach the analytics. **Destructive step**: 1,639 out-of-scope companies + 2,527 events + 3,834 `classify_audit` rows `DELETE`'d from the live DB; 98 alias rows canonicalised in place via `UPDATE`. Pre-Sprint-14 backup at `/tmp/eit_data_backup/db.sqlite.pre-europe-scope.bak`. **Sanity check**: new "DQ: Europe scope integrity" block in [sanity_check.py](../scripts/sanity_check.py) — three zeros (no out-of-scope rows, no lingering aliases, both triggers installed). All q01 sub-queries refactored to source from `v_european_companies` directly. **Corpus delta**: 21,689 → 20,050 companies (-1,639); 58,628 → 56,101 events (-2,527); €76.9B → €76.2B; 53 → 40 countries. **Map**: `NUMERIC_TO_ISO2` in [europe-map.tsx](../site/components/europe-map.tsx) carries the 40-country geographic-Europe subset; Malta, Liechtenstein, Kosovo (absent from world-110m at this resolution) render as labelled dot markers via `MARKER_COUNTRIES`. **Cost of expansion**: adding a country requires editing three files (the JSON, the trigger in schema.sql, the WHERE in views.sql) plus re-installing the trigger on the live DB; "When to revise the scope" runbook in [europe_scope.md](europe_scope.md) documents the steps. Full per-country exclusion rationale and propagation diagram in [europe_scope.md](europe_scope.md).
