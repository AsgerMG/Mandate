# Sprint 12 plan — Horizon Europe Pillar II ingestion via CORDIS

**Owner**: Claude (next session), executing against `/Users/asgermollergrimberg/EuroInvTracker/`.

**Status**: Not started. Follows Sprint 11 (3,633 companies / 5,733 events).

**Purpose**: Close the single largest remaining coverage gap — the Horizon Europe Pillar II "Global Challenges" clusters (CL1 Health, CL3 Civil Security, CL4 Digital/Industry/Space, CL5 Climate/Energy/Mobility, CL6 Food/Bioeconomy). Roughly €40-45B of company-direct EU innovation funding currently invisible. Brings coverage from ~31% to ~60% of the "company-direct identifiable EU innovation universe" for 2021-2026.

---

## TL;DR for a fresh Claude session

One workstream, executed cluster-by-cluster. CORDIS already provides clean, structured CSV bulk exports — no scraping, no PDF parsing, no rate limits. Schema fit is excellent (we already process narrow CORDIS slices for IHI / EuroHPC / Chips JU under Sprint 11). The job is to generalise that pattern across the four high-strategic-relevance clusters.

**Reframed study goal** (user, 2026-05-25): map all ways strategic European companies can access European support to build resilience and scale. Horizon Pillar II Clusters CL3/CL4/CL5 are arguably the single largest direct-to-company innovation channel in this map. CL1 included for biotech/medtech. CL6 partly included for food/agritech with a research-org filter.

**CL2 (Culture, Creativity, Society) is out of scope** — low industrial-policy signal, dominated by academia.

**Pillar I (ERC, MSCA, Research Infrastructures) is out of scope** — academia-dominated, individual PIs, not relevant for "company access to EU support."

**EIC and EIT (Pillar III)** are already in the DB; not re-ingested here.

---

## Scope decisions (locked before scripting)

1. **Time window**: 2021-01-01 to today. Filter `start_date >= 2021-01-01` at extraction time. Horizon 2020 (FP8) projects with EU funding still flowing into 2021+ are **excluded** — H2020 was a different framework, and partial overlap pollutes the time-series. Document the exclusion.
2. **Granularity = organisation-level event**. CORDIS publishes a separate `organization.csv` linking projects ↔ orgs with per-org `ec_contribution` (clean EU money per company). One row in `public_funding_events` per (project_id, organization_id) pair. This is finer than our usual "coordinator-only" Option A for JUs — but CORDIS makes per-participant EU money explicit, so we use it.
3. **Role field populated from CORDIS `role` column**: `coordinator`, `participant`, `thirdParty`, `associatedPartner`. We load all four, but **`thirdParty` and `associatedPartner` get `coordinator_only=NULL` and excluded by default from aggregate views** (they typically don't receive direct EU funding).
4. **Research-org filtering**: CORDIS `organization.csv` includes `organizationActivityType` (HES = Higher Education, REC = Research Centre, PRC = Private Company, PUB = Public Body, OTH = Other). All four cluster ingestions load **all activity types** — but the analysis layer filters to `entity_type='company'` for the strategic-resilience narrative. Document this dual-use clearly.
5. **Source IDs**:
   - `horizon_eu_cl1_<year>` (Health)
   - `horizon_eu_cl3_<year>` (Civil Security)
   - `horizon_eu_cl4_<year>` (Digital, Industry, Space)
   - `horizon_eu_cl5_<year>` (Climate, Energy, Mobility)
   - `horizon_eu_cl6_<year>` (Food, Bioeconomy) — conditional on Step 0 budget check
   - Year = `start_date` year.
6. **`grant_amount_basis` = `horizon_eu_grant`** (single value for all CL ingestions — they are the same instrument, just different topical clusters). The `source` field carries the cluster distinction.
7. **Sector defaults via cluster → sector mapping** (overridden if topic-level tags justify finer-grain):
   - CL1 → `life_sciences`
   - CL3 → `defense_dual_use`
   - CL4 → `digital_ai` (sub-topic refinement for semis → `deeptech_hardware`, space → `space`)
   - CL5 → `cleantech`
   - CL6 → `agritech_food` (new sector — see Step 0.5)
8. **PIC-based dedup is canonical**. CORDIS publishes PIC for every organisation. Our existing `companies.pic` field has 2,188 of 3,633 populated — CORDIS join will be near-automatic where PICs match. New companies inserted with `match_method='cordis_pic'`, `match_confidence='high'`.
9. **No DB writes until validation passes**. Each cluster: CSV mode first, row-count + grant-sum sanity check, then `--load-db`.

---

## Pre-flight

1. Confirm DB baseline: `sanity_check.py` clean, 3,633 / 5,733.
2. Back up: `cp db.sqlite db_backups/db.sqlite.backup_pre_sprint12`.
3. Download CORDIS bulk exports. Public bulk endpoint: `https://data.europa.eu/data/datasets/cordis-eu-research-projects-under-horizon-europe-2021-2027`. Expect 4 zipped CSVs (`project`, `organization`, `topics`, `webItem` / `webLink`). Total ~80MB compressed, ~400MB uncompressed.
4. Store raw downloads in `data/raw/cordis/horizon_europe/` (do not commit — same convention as other large raw extracts).
5. Verify schema columns present in `organization.csv`: `projectID`, `projectAcronym`, `organisationID`, `vatNumber`, `name`, `shortName`, `activityType`, `endOfParticipation`, `ecContribution`, `country`, `street`, `postCode`, `city`, `geolocation`, `organizationURL`, `contactForm`, `role`. If column names differ in the current export, regenerate the column-mapping constants at top of the extractor.
6. Check whether sector `agritech_food` exists in `companies.sector_inferred` controlled vocabulary. If not, add it in Step 0.5.

---

## Workstream 0 — Discovery and shared loader

### Step 0.0 — Bulk download

```bash
mkdir -p data/raw/cordis/horizon_europe
cd data/raw/cordis/horizon_europe
# Download from data.europa.eu (URL confirmed at pre-flight)
curl -L -o horizon_europe_projects.zip "<bulk_export_url>"
unzip horizon_europe_projects.zip
```

If bulk download is gated behind a redirect or login, fall back to the four individual CSV links on the dataset landing page.

### Step 0.1 — Build `scripts/extract_cordis_pillar_ii.py`

Single shared extractor parameterised by cluster code. Pattern is closer to `extract_eit.py` (multi-call from one source) than the per-JU extractors.

Top-level structure:

```python
CLUSTER_TOPIC_PREFIXES = {
    "CL1": "HORIZON-HLTH-",        # Health
    "CL3": "HORIZON-CL3-",          # Civil Security
    "CL4": "HORIZON-CL4-",          # Digital, Industry, Space
    "CL5": "HORIZON-CL5-",          # Climate, Energy, Mobility
    "CL6": "HORIZON-CL6-",          # Food, Bioeconomy
}

CLUSTER_DEFAULT_SECTOR = {
    "CL1": "life_sciences",
    "CL3": "defense_dual_use",
    "CL4": "digital_ai",
    "CL5": "cleantech",
    "CL6": "agritech_food",
}
```

Per-cluster pipeline:
1. Filter `topics.csv` to topic codes starting with the cluster prefix → set of `project_id`.
2. Filter `project.csv` to those IDs AND `start_date >= 2021-01-01`.
3. Inner-join with `organization.csv` on `project_id`.
4. For each (project, org) row, emit one `public_funding_events` row with:
   - `source = f"horizon_eu_{cluster.lower()}_{start_year}"`
   - `role = org["role"]` (coordinator/participant/thirdParty/associatedPartner — preserve as-is)
   - `coordinator_only = 1 if role == "coordinator" else 0`
   - `project_number = project_id`
   - `project_acronym`, `project_title`, `project_summary` from project.csv
   - `project_started = start_date`, `project_ended = end_date`
   - `call_id = topic_code` (most relevant code from topics.csv for that project)
   - `grant_amount_eur = org["ecContribution"]`
   - `total_project_cost_eur = project["totalCost"]` (project-level, repeated across org rows for that project; analysis layer must avoid double-summing)
   - `sector_tags_raw = topic_code` (raw — classify.py interprets)
   - `grant_amount_basis = "horizon_eu_grant"`
   - `raw_source_url = f"https://cordis.europa.eu/project/id/{project_id}"`
5. Company matching: PIC-first (CORDIS `organisationID` field IS the PIC), then fall back to the standard 5-tier matcher for the small fraction without PIC.

CLI:

```
python scripts/extract_cordis_pillar_ii.py --cluster CL4              # CSV mode
python scripts/extract_cordis_pillar_ii.py --cluster CL4 --load-db
python scripts/extract_cordis_pillar_ii.py --cluster all --load-db    # convenience
```

### Step 0.5 — Schema additions

1. Add `agritech_food` to the `companies.sector_inferred` controlled vocabulary (`classify.py` SECTOR_TAGS dict). Single line addition.
2. Add new tag families to `classify.py` if needed:
   - Civil-security topic strings (CL3) → trigger `defense_dual_use`
   - Space topic strings (CL4 space sub-cluster) → trigger `space`
   - Semiconductor topic strings (CL4 digital sub-cluster) → trigger `deeptech_hardware`
3. Export per-cluster `HORIZON_EU_CLx_SOURCE_SECTOR` dicts following the [feedback_nextjs_barrel_imports] anti-pattern doesn't apply here — but **do** mirror the `IF_SOURCE_SECTOR` import convention so classify.py is the only place that knows the mapping table.

---

## Workstream A — Cluster 4 (Digital, Industry, Space)

**Why first**: largest cluster (€15.3B envelope 2021-27), most relevant for strategic resilience (semis, AI, manufacturing, space), and overlaps with existing Chips JU / EuroHPC companies → good dedup stress-test.

```bash
python scripts/extract_cordis_pillar_ii.py --cluster CL4              # CSV mode
# Inspect data/processed/horizon_eu_cl4_projects.csv
python scripts/extract_cordis_pillar_ii.py --cluster CL4 --load-db
python scripts/classify.py
python scripts/sanity_check.py
python scripts/audit_dedup.py
```

Validation gates:
- Expect ~1,200-1,800 projects × ~6-12 partners avg = **~8,000-16,000 new event rows**.
- Grant sum should be within ±15% of the published cumulative CL4 budget spent through start-of-2026 (roughly €7-9B given a partial multi-year window).
- Cross-instrument overlap with Chips JU expected (CEA, IMEC, Atos/Eviden, BSC, Infineon, ASML). Spot-check 10 multi-instrument winners.
- Topic-code coverage: at least 90% of unique CL4 topic codes in `topics.csv` should produce at least one event after the date filter.

---

## Workstream B — Cluster 5 (Climate, Energy, Mobility)

**Why second**: comparable size to CL4 (€15.1B), highest overlap with existing Innovation Fund and CHP coverage → tests our dedup + cross-instrument fingerprinting at scale.

```bash
python scripts/extract_cordis_pillar_ii.py --cluster CL5              # CSV mode
python scripts/extract_cordis_pillar_ii.py --cluster CL5 --load-db
python scripts/classify.py
python scripts/sanity_check.py
```

Validation gates:
- Expect ~8,000-15,000 new event rows.
- Cross-instrument overlap with CHP, IF, EIB venture debt. Spot-check 10 multi-instrument winners.
- Sector classification: ≥95% should land in `cleantech`; outliers should be diagnosed (e.g. mobility-tech might land in `digital_ai` if classifier picks the wrong signal).

---

## Workstream C — Cluster 3 (Civil Security)

**Why third**: smallest dedicated cluster (€1.6B) but highest strategic-resilience relevance per euro (cyber, border tech, crisis response). Some dual-use overlap with EDF — flag the overlap explicitly in methodology.

```bash
python scripts/extract_cordis_pillar_ii.py --cluster CL3              # CSV mode
python scripts/extract_cordis_pillar_ii.py --cluster CL3 --load-db
python scripts/classify.py
python scripts/sanity_check.py
```

Validation gates:
- Expect ~400-700 projects × ~5-10 partners avg = ~3,000-6,000 new event rows.
- EDF overlap: any company appearing in both EDF and CL3 should be flagged in the analysis layer as `defense_dual_use_double_funded`.

---

## Workstream D — Cluster 1 (Health)

**Why fourth**: large envelope (€8.2B) but **already partially covered via IHI JU** (Sprint 11). De-duplicate carefully — IHI is a JU under HE, so its projects ARE also in CORDIS as `HORIZON-JU-IHI-*` topics. Exclude IHI topic codes at extraction (`call_id NOT LIKE 'HORIZON-JU-IHI-%'`).

```bash
python scripts/extract_cordis_pillar_ii.py --cluster CL1 --exclude-ihi              # CSV mode
python scripts/extract_cordis_pillar_ii.py --cluster CL1 --exclude-ihi --load-db
python scripts/classify.py
python scripts/sanity_check.py
```

Validation gates:
- Expect ~600-1,000 projects → ~4,000-8,000 new event rows (CL1 has high partner counts — multi-hospital + uni + pharma consortia).
- High `research_org` proportion expected (60-70% of orgs). Document.
- IHI duplicate audit: zero events should have `call_id` matching existing IHI events.

---

## Workstream E — Cluster 6 (Food, Bioeconomy)

**Why last and conditional**: lower strategic-resilience priority. Include only if A-D land cleanly and the analytical question for agritech/food security justifies the volume.

Decision gate after Workstream D: if the corpus has grown past ~25,000 events and runtime/storage are healthy, proceed. Otherwise defer to Sprint 13 backlog.

```bash
python scripts/extract_cordis_pillar_ii.py --cluster CL6              # CSV mode
python scripts/extract_cordis_pillar_ii.py --cluster CL6 --load-db
python scripts/classify.py
python scripts/sanity_check.py
```

---

## Cross-cluster post-load tasks

### Post-1 — Dedup audit across the full corpus

CORDIS adds ~25-40k event rows referencing ~12-18k unique organisations. Many will match existing companies via PIC; the rest need fuzzy-match scrutiny.

```bash
python scripts/audit_dedup.py --threshold=0.85 --report
```

Expected: 100-300 candidate merges flagged. Review manually before applying.

### Post-2 — `grant_amount_basis` reconciliation

Add the new basis (`horizon_eu_grant`) to:
- `analysis/views.sql` (`v_events` view)
- `docs/methodology.md` (basis table)
- The Sprint 9 EDA `analysis/run.py` rollups (so the findings site refreshes correctly)

### Post-3 — Site refresh

Regenerate `site/public/data/*.json` via `python analysis/run.py`. Validate that the 15 routes still render with the larger dataset. The findings page totals will jump significantly — update headline numbers in `site/app/page.tsx` (or wherever the hero stat lives).

### Post-4 — Methodology update

In `docs/methodology.md`:
- Add a "Horizon Europe Pillar II" section under Sources.
- Expand the source-coverage table to include CL1/CL3/CL4/CL5/(CL6).
- Document the **org-level vs project-level event** decision (different from JU coordinator-only convention).
- Document the **CL2/Pillar I exclusion** with rationale.
- Document the **CORDIS ↔ IHI/Chips JU/EuroHPC dedup** approach (exclude JU topics from CL1/CL4 ingestion).
- Update the "company-direct identifiable universe" coverage estimate from ~31% to ~60%.

---

## File manifest

| File | Action |
|---|---|
| `scripts/extract_cordis_pillar_ii.py` | **New**: shared multi-cluster CORDIS extractor |
| `scripts/classify.py` | Import 5 new `HORIZON_EU_CLx_SOURCE_SECTOR` dicts; add `agritech_food` sector; add civil-security / space / semiconductor sub-cluster tag families |
| `analysis/views.sql` | Update `v_events` to include `horizon_eu_*` source family; recompute `v_company_breadth` to recognise Horizon Pillar II as one family |
| `analysis/run.py` | Add Horizon Pillar II rollups; refresh existing rollups |
| `docs/methodology.md` | New Pillar II section; updated coverage table; org-level event rationale; coverage % update |
| `docs/notes.md` | Day 14 entry |
| `data/raw/cordis/horizon_europe/` | Bulk raw CSVs (gitignored) |
| `data/processed/horizon_eu_cl{1,3,4,5,6}_projects.csv` | Per-cluster extracted CSVs |

---

## Validation gates

| Gate | Criterion |
|---|---|
| G1 Baseline | `sanity_check.py` clean before any load (3,633 / 5,733) |
| G2 Dates | Zero `NULL project_started` after each cluster load |
| G3 Sectors | Zero `unclassified` after `classify.py` re-run |
| G4 Dedup | `audit_dedup.py` produces a reviewable candidate list, not silent merges. Manual review applied before commit. |
| G5 Totals | Per-cluster EU contribution sum within ±15% of publicly reported envelope spent through start-of-2026 (or gap documented) |
| G6 JU non-overlap | Zero CL1 events with `call_id LIKE 'HORIZON-JU-IHI-%'`; zero CL4 events with `call_id LIKE 'HORIZON-JU-CHIPS-%'` or `LIKE 'HORIZON-EUROHPC-%'` |
| G7 Coverage % | Methodology update reflects the new ~60% coverage estimate |
| G8 Site | `site/out/` rebuilds cleanly; all 15 routes return 200; headline number on home page updated |

---

## Expected corpus growth (rough pre-discovery estimates)

| Cluster | Projects | Avg partners | New events | New companies (post-dedup) |
|---|---:|---:|---:|---:|
| CL4 Digital/Industry/Space | ~1,500 | ~9 | ~13,500 | ~3,000 |
| CL5 Climate/Energy/Mobility | ~1,200 | ~9 | ~11,000 | ~2,500 |
| CL3 Civil Security | ~550 | ~7 | ~4,000 | ~1,200 |
| CL1 Health (excl. IHI) | ~800 | ~8 | ~6,500 | ~1,800 |
| CL6 Food/Bioeconomy (conditional) | ~600 | ~9 | ~5,500 | ~1,500 |
| **Total** | **~4,650** | — | **~40,500** | **~10,000** |

Post-dedup unique companies: PIC-match coverage should keep new-company growth to ~70% of organisation count (the rest are already in the corpus via EIC / EIT / IPCEI / EDF / JUs).

**Sprint 12 corpus target after dedup: ~13,000-14,000 companies / ~45,000-47,000 events.**

---

## Execution order

A → B → C → D → (decision gate) → E. Reasoning:
- CL4 is biggest and exercises the dedup machinery hardest → best to surface scaling problems early.
- CL5 then C5 then CL3 are next-largest and lowest-novelty (well-trodden patterns).
- CL1 has the IHI deduplication wrinkle — do it after the pipeline is proven.
- CL6 is conditional based on Workstream A-D outcomes.

After each cluster: `classify.py` + `sanity_check.py` + `audit_dedup.py --report` before proceeding. Don't batch.

---

## Out of scope (explicit)

- **CL2 Culture, Creativity, Society**: low industrial-policy signal, academia-dominated.
- **Pillar I (ERC, MSCA, Research Infrastructures)**: not company-direct.
- **Horizon 2020 legacy projects**: out of time window, different framework.
- **Mission funding (EU Missions)**: cross-cuts the clusters; revisit in a dedicated mini-sprint if the analysis layer flags them as missing.
- **Public-procurement under PCP/PPI in CL4**: contract-based, different vehicle, defer.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Bulk CSV format changes from CORDIS version (column rename) | Pin column mapping in extractor header; fail loudly if a required column is absent. |
| ~40k new events 7x-es DB size and slows queries | Add indexes on `(source, project_started)` and `(company_id, source)` post-load; analyse query plans on `v_events`. SQLite handles this volume fine but indexes matter. |
| PIC mismatch on cross-encoded company names (e.g. CEA vs CEA-Leti vs CEA Tech) | PIC is the canonical key — trust it. Names that disagree but PICs match are the SAME entity; this is correct dedup. |
| Topic-to-cluster mapping ambiguity (some topics span clusters) | CORDIS publishes a topic-to-call hierarchy; use it. Avoid manual mapping. |
| CL5 mobility-tech bleeds into `digital_ai` classification | Audit sample of 50 CL5 events post-classify; tune tag families if >5% misclassified. |
| Analysis layer assumes coordinator-only events | Add `WHERE coordinator_only = 1` to the relevant `v_events` queries that need lead-only semantics; the new org-level rows are visible to participant-aware queries. Document clearly. |
| Methodology coverage % overstated | Recompute the "company-direct identifiable universe" denominator after the load — if the actual coverage is higher or lower than ~60%, update the headline. Don't anchor to the pre-sprint estimate. |

---

## Definition of done

- Pillar II Clusters CL1/CL3/CL4/CL5 (and CL6 if executed) loaded into `public_funding_events`.
- `classify.py` integrates the new source families with `agritech_food` and refined CL4 sub-cluster tagging.
- `audit_dedup.py` clean (no orphaned candidate merges).
- `docs/methodology.md` updated with the Pillar II section, coverage update, and dedup approach.
- `site/out/` rebuilds; home page headline number reflects the new total (~€95-100B captured).
- Memory file `project_horizon_pillar_ii.md` written with workstream-specific caveats.
- One-line entry added to `MEMORY.md` index.
