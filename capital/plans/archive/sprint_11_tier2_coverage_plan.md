# Sprint 11 plan — Tier 2 coverage (CHP + IHI JU + EuroHPC JU + EIT backfill)

**Owner**: Claude (next session), executing against `/Users/asgermollergrimberg/EuroInvTracker/`.

**Status**: Not started. Follows Sprint 10 (3,561 companies / 5,484 events).

**Purpose**: Extend the corpus to the three deferred Horizon Europe partnerships (CHP, IHI JU, EuroHPC JU) and resolve the residual thin-source EIT gaps that Sprint 10 couldn't reach with static WebFetch. All on Option A (coordinator-only) convention.

---

## TL;DR for a fresh Claude session

Four workstreams. Three add new sources; one finishes Sprint 10's loose ends.

- **A — Clean Hydrogen Partnership (CHP)**: `scripts/extract_chp.py`. CORDIS topic-code enumeration over `HORIZON-JTI-CLEANH2-YYYY-NN-NN` (verified accessible 2026-05-25). Coordinator-only.
- **B — IHI JU (Innovative Health Initiative)**: `scripts/extract_ihi.py`. CORDIS topic-code enumeration over `HORIZON-JU-IHI-YYYY-NN`. Successor to IMI2 JU. Coordinator-only. Methodology flagged this as the strongest deferred HE partnership candidate.
- **C — EuroHPC JU**: `scripts/extract_eurohpc.py`. CORDIS topic-code enumeration over `HORIZON-EUROHPC-YYYY-NN` plus pre-existing `EUROHPC-2020`+ calls if accessible. Same Option A pattern as Chips JU.
- **D — EIT thin-source backfill**: Three sub-tasks that need a real browser or alternative URL paths — (1) EIT InnoEnergy full portfolio via Playwright/Selenium against innoenergy.com/for-innovators/portfolio/ (target 160+); (2) EIT RawMaterials portfolio via alternative routes (eitrawmaterials.eu was 404; try EIT website / EU-Startups); (3) EIT Health Catapult Edition 5 (2020–21 cycle, currently 0 rows under `eit_health_catapult_2021`).
- **E — Incremental refresh of existing sources**: All idempotent re-runs of extractors built in earlier sprints. (1) `chips_ju_kdt_2023` was explicitly documented as incomplete (4/~25 projects, €38M/~€240M) — portal should be populated now; (2) Chips JU 2024+ Chips Act–era calls (Sprint 5 said "not yet published"; check OData `shv_jueratype` enum for new value); (3) Innovation Fund IF25 cohort — Sprint 4 excluded pending grant signatures; now signed; (4) IF 2024 cohorts with NULL grant amounts (4–7 fiches were unpublished at Sprint 4 cut); (5) EDF 2025 second-pass (4 rate-limited URLs); (6) EIB venture-debt incremental (last loaded 2026-04-14, ~6 weeks behind).

**Out of scope for Sprint 11** (user-confirmed 2026-05-25):
- HE Pillar 2 Cluster grants (consortium-partner pattern, weak signal)
- ECSEL JU 2014–2020 (pre-period; would require time-window expansion)

**Conditional / stretch**:
- Eurostars retry via EU Funding & Tenders Portal (Tier 2 candidate, still listed in methodology but not user-prioritised). Include only if A/B/C/D finish under budget.
- EIC Fund equity portfolio: stays Tier 2 until EIC publishes a structured export.

---

## Scope decisions (locked before scripting)

1. **Time window unchanged**: 2021–2026. Filter to `project_started >= 2021-01-01`. For IHI JU, IMI2 predecessor projects (pre-2021) are out of scope; explicit cutoff at IHI JU's first call in 2022.
2. **Coordinator only (Option A)**: same convention as IF / Chips JU / EDF / CHP.
3. **Source IDs**:
   - `chp_<year>` (one per call year 2022–2025; HI2 Valley 2024 confirmed at €19.9M).
   - `ihi_<year>` (2022–2025).
   - `eurohpc_<year>` (2021–2025).
4. **`grant_amount_basis`**: `chp_grant`, `ihi_grant`, `eurohpc_grant`. Each new source family exports its `*_SOURCE_SECTOR` dict for `classify.py` to import (same single-source-of-truth pattern as IF/Chips JU/EDF/EIT).
5. **Sector defaults**: CHP → `cleantech`; IHI → `life_sciences`; EuroHPC → `deeptech_hardware`.
6. **No DB writes until each extractor validates clean in CSV mode.** `--load-db` only after the row counts and per-source grant totals look right.
7. **EIT backfill stays inside `scripts/extract_eit.py`** — new hardcoded list constants for InnoEnergy full portfolio / RawMaterials / Health Catapult Ed 5. Playwright is acceptable if needed for the InnoEnergy scrape; the harvested list is then hardcoded just like Sprint 10 entries.

---

## Pre-flight

1. Confirm DB baseline: `sanity_check.py` clean, 3,561 companies / 5,484 events.
2. Back up: `cp db.sqlite db_backups/db.sqlite.backup_pre_sprint11`.
3. Verify CORDIS per-project pages still render — fetch `https://cordis.europa.eu/project/id/101137799` (CLEANER) as a smoke test.
4. Install Playwright (for the InnoEnergy backfill): `pip install playwright --break-system-packages && playwright install chromium`. Confirm headless mode works on Darwin.

---

## Workstream A — Clean Hydrogen Partnership

### Step A0 — Topic-code enumeration

CORDIS structures CHP funding under topic codes `HORIZON-JTI-CLEANH2-{year}-{pillar}-{topic}`. Sprint 10 verified:
- `HORIZON-JTI-CLEANH2-2023-04-01` (CLEANER, SINTEF NO, €3.9M, 2024 start)
- `HORIZON-JTI-CLEANH2-2024-06-01` (HI2 Valley, WIVA P&G AT, €19.9M, 2025 start)

Approach: scrape the CORDIS programme-id pages — `https://cordis.europa.eu/programme/id/HORIZON_HORIZON-JTI-CLEANH2-{year}-{pillar}-{topic}` — each lists the projects funded under that topic. CHP publishes a Work Programme PDF per year that lists all topic codes — pull from `clean-hydrogen.europa.eu` if still 404, else search "CHP Annual Work Programme {year} PDF".

Fallback: if topic-by-topic enumeration is too brittle, scrape `https://cordis.europa.eu/projects/en?q=programme/code='HORIZON-JTI-CLEANH2'` with pagination. WebFetch returned only the header on the search URL in Sprint 10 — try with explicit `&format=json` or `&data=true` query parameters first.

### Step A1 — Build `scripts/extract_chp.py`

Schema mapping:

| Field | Value |
|---|---|
| `source` | `chp_{year}` |
| `role` | `direct` |
| `project_number` | CORDIS project ID (e.g. `101137799`) |
| `project_title` | CORDIS title |
| `project_started` | start date |
| `grant_amount_eur` | EU contribution |
| `sector_tags_raw` | `"Hydrogen, {topic_area}"` — leading `"Hydrogen"` triggers `CLEANTECH_TAGS` |
| `grant_amount_basis` | `chp_grant` |
| `raw_source_url` | `https://cordis.europa.eu/project/id/{project_number}` |

Coordinator-country derivation: CORDIS project pages name the coordinator country explicitly — single-tier lookup.

Company matching: same 5-tier matcher (exact name+country → exact name-only → forward prefix → reverse prefix → fuzzy ≥0.92 → new insert, `match_method='chp'`).

Export `CHP_SOURCE_SECTOR` dict. Replace the existing stub import in `classify.py`.

### Step A2 — Load and validate

```bash
python scripts/extract_chp.py            # CSV-only first
python scripts/extract_chp.py --load-db
python scripts/classify.py
python scripts/sanity_check.py
```

Validation gate: grant sum within ±15% of the published annual CHP call budget (e.g. ~€300M for 2022 wave, ~€200M for 2023). If significantly under, log which topic codes failed to resolve.

---

## Workstream B — IHI JU

### Step B0 — Discovery

IHI JU (Innovative Health Initiative) replaced IMI2 JU under Horizon Europe. First IHI call was IHI-2022. Topic codes: `HORIZON-JU-IHI-2022-XX`, `HORIZON-JU-IHI-2023-XX`, etc.

Source to check: `https://www.ihi.europa.eu/projects-results` (or via CORDIS topic enumeration if site uses heavy JS). The IHI annual work plan PDFs list all calls per year.

### Step B1 — Build `scripts/extract_ihi.py`

Same schema pattern as CHP. Differences:
- `source` = `ihi_{year}`
- `sector_tags_raw` = `"Health Biotechnology, {therapeutic_area}"` (the leading tag triggers `LIFE_SCIENCES_TAGS`)
- `grant_amount_basis` = `ihi_grant`

Export `IHI_SOURCE_SECTOR` (all → `life_sciences`).

### Step B2 — Load and validate

```bash
python scripts/extract_ihi.py
python scripts/extract_ihi.py --load-db
python scripts/classify.py
python scripts/sanity_check.py
```

Validation gate: ±15% of published per-call IHI budget. IHI is large multi-partner consortia with hospitals/universities as coordinators; expect a higher `entity_type=research_org` proportion than Chips JU.

---

## Workstream C — EuroHPC JU

### Step C0 — Discovery

EuroHPC operates two streams:
- **Infrastructure** (procurement of pre-exascale/exascale supercomputers; LUMI, LEONARDO, MareNostrum5 etc.) — out of scope by Tier 3 principle (these are member-state consortia receiving infrastructure subsidies, not company R&D grants).
- **R&I projects** under `HORIZON-EUROHPC-JU-YYYY-XX` topic codes — IN SCOPE. These fund applications, software, training, energy efficiency.

CORDIS topic-code enumeration over `HORIZON-EUROHPC-JU-{year}`. Also predecessor `EUROHPC-2020-*` calls (last calls under H2020 framework — verify whether project_started falls inside the 2021+ window; load only those that do).

### Step C1 — Build `scripts/extract_eurohpc.py`

Schema mapping similar to Chips JU (semiconductors → HPC). Sector: `deeptech_hardware`.
- `source` = `eurohpc_{year}`
- `sector_tags_raw` = `"HPC, {topic_area}"` — `"HPC"` to be added to `DEEPTECH_TAGS` in `classify.py` (mirrors the `"Semiconductors"` addition in Sprint 5).
- `grant_amount_basis` = `eurohpc_grant`

### Step C2 — Load and validate

```bash
python scripts/extract_eurohpc.py
python scripts/extract_eurohpc.py --load-db
python scripts/classify.py
python scripts/sanity_check.py
```

Validation gate: cross-instrument overlap with Chips JU expected (CEA, IMEC, Atos/Eviden, BSC are likely in both). Spot-check 3–5 multi-instrument winners.

---

## Workstream D — EIT thin-source backfill

### Step D1 — EIT InnoEnergy full portfolio (Playwright)

The static WebFetch returned only 4 feature companies from `innoenergy.com/startups/` and 0 from `/for-innovators/portfolio/`. The full 160+ portfolio is JS-rendered.

Approach:
1. `pip install playwright && playwright install chromium`
2. Write a one-shot scraper `scripts/scrape_innoenergy_portfolio.py` that:
   - Launches headless Chromium
   - Navigates to `https://www.innoenergy.com/for-innovators/portfolio/`
   - Waits for the portfolio grid to render
   - Clicks "Load more" or scrolls to load all entries
   - Extracts company name + country + description
3. Output to a temp JSON file
4. Manually review for sanity, then hardcode into a new `EIT_INNOENERGY_PORTFOLIO_BACKFILL` list in `extract_eit.py` (one-time addition, dedup against existing `EIT_INNOENERGY_HIGHWAY_*` entries).

Target: 100+ additional unique companies on top of the 38 already loaded.

### Step D2 — EIT RawMaterials portfolio

Try these sources in order:
1. `https://eitrawmaterials.eu/start-up-portfolio/` (was 404 in Sprint 10 — retry; may have been a transient)
2. `https://www.eit.europa.eu/our-communities/eit-rawmaterials` portfolio link
3. The EIT RawMaterials annual reports / Summit pitch decks (PDFs)
4. EU-Startups directory entry for EIT RawMaterials
5. Crunchbase Hub Profile for EIT RawMaterials portfolio

Target: 20+ companies (up from 8 currently).

### Step D3 — EIT Health Catapult Edition 5 (2020–21 cycle)

Search for press releases naming Edition 5 finalists. The 2020 finals were COVID-disrupted; winners may have been announced in early 2021. Try:
- `https://eithealth.eu/wp-content/uploads/2021/` annual report PDFs
- Press search "EIT Health Catapult 2020 finalists"
- Edition 5 = 2019–20 cycle if numbering is off-by-one — verify via the Sprint 7 mapping note.

If no public list is recoverable, document in notes.md and leave `eit_health_catapult_2021` as an intentionally empty source. Don't fabricate.

---

## Workstream E — Incremental refresh of existing sources

All idempotent re-runs against extractors built in Sprints 3–7. Goal: pick up data the earlier sprints couldn't reach because (a) portals were being populated, (b) grant agreements weren't signed yet, or (c) network rate-limits truncated the pull.

### Step E1 — Chips JU re-run (KDT-2023 + Chips Act era)

The Sprint 5 OData endpoint is idempotent — re-running picks up newly-published projects without code changes.

```bash
python scripts/extract_chips_ju.py            # CSV check; compare to 35 baseline
python scripts/extract_chips_ju.py --load-db
```

Two expected gains:
1. **KDT-2023 completion**: current 4 events / €38M vs expected ~25 / ~€240M. Likely ~20+ new events.
2. **Chips JU 2024+ Chips Act calls**: Sprint 5 noted the portal's `shv_jueratype` enum had no Chips JU value yet (only KDT and ECSEL). Before running, inspect the raw JSON for a new `jueratype` value; if present, extend the filter clause in `extract_chips_ju.py`. If still KDT-only, document and move on.

Validation: per-call grant sum within ±10% of published budget; KDT-2023 should land near €240M to clear the gate.

### Step E2 — Innovation Fund IF25 + NULL refresh

Two sub-steps:

**E2a — IF25 cohort**: Sprint 4 deferred IF25 (calls 2024) because all projects were in "Invited to grant agreement preparation" status. Grants should now be signed (12+ months elapsed). Add new entries to `CALL_TO_SOURCE` in `extract_innovation_fund.py` for each IF25 sub-call (`innovation_fund_lsp_2025`, `innovation_fund_ssp_2025`, etc.) and pull the new fiches from climate.ec.europa.eu.

**E2b — Refresh NULL grants on 2024 cohorts**: 7 IF events were loaded with `grant_amount_eur=NULL` because the fiches weren't published at Sprint 4 time. Query: `SELECT call_id, raw_source_url FROM public_funding_events WHERE source LIKE 'innovation_fund%' AND grant_amount_eur IS NULL`. Retry the fiche URLs; update in-place via `UPDATE public_funding_events SET grant_amount_eur = ? WHERE call_id = ?`.

```bash
python scripts/extract_innovation_fund.py            # CSV check
python scripts/extract_innovation_fund.py --load-db
python scripts/classify.py                           # cleantech rollups
```

Validation: IF25 grant sums match published call-budget totals; NULL count drops from 7 to ≤2.

### Step E3 — EDF 2025 second-pass

Sprint 6 catalogued 285 EDF factsheet URLs but 4 EDF 2025 URLs remained rate-limited at sign-off. The extractor has a `--sleep=N` flag specifically for this case.

```bash
python scripts/extract_edf.py --sleep=30 --year=2025      # if year flag exists; else full re-run
python scripts/extract_edf.py --load-db
```

Validation: coverage moves from 55/59 (2025) to 59/59. If still rate-limited, increase sleep or run overnight.

### Step E4 — EIB venture-debt incremental

EIB publishes new loans on a rolling basis. Last `project_started` in DB is 2026-04-14; running the extractor picks up anything newer.

```bash
python scripts/extract_eib.py                  # idempotent — only inserts new project_numbers
python scripts/extract_eib.py --load-db
```

Validation: expect 5–20 new loans across the 6-week gap (typical EIB cadence is 2–5 new venture-debt loans per month).

### Step E5 — Re-run classify + sanity_check after each step

Don't batch — `classify.py` is fast and re-running after each extractor surfaces any sector regressions immediately.

```bash
python scripts/classify.py
python scripts/sanity_check.py
python scripts/audit_dedup.py
```

### Expected E-stream growth (rough estimates)

| Refresh | New events | Notes |
|---|---:|---|
| E1 Chips JU KDT-2023 fill | ~20 | Methodology gap explicitly documented |
| E1 Chips JU 2024+ (Chips Act) | 0–15 | Conditional on portal enum change |
| E2a IF25 cohort | ~40–80 | 5–7 sub-call tracks × ~8–15 awards each |
| E2b IF NULL refresh | 0 events (UPDATE only) | Drops NULL count |
| E3 EDF 2025 second-pass | ~4 | Rate-limited URLs |
| E4 EIB incremental | ~10–20 | Rolling cadence |
| **Subtotal** | **~75–140** | Refresh-driven |

---

## File manifest

| File | Action |
|---|---|
| `scripts/extract_chp.py` | **New**: CHP CORDIS extractor (Option A) |
| `scripts/extract_ihi.py` | **New**: IHI JU CORDIS extractor (Option A) |
| `scripts/extract_eurohpc.py` | **New**: EuroHPC JU CORDIS extractor (Option A) |
| `scripts/extract_eit.py` | Extend with InnoEnergy portfolio backfill + RawMaterials backfill + Health Catapult Ed 5 (if recoverable) |
| `scripts/classify.py` | Replace stubs with real imports for `CHP_SOURCE_SECTOR`, add `IHI_SOURCE_SECTOR` and `EUROHPC_SOURCE_SECTOR`; add `"Hydrogen"`/`"HPC"` tag entries if not already in CLEANTECH_TAGS/DEEPTECH_TAGS |
| `scripts/scrape_innoenergy_portfolio.py` | **New, one-shot**: Playwright scraper for InnoEnergy portfolio. Output is JSON consumed manually into `extract_eit.py`. Not part of the regular run sequence. |
| `scripts/extract_chips_ju.py` | **Refresh**: re-run; may need filter-clause extension if `shv_jueratype` enum has a Chips JU value now |
| `scripts/extract_innovation_fund.py` | **Refresh**: add IF25 sub-call entries to `CALL_TO_SOURCE`; retry NULL-grant fiche URLs |
| `scripts/extract_edf.py` | **Refresh**: second-pass with `--sleep=30` on EDF 2025 rate-limited URLs |
| `scripts/extract_eib.py` | **Refresh**: incremental for 2026-04-14 → now |
| `docs/methodology.md` | Source coverage table, HE coverage table (CHP / IHI / EuroHPC rows), decision log entry covering all five workstreams |
| `docs/notes.md` | Day 13 entry |

---

## Validation gates

| Gate | Criterion |
|---|---|
| G1 Baseline | `sanity_check.py` clean before any load (3,561 / 5,484) |
| G2 Dates | Zero `NULL project_started` after each `--load-db` run |
| G3 Sectors | Zero `unclassified` after `classify.py` re-run |
| G4 Dedup | `audit_dedup.py` stable; no new `merge` rows beyond the 2 existing `needs_human_review` |
| G5 Totals | Each new source's grant sum within ±15% of published programme totals, or gap documented |
| G6 Methodology | Source coverage table matches DB state; CHP / IHI / EuroHPC rows added |
| G7 Backfill | InnoEnergy total events ≥ 100; RawMaterials total events ≥ 20 OR documented as best-available |
| G8 Refresh | Chips JU KDT-2023 reaches ≥ 20 events OR portal still incomplete (documented); IF NULL grants drop from 7 to ≤ 2; EDF 2025 reaches 59/59 |

---

## Expected corpus growth (rough pre-discovery estimates)

| Source | New events | New companies |
|---|---:|---:|
| CHP | ~80–150 | ~70–130 |
| IHI JU | ~30–80 | ~25–70 |
| EuroHPC JU | ~40–100 | ~35–90 |
| EIT InnoEnergy backfill | ~100–130 | ~70–100 |
| EIT RawMaterials backfill | ~10–20 | ~10–20 |
| EIT Health Catapult Ed 5 | ~0–10 | ~0–10 |
| **Subtotal A–D (new sources)** | **~260–490** | **~210–420** |
| E1 Chips JU KDT-2023 + Chips Act | ~20–35 | ~15–30 |
| E2a IF25 cohort | ~40–80 | ~35–75 |
| E2b IF NULL refresh | 0 (UPDATE only) | 0 |
| E3 EDF 2025 second-pass | ~4 | ~4 |
| E4 EIB venture-debt incremental | ~10–20 | ~10–20 |
| **Subtotal E (refresh)** | **~75–140** | **~60–130** |
| **Grand total** | **~335–630** | **~270–550** |

Cross-instrument overlap will reduce net new company count. Refresh-stream is biased toward existing-company overlap (Chips JU, EIB, EDF, IF coordinators frequently appear elsewhere). The Sprint 11 corpus target after dedup is roughly **3,830–4,100 companies / 5,820–6,100 events**.

---

## Execution order

**E first, then A → B → C → D.** Reasoning: the refresh stream (E) is low-risk and high-confidence (idempotent re-runs of working extractors), so running it first lets us see corpus growth quickly and surfaces any environmental issues (rate limits, broken endpoints) before we invest in new extractors. Once E completes, build A/B/C/D on a known-good baseline.

Each workstream loads independently and re-runs `classify.py` + `sanity_check.py` before the next starts. The EIT backfill (D) can run in parallel with A/B/C if Playwright is functional.

If CORDIS topic-code enumeration proves brittle for any of A/B/C (e.g. WebFetch returning header-only pages again), the fallback is per-project lookup using the EU Funding & Tenders Portal's project search — slower but deterministic.

---

## Out of scope (explicit)

Per user decision 2026-05-25:
- **HE Pillar 2 Cluster grants** — consortium-partner pattern, weak direct-funding signal, would add tens of thousands of low-signal rows.
- **ECSEL JU (2014–2020)** — pre-period; loading would require expanding the project's 2021–2026 time window, which is a separate scope question.

Still deferred (not in this sprint, but tracked):
- Eurostars retry via EU Funding & Tenders Portal (Tier 2; revisit if A–D finish under budget)
- EIC Fund equity portfolio (pending EIC publishing a structured export)
- EU Missions, DEP, other HE partnerships (Tier 2 acknowledged, deprioritised)

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| CORDIS WebFetch returns header-only pages again | Use per-project ID lookup as fallback; enumerate topic codes from the work-programme PDFs |
| Playwright doesn't install cleanly on Darwin/Python 3.9 | Skip D1 and document InnoEnergy gap; D2/D3 don't need Playwright |
| IHI JU returns mostly research_org coordinators (universities/hospitals) | Expected — the analytical question for IHI is consortium-coverage, not company-coverage. Document the entity_type skew in methodology. |
| EuroHPC infrastructure-stream projects bleed into the R&I-stream filter | Add explicit topic-code allow-list at extractor level; project codes like `EUROHPC-2020-04-XX` (infrastructure) excluded by name pattern. |
| Cross-instrument duplicates surface as fuzzy-match misses | Same 5-tier matcher; document any new prefix/reverse-prefix tier additions in the decision log. |
