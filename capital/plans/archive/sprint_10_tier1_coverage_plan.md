# Sprint 10 plan — Tier 1 coverage completion + methodology scope formalisation

**Owner**: Claude Sonnet 4.6, executing against `/Users/asgermollergrimberg/EuroInvTracker/`.

**Status**: Not started. Follows Sprint 9 EDA site (read-only). DB baseline: **3,101 companies / 4,969 events**.

**Purpose**: Close the three remaining Tier 1 data gaps identified in the coverage audit (2026-05-25): the six missing EIT KICs, Eurostars, and the Clean Hydrogen Partnership. Also formalise Tier 2 (acknowledged / lower-signal) and Tier 3 (explicitly out-of-scope) coverage boundaries in `docs/methodology.md`.

---

## TL;DR for a fresh Claude session

Four workstreams. Three add new data; one updates documentation only.

- **A — 6 missing EIT KICs**: Extend `scripts/extract_eit.py` with hardcoded company lists for EIT InnoEnergy, EIT Health, EIT Climate-KIC, EIT Urban Mobility, EIT RawMaterials, and EIT Food. Same 8-tuple pattern as existing EIT Digital + Manufacturing entries. Each KIC needs a discovery step first to establish which public programme lists exist and what years are available within the 2021–2026 window.
- **B — Eurostars**: New `scripts/extract_eurostars.py`. Eurostars-3 is Horizon Europe co-funded (2021+); **all EU SME partners are loaded** (not coordinator-only) because all participants are primary beneficiaries by programme design. Discovery needed to confirm data access method (eurostars-eureka.eu project pages vs. CORDIS API vs. downloadable CSV).
- **C — Clean Hydrogen Partnership (CHP)**: New `scripts/extract_chp.py`. Clean Hydrogen JU succeeded FCH JU in 2021; coordinator-only (Option A) to match our JU convention. Discovery needed to confirm CORDIS API access vs. clean-hydrogen.europa.eu dashboard scraping.
- **D — Methodology updates**: No new data. Update `docs/methodology.md` — Tier 2 section, Tier 3 out-of-scope statement, coverage tables, decision log entry.

**ECSEL JU (2014–2021) is out of scope for this sprint**: all ECSEL calls have project start dates in 2014–2020, outside the 2021–2026 Horizon Europe period tracked here. Noted in methodology as a pre-period exclusion.

---

## Scope decisions (locked before scripting)

1. **Time window unchanged**: 2021–2026. Filter all new sources to calls/programmes with `project_started >= 2021-01-01`.
2. **EIT KICs — hardcoded list pattern**: same approach as existing EIT Digital/Manufacturing. Company data is compiled manually from public KIC pages and hardcoded as 8-tuples in `extract_eit.py`. No live web dependency at run time.
3. **Eurostars — all EU SME partners**: Eurostars projects have 2–5 partner SMEs each; all are primary beneficiaries by programme design. Deliberate deviation from the coordinator-only (Option A) convention used for large JU consortia. Document in methodology.
4. **CHP — coordinator only (Option A)**: CHP projects are large multi-partner research consortia (same structure as Chips JU); take coordinator only.
5. **No DB writes until each extractor validates clean**: run CSV-only mode first, inspect output, then `--load-db`.
6. **classify.py**: each new source exports a `*_SOURCE_SECTOR` dict; classify.py imports it with try/except fallback (same pattern as EIT, IF, Chips JU, EDF). Do NOT duplicate mappings inline.
7. **Methodology Tier 3 principle**: this tracker covers **direct** EU investment relationships — grants, equity, and debt where an EU institution/programme directly awards funding to the named company. Fund-of-fund structures (InvestEU guarantee → financial intermediary, EIF → VC fund) and member-state-administered funds (ERDF/ESF/Cohesion) are out of scope by design.

---

## Pre-flight

1. Confirm DB baseline: `python scripts/sanity_check.py` clean, 3,101 companies / 4,969 events.
2. Back up: `cp db.sqlite db_backups/db.sqlite.backup_pre_sprint10`.
3. Python env functional (unchanged from Sprint 9).

---

## Workstream A — 6 missing EIT KICs

### Step A0 — Discovery (do this first; blocks A1+)

For each of the 6 KICs, answer before scripting:
- What programme/cohort names exist?
- Which years fall within 2021–2026?
- Is there a public-facing winner/portfolio list with company name + country?
- What is the appropriate `grant_amount_basis`? (`eit_kic_support`, `eit_kic_grant`, or `eit_kic_equity`)

Primary sources to check:

| KIC | Primary source to check |
|---|---|
| EIT InnoEnergy | innoenergy.com/startups — publicly searchable portfolio (110+ companies); EIT.europa.eu news for annual cohort announcements |
| EIT Health | eithealth.eu/programmes/catapult — Catapult annual cohort pages (42/year); eithealth.eu Headstart grant recipients |
| EIT Climate-KIC | climate-kic.org/programmes — startup portfolio pages (rebranded from EIT Climate-KIC to Climate-KIC in 2022) |
| EIT Urban Mobility | eiturbanmobility.eu — accelerate programme pages |
| EIT RawMaterials | eitrawmaterials.eu — upscaling programme portfolio |
| EIT Food | eitfood.eu — RisingFoodStars programme, co-innovation cohort lists |

### Step A1 — Extend `CALL_TO_SOURCE` in `scripts/extract_eit.py`

Add one entry per KIC programme × year cohort. Follow existing naming pattern:
```python
"eit_innoenergy_highway_2022": ("eit_innoenergy_highway_2022", "YYYY-MM-DD"),
```

### Step A2 — Extend `EIT_KIC_SOURCE_SECTOR` in `scripts/extract_eit.py`

Add sector fallback for each new source ID:

| KIC | sector_inferred |
|---|---|
| EIT InnoEnergy | `cleantech` |
| EIT Health | `life_sciences` |
| EIT Climate-KIC | `cleantech` |
| EIT Urban Mobility | `other` |
| EIT RawMaterials | `deeptech_hardware` |
| EIT Food | `other` |

### Step A3 — Add hardcoded company lists

For each programme × year, add a constant list (e.g. `EIT_INNOENERGY_HIGHWAY_2022`) with 8-tuples:
```python
(company_name, country_iso, description, grant_amount_eur, equity_amount_eur, notes, call_key, source_url)
```
`grant_amount_eur` is `None` for support/acceleration programmes; set only for programmes with published cash prizes.

Add all new lists to the master aggregation that drives CSV output + DB load (follow the existing `ALL_COMPANIES` / `main()` pattern).

### Step A4 — Load and validate

```bash
python scripts/extract_eit.py              # CSV check — inspect output
python scripts/extract_eit.py --load-db
python scripts/classify.py
python scripts/sanity_check.py
```

---

## Workstream B — Eurostars

### Step B0 — Discovery

Check these sources in order; stop at the first that gives full project + company data:

1. `eurostars-eureka.eu/projects` — paginated project list; check if filterable by year and whether company names + countries are in the HTML.
2. `eurekanetwork.org/data` — EUREKA publishes open data; check for downloadable CSV export.
3. CORDIS API: `https://api.cordis.europa.eu/v1/results?programme=EUROSTARS` — verify whether Eurostars-3 (2021+) projects appear here.

If primary source turns out to be inaccessible or yields fewer than ~10 companies per call year, document and skip.

### Step B1 — Build `scripts/extract_eurostars.py`

Schema mapping:

| Field | Value |
|---|---|
| `source` | `eurostars_{year}` (one per call year, 2021–2024) |
| `role` | `participant` (all EU SME partners are primary beneficiaries) |
| `project_number` | Eurostars project reference |
| `project_title` | project title |
| `project_started` | project start date |
| `grant_amount_eur` | national grant amount if published; NULL otherwise |
| `sector_tags_raw` | from EUREKA technology domain field |
| `grant_amount_basis` | `eurostars_grant` |
| `raw_source_url` | project page URL |

Export `EUROSTARS_SOURCE_SECTOR` dict. Since Eurostars is cross-sector, map each source to sector based on the technology domain field per project, falling back to `digital` if ambiguous. Alternatively, if the domain field maps cleanly, export a `EUROSTARS_DOMAIN_TO_SECTOR` mapping.

Company matching: same 5-tier matcher (exact name+country → exact name-only → forward prefix → reverse prefix → fuzzy ≥0.92 → new insert with `match_method='eurostars'`).

Add to `classify.py`:
```python
try:
    from extract_eurostars import EUROSTARS_SOURCE_SECTOR  # noqa: E402
except ImportError:
    EUROSTARS_SOURCE_SECTOR: dict[str, str] = {}
```

### Step B2 — Load and validate

```bash
python scripts/extract_eurostars.py
python scripts/extract_eurostars.py --load-db
python scripts/classify.py
python scripts/sanity_check.py
```

---

## Workstream C — Clean Hydrogen Partnership

### Step C0 — Discovery

Check these sources in order:

1. Inspect `clean-hydrogen.europa.eu/projects-dashboard` page source for an underlying API endpoint (same technique that found the Chips JU OData endpoint in Sprint 5).
2. CORDIS API: `https://api.cordis.europa.eu/v1/results?programme=HORIZON` filtered by JU type or by the clean hydrogen programme code — check whether CHP projects appear.
3. If no API: paginated scraping of the projects repository at `clean-hydrogen.europa.eu/projects-dashboard/projects-repository`.

Note: CHP also covers FCH JU and FCH 2 predecessor projects (pre-2021) on the same dashboard. Filter to `project_started >= 2021-01-01` (the Clean Hydrogen JU era, aligned to Horizon Europe MFF).

### Step C1 — Build `scripts/extract_chp.py`

Schema mapping:

| Field | Value |
|---|---|
| `source` | `chp_{year}` (one per call year, 2021–2024) |
| `role` | `direct` (coordinator only) |
| `project_number` | CORDIS / CHP project number |
| `project_title` | project title |
| `project_started` | start date |
| `grant_amount_eur` | EU contribution (grant ceiling) |
| `sector_tags_raw` | `"Hydrogen, {topic_area}"` — `"Hydrogen"` triggers `CLEANTECH_TAGS` in classifier |
| `grant_amount_basis` | `chp_grant` |
| `raw_source_url` | project page URL |

Export `CHP_SOURCE_SECTOR` dict (all `chp_*` sources → `cleantech`).

Coordinator-country derivation: same 3-tier heuristic as Chips JU (explicit country mention in name → language patterns → hardcoded org overrides for multi-country corporates). Validate against the participating-countries field if available.

Company matching: same 5-tier matcher, `match_method='chp'`.

Add to `classify.py`:
```python
try:
    from extract_chp import CHP_SOURCE_SECTOR  # noqa: E402
except ImportError:
    CHP_SOURCE_SECTOR: dict[str, str] = {}
```

### Step C2 — Load and validate

```bash
python scripts/extract_chp.py
python scripts/extract_chp.py --load-db
python scripts/classify.py
python scripts/sanity_check.py
```

---

## Workstream D — Methodology updates

All edits to `docs/methodology.md`.

### D1 — Update source coverage table

- EIT KIC row: change from `✅ partial` to `✅ Loaded` (all 8 KICs). Update notes to list all KIC programmes.
- Add `Eurostars` row: `✅ Loaded`, note Eurostars-3 era (2021+), all EU SME partners.
- Add `Clean Hydrogen Partnership` row: `✅ Loaded`, coordinator-only, 2021+.

### D2 — Update Horizon Europe coverage table

- EIT KICs row: update to all 8 loaded.
- CHP / CleanH2 JU row: change from `❌ Deferred` to `✅ Loaded`.
- ECSEL JU: add explicit note — out of time-window (2014–2020 calls; succeeded by KDT/Chips JU from 2021).

### D3 — Add Tier 2 section

New subsection under "Coverage gaps": **"Tier 2 — known gaps with lower direct-funding signal"**

| Source | Why excluded | Revisit trigger |
|---|---|---|
| HE Pillar 2 collaborative R&D (Clusters 1–6) | Companies appear as consortium partners, not primary beneficiaries; coordinator role typically goes to universities/research orgs; weak "company received EU funding" signal | If future analysis needs broad HE coverage including consortium partners |
| Digital Europe Programme (DEP) | Funds testing infrastructure, capacity-building, and skills — not direct company R&D grants; beneficiaries are facility operators and training providers, not innovating companies | If DEP deployment calls produce company-level grant data |
| EIC Fund equity investments | Tracked separately from EIC grants; portfolio is public but not machine-readable as of 2026-05-25; `equity_amount_eur` column exists for future enrichment | When EIC Fund publishes a structured portfolio export |
| ECSEL JU (2014–2021) | Pre-period: all ECSEL calls have project start dates in 2014–2020, outside the 2021–2026 HE window | If the analysis scope expands to the full 2014–2026 lifecycle |
| EU Missions (Cancer, Climate, Cities, Soil, Oceans) | Small budgets (€1.8bn total), same consortium-partner pattern as Cluster grants, no clean company-coordinator subset | — |

### D4 — Add Tier 3 out-of-scope statement

New subsection: **"Scope principle — direct investments only"**

> This tracker covers **direct** EU investment relationships only. A "direct" relationship means an EU institution or programme awards funding — grant, equity, or debt — in which the named company is the direct counterparty. The following structures are **explicitly out of scope** because the EU's direct counterparty is an intermediary, not the company:
>
> | Out-of-scope structure | Examples | Reason |
> |---|---|---|
> | **Fund-of-fund / guarantee programmes** | InvestEU (EU guarantee → EIB/national bank → company); EIF (EU capital → VC fund → portfolio company) | EU's counterparty is the financial intermediary; the company has no direct contractual relationship with the EU budget |
> | **Member-state-administered structural funds** | ERDF, ESF+, Cohesion Fund | Administered via 27 member-state managing authorities; no unified EU-level beneficiary registry; would require 27 separate national extractors |
> | **Intermediated bank lending** | EIB loans to commercial banks for on-lending to SMEs | The borrower in the EIB project database is the commercial bank, not the SME |
> | **National-level subsidies** | DE Investitionszulage, FR BPI grants, IT credito d'imposta | EU-level tracker by design; national subsidy data varies enormously in structure and availability |
>
> **Note on EIB Venture in this DB**: the EIB venture-debt and InvestEU VD rows already loaded are *direct* EIB-to-company loans where the company is the named borrower on the EIB project page — not intermediated. The EIB's fund-of-fund instruments (EIF, EGF VDC, intermediated SME lending) were excluded during Sprint 3 on the same principle.

### D5 — Decision log entry

Add dated entry covering: IPCEI date backfill (EC decision dates, 2026-05-25), Sprint 10 plan rationale, Tier 2/3 boundary formalisation.

---

## File manifest

| File | Action |
|---|---|
| `scripts/extract_eit.py` | Extend with 6 KIC source IDs, sector mappings, and hardcoded company lists |
| `scripts/extract_eurostars.py` | **New**: Eurostars-3 extractor (all EU SME partners) |
| `scripts/extract_chp.py` | **New**: Clean Hydrogen Partnership extractor (coordinator-only) |
| `scripts/classify.py` | Add try/except imports for `EUROSTARS_SOURCE_SECTOR` and `CHP_SOURCE_SECTOR` |
| `docs/methodology.md` | Source coverage table, HE table, Tier 2 section, Tier 3 principle, decision log |
| `docs/notes.md` | Day 12 entry |

---

## Validation gates

| Gate | Criterion |
|---|---|
| G1 Baseline | `sanity_check.py` clean before any load |
| G2 Dates | Zero `NULL project_started` after each `--load-db` run |
| G3 Sectors | Zero `unclassified` after `classify.py` re-run |
| G4 Dedup | `audit_dedup.py` stable; no new regressions |
| G5 Totals | Each new source grant sum within ±10% of published programme totals, or gap documented |
| G6 Methodology | Source coverage table matches DB state; Tier 2/3 sections present |

---

## Expected corpus growth (rough pre-discovery estimates)

| Source | New events | New companies |
|---|---|---|
| 6 EIT KICs | ~100–300 | ~80–250 |
| Eurostars | ~150–400 | ~100–300 |
| CHP | ~50–150 | ~40–120 |
| **Total** | ~300–850 | ~200–670 |

Cross-instrument overlap (especially EIC × EIT KIC × Eurostars) will reduce net new company count. Exact numbers surface only after load.

---

## Execution order

A → B → C → D. The discovery steps (A0, B0, C0) must complete before scripting begins for each workstream. D can proceed in parallel but should be finalised last so the coverage table reflects actual loaded counts.

If a primary data source proves inaccessible or too sparse (fewer than ~10 companies per call year), document the dead end in notes.md and skip that source — do not build an extractor for negligible yield.
