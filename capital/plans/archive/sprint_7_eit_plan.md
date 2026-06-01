# Sprint 7 plan — EIT Digital + EIT Manufacturing portfolios

**Purpose of this doc**: a self-contained brief for a fresh Claude session to execute the EIT KIC load without needing to re-derive context. Read top-to-bottom before touching code.

**Owner of this sprint**: Claude Sonnet, executing against `/Users/asgermollergrimberg/EuroInvTracker/files/`.

**Status**: Step 0 (discovery) is **already done in-band** — see `## Step 0 findings` below. Ready for code execution.

---

## TL;DR

Load company-facing EIT KIC funding/support events from **EIT Digital** and **EIT Manufacturing** (the two of the eight KICs that publish portfolios scrape-friendly without Dealroom) into the existing SQLite DB. Expected size: **~75–150 portfolio companies** across both KICs. The other 6 KICs are deferred:

- **EIT InnoEnergy** and **EIT Health** — both publish portfolios via Dealroom (898 startups on the EIT Health Dealroom list; InnoEnergy has its own Dealroom investor profile at `app.dealroom.co/investors/kic_innoenergy`). **Loading them now would mean scraping Dealroom twice** — once here and once in Sprint 9. Defer to Sprint 9 where Dealroom enrichment runs natively.
- **EIT Climate-KIC, EIT Food, EIT Raw Materials, EIT Urban Mobility, EIT Culture & Creativity** — varied publication formats; deferred to a possible future mini-sprint conditional on portfolio publication.

Schema needs **no migration**. Sprint 7 introduces three new `grant_amount_basis` labels (`eit_kic_grant`, `eit_kic_equity`, `eit_kic_support`) and a new `role` value (`portfolio_company`).

End state: corpus grows from **3,020 companies / 4,870 events** to roughly **3,100–3,170 companies / 4,950–5,020 events**. Heavy expected overlap with EIC Accelerator (≥30% — graduation pipeline). Classifier re-run yields zero `unclassified`.

**Why this scope** (different from earlier draft of the plan):
- Discovery (below) showed InnoEnergy/Health portfolios are Dealroom-hosted — scraping them in Sprint 7 duplicates Sprint 9 work
- EIT Manufacturing ceased operations as ASBL on 10 April 2026 → its portfolio is a frozen snapshot worth capturing while still online
- EIT Digital rebranded to "28digital" → portfolio page is partially broken but annual Champions cohorts are scrapeable from news pages
- This honest-scope sprint is ~1.5 days of work, not the 3+ days the original 4-KIC plan would have required

---

## Step 0 findings (already done — do NOT re-discover)

### EIT Digital — `28digital.eu`

- **Status**: EIT Digital was rebranded to **28digital** in 2025; old URLs (`eitdigital.eu/*`) 301-redirect to `28digital.eu/*`.
- **Portfolio page (`/accelerator/scaleup-portfolio/`)**: **404 on new domain.** A PDF brochure exists on the old domain (`https://www.eitdigital.eu/accelerator/scaleup-portfolio/` returns a PDF) but is not authoritative as a current list.
- **Best data source**: per-year **EIT Digital Champions** announcement pages on `28digital.eu/newsroom/news/<year>/`. Each year publishes a HTML page with the winning cohort (~8–13 companies), name + country + sector/description visible.
- **Known cohort URLs (verified 2026-05-21)**:
  - 2025 Champions (8 cos): `https://28digital.eu/newsroom/news/2025/the-eit-digital-champions-arise-once-more/`
  - 2024 Champions (13 cos): `https://28digital.eu/newsroom/news/2024/the-eit-digital-champions-have-arisen/`
  - 2023, 2022, 2021 Champions: search `28digital.eu/newsroom/news/<year>/` for "Champions" — URLs vary, sprint runner must discover per year
- **Plus** the EIC – EIT Digital Venture Acceleration Programme (2022, 10 winners): `https://www.eitdigital.eu/newsroom/news/2022/eic-eit-digital-venture-acceleration-programme-10-winners-that-will-receive-scaleup-support/` (redirects to 28digital.eu)
- **Expected total events (2021–2025)**: ~50 Champions + ~10 VAP winners = **~60 events**.
- **Data fields available**: company name, country, brief sector/description. **No funding amounts** (Champions get coaching/visibility support, not cash awards). Default `grant_amount_basis='eit_kic_support'` with NULL amounts.
- **Per-company URL**: most listings link to external company sites (not Dealroom IDs). Will need fuzzy/prefix matching against existing DB.

### EIT Manufacturing — `eitmanufacturing.eu`

- **Status**: **EIT Manufacturing ASBL ceased operations on 10 April 2026.** Regional offices (East/Vienna, West/San Sebastian, South/Milan, North/Gothenburg) remain operational. Website is in winding-down mode but pages are still online.
- **Best data source**: `https://www.eitmanufacturing.eu/investment-portfolio/` — **23 companies listed as HTML cards** (verified 2026-05-21). Each has: name, tagline, description, "Discover" link.
- **PitchBook reports 52 total investments** (more than the 23 on-site) — there's a discovery gap. The on-site list is likely "active/non-exited" while PitchBook shows the full history. **Decision**: use the 23 on-site as the primary set; add a methodology caveat about the discrepancy.
- **BoostUp! competition winners**: separate from investments. Annual cohorts (2022, 2023, 2024, 2025) each had ~8 winners receiving €20K–€50K prizes. URLs vary per year (e.g. `boostup-east-2025`, `boostup-2024`) — sprint runner must discover and scrape per year. **Expected BoostUp! events 2021–2025**: ~30–40.
- **Combined expected EIT Manufacturing events**: **~50–60**.
- **Data fields**: name + country (sometimes implicit from regional office); funding type varies (equity for investments, cash prize for BoostUp!). Map: investments → `grant_amount_basis='eit_kic_equity'` with NULL `equity_amount_eur` (most are undisclosed); BoostUp! prizes → `eit_kic_grant` with the published cash amount.
- **Discovery contact**: `investments@eitmanufacturing.eu` — only as a last resort.

### EIT InnoEnergy — deferred to Sprint 9

- Portfolio at `https://innoenergy.com/portfolio/` is JS-rendered, no scrape-friendly HTML.
- Has Dealroom investor profile: `https://app.dealroom.co/investors/kic_innoenergy` (paywalled).
- Crunchbase Hub profile (paywalled): `https://www.crunchbase.com/hub/eit-innoenergy-portfolio-companies`
- 160+ portfolio companies. Loading via Sprint 9 Dealroom enrichment is the clean path.

### EIT Health — deferred to Sprint 9

- Portfolio at `https://startups.eithealth.eu/` — Dealroom-hosted, returns 403 to WebFetch (CloudFlare bot protection).
- 897 startups in the database.
- Loading via Sprint 9 Dealroom enrichment with an `investor` / `tag` filter for "EIT Health" is the clean path.

---

## Assumptions baked in (override at top of session if wrong)

1. **Time window**: 2021–2026-05-21. Match the existing corpus' upper bound.
2. **In-scope KICs**: EIT Digital + EIT Manufacturing only (this sprint). Others deferred per Step 0 findings.
3. **In-scope event types for EIT Digital**: Champions cohorts 2021–2025 + VAP 2022. Excludes general accelerator portfolio (broken page; deferred to a possible later mini-sprint).
4. **In-scope event types for EIT Manufacturing**: the 23 investment portfolio companies + BoostUp! winners 2021–2025.
5. **Funding-event semantics**:
   - Champions / VAP support → `grant_amount_basis='eit_kic_support'`, both amount columns NULL
   - BoostUp! cash prizes → `grant_amount_basis='eit_kic_grant'`, populate `grant_amount_eur` (€20K or €50K per published rules)
   - Investment portfolio (equity tickets) → `grant_amount_basis='eit_kic_equity'`, populate `equity_amount_eur` ONLY if explicitly disclosed; otherwise NULL with `notes_event` indicating undisclosed
6. **`role` field**: `'portfolio_company'` for all rows (new role value, mirrors prior loaders' convention).
7. **`coordinator_only`**: `1` for all EIT rows.
8. **Source naming**: `eit_digital_champions_<year>`, `eit_digital_vap_2022`, `eit_manufacturing_investments`, `eit_manufacturing_boostup_<year>`. One row per (company, programme-instance).
9. **Sector inference**: `EIT_KIC_SOURCE_SECTOR` maps `eit_digital_*` → `digital`, `eit_manufacturing_*` → `deeptech_hardware`. Per-company sector still goes through the standard classifier; the source-sector dict is the fallback when `sector_tags_raw` is empty (which it will be for most EIT rows — descriptions are free text, not tagged).
10. **Schema migration**: NONE in the DB. **One non-migration code change**: `public_funding_events` needs a `notes` column OR we use the existing `project_summary` field for free-text per-event notes (e.g. "equity amount undisclosed"). **Decision**: reuse `project_summary` — keeps schema unchanged. The classifier already reads `project_summary` for keyword fallback, which is fine.
11. **Raw data**: not yet acquired. Step 1 is acquisition.

---

## Context the next session needs

### What exists in the repo

- `db.sqlite` — **3,020 companies, 4,870 events**.
- [schema.sql](schema.sql) — current schema with `coordinator_only`, `grant_amount_basis`, `classify_audit`.
- [extract_innovation_fund.py](extract_innovation_fund.py) — cleanest template. HTML/PDF scraping + `CALL_TO_SOURCE` mapping + derived source-sector dict.
- [extract_chips_ju.py](extract_chips_ju.py) — simpler if structured data is available (JSON/API).
- [extract_edf.py](extract_edf.py) — has `--sleep=N` rate-limit pacing + `_is_real_pdf()` magic-byte cache check. Reuse the sleep/curl pattern.
- [extract_eib.py](extract_eib.py) — fuzzy/prefix matching when PIC absent (EIT companies won't have PICs).
- [classify.py](classify.py) — idempotent + audit log. Add `from extract_eit import EIT_KIC_SOURCE_SECTOR` next to the IF/Chips JU imports.
- [sanity_check.py](sanity_check.py) — DQ gates already in place; add an EIT section before the cross-cutting DQ.

### What is already in memory (read these before starting)

- `project_eib_workarounds.md` — SSL curl pattern.
- `project_innovation_fund_workarounds.md` — coordinator-only capture caveat (EIT inherits this same caveat).
- `project_chips_ju_workarounds.md` — prefix-match tier critical for short-name aliases (EIT alumni will match EIC short-names).
- `project_edf_workarounds.md` — rate-limiting and `--sleep` pacing pattern.

---

## Step-by-step plan

### Step 1 — Skeleton `extract_eit.py`

Create file with:
- `EIT_KIC_SOURCE_SECTOR` dict: `{'eit_digital_champions_2021': 'digital', ..., 'eit_manufacturing_investments': 'deeptech_hardware', ...}`. Derive from a `CALL_TO_SOURCE` mapping (mirror `extract_innovation_fund.py` and `extract_chips_ju.py`).
- Subprocess curl helper (reuse the SSL pattern from `extract_eib.py`).
- `_is_real_html()` check (mirror EDF's magic-byte pattern, just for HTML).
- `parse_eit_digital_cohort(html, year)` → list of dicts
- `parse_eit_manufacturing_investments(html)` → list of dicts
- `parse_eit_manufacturing_boostup(html, year, region)` → list of dicts

### Step 2 — Fetch and parse EIT Digital cohorts

For each year 2021–2025:
- Discover the Champions URL from `28digital.eu/newsroom/news/<year>/` (search for "Champions" in titles)
- Fetch HTML (with `--sleep=2`)
- Parse to extract (company_name, country, description)
- Set fields: `source='eit_digital_champions_<year>'`, `role='portfolio_company'`, `coordinator_only=1`, `grant_amount_basis='eit_kic_support'`, `grant_amount_eur=NULL`, `equity_amount_eur=NULL`
- Also fetch VAP 2022 page (URL above)

### Step 3 — Fetch and parse EIT Manufacturing

- Fetch `https://www.eitmanufacturing.eu/investment-portfolio/` — parse 23 investment cards
- For each: `source='eit_manufacturing_investments'`, `grant_amount_basis='eit_kic_equity'`, NULL equity_amount_eur, `project_summary` notes "amount undisclosed"
- For each year 2021–2025, discover BoostUp! URLs (regional: East/West/South/North; some years have one combined call, others split) and parse
- BoostUp! winners: `source='eit_manufacturing_boostup_<year>'`, `grant_amount_basis='eit_kic_grant'`, `grant_amount_eur=20000` or `50000` per published rules (verify in each year's page)

### Step 4 — Match and load

- Use the 5-tier matcher pattern from `extract_chips_ju.py` (exact name+country → name-only → prefix → fuzzy → new). EIT companies have no PICs — heavy reliance on name matching.
- Insert with all the Day-8 fields: `coordinator_only=1`, `grant_amount_basis=<per row>`, `match_method='none'` for new inserts.
- Idempotent on `(source, call_id)` where `call_id` is a stable per-event ID — recommend `<source>_<slugified_company_name>` since EIT URLs are unstable.

### Step 5 — Wire `EIT_KIC_SOURCE_SECTOR` into `classify.py`

One-line import + add to the existing `for src in sources` source-sector fallback block.

### Step 6 — Add EIT section to `sanity_check.py`

Mirror the existing per-source sections (events by source, by country, multi-instrument winners), placed before the cross-cutting DQ section.

Also extend the `allowed basis labels` allowlist in DQ query #2 from 6 to 9 labels (adding `eit_kic_grant`, `eit_kic_equity`, `eit_kic_support`).

### Step 7 — Run + validate

```bash
python3 extract_eit.py --load-db --sleep=2
python3 classify.py
python3 sanity_check.py | tee /tmp/sanity_after_eit.txt
```

**Validation gates** (all must pass):
1. `events with NULL coordinator_only`: 0
2. `events with NULL grant_amount_basis`: 0
3. `events with unknown basis label`: 0 (after the allowlist update in Step 6)
4. EIT Digital events: 50–70; EIT Manufacturing events: 50–80; combined: 100–150
5. classify_audit shows ~75–120 first-time assignments (new EIT companies), small number (<10) of legitimate sector flips
6. **EIT × EIC overlap check** — soft gate: target ≥20% of EIT Digital Champions to overlap with EIC Pathfinder/Accelerator/Transition coordinators. If < 10%, debug matching (likely a name-normalisation issue). Document actual figure regardless.
7. Total companies in DB grows by 70–130 (the rest are matches to existing).
8. Zero orphans, zero unclassified, zero stale sector timestamps.

### Step 8 — Documentation updates

In order:
1. `methodology.md` — flip EIT KICs row to ✅ **(partial — Phase 1, Digital + Manufacturing only; other 6 KICs deferred or pending)**; add a `## EIT KIC extraction` section explaining the scope choice and the basis labels.
2. `notes.md` — Day 9 section with per-KIC numbers, multi-instrument overlap stats.
3. `README.md` — flip EIT row to ✅ (partial), update total company count, add `python3 extract_eit.py --load-db --sleep=2` to run section.
4. `schema.sql` — confirm `grant_amount_basis` comment includes the 3 new labels.
5. Memory: add `project_eit_workarounds.md` with: per-cohort URL discovery pattern, EIT-Digital→28digital rebrand, EIT-Manufacturing ASBL closure, deferred-to-Sprint-9 KICs.

---

## Risks and decisions to flag at the start of the next session

| Risk | Mitigation | Owner |
|---|---|---|
| 28digital.eu URLs unstable after EIT-Digital rebrand | Discovery-per-year (Step 2). Cache HTML to `data/raw/eit/digital/<year>.html` for reproducibility | Runner |
| EIT Manufacturing pages going dark (ASBL closed) | Snapshot HTML to `data/raw/eit/manufacturing/` on first run; idempotent re-load works from cache | Runner |
| Champions cohorts for 2021/2022/2023 may have different page structures than 2024/2025 | Each year gets its own per-page parser if needed; don't try to unify too early | Runner |
| EIT-Digital Champions include UK/Israel — non-EU but EIT-supported | Keep all (do not EU-filter); EIT explicitly supports non-EU participation in some cases. Document in methodology | Runner |
| BoostUp! prize amounts vary by year (€20K vs €50K) | Read published rules per year; default €20K if unclear, note in `project_summary` | Runner |
| 23 investments on EIT Manufacturing's page vs 52 on PitchBook | Use the 23. Document the discrepancy in `project_eit_workarounds.md` | Runner |
| Overlap with future Sprint 9 Dealroom data — duplicate company rows risk | Use the existing 5-tier matcher; new rows only when no match. Sprint 9 will then enrich via Dealroom ID. | Automatic |
| Some EIT Digital Champion company names are generic (e.g. "Macaron") and could prefix-match wrong existing rows | Same-country tier on prefix matching prevents most false positives; spot-check the prefix-match summary | Runner |

## Out of scope (do NOT do this sprint)

- EIT InnoEnergy, EIT Health (load via Sprint 9 Dealroom)
- EIT Climate-KIC, Food, Raw Materials, Urban Mobility, Culture (defer)
- EIT Digital general accelerator portfolio (only Champions + VAP this sprint)
- Linking EIT alumni to private funding rounds (Sprint 9)
- PADR/EDIDP-era predecessor programmes
- Touching the 4 still-rate-limited EDF 2025 URLs (background task)
- Adding a `notes` column to `public_funding_events` (reuse `project_summary` instead)
