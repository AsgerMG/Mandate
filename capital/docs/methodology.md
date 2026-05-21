# Methodology

Living reference for analytical and engineering choices in this project. New decisions extend the relevant topic section; the decision log at the bottom dates major changes.

## Research framing

**Question**: Does EU-directed public capital predict private follow-on investment in European tech?

**Framing**: Descriptive only — "predict", never "cause". Public funding selection is non-random (calls have eligibility criteria, applicants self-select, panels score on quality), so observed correlations with downstream outcomes cannot be read as treatment effects. The brief reports conditional patterns, not causal claims.

## Time horizon

**Period**: 2021–2026, scoped to the current Horizon Europe / MFF cycle.

**2025 caveat**: Call cycle still running when the data was pulled (2026-05-20). Only 41 EIC Accelerator coordinators visible for 2025 so far; treat as partial. Primary analysis universe is 2021–2024 with 2025 noted as incomplete.

## Identifiers and deduplication

**Canonical company ID**: PIC (EU Participant Identification Code) — the EU's stable, registered identifier across all Horizon-funded programmes. Used as the primary dedup key.

**One row per company, many event rows**: A company appearing in multiple EIC programmes (Pathfinder → Transition → Accelerator), or across multiple EU instruments, gets one row in `companies` and multiple rows in `public_funding_events`. This makes the "multi-instrument winner" pattern queryable without join gymnastics.

**Companies without PIC**: Fall back to canonical name matching for non-EIC sources where PIC may not be reported. Match confidence and method are recorded on the company row (`match_confidence`, `match_method`).

## Schema choices

**Three core tables**: `companies` (deduplicated entities), `public_funding_events`, `private_funding_events`. Full definition in [schema.sql](schema.sql).

**Grant-only for v1**: EIC Fund equity tickets (up to €10M per company) are reported separately and are not in the EIC Data Hub export. The `equity_amount_eur` column exists on `public_funding_events` but is NULL for current EIC rows. Pulling the EIC Fund portfolio list is a v2 task.

**`entity_type` left blank initially**: All rows start at `"unknown"`. Populated via LLM classification on name + project summary during enrichment (startup / sme / large_corp / research_org / consortium / public_body).

## Source coverage

| Source | Status | Notes |
|---|---|---|
| EIC Accelerator | ✅ Loaded | 707 coordinator companies / 712 events — the core startup universe |
| EIC Pathfinder | ✅ Loaded | 1,289 companies — early-stage research consortia |
| EIC Transition | ✅ Loaded | 407 companies — research-to-market bridge |
| IPCEI | ✅ Loaded | 317 funding events / 302 distinct companies (11 decisions) |
| EIB venture/growth | ✅ Loaded | 153 events / 151 distinct borrowers — debt instrument tracked via `debt_amount_eur` |
| Innovation Fund | ✅ Loaded | 246 events / 237 beneficiaries across 20 sub-calls (2020–2024) |
| Chips JU / KDT JU | ✅ Loaded | 35 KDT-era coordinator events across call years 2020–2023 (Option A; Chips JU 2024+ pending portal publication) |
| EDF (European Defence Fund) | ✅ Loaded | 143 coordinator events across 8 call/strand combinations (2021–2024 RA+DA; 2025 partially downloaded). Introduced `defense` sector label. |
| EIT KICs | ✅ partial | EIT Digital (51 events: Champions 2021–2025 + VAP 2022) + EIT Manufacturing (48 events: investments + BoostUp 2021/2023/2024). 99 events total / 96 distinct companies; 87 new company inserts; 3 new basis labels. 6 remaining KICs (InnoEnergy, Health, Climate-KIC, Food, Raw Materials, Urban Mobility) deferred to Sprint 9 (Dealroom-assisted). |
| STEP seal | 🔜 Sprint 8 | Tagging cross-cut, not a new source. Boolean flag on existing event rows where the project holds the Strategic Technologies for Europe Platform "Sovereignty Seal". |
| Dealroom enrichment | 🔜 Sprint 9 | Right-hand side variable — private follow-on funding, headcount, status. Matches DB companies to Dealroom IDs and populates `private_funding_events`. |

**Sprint ordering rationale**: complete the supply side (LHS) fully before enrichment (RHS). EDF first because it forces the defense-label decision; EIT KICs second because it closes the HE company-facing gap; STEP third as a small tagging pass; Dealroom last because its design will be informed by a finished supply side.

**Primary analysis universe**: EIC Accelerator coordinators. They are the cleanest "startup" subset — coordinator role excludes consortium participants, and Accelerator is the only EIC programme aimed squarely at single companies (vs. multi-partner research projects).

### Horizon Europe coverage — what's loaded, what isn't, and why

Horizon Europe (HE) is the EU's flagship R&D programme — €95.5bn budget for 2021–2027, structured into three pillars plus partnerships and the EIT. This tracker loads HE **selectively**: we cover the slices where companies are the primary beneficiaries, and exclude the slices where individual researchers or academic-led consortia are. Stating the inclusion/exclusion choice per HE component so it can be contested:

| HE component | What it funds | In tracker? | Reasoning |
|---|---|---|---|
| **Pillar 1: ERC grants** | Individual researcher grants (~€2.4bn/yr) | ❌ Out of scope | Almost entirely academic individuals at universities. Company applicants are vanishingly rare. Outside the "EU funds companies" research question. |
| **Pillar 1: MSCA fellowships** | Researcher mobility/fellowships | ❌ Out of scope | Individual researchers, no company funding mechanism. |
| **Pillar 1: Research Infrastructures** | Large-scale shared scientific facilities | ❌ Out of scope | Builds facilities, doesn't fund companies. |
| **Pillar 2: Cluster 1–6 collaborative R&D** (Health, Culture, Civil Security, Digital, Climate, Food) | Multi-partner research consortia (~€53bn total — the biggest HE pot) | ⚠️ Partial via JU partnerships only | Companies appear as consortium *partners*, not coordinators (coordinator role typically goes to universities/research orgs). The "company X received EU funding" signal is much weaker than for EIC/EIT where the company is the primary beneficiary. **Decision**: load only the JU partnerships under each Cluster (Chips JU loaded so far); skip the broader Cluster RIA/IA grants. Alternative we rejected: load Cluster grants under Option B (every beneficiary as a row) — would add tens of thousands of consortium-partner rows with weak analytical signal. |
| **Pillar 2: EU Missions** (Cancer, Climate Adaptation, Cities, Soil, Oceans — €1.8bn) | Mission-specific consortia | ❌ Out of scope | Small budget, same consortium pattern as Cluster grants, no clean company-coordinator subset. |
| **Pillar 3: EIC** (Accelerator, Pathfinder, Transition) | Startup-focused grants + EIC Fund equity | ✅ Loaded | The core of our corpus. EIC Accelerator coordinators = the cleanest "company funded by EU" cohort. |
| **Pillar 3: EIT KICs** (8 thematic Knowledge & Innovation Communities) | Startup acceleration programmes funded by EIT | ✅ partial | EIT Digital + EIT Manufacturing loaded (Sprint 7): 99 events, 96 companies, 87 new inserts. 6 remaining KICs (InnoEnergy, Health, Climate-KIC, Food, Raw Materials, Urban Mobility) deferred to Sprint 9 (Dealroom-assisted). EIT-Digital × EIC overlap: 11.8% (6/51 companies). |
| **HE Partnership: Chips JU / KDT JU** | Semiconductor R&D consortia (Cluster 4) | ✅ Loaded | Coordinator-only (Option A). |
| **Other HE Partnerships** (CleanH2 JU, IHI JU, SESAR JU, EuroHPC JU, Shift2Rail/Europe's Rail JU, GHEU JU, BBI/CBE JU) | Domain-specific R&D consortia | ❌ Deferred | Same consortium-pattern limitation as Cluster grants. CleanH2 JU and IHI JU are the strongest candidates for a future sprint if Dealroom enrichment reveals a signal we're missing. |

### Non-HE EU instruments — what's in and out

| Instrument | What it funds | In tracker? | Reasoning |
|---|---|---|---|
| **IPCEI** | State-aid for cross-border industrial projects | ✅ Loaded | 11 IPCEI decisions across micro-electronics, batteries, hydrogen, cloud, health. Outside HE — operates as state-aid notifications. |
| **Innovation Fund** | ETS revenue–funded climate/energy projects | ✅ Loaded | 20 sub-calls 2020–2024. Outside HE — funded by EU Emissions Trading System revenues. |
| **EIB venture/growth debt** | Direct EIB venture-debt loans | ✅ Loaded | Debt instrument. Outside HE — EIB is a separate financial institution. |
| **EDF (European Defence Fund)** | Defense R&D & capability development (€8bn 2021–2027) | ✅ Loaded | Outside HE. 143 coordinator events (2021–2024). Introduced `defense` sector label. |
| **EU4Health** | Health policy programme | ❌ Out of scope | Mostly policy/regulator funding, not company grants. |
| **Digital Europe Programme (DEP)** | AI, cybersecurity, supercomputing capacity-building | ❌ Out of scope for v1 | Funds testing facilities, skills, and deployment infrastructure rather than company R&D. Could revisit if v2 broadens scope. |
| **Connecting Europe Facility (CEF) — Digital** | Cross-border digital infrastructure | ❌ Out of scope | Infrastructure operators, not startups. |
| **Single Market Programme** | SME competitiveness | ❌ Out of scope | Scattered small grants; no clean cohort. |
| **National-level subsidies** (DE Investitionszulage, FR aides aux entreprises, IT credito d'imposta, etc.) | National R&D and capex grants | ❌ Out of scope | EU-level tracker by design. National data would require 27 separate extractors. |

### Coverage gaps — state after Sprints 6 and 7 complete

After EDF and EIT KICs (partial) are loaded, the tracker covers:
- ✅ 100% of HE Pillar 3 EIC (Accelerator + Pathfinder + Transition)
- ✅ EIT Digital + EIT Manufacturing (2 of 8 EIT KICs)
- ✅ The one HE partnership (Chips JU) most relevant to deep-tech-startup analysis
- ✅ All major non-HE company-targeted EU instruments (IPCEI, IF, EIB-VD, EDF)

It will NOT cover:
- ❌ HE Cluster 1–6 collaborative R&D where companies appear only as consortium partners (deliberate scoping choice — analytical signal is weak; would require Option B beneficiary-level extraction across thousands of projects)
- ❌ HE partnerships other than Chips JU (deferred — same consortium-pattern limitation; CleanH2/IHI candidates for v2)
- ❌ Pillar 1 (ERC, MSCA, Research Infrastructures) — by design (individuals/facilities, not companies)
- ❌ Capacity-building / infrastructure programmes (DEP, CEF, EU4Health) — not direct company R&D funding
- ❌ National-level subsidies — out of EU-level scope

### How to read a "company received EU public funding" claim against this DB

A claim that a company "received EU public funding" against this tracker means the company appears in at least one of: EIC (Accelerator/Pathfinder/Transition), IPCEI direct-partner list, EIB venture-debt portfolio, Innovation Fund coordinator list, Chips JU / KDT JU coordinator list, EDF leaders list (post-Sprint 6), or EIT KIC-funded list (post-Sprint 7). It does **not** mean they received funding via *every* EU mechanism — they may also have received Cluster collaborative funding, ERC grants, national subsidies, or DEP capacity-building funds **not tracked here**. Any analytical claim from this DB carries this scope qualifier.

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
| `digital` | AI/ML, software & services, data analytics, robotics — only when no domain label above applies |
| `other` | Agrifood, mobility, telecom, social innovation, creative industries |

### Core principle

**Use-domain beats technology enabler.** A company doing "AI for drug discovery" is `life_sciences`, not `digital`. A "quantum sensor for medical imaging" company is `life_sciences`, not `deeptech_hardware`. The `digital` and `deeptech_hardware` labels apply only when there is no clear end-use domain.

### Overlap resolution — priority order

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

Note: `space` outranks `defense` so that space-launch or satellite projects (even military reconnaissance) are classified as `space`. EDF-funded space projects with "Defence Space" capability area will land in `space` per this order — this is intentional.

### Known tensions

- **Dual-use**: A company doing AI-for-medical-imaging that *could also* serve a military client stays `life_sciences`; only companies whose primary funded project is explicitly defense-purpose go to `defense`. EDF funding is the primary signal — any EDF coordinator is classified as `defense` regardless of other instrument overlap. A future `dual_use` boolean column can layer in if cross-cutting analysis is needed.
- **Cross-cutting biotech**: "Industrial Biotech & Biomanufacturing" can be cleantech (biofuels, bioremediation) or deeptech (precision fermentation for materials). Rule 4 resolves it — cleantech wins if a climate tag is present.
- **AI-heavy companies without domain tags**: A company tagged only "Artificial Intelligence" lands in `digital`. If they're really an AI drug discovery company, we rely on the LLM classification pass over `project_summary` to catch the missing domain tag.
- **Multi-domain research organisations**: For institutions like IMEC, CEA, Fraunhofer, SINTEF, or large universities whose work spans every sector, the first-EIC-tag-wins priority rule lands on whichever downstream use-domain happened to appear in their first EIC project (e.g. IMEC → `life_sciences` via a bio-electronics Pathfinder project, even though IMEC's primary discipline is semiconductors). The methodology's "use-domain beats technology enabler" rule was designed for single-domain companies and doesn't fit research orgs whose *primary discipline IS the technology enabler*. The most egregious cases (IMEC entities) are corrected via `MANUAL_SECTOR_OVERRIDES` in `classify.py`; broader research_org sector_inferred values should be interpreted with caution. A proper fix would be a separate sentinel for multi-domain orgs, deferred to a future taxonomy revision.

### Why seven labels and not more

We considered a 9–10 label taxonomy (separate `agrifood_biotech`, `mobility`, `built_environment`, `advanced_manufacturing`). Collapsed because (a) per-label volumes are small individually, (b) the analytical question — does EU public capital signal private follow-on — is best assessed at the level of broad investor categories rather than vertical sub-sectors, and (c) finer-grained labels are easy to layer in later as sub-categorizations of the broad ones. `defense` was added in Sprint 6 when EDF loading made it the only remaining label forced by a programme with no existing sector home.

## Classification implementation

Sector and entity-type classifiers are deterministic Python — no LLM in the loop. See [classify.py](classify.py).

**Sector**: For each company, collect unique tags across all events, then apply the priority rules. For companies with empty `sector_tags_raw` (EIC tag-empties and all IPCEI rows), the classifier falls back in order: (1) keyword matching on `project_title + project_summary`; (2) IPCEI source → sector mapping for IPCEI-only companies (`IPCEI_SOURCE_SECTOR` in [classify.py](classify.py), kept in sync with the IPCEI scope table below). 100% of 2,484 companies (EIC + IPCEI) are now classified, no `unclassified` remaining.

> **Loader→classifier ordering**: `classify.py` must be re-run after any loader that inserts new `companies` rows. It is idempotent and re-reads all sources off `public_funding_events`. (Caught on Day 3 follow-up: IPCEI rows initially landed as `unclassified` because the classifier wasn't re-run post-extraction.)

**Entity type**: Three-bucket scheme (`research_org` / `company` / `other`), populated by deterministic name-based regex. Priority order: research_org > public body (other) > company. Granular splits (startup / SME / large_corp / consortium) are deferred to a later enrichment pass — they require Dealroom or EU registry data anyway.

- `research_org` — name matches research/academic patterns. Multilingual coverage: university stems (English, Spanish/Portuguese, German, Italian, Nordic, Polish "Uniwersytet", Slovak "Univerzita", Greek "Panepistimio", Hungarian "Egyetem", Icelandic "Háskóli", Finnish "Korkeakoulu"), Hochschule, polytechnic variants, college, "institut(e)" anywhere in name (catches compounds like "AgroBioInstitute"), Italian "istituto", Czech "ústav", named bodies (Fraunhofer, Max Planck, Helmholtz, Leibniz, CNRS, CSIC, CEA, TNO, VITO, CIEMAT, INSERM, DKFZ, MRC, IMEC), foundations (Stichting, Stiftung, Fondazione, Fundación, Fundação), hospitals/clinical research (Hospital, Hôpital, Ospedale, Krankenhaus, Klinik, Clinique, Hospice, Hopitaux, Italian Azienda Ospedale/Socio-Sanitaria), German Forschung\*, Belgian Studiecentrum, ERIC (European Research Infrastructure Consortium), Belgian VZW/IVZW/AISBL non-profits, synchrotron facilities.
- `other` — public bodies: ministries (multi-language), agencies (Agence/Agencia/Agentur/Agenzia/Agency), regional authorities, municipalities, health services (Servicio de Salud, Servizio Sanitario), European Commission.
- `company` — recognised corporate legal forms (multilingual): GmbH/gGmbH/AG/KG/UG/Gesellschaft (DE), BV/NV (NL/BE), SAS/SARL/SA/SCA (FR), SRL/SpA/SCPA + long forms (IT), SL/SLU/SAU (ES), Lda/CRL (PT), Ltd/PLC/LLC/Inc/Corp (Anglo/US), AB/ApS/A/S/AS (Nordic), Oy/Oyj/hf/ehf (FI/IS), DOO/DD (SI), UAB (LT), OOO (RU), SRO (CZ), sp. z o.o./Spolka Akcyjna (PL), EE/IKE (GR), Zrt/Kft/Nyrt (HU), SE (Societas Europaea). Plus Accelerator coordinator → company (Accelerator programme is SME-only by eligibility).
- `unknown` — names without any of the above signals. Mostly companies that don't carry a legal-form suffix (e.g. "PASQAL", "POIETIS", "EDF"). Defer to enrichment pass.

Current distribution (post-IPCEI, 2,484 companies): 1,407 company (57%), 585 research_org (24%), 9 other (0.4%), 483 unknown (19%). The unknown share grew from 10% (EIC-only) to 19% because IPCEI direct-partner names in the Commission PDFs often appear without legal-form suffixes (e.g. "Infineon", "Bosch", "Globalfoundries", "Carl Zeiss"). These are obviously corporates but get deferred to the same enrichment pass as the EIC suffix-less names.

## IPCEI extraction

### Scope (v1)

Eleven Commission state-aid decisions in scope.

> **⚠️ COUNTING METHODOLOGY — REVIEW REQUIRED**
>
> The "Direct partners" column below counts **distinct companies** as named in each Commission decision, which is how the Commission itself reports the figure. Our database, however, stores **one row per (company, member-state) funding event**, because a company like Solvay receiving aid in BE, FR, and IT is genuinely three separate state-aid awards. This means `ipcei_partners.csv` will always have *more rows* than the partner counts here — e.g. Batteries has 17 distinct companies but 23 funding-event rows.
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
| **Total** | | | **~296** | **317** | **—** | **—** | |

The press-release "direct partners" counts sum to ~296 across the 11 IPCEIs, but our DB lands at **302 distinct companies** post-load. The +6 gap is a mix of (a) Commission press releases occasionally rounding or omitting late-added partners that the PDF tables still enumerate, and (b) name-normalisation cases where what the press release calls one corporate group appears as two distinct legal entities in the PDF (e.g. a parent + a project-vehicle subsidiary). Aid-sum validation, not row count, remains the primary correctness signal.

**Hy2Infra gap (€5.21bn extracted vs €6.9bn press release, −24%)**: only 1 row redacted in the PDF, but it is a single very large anchor partner (likely steel/H2 industrial decarbonisation). Per-row max in the extracted set is €574m (Energie Salentine), so a single redacted row hiding ~€1.7bn is plausible. Flag any Hy2Infra-level aggregation as conservative until the partner is identified manually.

### Direct partners only (v1 decision)

IPCEIs distinguish **direct partners** (large named beneficiaries who receive aid directly, typically 5–20 per IPCEI) from **indirect partners** (downstream SMEs and sub-suppliers). For v1 we load **direct partners only** because:

1. Direct partners carry the signal we want — they are the named recipients of EU public capital
2. Direct-partner data is well-documented in every Commission decision; indirect-partner lists are often summarised (e.g. "approx. 200 SMEs across 12 member states") rather than enumerated
3. Indirect partners are typically already captured by Horizon programmes (EIC, etc.) where they appear with PIC codes
4. Tractable extraction surface — landed at 317 funding-event rows / 302 distinct companies once all 11 PDFs were processed (initial estimate ~80–120 was off by roughly 3×; the legacy PDFs name more partners per IPCEI than expected)

If a research question later requires indirect-partner detail, we can re-extract per IPCEI on demand.

### Schema mapping

| Field | IPCEI value |
|---|---|
| `source` | `ipcei_micro`, `ipcei_batteries`, `ipcei_eubatin`, `ipcei_hy2tech`, `ipcei_hy2use`, `ipcei_mect`, `ipcei_cloud`, `ipcei_hy2infra`, `ipcei_hy2move`, `ipcei_med4cure`, `ipcei_tech4cure` — canonical list is `PROGRAM_META` in [extract_ipcei.py](extract_ipcei.py). Note: old placeholder `ipcei_health` and suffix-year variants (`_2018`, `_2019`, `_2021`, `_2023`) are retired. |
| `role` | `direct` (new role value; EIC uses `coordinator`/`participant`) |
| `call_id` | SA case number (e.g. `SA.46705`) |
| `grant_amount_eur` | Approved aid ceiling (note: ceiling, not necessarily disbursed) |
| `sector_tags_raw` | Empty (IPCEIs don't tag like EIC); sector_inferred set directly per IPCEI |
| `raw_source_url` | URL of the Commission decision PDF |

### Two-layout extraction strategy

PDFs fall into two families handled separately in `extract_ipcei.py`:

**Modern (2022+):** Tables captioned `Table N – <Country> – Financial figures in EUR million`. State-aid column is nominal EUR. Amounts are explicit numbers (e.g. `18.77`) with some range-redacted cells (`[10–20]`). Multiplied by 1,000,000 to store as EUR.

**Legacy (2018–2021):** Tables captioned `Table N: <Country> – State aid per company in 1000 €`. Amounts mostly redacted (`[…]`) or expressed as ranges (`[6 000 – 10 000]`) in thousands of EUR. Where no amount is extractable, `aid_amount_eur` is NULL and `aid_amount_raw` retains the original cell text for traceability. Sweden Batteries row is in SEK and stored as-is with `aid_amount_eur = NULL`.

Country attribution is resolved in priority order: (1) explicit table caption below the table, (2) top of the next page, (3) caption above the table. For Hy2Infra, project codes (e.g. `DE43A`) override caption-derived country.

### Redacted-amount handling

When an amount is `[…]` or fully redacted, `aid_amount_eur` is NULL and `aid_amount_redacted = 1`. When an amount is a range (`[6 000 – 10 000]`), the midpoint is **not** imputed — `aid_amount_eur` is NULL and `aid_amount_is_range = 1` with the raw string preserved. This is conservative: any aggregation over `grant_amount_eur` must account for the NULL rows.

### Matching strategy

IPCEI PDFs do **not** carry PIC codes (PIC is Horizon-specific). Match against existing `companies` by canonical_name + country:
- Exact normalised-name match within same country → link to existing `companies.id` (multi-instrument winner pattern)
- Fuzzy match (SequenceMatcher ratio ≥ 0.92, same country) → link with `match_confidence='medium'`
- No match → insert new row, `match_method='ipcei_pdf'`, `pic=NULL`

**Day-3 results (2026-05-20):** 317 events loaded, 302 distinct companies. 7 matched to existing EIC companies (exact); 295 new IPCEI-only companies inserted. See `data/processed/ipcei_match_summary.csv` for row-level match details.

## EIB venture debt extraction

### Scope

EIB direct venture-debt and growth-finance loans to European corporate borrowers, 2021-01-01 to 2026-05-20. Instruments included:

- **EGF VD** (European Guarantee Fund Venture Debt, 2021–2022): EIB direct loans under the COVID-19 EGF window, tagged `(EGF VD)` in EIB project titles
- **InvestEU VD windows** (2022+): `IEU LS` (Life Sciences), `IEU TI` (Thematic Innovation), `IEU FT` (Future Tech), `IEU GT / GT2 / GT3` (Green Deal/Green Tech), `IEU SIW` (Sustainable Investments Window), `IEU G` (Growth) — tagged `(IEU XX)` in project titles
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
| `debt_amount_eur` | Approved loan amount in EUR (from EIB `additionalInformation[2]`) — never stored in `grant_amount_eur` |
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

Borrower names are scraped from individual EIB project detail pages (the "Promoter – financial intermediary" field). Title-derived fallback (strip framework suffix) is used for the few pages that fail to resolve. The fallback also strips "TECHEU VD " prefixes from the newer 2024–2026 loan titles.

### Validation results

See Day 4 in [notes.md](notes.md) for post-load numbers and multi-instrument winners.

## Innovation Fund extraction

EU Innovation Fund grant-signed projects (calls 2020–2024) loaded from CINEA project fiche PDFs. Scope: 20 sub-call tracks across 5 call years (Large-scale, Small-scale, Medium-scale, Manufacturing, Pilots, Battery, H2 Bank Auction).

**IF25 exclusion**: All IF25 projects remain in "Invited to grant agreement preparation" status as of 2026-05-21. They will be added once grant agreements are signed.

**Source**: `climate.ec.europa.eu/eu-action/eu-funding-climate-action/innovation-fund/innovation-fund-projects_en` project table + individual CINEA project fiche PDFs (`data/raw/innovation_fund/fiches/`).

**PDF parsing**: All IF fiches use a two-column layout (project summary left, metadata right). `pdfplumber.extract_text()` on the full page interleaves both columns. Fix: `page.crop((width/2, 0, width, height))` to isolate right-column metadata. Two amount field name variants exist: "AMOUNT OF INNOVATION FUND GRANT" (2020–2022) and "AMOUNT OF THE INNOVATION FUND GRANT" (2021+); parser handles both.

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

Chips JU (formerly KDT JU) awarded projects loaded from the chips-ju.europa.eu portal's OData API. Scope (v1): 35 KDT JU projects across call years 2020–2023 (the JU portal labels both ECSEL-transition and Chips Act-era projects under `shv_jueratype=920810000`; the predecessor ECSEL JU is filtered out by the same field). Option A (coordinator only) — the OData API does NOT expose the full beneficiary list per project, only the lead institution.

**Source**: `https://www.chips-ju.europa.eu/_api/shv_webprojectses?$filter=shv_jueratype%20eq%20920810000` — a Dynamics 365 / PowerApps portal OData endpoint discovered from the page source of `/projects/`. Returns clean JSON; no PDF parsing required. Cached to `data/raw/chips_ju/chips_ju_projects.json`.

**Scope decisions**:
- **Call year 2020 included** (2 projects): the portal labels them KDT and both started in 2021 (within the project's 2021+ time window). They represent the KDT JU's transition projects (ASML's ID2PPAC, SIOUX's IMOCO4.E).
- **KDT-2023 incomplete** (4 of ~25 expected projects): the portal was still being populated as of 2026-05-21 (SMARTY added Oct 2025). Re-running the extractor is idempotent and will pick up the rest once published. Per-call grant sum is €38.2M vs an expected ~€240M budget — flag this gap when reporting KDT-2023 totals.
- **Chips JU 2024+ R&D calls not in scope**: the first Chips JU-branded calls (under the Chips Act mandate, post-2024) are not yet published in the portal; the `shv_jueratype` enum has no Chips JU value yet, only KDT and ECSEL.
- **Pillar 1 manufacturing subsidies excluded**: state-aid notifications, not a Chips JU call — partially covered by IPCEI MECT/Microelectronics already.

**Schema mapping**:
- `source`: `chips_ju_kdt_{2020..2023}` (one per call year)
- `role`: `direct`
- `grant_amount_eur`: `shv_totalinvestment` from the portal — **total JU public funding** (EU + member-state contributions combined; the EU-only share is roughly half but is not published per project, same caveat as IPCEI state-aid totals)
- `debt_amount_eur`: NULL (grant instrument only)
- `sector_tags_raw`: `"Semiconductors, {category}"` where category is the chips-ju impact-area field (Digital Industry, Digital Society, etc.). `"Semiconductors"` added to `DEEPTECH_TAGS` in `classify.py` so tag-match resolves directly without falling through to source-sector mapping.
- `project_started`: `shv_startdate` from the portal
- `raw_source_url`: project detail page in the portal

**Coordinator-country derivation**: the portal exposes the full list of participating consortium countries (`shv_countries`) but NOT a separate coordinator-country field. Country is derived from the institution name using three tiers: (1) explicit country mention ("GERMANY", "AUSTRIA", "NEDERLAND" — case-insensitive); (2) language-specific institution patterns (POLYTECHNEIO → GR, SCUOLA SUPERIORE → IT, COMMISSARIAT → FR, SINTEF → NO, etc.); (3) hardcoded org overrides for multi-country corporates (ASML→NL, INFINEON…AG→DE, AVL LIST GMBH→AT). Result is validated against the consortium-country list. After exact/fuzzy/prefix match against the existing `companies` table, matched rows inherit the canonical country, so derivation only fires for new inserts.

**Company matching**: exact (normalised name + country) → name-only exact (when country can't be derived) → **prefix match** (existing name is a whole-word prefix of new name, ≥4 chars, same country) → fuzzy SequenceMatcher ≥ 0.92 → new insert with `match_method='chips_ju'`. The prefix tier was added specifically for Chips JU and is the key entity-resolution improvement of this sprint: IPCEI MECT/Micro stored shortened names ("ASML", "Infineon", "Bosch") while Chips JU uses full legal names ("ASML NETHERLANDS B.V.", "INFINEON TECHNOLOGIES AG"); fuzzy ratio is too low to bridge these but prefix is exact.

**Sector**: all Chips JU sources → `deeptech_hardware` via two paths: (1) `"Semiconductors"` tag added to `DEEPTECH_TAGS` so the tag-match path resolves directly; (2) `CHIPS_JU_SOURCE_SECTOR` in `extract_chips_ju.py` (imported by `classify.py` — single source of truth, same pattern as `IF_SOURCE_SECTOR`) as a fallback for any tag-less row. Multi-source Chips JU companies (e.g. CEA — EIC Pathfinder/Transition + Chips JU) keep their primary EIC-derived sector per the methodology's priority order (Space > Life Sciences > Cleantech > Deeptech > Digital); this is by design.

**Methodological caveats** (same as Innovation Fund Sprint 4 under Option A):
1. **Coordinator-only capture** — undercounts companies reached. Each KDT JU project is a 5–40 partner consortium; only the lead institution is captured. Cross-instrument "number of companies reached" comparisons must caveat that Chips JU figures count only coordinators.
2. **Country = coordinator HQ** — not project location. CEA coordinating a project executed across multiple sites would still be FR in our DB.
3. **`shv_totalinvestment` = combined JU public funding** — not EU-only. KDT JU is a public-public partnership; the figure combines EU (Horizon Europe) and national member-state contributions to the JU. The EU-only split is roughly 50% but is not published per project. Comparable to IPCEI state-aid totals (also combined cross-jurisdiction). When reporting "EU contribution", apply the ~50% rule of thumb or note the methodology caveat.
4. **KDT-2023 incomplete** — silent undercount in 2023 totals. Re-check periodically and re-run the extractor (idempotent).

## EDF extraction

European Defence Fund awarded projects (2021–2025 calls) loaded from individual per-project PDF factsheets published on `defence-industry-space.ec.europa.eu`. Scope (v1): coordinator only (Option A) — same convention as IF and Chips JU. **276 coordinator events loaded across all 10 source IDs (RA + DA for each of call years 2021–2025), 97% coverage.**

**Data source**: Per-project factsheet PDFs hosted on the EDF results pages at `defence-industry-space.ec.europa.eu`. Each PDF contains: project acronym, title, call title, topic/capability area, duration, activity types, estimated total cost, maximum EU contribution (page 1), and a consortium member table with "(Coordinator)" marker (page 2+). No OData API or structured export is available — factsheets are the only machine-readable source for EDF. **285 factsheet URLs catalogued across all call years 2021–2025; 276 successfully parsed and loaded; 8 missed (4 EDF 2025 still rate-limited, 4 real-PDF parse failures likely needing OCR).** Coverage by year: EDF 2021 (59/60), EDF 2022 (39/41), EDF 2023 (60/61), EDF 2024 (63/63), EDF 2025 (55/59). Initial load (no per-request delay) achieved only 50% coverage because the EC server rate-limited the domain and returned HTML "Sorry" pages disguised as ~40KB PDFs; the `_is_real_pdf()` magic-byte check plus a `--sleep=N` CLI flag recovered the remainder on a second run.

**RA/DA determination**:
- EDF 2022–2025: "Call title" field states "Research actions" or "Development actions" explicitly.
- EDF 2021: "Call title" is the capability area (e.g. "Avionics and advanced air combat"). Infer from "Type(s) of activities": if "Generating knowledge" or "Integrating knowledge" → RA; if "Prototyping" / "Testing" without knowledge-generation activities → DA; plain "Studies" / "Studies; Design" defaults to DA.

**PDF parsing**: EDF factsheets use a two-column table on page 2+ (company name left, country right). The PDF text extractor (pdfplumber) sometimes fuses the last word of the company name with "(Coordinator)" into a single token (e.g. "FRANCE(Coordinator)"). The extractor uses `extract_words()` with x-position thresholds to reconstruct the two-column layout, handles multi-line company names (spanning up to ~45px above the "(Coordinator)" word), and strips the fused suffix to recover the full name. Country is extracted from the right column (x > 65% of page width) within the same y-window.

**Amount**: "Maximum EU contribution" from page 1 → `grant_amount_eur`. "Estimated total cost" (EU + national co-funding) is NOT stored — same caveat as Chips JU `shv_totalinvestment` and IPCEI state-aid totals. EDF-DA projects have member-state co-funding of 20–80%; our stored amount is the EU-contribution ceiling only.

**Schema mapping**:
- `source`: `edf_ra_<year>` or `edf_da_<year>` (10 values for call years 2021–2025, all populated)
- `role`: `direct` (consistent with IF and Chips JU Option A convention; `coordinator` label reserved for EIC where the role distinction is meaningful at event level)
- `grant_amount_eur`: EU contribution ceiling from factsheet
- `debt_amount_eur`: NULL (grant instrument)
- `sector_tags_raw`: `"Defense, {capability_area}"` where capability area is the topic/call title from the factsheet (e.g. `"Defense, Sensors"`, `"Defense, Ground Combat"`). The leading `"Defense"` tag triggers `DEFENSE_TAGS` membership in the classifier.
- `project_started`: awarded date per call year (approximate; varies within a year as grant agreements are signed)

**Coordinator-country derivation**: EDF factsheet tables explicitly state the country on the same row. Country names are converted to ISO2 via a lookup table; for the few cases where the extractor cannot isolate the country from the PDF layout, `_derive_country_from_name()` applies a 3-tier heuristic (explicit country mention in name → language patterns → hardcoded org overrides for known defense primes). 0 NULL country after load (1 case — CYBERNETICA AS — fixed manually to EE).

**Company matching**: exact (normalised name + country) → name-only exact → prefix (existing name is a whole-word prefix of new name, ≥4 chars, same country) → fuzzy SequenceMatcher ≥ 0.92 → new insert with `match_method='none'`. The prefix tier was critical for bridging defense-prime name variants across instruments.

**Sector**: all EDF sources → `defense` via two paths: (1) `"Defense"` tag in `DEFENSE_TAGS` membership check (primary path; every EDF row has `sector_tags_raw` starting with `"Defense"`); (2) `EDF_SOURCE_SECTOR` dict in `extract_edf.py` (imported by `classify.py`, same single-source-of-truth pattern as `IF_SOURCE_SECTOR` and `CHIPS_JU_SOURCE_SECTOR`) as a fallback. Multi-source EDF companies (e.g. Thales, CEA, SINTEF — also in EIC/IPCEI/Chips JU) retain their primary existing sector per the methodology's priority order (Space > Life Sciences > Defense > …); this is by design.

**Methodological caveats**:
1. **Coordinator-only capture** — each EDF project consortium has 5–25+ partners; only the lead is loaded. The "number of EDF-funded companies" count is a coordinator count, not a full beneficiary count.
2. **Coverage near-complete (97%)** — 9 of 285 EDF factsheets remain unloaded: 4 EDF 2025 URLs still rate-limited (idempotent re-run will pick them up), 4 real-PDF parse failures across 2021–2023 (likely scanned-image factsheets needing OCR), 1 NULL grant amount.
3. **Amount = EU contribution ceiling** — not necessarily disbursed; not the total project cost. EDF-DA projects have co-funding obligations (20–80% national contribution).
4. **EDF 2021 RA/DA split imprecise** — the call title in EDF 2021 factsheets does not label RA vs DA explicitly. Activity-type heuristic is best-effort; 3 borderline projects (activity types = "Studies" only) defaulted to DA.
5. **PADR/EDIDP out of scope** — predecessor defense programmes (PADR 2017–2019, ~€90M, ~18 projects; EDIDP 2019–2020, ~€500M, ~62 projects) predate the tracker's 2021+ time window. Could be added in a future mini-sprint.
6. **Duplicate company rows for same legal entity** — defense primes sometimes appear under slightly different names across call years (e.g. "LEONARDO S.p.A." vs "LEONARDO -SOCIETA PER AZIONI"). These map to separate rows despite being the same company. The prefix matcher resolved most but not all cases; review during Dealroom enrichment.

## EIT KIC extraction

EIT Digital (rebranded to 28digital.eu in 2025) and EIT Manufacturing (ASBL, ceased operations 10 April 2026 but pages remain online) loaded in Sprint 7. All company data compiled from web-fetched pages into hardcoded Python lists in `extract_eit.py` — no live HTML parser — because page structures are inconsistent and N is small enough to curate manually.

**EIT Digital scope**: 6 sources — Champions cohorts 2021–2025 (called "EIT Digital Challenge" until 2023, renamed "Champions" from 2024; all unified as `eit_digital_champions_<year>`) + EIC–EIT Digital Venture Acceleration Programme 2022 (`eit_digital_vap_2022`). Total: 51 events.

**EIT Manufacturing scope**: 4 sources — investment portfolio (21 companies, equity undisclosed, `eit_manufacturing_investments`) + BoostUp! competition winners 2021, 2023, 2024 (17 sources with cash prizes €2.5K–€50K, `eit_manufacturing_boostup_<year>`). BoostUp 2022 excluded — 8 winners at €20K each but winner names not published. Total: 48 events.

**Schema mapping**:
- `source`: 10 source IDs (`eit_digital_champions_{2021..2025}`, `eit_digital_vap_2022`, `eit_manufacturing_investments`, `eit_manufacturing_boostup_{2021,2023,2024}`)
- `role`: `portfolio_company` (new role value for EIT rows)
- `coordinator_only`: `1` for all rows (single-company participation, no consortium)
- `grant_amount_basis`: 3 new labels — `eit_kic_support` (Champions/VAP: no cash, support services only), `eit_kic_grant` (BoostUp cash prizes), `eit_kic_equity` (investment portfolio, amount undisclosed)
- `project_title`: truncated description (first 200 chars); `project_summary`: full description + notes
- `sector_tags_raw`: empty string for all rows; `EIT_KIC_SOURCE_SECTOR` dict in `extract_eit.py` (imported by `classify.py`) provides source-level fallback (`digital` for EIT Digital sources, `deeptech_hardware` for EIT Manufacturing)

**Company matching**: same 5-tier matcher as Chips JU/EDF — exact (name+country) → exact name-only → **forward prefix** (existing name is whole-word prefix of new) → **reverse prefix** (new name is whole-word prefix of existing, added Sprint 7 to handle EIT short names vs. long EIC legal names) → fuzzy (≥0.92 threshold) → new insert. The reverse-prefix tier was added because 3 EIT short names (`Plexigrid`, `Ekkono`, `Orange Quantum Systems`) failed to match existing EIC legal-form names (`PLEXIGRID SOCIEDAD LIMITADA`, `EKKONO SOLUTIONS AB`, `ORANGE QUANTUM SYSTEMS OPERATIONAL BV`); 3 duplicate rows were detected via `data/processed/eit_match_summary.csv` and merged via SQL.

**EIT Digital × EIC overlap**: 6 of 51 EIT Digital companies also appear in EIC (11.8%). Sprint plan gate was ≥20%; the shortfall reflects small per-year cohorts (3–13 champions) and a niche-vertical bias (not every EIT Digital winner is in the EIC-fundable life-sciences / deeptech space). Full overlap list: Connecting Food (FR), Multiverse Computing (ES), GrayMatters Health (IL), Ekkono Solutions AB (SE), Plexigrid (ES), Orange Quantum Systems (NL).

**EIT Manufacturing multi-instrument winners**: 3 companies appear in both investments and BoostUp (ChainTraced DE, DREV SE, Litech NO). FAIRMAT SAS (FR) appears in both EIT Manufacturing BoostUp and EIB venture debt.

**Methodological caveats**:
1. **Hardcoded data** — company lists were compiled 2026-05-21 from source pages. New Champions or BoostUp cohorts will require a manual data update to `extract_eit.py`; no live web dependency.
2. **EIT Digital amounts = no cash** — Champions and VAP programmes offer support services, not grants. `grant_amount_eur` is NULL for these rows by design (`eit_kic_support` basis).
3. **BoostUp 2022 excluded** — EIT Manufacturing BoostUp 2022 grand-final winners (8 companies, €20K each) were not published on the website.
4. **EIT Manufacturing ceased operations** — ASBL wound down 10 April 2026; website is a frozen snapshot. The investment portfolio date is approximate (`2023-01-01`).
5. **6 remaining KICs deferred** — EIT InnoEnergy and EIT Health are planned for Sprint 9 (via Dealroom portfolio lists); EIT Climate-KIC, Food, Raw Materials, Urban Mobility deferred to future sprints.

## Enrichment plan (pending)

- **Granular entity refinement**: Split `company` into startup / sme / large_corp via Dealroom or EU Funding & Tenders Portal lookup by PIC. Same lookup can resolve the 221 remaining `unknown`.
- **Match enrichment**: Dealroom / Crunchbase / LinkedIn matching for the 1,374 companies to enable downstream private-funding event enrichment.

## Decision log

- **2026-05-20** — Project structure, PIC as canonical company ID, three-table schema, grant-only for v1
- **2026-05-20** — EIC Accelerator/Pathfinder/Transition loaded; primary analysis universe = Accelerator coordinators
- **2026-05-20** — Sector taxonomy: six labels (`life_sciences`, `deeptech_hardware`, `cleantech`, `space`, `digital`, `other`) with use-domain-over-technology priority and ordered overlap-resolution rules
- **2026-05-20** — Sector + entity_type classifiers implemented deterministically in [classify.py](classify.py). All 2,189 companies classified by sector. Entity type: 707 startups (Accelerator coordinators), 361 research_orgs (name pattern match), 1,121 still `unknown` pending LLM refinement.
- **2026-05-20** — Adopted 3-bucket entity scheme (`research_org` / `company` / `other`) for v1. Granular startup/SME/large_corp split deferred — requires Dealroom or EU registry data anyway. Heuristics expanded with multilingual coverage (research stems for 12+ languages; corporate suffixes for 15+ jurisdictions). Final entity_type distribution: 1,374 company, 585 research_org, 9 other (public bodies), 221 unknown (~10%, mostly suffix-less company names).
- **2026-05-20** — IPCEI extraction complete. 317 funding-event rows loaded across 11 decisions; 302 distinct companies; 7 matched to existing EIC records, 295 new. Aid sums validate within ±3% for all modern-format programs with non-redacted amounts (Hy2Tech €5.42bn vs €5.4bn, Hy2Use €5.12bn vs €5.2bn, MECT €8.13bn vs €8.1bn, Hy2Move €1.44bn vs €1.4bn). Legacy amounts (Micro, Batteries, EuBatIn) fully redacted in PDFs — NULL in DB. **Decision**: Benchmark counts updated from "distinct companies" to "funding-event rows" (see IPCEI scope table and flagged callout above); use aid-sum validation as primary correctness signal going forward.
- **2026-05-20 (sprint-2 hygiene pass)** — (a) Found classifier was never re-run after IPCEI load; 295 new rows had sat as `sector=NULL→unclassified` and `entity_type=unknown`. Extended `classify.py` with an `IPCEI_SOURCE_SECTOR` map (kept in sync with the IPCEI scope table) and added `sources` parameter to `classify_sector` so IPCEI-only companies resolve via source→sector after EIC tags and keyword fallback fail. Re-ran cleanly. (b) Aligned schema.sql column comments to the v1 6-label sector taxonomy and 3-bucket entity scheme. (c) Corrected README counts (707 distinct Accelerator coordinators / 712 events; project structure flattened to repo root) and fixed stale "~80–120 direct-partner rows" estimate (actual: 317). (d) Reconciled the +6 gap between press-release "~296 distinct partners" and DB's 302 distinct IPCEI companies, and noted the Hy2Infra −24% aid-sum gap is plausibly one large redacted anchor partner. Final counts: 2,484 companies, sectors fully populated (1,032 life_sciences / 677 cleantech / 482 deeptech_hardware / 146 space / 111 digital / 36 other), entity_type 1,407 company / 585 research_org / 9 other / 483 unknown.
- **2026-05-20 (sprint-3 EIB load)** — EIB venture-debt loaded. 153 events, 151 distinct borrowers, 16 matched to existing EIC companies, 135 new inserts; total committed debt €3,590M. `debt_amount_eur` column added to `public_funding_events`; `role='borrower'` used (not `coordinator`/`participant`/`direct`). Zero NULL `debt_amount_eur`, zero `grant_amount_eur` populated for EIB rows. Final counts: 2,619 companies (1,086 life_sciences / 711 cleantech / 499 deeptech_hardware / 150 space / 137 digital / 36 other), zero unclassified. **Workarounds / items needing future review:**
  1. **EIB scraper uses `subprocess.run(['curl', ...])`** instead of Python `urllib` — macOS Python SSL certificate store does not trust the EIB root CA, causing `CERTIFICATE_VERIFY_FAILED`. The curl workaround uses the system keychain. *Review if running on Linux CI or a new machine — curl must be present, or certificate verification must be configured for Python's ssl module.*
  2. **EIB sector_tags_raw is empty for Industry / Services / Transport borrowers** — EIB's broad sector labels give no useful signal for these categories, so `sector_tags_raw` is stored as `''` and classification falls entirely to keyword matching on `project_summary`. This required adding 50+ new keyword entries to `classify.py` to reach zero unclassified. *Proper fix: run a richer keyword pass inside `extract_eib.py` at load time and store explicit EIC-compatible tags in `sector_tags_raw`, reducing future dependency on keyword volume in the classifier.*
  3. **`MANUAL_SECTOR_OVERRIDES` dict** in `classify.py` (4 entries) — used both for unclassifiable cases (NOMAGIC INC, RDI-only description) and to correct keyword-fallback misclassifications that violate the use-domain-over-technology rule (STARK FUTURE SL → cleantech, IN OVO HOLDING BV → other, CROWDFARMING SL → other). Applied AFTER `classify_sector` so it overrides, not just falls back. NOMAGIC INC is also the same company as NOMAGIC SP ZOO (separate legal entities) but the fuzzy-match threshold (≥0.92) didn't merge them. *Review when enriching with Dealroom: if both NOMAGIC entities resolve to the same Dealroom ID, merge them. If this dict grows past ~10 entries, refactor the classifier (e.g. pre-classification in `extract_eib.py` at load time, storing explicit `sector_tags_raw`).*
  4. **Two orphan company rows deleted** during classifier cleanup (DB IDs 2620–2621: "SQIM MYCELIUM TECHNOLOGY DEMO PLANT", "AMSILK ADVANCED MATERIALS") — project titles stored as company names, no linked events, and no clear origin. Legitimate rows (SQIM SRL id=2606, AMSILK GMBH id=2607) were unaffected. *Root cause: suspected race condition during an earlier CSV rebuild run. `sanity_check.py` now contains a `DQ: orphan companies` query that surfaces any future occurrence without auto-deleting. The `(source, call_id)` duplicate guard on `public_funding_events` prevents duplicate events but does not prevent duplicate `companies` rows if name normalisation produces a different canonical name on re-run — fixing this properly requires dedup on insert into `companies`.*
- **2026-05-20 (sprint-3 follow-up review)** — Reviewed Sprint 3 output against methodology. Three keyword-fallback misclassifications corrected via `MANUAL_SECTOR_OVERRIDES` (use-domain-over-technology rule from sector taxonomy): STARK FUTURE SL (electric motorbikes) deeptech → cleantech, IN OVO HOLDING BV (poultry agribusiness) life_sciences → other, CROWDFARMING SL (agrifood marketplace) digital → other. Added 3 DQ queries to `sanity_check.py`: orphan companies, unclassified count, manual-override audit. Final sector distribution: 1,085 life_sciences / 712 cleantech / 498 deeptech_hardware / 150 space / 136 digital / 38 other. Sprint-3 deliverable signed off; outstanding follow-ups (pre-classification in loaders; companies-table dedup on insert) deferred to a future architecture sprint.
- **2026-05-21 (sprint-4 Innovation Fund load)** — EU Innovation Fund grant-signed projects (calls 2020–2024) loaded from CINEA project fiche PDFs. 246 events across 20 sub-calls; 237 distinct beneficiaries; 8 cross-instrument matches (6 EIC, 1 IPCEI, 1 EIB), 229 new inserts. `role='direct'`, `grant_amount_eur` from fiche PDF (NULL for 7 projects without a published fiche). **IF25 excluded** — all projects still in "Invited to grant agreement preparation" status; will be added when grant signatures are announced. `IF_SOURCE_SECTOR` map added to `classify.py` (all IF sources → cleantech). Zero unclassified after re-run. Final counts: 2,848 companies (1,085 life_sciences / 942 cleantech / 498 deeptech_hardware / 150 space / 136 digital / 37 other). **Data note**: 7 projects have no published fiche on climate.ec.europa.eu (all from hbank_2024, msp_2024, mfg_2024, lsp_2022); coordinator and amount are NULL for these rows. One fiche (CapturEste, ID 101191951) returns HTML instead of PDF — loaded using alternate CINEA ID 101190951. **Extractor note**: `extract_innovation_fund.py` uses right-column PDF crop (`page.crop((width/2, 0, width, height))`) because pdfplumber returns interleaved left/right column text on the two-column fiche layout; the crop eliminates left-column body text from the metadata fields. Same `subprocess.run(['curl', ...])` SSL workaround as EIB extractor.
- **2026-05-21 (sprint-4 post-sign-off cleanup)** — Two pieces of technical debt from the IF load addressed before they could compound:
  1. **`sector_tags_raw` upgraded from placeholder `'Energy'` to `"Energy, {category}, {sector}"` per row** — preserves the climate.ec.europa.eu category and project-level sector (Cement & lime, Hydrogen, Refineries, etc.) for direct SQL sub-sector queries while keeping the `'Energy'` prefix so the classifier's CLEANTECH_TAGS membership check still fires. Verified: `SUM(grant_amount_eur) WHERE sector_tags_raw LIKE '%Hydrogen%'` returns €1.6bn across 30 events; `'%Cement%'` returns €3.1bn across 24 events; `'%Storage%'` returns €1.8bn across 39 events. No regression in classifier output (still 942 cleantech, zero unclassified).
  2. **`IF_SOURCE_SECTOR` deduplicated** — `classify.py` now imports `IF_SOURCE_SECTOR` from `extract_innovation_fund.py` rather than maintaining a parallel copy. Adding a new IF sub-call now requires only updating `CALL_TO_SOURCE` in the extractor. Also housekeeping: removed empty per-call sub-directories under `data/raw/innovation_fund/` (everything ended up in `fiches/`); deleted leftover `/tmp/batch_download_fiches.py`. Kept the CINEA reference PDFs (pre-selection lists, statistics, annexes) in `lsp_2020/`, `lsp_2021/`, `ssp_2020/` as data lineage. Reload (delete-and-reinsert IF events, re-run classifier) confirmed clean: 2,848 companies / 4,559 events / zero unclassified / zero orphans.
- **2026-05-21 (sprint-5 Chips JU / KDT JU load)** — 35 KDT JU coordinator events loaded across call years 2020–2023 from the chips-ju.europa.eu OData API (`/_api/shv_webprojectses`, discovered from the projects page source). Per-call counts: kdt_2020=2 (€138.5M), kdt_2021=13 (€462.6M, matches published ~€455M JU budget within 2%), kdt_2022=16 (€609.4M, matches ~€617M within 2%), kdt_2023=4 (€38.2M, **INCOMPLETE** — expected ~€240M / ~25 projects, portal still being populated as of 2026-05-21, idempotent re-run will pick up the rest). Option A (coordinator only) — the API does NOT expose the full consortium beneficiary list. **Schema**: no migration. `source=chips_ju_kdt_<year>`, `role=direct`, `grant_amount_eur=shv_totalinvestment` (total JU public funding = EU + national member-state contributions combined, not EU-only; same convention as IPCEI state-aid totals), `sector_tags_raw="Semiconductors, {portal_category}"`. **Classifier**: `"Semiconductors"` added to `DEEPTECH_TAGS` in `classify.py`; `CHIPS_JU_SOURCE_SECTOR` added to `extract_chips_ju.py` (imported by classify, same single-source-of-truth pattern as `IF_SOURCE_SECTOR` after Sprint 4 cleanup). **Match results**: 13 exact + 8 prefix + 1 fuzzy + 13 new inserts. **Prefix-match tier** (new this sprint) bridges IPCEI MECT/Micro shortened names ("ASML", "Infineon", "Bosch", "Lynred") to Chips JU full legal names ("ASML NETHERLANDS B.V.", "INFINEON TECHNOLOGIES AG") — fuzzy ratio was too low (~0.6); the prefix tier requires the existing normalized name to be ≥4 chars and a whole-word prefix of the new name (same country). This is a meaningful entity-resolution improvement that also reduces the duplicate-row backlog from prior IPCEI loads. **Final counts**: 2,861 companies (1,085 life_sciences / 942 cleantech / 511 deeptech_hardware / 150 space / 136 digital / 37 other), zero unclassified, 12 distinct Chips JU multi-instrument winners (4 with IPCEI: ASML, Infineon, Lynred, IMEC; 8 with EIC Pathfinder/Transition: AVL, CEA, CNIT, Infineon-AT, Lulea, SantAnna, SINTEF, plus IMEC). **Coordinator-country derivation**: 3-tier heuristic (explicit country mention → language patterns → hardcoded org overrides), validated against the participating-countries field; 100% coverage on the 35 rows. **Caveats** (4): coordinator-only capture, country=HQ, total-funding-not-EU-only, KDT-2023 incompleteness — same patterns as IF Sprint 4 under Option A, see [`project_innovation_fund_workarounds.md`](memory) items 1–3 which apply equally here.
- **2026-05-21 (sprint-6 taxonomy revision)** — Sector taxonomy expanded from 6 to 7 labels. Added `defense` between `life_sciences` and `cleantech` in the priority order (Space > Life Sciences > Defense > Cleantech > Deeptech > Digital > Other). Retroactive classifier pass over all 2,861 existing companies before EDF load: 7 companies flipped to `defense` via `DEFENSE_KEYWORDS` fallback (companies with defense-focused descriptions in historical EIC/IPCEI/EIB/IF rows). No false positives identified; flipped list comprises defense-oriented research institutions and one dual-use systems company. `DEFENSE_TAGS` and `DEFENSE_KEYWORDS` added to `classify.py`; schema.sql sector_inferred comment updated to 7 labels.
- **2026-05-21 (sprint-7 EIT KIC load)** — EIT Digital (28digital.eu) and EIT Manufacturing loaded: 99 events, 96 distinct companies, 87 new company inserts. 3 new `grant_amount_basis` labels (`eit_kic_support`, `eit_kic_grant`, `eit_kic_equity`). New `role='portfolio_company'` value. Reverse-prefix tier added to `match_companies()` in `extract_eit.py` (catches EIT short names vs. pre-existing EIC long legal names). 3 duplicate rows merged via SQL post-load (Plexigrid/Ekkono/Orange Quantum). EIT Digital × EIC overlap: 11.8% (6/51 companies, below 20% gate; documented). 87 first-time sector assignments; 0 stale timestamps. Sector distribution of new EIT companies: digital=48, deeptech_hardware=32, life_sciences=9, cleantech=6, defense=1. Final counts: 3,107 companies / 4,969 events.
- **2026-05-21 (sprint-6 EDF load)** — 143 EDF coordinator events loaded across 8 source IDs (edf_ra/da_2021–2024) from 143 successfully parsed factsheet PDFs (out of 284 catalogued; 141 rate-limited by the EC server — idempotent re-run will pick these up). **Match results**: 26 exact + 1 exact_name_only + 21 prefix + 6 fuzzy + 89 new inserts (match_method='edf'). **Final counts**: 2,950 companies (1,084 life_sciences / 941 cleantech / 507 deeptech_hardware / 149 space / 136 digital / 96 defense / 37 other), zero unclassified. **Grant sums** (EU contribution ceilings, partial due to download coverage): edf_da_2021 €827M/29, edf_ra_2021 €335M/30, edf_da_2022 €496M/15, edf_ra_2022 €312M/24, edf_da_2023 €337M/9, edf_ra_2023 €216M/18, edf_da_2024 €422M/11, edf_ra_2024 €118M/7. Total loaded: €3.06B across 143 events (~50% coverage of total call budgets). **Top coordinator countries**: FR=44, ES=27, DE=13, GR=13, IT=12. **31 cross-instrument winners** (EDF + at least one other source), including Thales (7 EDF events + EIC), CEA (7 events + EIC + Chips JU), Airbus (5 EDF + IPCEI MECT), Lynred (IPCEI + Chips JU + EDF), SINTEF (EIC + Chips JU + EDF). **Taxonomy note**: EDF-DA projects have co-funding obligations (20–80% national contribution); stored amount is EU contribution ceiling only, not total project cost. **Coverage note**: 141 factsheets rate-limited on first run; no data quality issue with the 143 parsed — re-run after server cooldown.
