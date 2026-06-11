# Sprint 18 — Channel Coverage: Equity First

> **EXECUTION STATUS (2026-06-11, overnight):**
> - ✅ **Phase 1 DONE** — 5,694 events / ~€3.9B loaded (`scripts/load_ju_batch.py`); 76 cross-tagged projects correctly skipped; totals match probes ±1%.
> - ✅ **Phase 2 DONE** — EIC Fund: 233 events, 84% matched to existing EIC companies (`scripts/extract_eic_fund.py`).
> - ✅ **Phase 4b DONE** — ES RRF ⊂ BDNS verified: 3,518/13,244 BDNS rows carry PRTR markers. No extractor needed.
> - 🟡 **Phase 4a DATA READY, LOAD PARKED** — OpenPNRR CSVs in `data/raw/rrf_it/` (117MB, 298k projects). Company-attuatore slice: 28,618 projects / €12.8B / 686 companies, **dominated by SOE utilities** (E-Distribuzione €3.5B, GSE €2.2B, Trenitalia, SNAM); genuine tail exists (STMicroelectronics €292M). **USER DECISION NEEDED: measure whitelist + SOE in/out policy before load.**
> - ⛔ **Phase 3a Vinnova** — blocked on API key (user registering).
> - ⏳ **Open**: 3b Business Finland (Qlik), 5 LIFE (Qlik), 6 EIB-corporate decision + InvestEU, 7 EBRD devtools discovery.
> - Hardening done: classify/groups/sanity green, site rebuilt, methodology + gap analysis updated.

*Companion to [docs/gap_analysis_2026.md](../docs/gap_analysis_2026.md) Section 6 (channel-completeness audit). Every source below was **probed live on 2026-06-10/11**; record counts, endpoints, and formats are verified, not estimated. Goal: fix the channel verdict — "grant channel near-complete, equity channel effectively absent (25 events / €7M in 288k)" — and finish the Horizon partnership layer in one sprint.*

---

## Outcome targets

| # | Target | Before | After (expected) |
|---|---|---|---|
| 1 | Equity channel usable | 25 events / €7M | ~300 EIC Fund portfolio companies flagged + basis labels that make "no public ticket size disclosed" queryable |
| 2 | Horizon partnerships complete | 4 of 11 JUs org-level | 11 of 11 (+ ~5,800 events / ~€4.0B from the **local** CORDIS dump — zero new downloads) |
| 3 | Chips-Act-era gap closed | "not published in portal" (methodology, 2026-05-25) | 19 projects / 653 org-events / **€1,021M** — they ARE in CORDIS under the mixed-case prefix `HORIZON-JU-Chips-` |
| 4 | Nordic NDB carry-overs landed | Vinnova/BF SATR-only | Vinnova + Business Finland direct, SATR-deduped |
| 5 | RRF channel assessed → loaded for IT | "untractable" (old Tier 3) | IT company-implemented projects loaded; ES verified as already-covered via BDNS |
| 6 | EIB corporate lending scope decision | never decided | decided + (if in) loaded via verified JSON API |

---

## Pre-flight (do these first, ~15 min)

1. **Backup**: `sqlite3 db.sqlite "PRAGMA wal_checkpoint(TRUNCATE);" && sqlite3 db.sqlite ".backup /tmp/db.pre-sprint18.bak"` (iCloud backup from 2026-06-10 already exists).
2. **USER ACTION — Vinnova API key**: register at the Vinnova API portal (Azure APIM developer portal). Endpoint verified live: `https://api.vinnova.se/gdp_vinnova/finansieradeaktiviteter` returns 401 "missing subscription key" — the API exists and is documented (GDP standard, docs on GitHub `Gemensamma-data-projektet-GDP/Dokumentation`); only the free key is missing. **Without the key, Phase 3a is blocked — request it first thing.**
3. Every new extractor: import `lib/matching.py` (no local normalize/matcher copies), and register the new source in **all three maps** — `analysis/views.sql` source_family CASE, `gen_coverage_indicator.py` DIRECT_NDB_PREFIXES (national only), `classify.py` source-sector import. Finish with `python3 scripts/build_site_data.py` (prebuild gate enforces it anyway).

---

## Phase 1 — CORDIS local batch (~1 day, zero network, highest certainty)

All from `data/raw/cordis/` already on disk. Probed counts (2021+ start dates, org-level):

| Family | Topic prefix(es) — exact, case-sensitive | Projects | Org-events | EU contribution | Sector default | Source stem |
|---|---|---:|---:|---:|---|---|
| Clean Aviation JU | `HORIZON-JU-CLEAN-AVIATION` | 40 | 829 | €1,177M | cleantech | `clean_aviation` |
| SNS JU (6G) — **not in any prior gap list** | `HORIZON-JU-SNS` | 79 | 1,231 | €499M | digital | `sns_ju` |
| **Chips JU, Chips-Act era** | `HORIZON-JU-Chips` (mixed case!) + `HORIZON-JU-CHIPS` (3 projects, €33M) | 19+3 | 653+45 | €1,021M+€33M | deeptech_hardware | `chips_ju_chips` (or fold into `chips_ju_kdt_` naming — decide at impl.) |
| EuroHPC JU, new-prefix calls | `HORIZON-JU-EUROHPC` | 16 | 111 | €184M | deeptech_hardware | `eurohpc` (existing stem) |
| SESAR 3 JU | `HORIZON-SESAR` | 68 | 812 | €229M | digital (ATM) | `sesar_ju` |
| Europe's Rail JU | `HORIZON-ER-JU` | 25 | 811 | €287M | other (rail) | `europes_rail` |
| EUSPA (EU space) | `HORIZON-EUSPA` | 49 | 440 | €107M | space | `euspa` |
| EDCTP3 / Global Health JU | `HORIZON-JU-GH-EDCTP3` | 107 | 889 | €435M | life_sciences | `gh_edctp3` |

**Total: ~5,800 org-events / ~€4.0B.**

Implementation = the Sprint-18-reuses-Sprint-12 pattern:
- Add the 8 cluster configs to `CLUSTERS` in `extract_cordis_pillar_ii.py` (multi-prefix `prefixes` support already added 2026-06-10).
- **Case-sensitivity fix**: topic matching must handle `HORIZON-JU-Chips` — either add the literal mixed-case prefix or normalize topics to upper before prefix tests (safer: add both literals; upper-normalization would change existing family selection semantics).
- **Extend `JU_EXCLUDE_PREFIXES`** with all 8 new prefixes — otherwise the next Pillar II `--cluster all` re-run double-loads any project cross-tagged with a CL topic.
- Chips-Act-era and EuroHPC-new rows must run through the same delete-by-acronym/project_number replacement logic as `reload_ju_org_level.py` if any coordinator rows already exist (check first: `SELECT COUNT(*) FROM public_funding_events WHERE project_number IN (...)`).
- **EDCTP3 caveat**: EU-Africa clinical trials partnership — expect heavy out-of-scope trimming by `canonicalise_country` (African partner orgs). Loaded count will be well below 889; that is correct behavior, log the trim.
- After load: classify → company groups → `build_site_data.py`.

Acceptance: per-family € totals within ±5% of probe table above (pre-scope-trim); zero unclassified; Europe-scope gates green.

---

## Phase 2 — EIC Fund portfolio (equity flag, ~0.5-1 day)

**Probed live**: `https://eic.ec.europa.eu/eic-fund/eic-fund-invested-companies_en?page=0..14` — server-rendered Drupal/ECL, **no JS needed**, 20 cards/page × 15 pages ≈ **300 companies**. Per card (verified against page 3):
- name + detail URL: `<div class="ecl-content-block__title"><a href="/eic-fund/eic-fund-portfolio/<slug>_en">NAME</a>`
- `<dl>` terms: **Country**, **Sector** (e.g. "Germany" / "Advanced Manufacturing & Advanced Materials")
- one-line description paragraph.
- **No investment amounts anywhere** (checked a detail page: no €/EUR/round data). The EIC Fund does not publish per-company ticket sizes.

Load design:
- `source='eic_fund'`, `role='portfolio_company'`, `equity_amount_eur=NULL`, `grant_amount_basis='eic_fund_equity_unpublished'` — the basis label is the queryable marker for "equity position exists, size undisclosed" (precedent: `eit_kic_equity`).
- Match into existing companies — most portfolio companies are Accelerator winners already in the DB (expect a high exact-match rate; the blended-finance grant component is already loaded as their `eic_accelerator` event).
- Out-of-scope entries exist (Israel seen on page 3) — `canonicalise_country` trims them; log.
- Sector: map the portfolio's own sector labels (collect the full label set during scrape) into the 7-label taxonomy; description text as keyword fallback.
- Map their sector labels in the extractor, not classify.py (single-source-of-truth pattern: export `EIC_FUND_SOURCE_SECTOR`).

This is the single highest-leverage equity fix: the corpus can then say "X of the EIC Accelerator cohort carry an EIC Fund equity position" even without ticket sizes. **Note for methodology**: amounts stay invisible → the equity limitation text gets *narrower*, not removed.

Acceptance: ≥250 companies loaded post-scope-trim; ≥60% matched to existing EIC companies (sanity: portfolio ⊂ mostly Accelerator); limitations text updated.

---

## Phase 3 — Nordic NDB carry-overs (1-2 days, SATR gates pre-measured)

### 3a. Vinnova (SE) — blocked on API key (pre-flight #2)
- Endpoint (verified): `https://api.vinnova.se/gdp_vinnova/finansieradeaktiviteter` + key header (`Ocp-Apim-Subscription-Key`, standard Azure APIM). GDP-standard schema: calls / applications / funded-activities; filter `fromDate=2021-01-01`, organisationsnummer present per recipient.
- `scripts/extract_vinnova.py` exists as a scaffold — replace its endpoint-guessing `--probe` with the confirmed URL, keep its load path.
- **HARD RULE — SATR gate**: 514 SATR rows pre-tagged `ndb_distributor='vinnova'`. Run `satr_overlap_audit.py` extended to `vinnova_`; dedup on normalize_name + year±1 before insert (the TAČR/EIS precedent: expect a few hundred collisions, keep net-new only).
- Expected: ~1,000 company grants/yr × 5 yrs minus overlap ≈ 3,000-4,500 net-new.

### 3b. Business Finland (FI) — Qlik Sense
- Verified: `https://tietopankki.businessfinland.fi/anonymous/extensions/fundingawarded/fundingawarded.html` (granted 2010-2026), `.../fundingpaid/` (paid 2010-2025), `.../projectfunding/` (project-level 2016-2026). Monthly refresh on the 15th. Anonymous access, but it's a **Qlik app**: data sits behind the Qlik engine websocket (JSON-RPC), not REST.
- Plan A: Qlik Engine API session → `GetHyperCubeData` on the funding-awarded table (the SUDOP async-pipeline skillset applies). Plan B (half-day fallback): one manual UI export to XLSX committed as `data/raw/business_finland/`, extractor parses the file; monthly refresh stays manual until Plan A.
- **SATR gate**: 1,988 rows pre-tagged `ndb_distributor='business_finland'` — biggest pre-measured collision set; same dedup recipe.
- Expected: ~500-1,000 grants/yr, 2021+ ≈ 2,500-5,000 minus ~2,000 overlap.

---

## Phase 4 — RRF / NextGenerationEU (1-2 days)

### 4a. Italy — load
- **Probed**: official ItaliaDomani "Progetti del PNRR" dataset — bulk **CSV 226MB / JSON 592MB / XLSX 60MB**, every PNRR project keyed by CUP, with amounts and *soggetto attuatore* (implementing entity), ODbL licence, updated ~quarterly (Feb 2026 data live). Plus openpolis **OpenPNRR** curated CSVs + field documentation at `openpnrr.it/opendata/` and `openpnrr.openpolis.io/metadati/`.
- **The filter IS the work**: most implementing entities are municipalities/ministries. Company slice = filter `soggetto attuatore` by entity type (the dataset carries a type field — see OpenPNRR metadati) + measure whitelist (Transizione 5.0 / contratti di sviluppo / innovation-related missions M1C2, M2). Decide the whitelist by inspecting the measure taxonomy before writing the extractor.
- **Dedup**: IT is the largest SATR country (28.5k events) and RRF-funded aid measures ARE in SATR (e.g. Mediocredito/Invitalia-administered). Gate on normalize_name + year±1 against IT SATR rows + `ndb_distributor IN ('invitalia','mediocredito_centrale')`.
- `source='rrf_it_<year>'`, family decision: new `rrf` family in views.sql (it is neither state-aid-register nor NDB — it's the EU recovery instrument administered nationally).

### 4b. Spain — verify, don't build
- Spanish RRF grants flow through *convocatorias* registered in **BDNS — already loaded** (`extract_bdns.py`, €100k floor). Task: verify PRTR-funded calls appear (BDNS records carry a financing/MRR marker — check the `ayudasestado` API response fields); if confirmed, document "ES RRF ⊂ BDNS" in methodology and **close the channel** with one sentence. Only build a separate extractor if the marker shows material missing volume.

---

## Phase 5 — LIFE programme (1 day)

- **Probed**: CINEA public dashboard (launched 2023) covers **1,400+ LIFE projects / >€3.5B** with beneficiary-level data and raw export; same Qlik pattern as Business Finland (one engine-API client serves both). The legacy `webgate.ec.europa.eu/life` search returns 500 on CSV export — use the dashboard, not the legacy site.
- Company-relevant slice: SMEs/companies as coordinating or associated beneficiaries, concentrated in LIFE Clean Energy Transition + circular-economy close-to-market projects. Expect a minority of the 1,400 — likely 300-600 company events.
- `source='life_<year>'`, sector default cleantech, EU-instrument family.

---

## Phase 6 — EIB corporate + InvestEU (decision gate + 1 day)

**DECISION GATE (user)**: EIB *standard* direct corporate R&D/innovation loans (e.g. nine-figure facilities to automotive/pharma R&D programmes) — same public project DB as the venture debt already loaded, same direct-counterparty principle, but large-corporate rather than venture. In or out?
- **Probed**: `https://www.eib.org/page-provider/projects/list?pageNumber=0&itemPerPage=N&pageable=true&la=EN&deId=0` returns clean JSON (verified, 200). Full project list paginable; project detail pages carry sector/amount/status.
- If IN: filter signed projects 2021+, sector ∈ innovation-relevant, borrower = named company (exclude intermediated "loan to bank for SME on-lending" — the Sprint 3 principle). `source='eib_corporate_<year>'`, amounts → `debt_amount_eur`.
- InvestEU operations: the same API serves InvestEU-flagged operations (mandate filter param to discover). Even intermediary-level rows are useful as the documented `eif_lp_backed`-style flag — recall the column already exists on events.

---

## Phase 7 — EBRD (timeboxed 0.5 day discovery, then go/no-go)

- **Probed and NOT confirmed**: the new AEM site (`ebrd.com/home/what-we-do/projects.html`) hides the PSD search backend; guessed endpoints 404; no open-data portal found; web search confirms no public bulk API. ~7,000 projects exist as Project Summary Documents.
- Plan: 30 min with browser devtools on the PSD search page to capture the XHR endpoint. If found → extractor (country ∈ scope ∩ private sector ∩ 2021+, equity+debt split). If not found in the timebox → **park it** with a note in gap_analysis (do not burn the sprint on it; the eastern-tier lift is nice-to-have, not load-bearing).

---

## Hardening (last, ~0.5 day)

1. `audit_dedup.py` sweep + `build_company_groups.py` refresh (new names from 8 CORDIS families + portfolio).
2. `sanity_check.py` — all gates green; watch the orphan gate (the JU replacement pattern creates them — delete only own-sprint orphans, the 678 pre-existing stay until their own diagnosis).
3. Coverage indicator: SE/FI should flip to "richer-A" notes; add `rrf_`, `life_`, `sns_ju_` etc. to the right prefix lists (**three-map rule**, pre-flight #3).
4. `build_site_data.py` → `(cd site && npm run build)` — prebuild gate enforces freshness.
5. Methodology updates: source-coverage table rows for every loaded family; **narrow** the equity limitation (portfolio flagged, ticket sizes still unpublished); strike the Chips-Act-era "not published" caveat; decision-log entry.
6. iCloud backup (replace, after verify — the 2026-06-10 convention).

---

## What stays out (so the sprint doesn't sprawl)

- **Kohesio / structural funds** — Option A decision stands; revisit at 2021-27 data maturity (~2027).
- **eAid de minimis register** — data meaningful ~2027 (watch).
- **NL RVO Playwright / IT RNA 25GB / PL SUDOP remainder / RO REGAS / PT IAPMEI / NCBR / VLAIO / PFR** — real but not channel-defining; they level countries, not channels. Next coverage sprint.
- **Dealroom NDB-investor enrichment** — the real fix for equity *amounts*; separate RHS sprint as planned since Sprint 9.
- **ESA industrial contracts** — no open bulk source exists; documented limitation, not a work item.

## Expected corpus delta (honest ranges)

| Phase | Events | Companies (net-new) | € |
|---|---:|---:|---:|
| 1 CORDIS batch | ~5,500 post-trim | ~2,500-3,500 | ~€3.9B |
| 2 EIC Fund | ~280 | ~50-100 | flag-only |
| 3 Vinnova + BF | ~5,000-9,000 | ~3,000-6,000 | ~€2-4B |
| 4 RRF IT | ~1,000-5,000 (filter-dependent) | ~1,000-4,000 | ~€2-10B |
| 5 LIFE | ~300-600 | ~200-400 | ~€0.5-1B |
| 6 EIB corporate (if IN) | ~100-300 | ~50-150 | ~€5-15B debt |
| **Total** | **~12-20k** | **~7-14k** | **~€13-30B** |
