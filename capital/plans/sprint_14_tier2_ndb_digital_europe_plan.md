# Sprint 14 plan — Tier 2 coverage: regional NDBs + Digital Europe Programme + EIC Fund equity

**Owner**: Claude (next session), executing against `/Users/asgermollergrimberg/EuroInvTracker/`.

**Status**: Not started. Follows Sprint 13 (Tier 1 NDBs). Target baseline at start: **~15,500-18,500 companies / ~50,000-53,000 events** (Sprint 13 projected — confirm at pre-flight).

**Purpose**: Close the final ~15-20% coverage gap to reach the "complete access map" target. Three workstreams: (1) Tier 2 regional and smaller-economy NDBs that round out the national strategic deployment layer; (2) **Digital Europe Programme** (€8B Commission programme that we've been skipping); (3) **EIC Fund equity component** — the equity tickets the EIC deploys alongside Accelerator grants that have been NULL in the DB since day one.

---

## TL;DR for a fresh Claude session

Three workstreams, three different patterns:

- **A — Tier 2 regional / smaller-economy NDBs**: PMV (Flanders), SRIW + SOGEPA (Wallonia), AWS (Austria), PFR + NCBR (Poland), EIFO + Innovationsfonden (Denmark), FFG (Austria R&D), and any-tier-1-laggards skipped in Sprint 13. Per-institution portfolio extraction, same pattern as Sprint 13.
- **B — Digital Europe Programme (DEP)**: New `scripts/extract_digital_europe.py`. €8B Commission programme for AI / cybersecurity / supercomputing capacity / digital skills / advanced digital tech deployment. Distinct from Horizon Europe — same agency-managed funding model. Data published on the EU Funding & Tenders Portal and via CORDIS supplementary tables.
- **C — EIC Fund equity backfill**: New `scripts/extract_eic_fund_equity.py`. The EIC Fund makes €0.5-15M equity tickets alongside Accelerator grants. Currently invisible — `equity_amount_eur IS NULL` on every EIC event. EIC publishes a portfolio page (`eic.ec.europa.eu/eic-funding-opportunities/eic-accelerator/eic-fund_en`) and a quarterly investment digest.

After Sprint 14, the dataset should reach **~85-90% of the company-direct identifiable EU strategic universe** for 2021-2026, with all three layers of the access map populated: EU direct (Pillar I+II+III + DEP), national strategic deployment (Tier 1 + Tier 2 NDBs), and ready for Sprint 10 private follow-on enrichment (Dealroom).

---

## Scope decisions (locked before scripting)

1. **Time window**: 2021-01-01 to today. Same as previous sprints.
2. **Schema**: no migration. `equity_amount_eur`, `ipcei_linked`, `eif_lp_backed`, `deployment_country` from Sprint 13 are sufficient.
3. **Regional NDB inclusion rule**: include where (a) annual deployment ≥ €100M AND (b) per-company disclosure exists. Below that threshold, document the institution in methodology as "known but excluded for tractability" rather than half-cover it.
4. **EIC Fund equity uses the existing EIC event row when matchable**. Where the EIC Fund equity follows an Accelerator grant for the same company, **update the existing event** with `equity_amount_eur` rather than creating a duplicate row. If the EIC Fund made a follow-on without a corresponding grant event in our DB, insert a new event with `source='eic_fund_followon'`.
5. **Digital Europe source IDs**: `digital_europe_<sub_programme>_<year>` (e.g. `digital_europe_ai_2024`, `digital_europe_cybersec_2023`, `digital_europe_edih_2022`). Five DEP sub-programmes (AI, Cybersecurity, Supercomputing, Digital Skills, Advanced Digital Tech Deployment).
6. **New `grant_amount_basis` values**: `digital_europe_grant`, `eic_fund_equity`. Per-NDB equity/grant basis values follow Sprint 13 conventions.
7. **No DB writes until validation**. CSV mode first.

---

## Pre-flight

1. Confirm DB baseline: `sanity_check.py` clean post-Sprint 13.
2. Back up: `cp db.sqlite db_backups/db.sqlite.backup_pre_sprint14`.
3. Verify `equity_amount_eur` non-NULL count from Sprint 13 (sanity that the schema is properly populated before EIC Fund equity adds more).
4. Sanity-check the EIC events count — Sprint 14 will mutate ~300-500 existing EIC rows (the Accelerator awardees that also got equity), so back up first.

---

## Workstream A — Tier 2 regional and smaller-economy NDBs

### Step A0 — Discovery and gating

For each candidate institution, run a quick disclosure-quality check:

| Institution | Country / Region | Threshold met? | Disclosure quality |
|---|---|---|---|
| **PMV** (Participatie Maatschappij Vlaanderen) | BE / Flanders | Yes (~€150M/yr) | Portfolio page disclosed |
| **SRIW / SOGEPA / Wallonie Entreprendre** | BE / Wallonia | Marginal (~€100M) | Partial; press-driven |
| **Finance.brussels / SFPIM** | BE / Brussels + federal | Marginal | Aggregated only |
| **AWS** (Austria Wirtschaftsservice) | AT | Yes (~€500M/yr) | Programme-level published |
| **FFG** (Forschungsförderungsgesellschaft) | AT R&D | Yes (~€800M/yr) | Per-award lists published |
| **PFR** (Polish Development Fund) | PL | Yes (~€1B/yr) | PFR Ventures portfolio page |
| **NCBR** (Polish R&D Centre) | PL R&D | Yes (~€500M/yr) | Award lists published |
| **EIFO** (Danish Export and Investment Fund) | DK | Yes (~€2B/yr) | Portfolio page; merged entity 2024 |
| **Innovationsfonden** | DK R&D | Yes (~€250M/yr) | Per-award database |
| **Vækstfonden** legacy data | DK pre-2024 | Yes | Merged into EIFO; track legacy |

Skip:
- **HBOR** (Croatia) — sub-threshold
- **Hungarian Development Bank** — political-economy data-availability concerns; document the exclusion
- **Latvian Altum, Lithuanian Invega, Estonian KredEx** — sub-threshold individually; aggregate Baltic regional view via EIF reporting instead
- **Bulgarian Development Bank, Romanian EximBank** — sub-threshold, sparse disclosure
- **Greek Hellenic Development Bank** — sparse disclosure

### Step A1 — Build per-institution extractors

One extractor per institution, mirroring the Sprint 13 pattern:

- `scripts/extract_pmv.py`
- `scripts/extract_aws_ffg.py` (combined Austrian)
- `scripts/extract_pfr_ncbr.py` (combined Polish)
- `scripts/extract_eifo_innovationsfonden.py` (combined Danish)
- `scripts/extract_wallonia_ndb.py` (combined SRIW/SOGEPA/Wallonie Entreprendre — small)

For each, schema mapping is identical to Sprint 13 (equity_amount_eur, grant_amount_eur, ipcei_linked, eif_lp_backed, deployment_country, raw_source_url). Use `ndb_helpers.py` (built in Sprint 13).

### Step A2 — Load and validate

Each extractor in sequence:

```bash
python scripts/extract_<institution>.py            # CSV mode
python scripts/extract_<institution>.py --load-db
python scripts/classify.py
python scripts/sanity_check.py
```

Validation gates per institution:
- Event count within ~±30% of Step A0 estimate.
- `deployment_country` correctly set.
- IPCEI linkage runs post-load for Polish (PFR ↔ IPCEI Microelectronics, Hydrogen) and Austrian (AWS ↔ IPCEI Batteries) overlaps especially.

---

## Workstream B — Digital Europe Programme (DEP)

**Why this matters**: DEP is the Commission's €8B 2021-2027 programme for **deployment** of strategic digital tech (vs Horizon Europe which funds R&D of digital tech). Critical for the access-map narrative because it's the channel through which European companies scale digital capacity — AI, HPC, cybersecurity, EDIH (European Digital Innovation Hubs). Currently completely invisible in our DB.

### Step B0 — Discovery

Five sub-programmes published on the EU Funding & Tenders Portal:
1. **AI** — including the AI Factories initiative
2. **Cybersecurity** — CRA prep, ENISA-adjacent funding
3. **Supercomputing** — capacity-building (distinct from EuroHPC JU R&I)
4. **Digital Skills** — workforce-side, lower company-relevance signal
5. **Advanced Digital Tech Deployment** — incl. EDIH network grants

Data access:
- Primary: EU Funding & Tenders Portal API or CSV export (`ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-search`).
- Fallback: CORDIS supplementary table for DEP (since DEP is administered alongside Horizon Europe under the same HaDEA / EISMEA / CINEA agencies).

### Step B1 — Build `scripts/extract_digital_europe.py`

Pattern matches the Sprint 12 CORDIS extractor. Same organisation-level granularity (DEP awards are typically multi-partner consortia, like Horizon Pillar II).

Schema mapping:

| Field | Value |
|---|---|
| `source` | `digital_europe_<sub>_<year>` |
| `role` | from CORDIS-equivalent disclosure |
| `coordinator_only` | derived from role |
| `grant_amount_eur` | EU contribution per org |
| `total_project_cost_eur` | project-level cost |
| `sector_tags_raw` | call topic |
| `grant_amount_basis` | `digital_europe_grant` |
| `deployment_country` | NULL (Commission-managed; not NDB) |
| `raw_source_url` | EU Funding & Tenders Portal topic URL |

Sub-programme → sector defaults:
- AI → `digital_ai`
- Cybersecurity → `digital_ai` (sub-tag `cybersecurity` if classifier supports)
- Supercomputing → `deeptech_hardware`
- Digital Skills → flagged but low-signal; classify as `digital_ai` with `match_confidence='low'`
- Advanced Digital Tech Deployment (EDIH) → `digital_ai`

### Step B2 — Load and validate

```bash
python scripts/extract_digital_europe.py            # CSV mode
python scripts/extract_digital_europe.py --load-db
python scripts/classify.py
python scripts/sanity_check.py
```

Validation gates:
- Expected ~500-900 projects × ~5-10 partners → ~3,000-7,000 new events.
- Grant sum: target €3-5B (DEP through start-of-2026, partial multi-year window).
- EDIH grants are network-style (many recipients, smaller tickets) — expect ticket sizes much smaller than Horizon Europe averages.
- Cross-overlap with CL4 (Pillar II Digital/Industry/Space) — same companies appear in both, but distinct events (DEP = deployment, Horizon = R&D).

---

## Workstream C — EIC Fund equity backfill

**Why this matters**: The EIC Fund has been the elephant in the room — every EIC Accelerator grant in the DB has `equity_amount_eur=NULL`, but ~40% of Accelerator winners actually receive €0.5-15M equity from the EIC Fund alongside the grant. This is the single largest data quality bug in the corpus. Fixing it converts the EIC story from "subsidised R&D" to "blended grant+equity instrument with significant equity capital deployed."

### Step C0 — Discovery

EIC Fund publishes:
1. **Portfolio page**: `eic.ec.europa.eu/eic-funding-opportunities/eic-accelerator/eic-fund_en` (or successor URL) — full list of equity investments with company name, country, sector, ticket band (sometimes exact, sometimes range).
2. **Quarterly investment digest** — published as PDF; named investments with rounder ticket sizes.
3. **EIC Annual Report** — aggregate equity deployed per year (~€500-900M/yr deploying since 2021).

### Step C1 — Build `scripts/extract_eic_fund_equity.py`

This is an **update extractor**, not a fresh-load extractor. Pattern:

1. Fetch EIC Fund portfolio list (Playwright if JS-rendered).
2. For each portfolio entry, fuzzy-match to existing EIC Accelerator events using:
   - Exact company name + country
   - Forward / reverse prefix match
   - Year window: EIC Fund equity follows the Accelerator grant by 6-18 months; allow `project_started` window of ±24 months.
3. **Where match exists**: `UPDATE public_funding_events SET equity_amount_eur = ?, raw_source_url = raw_source_url || '; ' || ? WHERE id = ?`.
4. **Where no match**: insert a new event with `source='eic_fund_followon'` and a flag indicating it's an EIC Fund equity without preceding grant in our DB. These are rare (most EIC Fund equity follows an Accelerator grant) but possible — and worth surfacing.

### Step C2 — Load and validate

```bash
python scripts/extract_eic_fund_equity.py            # dry-run mode — emits proposed UPDATEs as CSV
python scripts/extract_eic_fund_equity.py --apply
python scripts/sanity_check.py
```

Validation gates:
- Expected ~300-500 EIC Accelerator events updated with non-NULL `equity_amount_eur`.
- Expected ~0-30 `eic_fund_followon` insertions (rare case).
- Total EIC equity deployed should land in the €1.5-3B range for 2021-2026 (cross-check against EIC annual reports).
- Sanity: no event should have `equity_amount_eur > total_project_cost_eur` post-update.

---

## Cross-workstream post-load tasks

### Post-1 — Final access-map view

`analysis/views.sql`:
- `v_access_map` — for each company, columns: `received_eu_pillar1`, `received_eu_pillar2`, `received_eu_pillar3`, `received_dep`, `received_ndb_equity`, `received_ndb_grant`, `received_ipcei`. Boolean flags. Enables the "how many channels has each company accessed" analysis.

### Post-2 — Coverage estimate update

Recompute the "company-direct identifiable EU strategic universe" coverage estimate. After Sprint 14 expect ~85-90% coverage. Document the residual ~10-15% gap (mostly: Pillar I excluded by choice, member-state RRF-funded programmes that aren't NDB-channeled, plus a handful of small-country NDBs).

### Post-3 — Site refresh and access-map narrative page

New page `site/app/access-map/page.tsx`:
- Sankey diagram: company count by access-map combination (e.g. "EU Pillar II + Tier 1 NDB + IPCEI" vs "EIC only" vs "Pillar II + DEP").
- Top 20 "fully-supported" companies (≥3 access-map channels).
- Country-level access-map distribution.

### Post-4 — Methodology consolidation

- Final methodology version of the 3-layer access map.
- Coverage table now spans EU direct + NDB national + DEP + (Sprint 10 stub for private follow-on).
- Decision log: explicit list of what we chose NOT to cover (Pillar I, CL2, member-state RRF allocations, sub-threshold NDBs, Hungarian institutions).

---

## File manifest

| File | Action |
|---|---|
| `scripts/extract_pmv.py` | **New** (BE Flanders) |
| `scripts/extract_aws_ffg.py` | **New** (AT) |
| `scripts/extract_pfr_ncbr.py` | **New** (PL) |
| `scripts/extract_eifo_innovationsfonden.py` | **New** (DK) |
| `scripts/extract_wallonia_ndb.py` | **New** (BE Wallonia, small) |
| `scripts/extract_digital_europe.py` | **New** (DEP) |
| `scripts/extract_eic_fund_equity.py` | **New** (EIC Fund — UPDATE pattern, not INSERT) |
| `scripts/classify.py` | Import new NDB SOURCE_SECTOR dicts; add `digital_europe` source-family routing |
| `analysis/views.sql` | New `v_access_map` view |
| `analysis/run.py` | Sankey data rollup; access-map distribution |
| `docs/methodology.md` | Consolidated 3-layer access-map section; final coverage table; decision log |
| `docs/notes.md` | Day 16 entry |
| `site/app/access-map/page.tsx` | **New**: Sankey + top-supported-companies |

---

## Validation gates

| Gate | Criterion |
|---|---|
| G1 Baseline | `sanity_check.py` clean post-Sprint 13 |
| G2 Tier 2 NDB loads | Each institution within ±30% of estimate; `deployment_country` set correctly |
| G3 DEP volume | DEP grant sum in €3-5B range; sub-programme distribution sensible |
| G4 EIC Fund equity | ~300-500 existing EIC events now have non-NULL `equity_amount_eur`; total EIC equity in €1.5-3B range |
| G5 No equity > cost | Zero events with `equity_amount_eur > total_project_cost_eur` |
| G6 Access-map view | `v_access_map` populated; spot-check 20 companies for correct channel flags |
| G7 Site | `/access-map` page renders; Sankey diagram coherent; top-20 list sensible |
| G8 Coverage % | Methodology updated to ~85-90% coverage of company-direct identifiable EU strategic universe |

---

## Expected corpus growth (rough estimates)

| Workstream | New events | New companies (post-dedup) |
|---|---:|---:|
| PMV | ~120-180 | ~80-130 |
| AWS + FFG | ~600-900 | ~400-650 |
| PFR + NCBR | ~500-800 | ~350-600 |
| EIFO + Innovationsfonden | ~300-500 | ~200-350 |
| Wallonia NDBs | ~80-150 | ~60-120 |
| **Tier 2 NDB subtotal** | **~1,600-2,530** | **~1,090-1,850** |
| Digital Europe Programme | ~3,000-7,000 | ~1,000-2,500 |
| EIC Fund equity (UPDATEs + few inserts) | ~0-30 inserts, ~300-500 updates | ~0-30 |
| **Grand total** | **~4,600-9,560 (inserts)** | **~2,090-4,380** |

**Sprint 14 corpus target: ~17,500-22,000 companies / ~55,000-62,000 events.** Total EU strategic capital tracked: ~€155-180B.

---

## Execution order

**C → B → A.** Reasoning:
- **EIC Fund equity (C) first** — biggest data-quality wins, smallest event-count change. Closes the longest-standing gap. Loading first means downstream rollups already reflect corrected EIC totals.
- **Digital Europe Programme (B) second** — clean CORDIS-style ingestion, biggest single new-data win.
- **Tier 2 NDBs (A) last** — heterogeneous extraction (Polish PDFs, Danish JSON, Flemish HTML), highest risk of needing per-institution debugging. Doing last means main analytical numbers don't move while debugging tier-2 quirks.

Each step: `classify.py` + `sanity_check.py` + `audit_dedup.py --report` between extractions.

---

## Out of scope (explicit)

- **Pillar I**: ERC, MSCA, RI — confirmed out of scope across the access-map study.
- **Member-state RRF-funded national programmes** that don't channel through an NDB (e.g. national grant calls administered directly by ministries). Data quality varies wildly and would balloon scope.
- **Tax credits and R&D tax incentives** (France CIR, UK pre-Brexit, Belgian innovation income deduction). Different instrument class; not company-direct grant/equity.
- **Norwegian, Swiss, UK** institutions (non-EU geography post-Brexit).
- **Hungarian Development Bank, Bulgarian Development Bank, Romanian EximBank, Slovak SZRB**: documented sub-threshold or sparse-disclosure exclusions.
- **Regional Italian fondazioni, German Land-banks** (NRW.BANK, LfA, IBB Berlin): regional scale; sub-threshold individually; methodology mentions them as known exclusions.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| EIC Fund portfolio page restructures | Cache the raw HTML on first fetch; if page goes 404 mid-sprint, work from cache + manual review. |
| EIC Fund equity match ambiguity (same company name, different country, possible match) | Strict matcher: requires name + country match OR PIC match. Ambiguous cases go to a human-review CSV, not auto-applied. |
| DEP and Horizon Pillar II CL4 confused at company level | DEP `source` prefix is distinct; sub-programme tagging is distinct. Same company appearing in both is expected and valid (different events, different instruments). |
| Tier 2 NDB portfolio coverage gaps | Document per-institution coverage % in methodology; don't claim "complete" where the source publishes partial data. |
| Equity field becomes mixed-meaning (some equity_amount_eur values are NDB direct, some EIC Fund) | `grant_amount_basis` disambiguates. Document analytical aggregation rules clearly. |
| Sankey diagram becomes unreadable with too many access-map combinations | Group access-map combinations into 5-7 canonical patterns ("EU-only", "EU + national equity", "EU + national grant", "IPCEI + national + EU", etc.) rather than enumerating all 2^N. |
| Coverage % overclaim | Recompute denominator after final load. If actual coverage is lower than 85%, update methodology rather than the other way around. |

---

## Definition of done

- Tier 2 NDBs loaded with per-institution caveats documented.
- Digital Europe Programme loaded across all 5 sub-programmes.
- EIC Fund equity backfilled — `equity_amount_eur` non-NULL for ~300-500 EIC Accelerator events.
- `/access-map` site page renders with Sankey diagram and top-20 fully-supported companies.
- `docs/methodology.md` final version of the 3-layer access map with explicit decision log.
- Memory file `project_sprint_14_access_map.md` written.
- MEMORY.md index updated.
- Coverage estimate at ~85-90% of company-direct identifiable EU strategic universe — clearly stated with denominator math.
- **The dataset is now publication-ready for the "European strategic-resilience access map" narrative.** Sprint 10 (Dealroom private follow-on) becomes the next-most-valuable augmentation.
