# EU Public Capital Tracker — Notes

## Day 1 (2026-05-20): EIC load complete

### What's in the DB

- **2,189 unique companies** (deduplicated by PIC, the EU's stable identifier)
- **3,843 funding events** loaded across three EIC programmes
- **712 EIC Accelerator coordinator events** — this is the core startup universe
- Coverage 2021–2025, with 2025 partial (only 41 Accelerator coordinators so far — call cycle still in progress)
- **157 rows skipped** (~4%) due to malformed multi-line summaries with embedded unescaped quotes. Acceptable for v1, noted as known limitation.

### Top-line numbers worth remembering

- EIC Accelerator total grant 2021–2025: **€1.63B** across 712 coordinator projects
- Median Accelerator grant: ~€2.5M (at the programme cap, as expected)
- EIC Pathfinder total grant: **€1.47B** across 443 coordinator projects (smaller per-project, more participants per consortium)
- EIC Transition total grant: **€490M** across 208 coordinator projects

### Country distribution (Accelerator coordinators)

DE (110), FR (107), NL (78), ES (58), SE (48), IL (46), FI (37), IE (28), DK (28), BE (27), IT (26)

**Note**: Israel is funded as a Horizon-associated country and is well-represented. UK appears with only 10 — much lower than its actual share, because UK lost Horizon access mid-2023 and only rejoined for some programmes. Will need a footnote in the brief about UK eligibility windows.

### Notable signal: multi-programme winners

Four companies appear in all three EIC programmes (Pathfinder → Transition → Accelerator):
- Cherry Biotech (FR)
- Inbrain Neuroelectronics (ES)
- Quantware (NL)
- Semiqon Technologies (FI)

These are the "EU deep-tech graduation pipeline" success stories — research → translation → commercial. Worth a sidebar in the brief: how many companies actually traverse the full EIC funnel, and how does follow-on funding differ for them vs. one-shot Accelerator winners?

### Known data limitations

1. **No equity amounts.** EIC Accelerator equity tickets (up to €10M from the EIC Fund) are reported separately, not in this export. Grant-only for v1. **Action**: pull the EIC Fund portfolio list separately later; for now, flag in methodology.
2. **157 rows skipped** in parsing. Mostly long Pathfinder summaries. Will retry with manual fixup if v2 needs the missing records.
3. **2025 partial**. Call cycle still running — final 2025 numbers won't be available until early 2026. Frame the brief as 2021–2024 with 2025 noted as partial.
4. **Sector field is unstructured** (free-text comma-separated, e.g. "Medical Technologies, Non-invasive Medical Devices"). Will need LLM-assisted classification to map onto a normalized sector taxonomy.

### Schema decisions made

- One `companies` row per unique PIC. Companies appearing across multiple programmes get one row + multiple events.
- All three programmes loaded but tagged via `source` field. The Accelerator-coordinator subset is the v1 primary analysis universe.
- `entity_type` left as "unknown" for now — will populate during enrichment phase using LLM classification on name + description (universities and research orgs vs. startups vs. corporates).

### Decisions for Day 2

- IPCEI extraction from Commission state aid decisions (7 PDFs, ~100 named participants)
- Continue using PIC as canonical company ID across all EU sources where available
- Start drafting the sector taxonomy mapping (do this once, use it across all sources)

## Day 2 (2026-05-20): Sector taxonomy + classification

### Decided

- Six-label sector taxonomy with use-domain-over-technology priority. Full definition and overlap rules in [methodology.md](methodology.md).
- Methodology promoted to a living reference doc; new decisions extend it rather than spawning new files.

### Built

- [classify.py](classify.py): deterministic classifier over `sector_tags_raw` with keyword fallback for the 31 tag-empty rows. Entity-type heuristics for research orgs + Accelerator coordinators.
- All 2,189 companies now have `sector_inferred` and `entity_type` populated.

### Distribution

Sector (across the full 2,189 universe):
- life_sciences: 1011 (46%)
- cleantech: 506 (23%)
- deeptech_hardware: 396 (18%)
- space: 146 (7%)
- digital: 94 (4%)
- other: 36 (2%)

EIC Accelerator coordinators (the "startup universe"): 299 life_sciences, 181 cleantech, 112 deeptech, 69 digital, 28 space, 23 other. Mean grant ~€2.3–2.4M across all sectors (at the programme cap, as expected).

Entity type: 707 startup (Accelerator coordinators), 361 research_org (name-pattern match), 1,121 unknown (mostly Pathfinder/Transition participants needing LLM refinement).

### Entity-type pass (later same day)

Decided to use a 3-bucket scheme (`research_org` / `company` / `other`) for v1 instead of granular startup/SME/large_corp — the granular split needs Dealroom or EU registry lookup anyway, and that's a Day 3+ task.

Expanded heuristics in [classify.py](classify.py) with broad multilingual coverage:
- Research stems for English, Spanish/Portuguese, German, Italian, Nordic, Polish, Slovak, Czech, Greek, Hungarian, Icelandic, Finnish
- Corporate legal-form suffixes for 15+ jurisdictions (GmbH/SAS/SRL/SL/Ltd/AB/Oy/UAB/SRO/sp z o.o./Kft, etc.)
- Hospitals, foundations, ERIC infrastructure consortia, Belgian VZW non-profits

Final entity_type: **1,374 company (63%), 585 research_org (27%), 9 other (public bodies, 0.4%), 221 unknown (10%)**.

The 221 unknowns are almost all companies that don't carry a legal-form suffix in their canonical name (e.g. EDF, PASQAL, POIETIS, IMAGENE) — we'll resolve these in the enrichment phase via PIC lookup against the EU Funding & Tenders Portal or Dealroom matching.

### Open for Day 3

- Granular `company` split (startup / SME / large_corp) via Dealroom or EU registry lookup
- IPCEI extraction from the 11 Commission state-aid PDFs ← **completed Day 3**
- Start matching to Dealroom / Crunchbase to enable private-funding event enrichment

## Day 3 — IPCEI extraction (2026-05-20)

Extracted direct-partner data from all 11 IPCEI Commission decision PDFs.

### Numbers

| IPCEI | Funding rows | Aid extracted | vs. press release |
|---|---|---|---|
| Microelectronics 2018 | 27 | redacted | €1.75bn |
| Batteries 2019 | 23 | redacted | €3.2bn |
| EuBatIn 2021 | 40 | redacted | €2.9bn |
| Hy2Tech 2022 | 41 | €5.42bn | €5.4bn ✓ |
| Hy2Use 2022 | 31 | €5.12bn | €5.2bn ✓ |
| MECT 2023 | 68 | €8.13bn | €8.1bn ✓ |
| Cloud 2023 | 19 | €0.75bn | €1.2bn (6 redacted) |
| Hy2Infra 2024 | 31 | €5.21bn | €6.9bn (1 redacted) |
| Hy2Move 2024 | 13 | €1.44bn | €1.4bn ✓ |
| Med4Cure 2024 | 14 | €0.82bn | €1.0bn (5 redacted) |
| Tech4Cure 2025 | 10 | €0.40bn | ~€1.0bn |
| **Total** | **317** | | |

**302 distinct companies**; 7 matched to existing EIC records (exact); 295 new IPCEI-only companies.

Multi-instrument winners found: CORTEC GMBH (EIC + IPCEI Micro), BASF SE (EIC + Batteries), CORWAVE/FINEHEART/POWERFUL MEDICAL (EIC + Tech4Cure), REPSOL/SOLAR FOODS (EIC + Hy2Use).

### Methodology note

"Direct partners" in Commission press releases = distinct companies. Our DB stores one row per (company, member-state) funding event, so row counts exceed company counts for IPCEIs where the same company holds grants in multiple countries (e.g. Solvay in BE+FR+IT = 3 rows, 1 company). Primary validation signal is the **aid sum**, not the row count — see the flagged callout in methodology.md.

Legacy programs (Micro 2018, Batteries 2019, EuBatIn 2021) have fully redacted amounts in the PDFs. The `aid_amount_eur` field is NULL for these rows; `aid_amount_raw` retains the original cell text.

### Open for Day 4

- Granular `company` split (startup / SME / large_corp) via Dealroom or EU registry lookup
- EIB venture/growth extraction
- Chips JU extraction
- Dealroom/Crunchbase matching for private-funding event enrichment
- Identify the redacted Hy2Infra anchor partner manually (~€1.7bn unaccounted)

### Files

- `data/raw/eic_datahub_export_20260520.csv` — original EIC export
- `data/raw/ipcei/*.pdf` — 11 Commission state-aid decisions
- `data/processed/ipcei_partners.csv` — extraction checkpoint
- `data/processed/ipcei_match_summary.csv` — IPCEI↔EIC dedup audit
- `schema.sql`, `load_eic.py`, `extract_ipcei.py`, `classify.py`, `sanity_check.py`
- `db.sqlite` — built database (2,484 companies)

## Day 4 (2026-05-20): EIB venture-debt load

EIB direct venture-debt and growth-finance loans loaded as `source='eib_venture'`.

### Numbers

| Metric | Value |
|---|---|
| EIB events loaded | 153 |
| Distinct borrowers | 151 |
| New companies inserted | 135 |
| Matched to existing EIC/IPCEI companies | 16 |
| Total debt_amount_eur | €3,590M |
| Total companies in DB (post-load) | 2,619 |

### Discovery methodology

EIB does not publish a dedicated "venture debt portfolio" CSV. Projects were identified from the full `/page-provider/projects/list` API dump (~17k projects) by pattern-matching project titles against instrument suffixes: `(EGF VD)`, `(IEU LS)`, `(IEU TI)`, `(IEU FT)`, `(IEU GT/GT2/GT3)`, `(IEU SIW)`, `IDGF`, `TECHEU VD`, `TECHEU SCALE UP`. After filtering out programme-level entries, lending envelopes, co-investment vehicles (EGF VDC), and multi-country codes (C7), 153 signed/approved project IDs for 2021–2026 were identified.

Borrower names were scraped from individual EIB project detail pages (the "Promoter – financial intermediary" HTML field) using rate-limited `curl` subprocess (1 req/sec) to avoid EIB bot-protection. All 153 pages resolved successfully.

### Instrument structure note

EGF VD loans (2021–2022) and InvestEU VD loans (2022+) are both stored as `source='eib_venture'`. Distinguishing them at the event level from the title suffix alone is possible but fragile (some newer loans use the EGF framework retroactively), so they are unified under one source label per the sprint plan. The `project_title` field retains the original EIB title with the instrument suffix for traceability.

### Sector classification

EIB's broad sector labels (Energy, Health, Industry, Services, Transport, Telecom) were mapped to EIC-compatible tags in `sector_tags_raw` where unambiguous (Energy → `"Energy"` → `cleantech`; Health → `"Health Biotechnology"` → `life_sciences`; Telecom → `"Data & ICT"` → `digital`). For Industry/Services/Transport (the majority of loans), `sector_tags_raw` is left empty and `classify.py` uses keyword matching on the `project_summary` field (the short EIB project description) to infer the sector. This approach matches the pattern established for EIC tag-empty rows. Zero `unclassified` after classifier re-run.

### Multi-instrument winners

(See sanity_check.py "EIB: multi-instrument winners" output for the actual list.)

Expected overlap with EIC: companies that received both an EIC grant and an EIB venture-debt loan. EIB venture debt is typically co-invested alongside VC rounds, so EIC+EIB is the "strongest signal" combination for the follow-on prediction question.

### Open items

- Granular company split (startup / SME / large_corp) still deferred to enrichment pass (Dealroom/EU registry)
- EIB does not publish disbursed amounts (only approved/signed ceiling); `debt_amount_eur` is the commitment, not necessarily the final draw-down
- A handful of EIB loans have borrower project titles that include descriptive suffixes (e.g. `SNIPR BIOME RDI`) rather than just the company name; the scraped promoter name (e.g. `SNIPR BIOME APS`) is the canonical name used for matching
- `TECHEU SCALE UP - FINTECH` (€70M, IT, 2025) references Scalapay per the EIB product page; the scraped promoter name is used directly

### Files added

- `data/raw/eib/eib_project_ids.json` — 153 EIB VD project IDs with metadata
- `data/raw/eib/eib_projects_signed_20260520.csv` — full project list with scraped borrower names
- `data/raw/eib/eib_scraped_temp.csv` — intermediate curl scrape output (merged into main CSV)
- `data/processed/eib_match_summary.csv` — per-row match audit
- `extract_eib.py` — EIB extractor (discovery + scraping + matching + DB load)

## Day 3 follow-up (2026-05-20): hygiene pass before sprint 3

Review of methodology/notes/README surfaced one real data issue and a handful of doc drifts. Fixed before moving on.

### Data issue: classifier was stale after IPCEI load

`extract_ipcei.py` inserts new `companies` rows and sets `sector_inferred` per-program (Hy2Tech→cleantech, etc.) but doesn't run the entity_type classifier. We also never re-ran `classify.py` after the IPCEI load — so the 295 new IPCEI companies sat as `entity_type='unknown'`, and when I belatedly re-ran `classify.py`, it overwrote the per-program sector assignments with `unclassified` because IPCEI rows have no `sector_tags_raw` to feed the classifier.

**Fix**: extended `classify.py` with an `IPCEI_SOURCE_SECTOR` dict (the same mapping the methodology IPCEI table holds) and gave `classify_sector` a `sources` parameter. Resolution order is now: EIC tags → keyword fallback on title/summary → IPCEI source→sector mapping → `unclassified`. Idempotent re-run lands cleanly:

- Sector: 1,032 life_sciences / 677 cleantech / 482 deeptech_hardware / 146 space / 111 digital / 36 other. Zero unclassified.
- Entity_type: 1,407 company (57%) / 585 research_org (24%) / 9 other / 483 unknown (19%). Unknown share grew from EIC-only 10% → 19% because IPCEI direct-partner names in Commission PDFs typically lack legal-form suffixes ("Infineon", "Bosch", "Globalfoundries", "Carl Zeiss" are obvious corporates that the suffix-based heuristic can't see).

**Operational rule going forward**: re-run `classify.py` after any loader that inserts new `companies` rows. Captured in methodology.md.

### Doc drifts fixed

- **README project structure** was wrong (showed `src/` layout that doesn't exist; scripts live at repo root). Run commands updated to reflect actual paths.
- **EIC Accelerator count** corrected from "709 companies" to "707 distinct coordinator companies / 712 events" (the README/notes/methodology had three different numbers).
- **schema.sql comments** still listed the old taxonomy (`ai_ml`, `semiconductors`, `climate_cleantech`, `health_biotech`) and the old 6-bucket entity scheme. Aligned to the v1 labels.
- **IPCEI "~80–120 partners" estimate** in methodology was off by ~3× (actual 317). Replaced with the actual figure.
- **+6 gap between press-release "~296 partners" and DB's 302 distinct IPCEI companies** explained inline.
- **Hy2Infra −24% aid-sum gap** flagged with the likely explanation (single large redacted anchor partner, plausibly ~€1.7bn).

### Data quality verdict before sprint 3

The supply-side dataset (who got EU public capital, in what sector, in what country) is solid enough to start exploratory analysis. The actual research question — does this capital *predict* private follow-on — needs three more pieces in place:

1. **`private_funding_events` table is still empty.** Until Dealroom/Crunchbase matching is wired up, there is no right-hand-side variable to model.
2. **Dealroom matching for the 1,407 `company` rows.** The 483 unknowns can be tackled in the same pass.
3. **Decide if IPCEI partners belong in the same analysis as EIC startups.** IPCEI direct partners are overwhelmingly large corporates (Infineon, BASF, Bosch); they answer a different "strategic anchor signal" question than EIC Accelerator's "VC-stage signal" question. Stratify rather than pool.

## Day 5 (2026-05-21): Innovation Fund load

**Goal**: load EU Innovation Fund awarded projects (2020–2024) — 20 sub-call tracks, ~246 grant-signed projects — as `public_funding_events` with `source='innovation_fund_<call>'`.

### Data sourcing

Attempted F&T Portal API first; the `INNOVFUND` programme filter returned incorrect results. Switched to direct scraping of `climate.ec.europa.eu/eu-action/eu-funding-climate-action/innovation-fund/innovation-fund-projects_en`, which has a full table of all awarded projects with links to individual CINEA project fiche PDFs.

Parsed the HTML table into `data/raw/innovation_fund/projects_index.json` (246 grant-signed projects; IF25 excluded — all still in "invited to grant agreement preparation" status). Downloaded 239 fiche PDFs to `data/raw/innovation_fund/fiches/` (7 projects have no published fiche).

### PDF parsing

All IF fiches use a two-column layout: project summary on left, metadata fields (COORDINATOR, LOCATION, AMOUNT OF INNOVATION FUND GRANT, etc.) on right. `pdfplumber.extract_text()` on the full page interleaves both columns, producing corrupt coordinator names (e.g. "The ELYgator 200 megawatt (MW) Air Liquide Industrie BV"). Fixed by cropping to the right half of each page: `page.crop((width/2, 0, width, height))`. Also fixed amount field matching to handle both "AMOUNT OF INNOVATION FUND GRANT" (2020–2022 format) and "AMOUNT OF THE INNOVATION FUND GRANT" (2021+ format). One fiche (CapturEste, CINEA ID 101191951) returns HTML from ec.europa.eu — loaded using alternate ID 101190951.

**Outcome**: 239/246 fiches parsed; 7 coordinator/amount fields remain NULL (projects with no published fiche).

### DB load

- `extract_innovation_fund.py --load-db`: 246 events inserted, idempotent on `(source, call_id)`.
- Match results: 17 events matched to existing companies (of which 8 are distinct cross-instrument winners; the other 9 are within-IF repeat winners — same company across multiple sub-calls, e.g. IBERDROLA × 3 grants); 229 new `innovation_fund` inserts.
- Same `subprocess.run(['curl', ...])` SSL workaround as EIB extractor.
- `sector_tags_raw="Energy, {category}, {sector}"` at insert time (e.g. `"Energy, Energy-intensive industries, Cement & lime"`) — leading `'Energy'` tag triggers the classifier's `CLEANTECH_TAGS` check; trailing tags enable sub-sector SQL queries. *(Upgraded post-sign-off; initial implementation used `'Energy'` alone — see post-sign-off cleanup section below.)*
- Added `IF_SOURCE_SECTOR` dict to `classify.py` (all 20 IF sources → cleantech) as a secondary fallback for any IF company whose `sector_tags_raw` is blank (the 7 no-fiche rows). *(Now imported from `extract_innovation_fund.py` rather than duplicated — see post-sign-off cleanup section below.)*

### Results

| Metric | Value |
|---|---|
| Events inserted | 246 |
| Distinct beneficiaries | 237 |
| Matched to prior company | 8 distinct (6 EIC, 1 IPCEI, 1 EIB) |
| New inserts | 229 |
| NULL grant_amount_eur | 7 (no published fiche) |
| Debt pollution | 0 |
| Unclassified after classify.py | 0 |
| Total companies in DB | 2,848 |
| Total events in DB | 4,559 |

Sector: 1,085 life_sciences / 942 cleantech / 498 deeptech_hardware / 150 space / 136 digital / 37 other. Notable multi-instrument winners: AURA AERO (EIC Accelerator + lsp_2023), REVERION (EIC Accelerator + mfg_2023), BATTOLYSER (EIB + mfg_2023), ECOP TECHNOLOGIES (EIC Accelerator + mfg_2024), KITEMILL (EIC Accelerator + ssp_2020).

### Post-sign-off cleanup (same day)

After sign-off I surfaced six methodological concerns and the user asked which deserve fixing now vs. documenting. Two were fixable without scope creep, so I did them:

1. **`sector_tags_raw` upgraded from placeholder `'Energy'` to `"Energy, {category}, {sector}"`** — the climate.ec.europa.eu sector field (Hydrogen, Cement & lime, Refineries, etc.) was already in `projects_index.json` but was being discarded at insert time. Now it's stored alongside `'Energy'` so the classifier's `CLEANTECH_TAGS` match still fires AND sub-sector queries are possible from SQL. Sanity check: hydrogen €1.6bn / 30 events; cement €3.1bn / 24 events; energy storage €1.8bn / 39 events; steel €776M / 9 events. Cleanly reloaded (delete-then-reinsert IF events, no schema change). Total companies / sector distribution unchanged.

2. **`IF_SOURCE_SECTOR` deduplicated** — the dict mapping the 20 IF source IDs to `'cleantech'` was independently defined in both `extract_innovation_fund.py` and `classify.py`. Refactored so `classify.py` imports from `extract_innovation_fund.py` (which derives it from `CALL_TO_SOURCE`, the actual source of truth). Adding a new IF sub-call now requires updating one dict instead of two.

3. **Housekeeping** — removed empty per-call sub-directories under `data/raw/innovation_fund/` (everything ended up in `fiches/`); kept the CINEA reference PDFs (pre-selection lists, statistics, annexes) in `lsp_2020/`, `lsp_2021/`, `ssp_2020/` as data lineage; deleted leftover `/tmp/batch_download_fiches.py`.

Four caveats remain documented but unfixed — they're either inherent (coordinator-only capture, country=HQ-not-project-location, H2 Bank ceilings vs. disbursements) or pending external action (7 NULL-fiche projects to be backfilled when CINEA publishes their fiches, expected ~Nov 2026).

## Day 6 (2026-05-21): Chips JU / KDT JU load

**Goal**: load Chips JU / KDT JU awarded projects (call years 2020–2023, Option A — coordinator only) as `public_funding_events` with `source='chips_ju_kdt_<year>'`. Expected 30–80 events (Option A); landed at 35.

### Data sourcing

Step 0 discovery found that the chips-ju.europa.eu projects page is a Dynamics 365 / PowerApps portal that loads data via JavaScript. Inspecting the page source revealed an unauthenticated OData REST endpoint at `/_api/shv_webprojectses` — no PDF parsing, no curl SSL workaround needed beyond the existing pattern for `subprocess.run(['curl', ...])`. The endpoint returns 129 total projects across two `shv_jueratype` values: ECSEL (94 projects, pre-2021 — out of scope) and KDT (35 projects, 2020–2023 calls — in scope).

The Chips JU's own R&D&I calls under the Chips Act mandate (post-2023) are **not yet in the portal**. The portal's calls page mentions "Chips JU 2023 Calls" as open-for-applications but no awarded projects are published. Per the sprint plan these are not in scope; the loader will pick them up on idempotent re-run when published.

Cached raw response to `data/raw/chips_ju/chips_ju_projects.json` (~70KB).

### Parsing

No PDF or HTML parsing — clean JSON from the OData API. Per-project fields used: `shv_name` (acronym), `shv_titlecontent` (title), `shv_institution` (coordinator name), `shv_countries` (full participating-countries list, formatted "DE-Germany; FR-France; …"), `shv_totalinvestment` (total JU public funding in EUR), `shv_year` (call year), `shv_startdate`, `shv_category` (portal impact area: Digital Industry, Digital Society, etc.), `shv_description`, `shv_participatingorganization` (partner count).

**Amount caveat**: `shv_totalinvestment` is the **total JU public funding** — EU (Horizon Europe) + national member-state contributions to the JU combined. The EU-only share is roughly 50% but is not published per project. This is comparable to IPCEI state-aid totals (also combined cross-jurisdiction). Documented in methodology.md Chips JU section caveat #3.

**Coordinator country derivation**: the API does NOT expose the coordinator country directly — only the full list of participating consortium countries. Derived from the institution name via a 3-tier heuristic in `derive_coordinator_country()`:
1. Explicit country mention in name ("GERMANY", "AUSTRIA", "NEDERLAND", "FRANCE", etc. — case-insensitive)
2. Language-specific institution patterns (POLYTECHNEIO → GR, SCUOLA SUPERIORE/UNIVERSIT[ÀA]/CONSORZIO → IT, COMMISSARIAT/UNIVERSITE/CNRS → FR, SINTEF → NO, etc.)
3. Hardcoded org overrides for multi-country corporates (ASML→NL, INFINEON TECHNOLOGIES AG→DE, AVL LIST GMBH→AT, X-FAB France→FR, etc.)

Result is sanity-checked against the formatted `shv_countries` list. 100% coverage on the 35 rows (0 NULL country at insert).

### DB load

- `extract_chips_ju.py --load-db`: 35 events inserted, idempotent on `(source, call_id)`. Re-run inserts 0, skips 35 duplicates.
- **Match results**: 13 exact (normalised name + country) + 8 prefix + 1 fuzzy + 13 new inserts.
- **Prefix-match tier added this sprint** — IPCEI MECT/Micro stored shortened names ("ASML", "Infineon", "Bosch", "Lynred") while Chips JU has full legal names ("ASML NETHERLANDS B.V.", "INFINEON TECHNOLOGIES AG"). Fuzzy SequenceMatcher ratio between the two is ~0.6 — well below the 0.92 threshold. The prefix tier requires the existing normalised name to be ≥4 chars and a whole-word prefix of the new name (same country). This is a meaningful entity-resolution improvement: the 8 prefix-match hits (ASML, Infineon DE, Lynred, plus 5 EIC short-name → Chips JU full-name pairs) reduce the dup-row backlog from prior loads.
- `sector_tags_raw="Semiconductors, {portal_category}"` (e.g. `"Semiconductors, Digital Industry"`). `"Semiconductors"` added to `DEEPTECH_TAGS` in `classify.py` so the tag-match path resolves to `deeptech_hardware` directly; `CHIPS_JU_SOURCE_SECTOR` (derived from `CALL_TO_SOURCE` in the extractor) imported by `classify.py` as the source-sector fallback — same single-source-of-truth pattern as `IF_SOURCE_SECTOR` after Sprint 4 cleanup.

### Results

| Metric | Value |
|---|---|
| Events inserted | 35 |
| Distinct beneficiaries (companies) | 25 |
| Matched to existing | 12 (across all instruments) |
| of which IPCEI matches | 4 (ASML, Infineon, Lynred, IMEC) |
| New inserts | 13 |
| NULL grant_amount_eur | 0 |
| NULL country (Chips JU companies) | 0 |
| Debt pollution | 0 |
| Unclassified after classify.py | 0 |
| Total companies in DB | 2,861 |
| Total events in DB | 4,594 |

Per-call grant sums:
- `chips_ju_kdt_2020`: 2 projects / €138.5M (transition: ASML's ID2PPAC + SIOUX's IMOCO4.E)
- `chips_ju_kdt_2021`: 13 projects / €462.6M — matches published ~€455M JU budget within 2%
- `chips_ju_kdt_2022`: 16 projects / €609.4M — matches published ~€617M JU budget within 2%
- `chips_ju_kdt_2023`: **4 projects / €38.2M — INCOMPLETE** (expected ~€240M / ~25 projects; portal still being populated as of 2026-05-21, SMARTY added Oct 2025). Re-run extractor when more projects are published.

Sector distribution: 1,085 life_sciences / 942 cleantech / 511 deeptech_hardware (+13) / 150 space / 136 digital / 37 other. The 13 new Chips JU coordinator inserts are all deeptech_hardware; the 12 matched companies retain their primary EIC-derived sector (e.g. CEA stays `space`, IMEC stays `life_sciences`) per the methodology's overlap priority order — this is by design.

Coordinator country distribution: DE=7, FR=6, NL=6, AT=5, IT=3, GR=2, SE=2, BE=1, CZ=1, NO=1, RO=1.

Multi-instrument winners (12 distinct companies):
- **IPCEI overlap (4)**: ASML, Infineon (DE), Lynred, INTERUNIVERSITAIR MICRO-ELECTRONICA CENTRUM (IMEC)
- **EIC overlap (8)**: AVL LIST GMBH (EIC Pathfinder), CEA, CNIT, Infineon Austria, LULEA TEKNISKA UNIVERSITET, SCUOLA SUPERIORE SANT'ANNA, SINTEF AS, plus IMEC (already counted)

### Open caveats

Same 4 methodological caveats as Innovation Fund Sprint 4 under Option A, documented in methodology.md Chips JU section:
1. **Coordinator-only capture** — undercounts the 5–40 partners per KDT consortium
2. **Country = coordinator HQ** — not project location
3. **`grant_amount_eur` is total JU public funding** (EU + national), not EU-only
4. **KDT-2023 partial** — only 4 of ~25 expected projects; re-run when portal updates

## Day 7 (2026-05-21): EDF load + defense sector label

**Goal**: load European Defence Fund awarded projects (2021–2024, coordinator only) as `public_funding_events` with `source='edf_{ra,da}_{year}'`; introduce a `defense` sector label as the 7th taxonomy bucket.

### Data sourcing

EDF published factsheet PDFs live at `defence-industry-space.ec.europa.eu/funding-tenders/...`. No machine-readable export exists — each project has its own PDF. Index pages per call year were scraped to collect factsheet URLs across EDF 2021–2024. Total of 284 factsheet URLs identified (EDF 2025 projects not yet published).

EC server rate-limits the domain: 141/284 requests returned HTML "Sorry - 689127" error pages instead of PDFs. Those 141 factsheets are marked as failed; the extractor is idempotent and will pick them up on `python3 extract_edf.py --refresh` after server cooldown. **143 factsheets parsed and loaded** in this session (~50% coverage).

### PDF parsing

EDF factsheets are structured A4 PDFs (not scanned). Used `pdfplumber.extract_words()` with x-position thresholds (left column: x < 65% page width; right column: x > 65%) to resolve three layout challenges:

1. **Token fusion** — `pdfplumber` fuses "SAS(Coordinator)" or "FRANCE(Coordinator)" into single tokens. Fixed by checking `"(coordinator)" in word["text"].lower()` and splitting out the prefix if the marker appears inside the token.
2. **Multi-line company names** — long names (Greek, Polish, Spanish corporates) span 2–3 lines above the "(Coordinator)" marker. Fixed by collecting all left-column words within a 45px vertical window above the marker.
3. **Decorative headers** — 2021 PDFs render "EUROPEAN / DEFENCE / FUND / UNION / SELECTED / PROJECTS" as a word-cloud header before the project acronym. Fixed by skipping any line whose words are all in a `_EDF_SKIP_WORDS` set or are ≤4-character all-caps fragments.

Amount field: `ESTIMATED TOTALCOST:` (no space between TOTAL and COST in some years) — regex updated to `ESTIMATED\s+TOTAL\s*COST`.

### RA/DA strand determination

EDF 2022+ call titles explicitly say "Research actions" or "Development actions". EDF 2021 uses capability-area titles (e.g. "EDF-2021-OPEN-C4ISR-SENS"). For EDF 2021, RA/DA is inferred from activity-type text in the factsheet: "Generating knowledge" or "Integrating knowledge" → RA; otherwise → DA. Result: 30 RA / 29 DA split for EDF 2021 (cross-checked against published call statistics).

### Sector taxonomy revision

Added `defense` as the 7th sector label (priority: Space > Life Sciences > **Defense** > Cleantech > Deeptech > Digital > Other). All EDF sources map to `defense` via `EDF_SOURCE_SECTOR` imported by `classify.py`. Retroactive re-run flipped 7 existing companies whose sector was previously `other` or `deeptech_hardware` to `defense` — these were dual-use defense primes (e.g. Airbus DS, Thales variants, MBDA entities) loaded in earlier sprints via EIC/Chips JU that pre-dated the `defense` label.

### DB load

- `extract_edf.py --load-db`: 143 events inserted, idempotent on `(source, call_id)`.
- Match results: 54 matched to existing companies, 89 new inserts.
- `CYBERNETICA AS` (EE) country manually patched post-load — derived as NULL because the name gives no country signal and it wasn't in `_KNOWN_EDF_ORG_COUNTRIES`.

### Results

| Metric | Value |
|---|---|
| Factsheets attempted | 285 |
| Initial load (no sleep)              | 143 events |
| Refresh-with-sleep load (`--sleep=3`) | **+133 events = 276 total** |
| Remaining failures | 8 (4 EDF 2025 still rate-limited, 4 real-PDF parse failures) |
| Coverage rate | 97% (276/285) |
| Matched to existing companies | 206 (151 exact + 3 exact_name_only + 40 prefix + 12 fuzzy) |
| New inserts | 70 |
| EU contribution by year | RA 2021 €335M / DA 2021 €827M; RA 2022 €312M / DA 2022 €495M; RA 2023 €286M / DA 2023 €707M; RA 2024 €379M / DA 2024 €607M; RA 2025 €355M / DA 2025 €662M |
| Total EU contribution loaded | ~€4.96B |
| Sector flips (retroactive defense label) | 7 |
| Total companies in DB | 3,020 |
| Total events in DB | 4,870 |
| Debt pollution | 0 |
| Unclassified after classify.py | 0 |

### Sleep-pacing fix (same day, post initial load)

The initial 143-event load hit ~50% coverage because the EC server rate-limits the `defence-industry-space.ec.europa.eu` domain and returns HTML "Sorry" pages (~40KB) that the cache check (size > 5KB) accepted as valid PDFs. Added `_is_real_pdf(path)` to `fetch_pdf` (checks first 5 bytes for `%PDF-` magic), plus a `--sleep=N` CLI flag to pace requests. Re-running `extract_edf.py --load-db --sleep=3` recovered 133 of 141 missing factsheets — final coverage 97%. The 4 EDF 2025 stragglers will pick up on a later `--refresh` re-run; the 4 real-PDF parse failures (one each in 2021/2022/2023) are likely scanned-image factsheets that would need OCR.

### Open items

1. **8 remaining failures**: 4 EDF 2025 URLs still rate-limited (idempotent `--refresh --sleep=N` will pick them up); 4 real-PDF parse failures need OCR or manual extraction.
2. **`grant_amount_eur` = EU contribution ceiling** from the factsheet's "MAXIMUM EU CONTRIBUTION" field (page 1) — not the Estimated Total Cost. DA projects can have up to 20% national co-funding on top.
3. **Coordinator country derivation**: 10 rows landed with NULL country (mostly EDF 2025 defense primes not yet in `_KNOWN_EDF_ORG_COUNTRIES`); needs a Dealroom enrichment pass.

### Chips JU portal recheck (same day)

Re-queried the OData endpoint without the KDT-era filter. Portal still exposes only two `shv_jueratype` values (KDT=920810000, ECSEL=920810001). KDT-2023 still at 4 projects (SMARTY, OPEVA, Resin Green, FEDERATE — same set as Sprint 5). **No Chips JU era / Chips Act mandate projects have been published yet** as of 2026-05-21. Idempotent re-run of `extract_chips_ju.py` would insert 0 events; no action needed. Recheck quarterly.

### Cross-extractor cleanup (same day)

Standardised `match_method` writes across all five extractors. Previously each loader wrote the source name (`edf`, `eib`, `chips_ju`, `innovation_fund`, `ipcei_pdf`) into `companies.match_method` for new inserts, violating the schema's intended enum (`exact`, `fuzzy`, `manual`, `none`). All such non-standard values were renamed to `none` in both code and existing DB rows (2,950 rows updated). The per-event matching method (exact/exact_name_only/prefix/fuzzy) is still retained in the `*_match_summary.csv` files. Schema comment on `match_method` updated to clarify it is INSERT-time only.

## Day 8 (2026-05-21): methodological-debt sprint (B5/B6/B7/C8/C9)

Five items from the post-Sprint-6 audit were knocked out in one pass. All schema changes were applied with `ALTER TABLE` on the live DB and mirrored into `schema.sql` (which now rebuilds cleanly with 20+21+12+7 column tables and 10 indexes).

### B5 — `coordinator_only INTEGER` flag on `public_funding_events`

Surfaces the consortium-undercount that's invisible at the row level. Backfilled across all 4,870 events: `1` for IF / Chips JU / EDF (557 events from coordinator-only sources, 11.4% of the dataset); `0` for EIC / IPCEI / EIB (4,313 events with all-partner or single-borrower capture). All 6 loaders updated to set the flag on new inserts; the live `sanity_check.py` confirms NULL coordinator_only count = 0.

### B6 — `grant_amount_basis TEXT` column to disambiguate amount semantics

This was the biggest silent trap: `grant_amount_eur` meant six different things across sources. The new column makes the basis explicit at row level:

| basis label              | semantic                                              | events | total (EUR) |
|--------------------------|-------------------------------------------------------|--------|-------------|
| `eic_eu_grant`           | EU grant to coordinator (EIC)                         | 3,843  | €3.591B     |
| `ipcei_state_aid`        | Commission-approved state aid (incl. national)        | 317    | €27.282B (101 NULL — redacted) |
| `eib_debt_commitment`    | Committed debt ceiling, not grant                     | 153    | (debt: €3.59B) |
| `if_eu_grant`            | Actual Innovation Fund EU grant                       | 246    | €13.497B    |
| `chips_ju_total_public`  | Total JU public funding (EU + national, ~50% each)    | 35     | €1.249B     |
| `edf_eu_ceiling`         | EU contribution ceiling (DA capped at 80% co-fund)    | 276    | €4.965B     |

These totals **cannot be summed** to a meaningful overall figure. `sanity_check.py` now emits a stratified-totals report and an explicit "DO NOT sum across rows" caption. Schema comment on `grant_amount_eur` warns to always filter by basis. All 6 loaders updated. New index `idx_pfe_basis` added for filter performance.

### B7 — `sector_inferred_updated_at` + `classify_audit` table

New columns `sector_inferred_updated_at` and `entity_type_updated_at` on `companies`; new append-only `classify_audit` table (`id`, `company_id`, `changed_at`, `field`, `old_value`, `new_value`, `run_id`). `classify.py` now:
- Reads current `sector_inferred` / `entity_type` before computing new values
- Logs every flip (including NULL → value first-time assignments) to `classify_audit` with a per-run `run_id` (UTC timestamp)
- Only stamps the `_updated_at` columns when a value actually changes
- Prints a per-run audit summary at the end: top sector/entity transitions

Existing 3,020 companies were backfilled to `sector_inferred_updated_at = now()` as a migration baseline; a single migration-baseline row was logged in `classify_audit`. Future re-classifies on top of a sector-taxonomy revision (like the Sprint 6 defense addition would have been) will produce visible per-row trails.

### C8 — Lenient parser added to `load_eic.py`

Built a fallback `_parse_lenient()` that runs only when the strict `csv.reader` mis-aligns a row. The fallback splits on the literal `";"` field separator and strips outer quotes — internal unescaped quotes get absorbed into whichever text field they live in (almost always `project_summary`). The lenient parser now correctly recovers 156 rows that would otherwise be skipped.

**Verified the recovery is a no-op against the current DB**: after locating the CSV on Desktop and restoring it to `data/raw/eic_datahub_export_20260520.csv`, an incremental dedup (by `pic + project_number + role`) found **0 truly missing rows**. The DB already contains all 3,711 distinct EIC events plus 132 duplicate-role variants — total 3,843 events. The Day 1 "157 skipped" figure was either an early estimate or was resolved by some intermediate re-load before audit memory captured the state. The lenient parser remains valuable as forward insurance: any future `load_eic.py` rebuild on the same or updated CSV will no longer silently drop malformed rows.

### C9 — `sanity_check.py` hardened

Added a "DQ: cross-cutting integrity" section at the end of the file with seven new queries:
1. Per-source basis / coordinator_only / NULL coverage (one row per source × basis × coordinator_only combo)
2. **Hard checks** — `coordinator_only`, `grant_amount_basis`, and unknown-basis counts must all be 0 (acts as a CI gate for new loaders)
3. **Stratified totals** — emits per-basis sums with the "DO NOT sum across rows" caption
4. Coordinator-only coverage banner (currently 11.4%)
5. classify_audit summary (counts of sector/entity flips since baseline)
6. Last 50 flips with prior values (visible trail of taxonomy revisions)
7. Timestamp hygiene check (NULL `sector_inferred_updated_at` count, stale-stamp count)

After Sprint 7 (EIT KICs) the integrity checks #2 and #7 will surface any new loader that forgot to set the flags.

## Day 9 (2026-05-21): EIT KIC load (Sprint 7)

**Goal**: load EIT Digital (rebranded 28digital.eu in 2025) and EIT Manufacturing company-facing support and investment events.

### Data sourcing

No live web-scraping — all company data compiled from WebFetch calls into hardcoded Python lists in `extract_eit.py` (10 lists, 99 total entries). Approach chosen because EIT pages have inconsistent HTML structures and N is small enough to curate manually. EIT Manufacturing website is a frozen snapshot (ASBL ceased operations 10 April 2026).

- **EIT Digital**: Champions cohorts 2021–2025 (3+6+11+13+8 = 41 events) + VAP 2022 (10 events) = **51 events**
- **EIT Manufacturing**: Investment portfolio (21 events) + BoostUp 2021 (4) + BoostUp 2023 (17) + BoostUp 2024 (6) = **48 events**
- **BoostUp 2022 excluded**: 8 winners at €20K each, but names not published on website

### DB load

- `extract_eit.py --load-db`: 99 events inserted on first run.
- **Match results** (per `data/processed/eit_match_summary.csv`):
  - `exact`: 9 — of which 3 were within-EIT dedup (ChainTraced, Litech, DREV appeared in both investments and BoostUp)
  - `reverse_prefix`: 0 (tier added post-load as a preventive fix)
  - `none` (new inserts): 90 → after 3 post-load SQL merges (Plexigrid/Ekkono/Orange Quantum) → **87 net new companies**
- **3 duplicate rows found and merged**: `Plexigrid` (ES) → `PLEXIGRID SOCIEDAD LIMITADA`, `Ekkono` (SE) → `EKKONO SOLUTIONS AB`, `Orange Quantum Systems` (NL) → `ORANGE QUANTUM SYSTEMS OPERATIONAL BV`. Root cause: forward-prefix tier checks `new.startswith(existing + " ")`, which misses cases where the EIT short name is *shorter* than the existing EIC legal name. **Fix**: reverse-prefix tier (`ex_norm.startswith(norm + " ")`, len≥5) added to `match_companies()` in `extract_eit.py` so idempotent re-runs handle this correctly.
- **Empty-country idempotency bug found during sign-off audit**: re-running `extract_eit.py --load-db` created 11 new duplicate company rows for EIT Manufacturing entries with no country in source data (CERPRO, DigiClean Solutions, Phine.Tech, Prenomics, GridMetrics, incon.ai, Convergent Information Technologies, QualiSense, Sleeve, Mavarick, PHEE). Root cause: tier 1 had `if country and exact_key in existing` — the `country and` guard skipped the exact-match path when country was empty. Fixed by removing the guard and tagging the empty-country case as `match_method="exact_no_country"` (medium confidence). 11 dup rows merged via SQL. Re-verified idempotency: 85 exact + 11 exact_no_country + 3 reverse_prefix = 99 matches, 0 new inserts.

### Results

| Metric | Value |
|---|---|
| EIT Digital events | 51 |
| EIT Manufacturing events | 48 |
| Total EIT KIC events | 99 |
| Distinct EIT KIC companies | 96 |
| Net new company inserts | 87 |
| Matched to prior company | 9 (6 EIC cross-source; 3 within-EIT dedup) |
| NULL grant_amount_eur (support + equity) | 75 |
| BoostUp cash-prize events | 24 |
| classify.py first-time sector assignments | 87 |
| Stale sector_inferred_updated_at | 0 |
| Total companies in DB | 3,107 |
| Total events in DB | 4,969 |

### EIT Digital × EIC overlap

6 of 51 EIT Digital companies also appear in EIC: **11.8%**. Sprint-plan gate was ≥20%; shortfall documented below the gate. The overlap companies are: Connecting Food (FR), Multiverse Computing (ES), GrayMatters Health (IL), Ekkono Solutions AB (SE, via EIC Accelerator), Plexigrid (ES, via EIC Accelerator), Orange Quantum Systems (NL, via EIC Accelerator + Pathfinder).

The below-20% overlap is structurally expected: EIT Digital Champions cohorts are 3–13 companies per year from a broad tech universe; EIC Accelerator is deep-tech-biased. The 10% debug-matching threshold was not triggered (actual 11.8% > 10%), so no name-normalisation investigation needed.

### Sector distribution of new EIT companies

| Sector | Companies |
|---|---|
| `digital` | 48 |
| `deeptech_hardware` | 32 |
| `life_sciences` | 9 |
| `cleantech` | 6 |
| `defense` | 1 |

EIT Digital sources → `digital` fallback; EIT Manufacturing sources → `deeptech_hardware` fallback. keyword classifier overrode the source fallback for 15 companies (life_sciences + cleantech).

### Files added

- `files/extract_eit.py` — EIT KIC extractor (hardcoded data, 10 sources)
- `files/data/processed/eit_projects.csv` — flat event list
- `files/data/processed/eit_match_summary.csv` — per-row match audit

### Final DB state after Day 8

| Metric | Value |
|---|---|
| Total companies | 3,020 |
| Total events | 4,870 |
| coordinator_only=1 events | 557 (11.4%) |
| Schema tables | 4 (companies, public_funding_events, private_funding_events, classify_audit) |
| classify_audit rows | 1 (B7 migration baseline) |
| Outstanding | C8 recovery awaiting user-supplied EIC CSV |
