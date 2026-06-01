# Sprint 6 plan — European Defence Fund (EDF) extraction + `defense` taxonomy label

**Purpose of this doc**: a self-contained brief for a fresh Claude session to execute the EDF load AND the related sector taxonomy expansion (6 → 7 labels) without needing to re-derive context. Read top-to-bottom before touching code.

**Owner of this sprint**: Claude Sonnet, executing against `/Users/asgermollergrimberg/EuroInvTracker/files/`.

---

## Fast-start checklist (read first, then dive into the full plan)

1. **Step 0**: Discover the authoritative EDF awarded-project list per call. Stop and report back with chosen URLs, row-count estimate (Option A vs B), amount semantics, redaction profile, and the actual tag/category vocabulary used by the source (this drives Step 1c).
2. **Step 1**: Taxonomy revision FIRST. Add `defense` as the 7th label with priority `space > life_sciences > defense > cleantech > deeptech_hardware > digital > other`. Back up the DB. Run classifier baseline (no EDF data yet); review the retroactive flips and confirm they look defense before proceeding.
3. **Step 2**: Build `extract_edf.py` mirroring `extract_chips_ju.py`. Use `role='direct'` (matches IF/Chips JU precedent), `sector_tags_raw="Defense, {capability area}"`.
4. **Step 3**: Wire `EDF_SOURCE_SECTOR` import into `classify.py` (same pattern as IF and Chips JU).
5. **Step 4**: Add EDF section to `sanity_check.py`.
6. **Step 5**: Run, validate against 10 gates, document.

Expect ~150–250 events (Option A) and corpus growth to ~3,000–3,050 companies. If anything in Step 0 contradicts the assumptions in the next section, **stop and report back before coding**.

---

## TL;DR

This sprint has **two coupled deliverables**:

1. **Taxonomy revision (do FIRST, before any EDF code)**: introduce a 7th sector label `defense` in `classify.py`, position it in the priority order (`space > life_sciences > defense > cleantech > deeptech_hardware > digital > other`), and re-run the classifier across the existing 2,861 companies. Expected: 5–20 retroactive flips, mostly from EIC Pathfinder projects on military-adjacent research (secure comms, military photonics, dual-use sensors). Document the methodology change.

2. **EDF load**: extract European Defence Fund coordinator events from EDF 2021–2024 awarded-projects lists. Expected **~150–250 events** under Option A (coordinator only). Per-call project counts (61 / ~41 / ~54 / ~50 for 2021/2022/2023/2024) are **recall-based estimates from training data, NOT verified figures** — confirm against the official EDF publication in Step 0 before quoting them downstream. All `source='edf_<strand>_<year>'`, `role='direct'` (matches IF/Chips JU Option A precedent), `sector_inferred='defense'`. End state: corpus grows from 2,861 → ~3,000–3,050 companies; classifier re-run leaves zero `unclassified`; new `defense` sector populated with EDF coordinators + retroactively-flagged historical companies.

**Why this sprint and not EIT KICs, STEP, or Dealroom**:
- EDF forces the defense-label decision, which is methodology debt that compounds the longer it waits
- EIT KICs is the *largest* remaining load (~1,000–2,000 companies) but the loader pattern is the same as IF/Chips JU — defer to Sprint 7
- STEP is a cross-cutting tagging pass that benefits from having all source events loaded first — defer to Sprint 8
- Dealroom is the right-hand-side enrichment that requires a complete supply side — defer to Sprint 9

EDF is the last bounded-scope load that introduces a new methodology decision; it's the right next move.

---

## Assumptions baked in (override at top of session if wrong)

1. **Time window**: EDF 2021 onwards (matches the project's 2021–2026 window). **PADR** (Preparatory Action on Defence Research, 2017–2019, ~€90M, ~18 projects) and **EDIDP** (European Defence Industrial Development Programme, 2019–2020, ~€500M, ~62 projects) are predecessor programmes — **out of scope** by the 2021+ window. Note this in methodology.
2. **Scope = awarded projects only**, NOT shortlisted / reserve list. Awarded = Grant Agreement signed and project listed on the official EDF awarded-projects publication.
3. **In-scope call years**: EDF 2021, EDF 2022, EDF 2023, EDF 2024 (load whatever has been published as of the execution date). EDF 2025 calls are likely still under evaluation; exclude until awarded.
4. **Each EDF call has two strands** that we keep separate in the `source` field:
   - **EDF-RA** (Research Actions, up to 100% funding) — early-stage tech R&D
   - **EDF-DA** (Development Actions, 20–80% co-funding) — closer-to-market capability development
   - Source IDs: `edf_ra_2021`, `edf_da_2021`, etc. Mirroring how Innovation Fund handles LSP/SSP/MSP separation.
5. **Consortium handling — Option A (coordinator only)**: same convention as Innovation Fund, Chips JU, EIC Accelerator. ~150–250 events expected. The full beneficiary list is published for EDF but loading it would add ~2,000+ partner-role rows with weak analytical signal (companies are partners, not primary beneficiaries) and would inflate the corpus disproportionately. If the executing session finds Option B would produce a meaningfully different analysis, flag and stop before proceeding.
6. **Schema migration**: NONE. Reuse `grant_amount_eur`, `role='direct'` (consistent with IF and Chips JU Option A precedent; the `'coordinator'` role label is reserved for sources with a meaningful coordinator-vs-participant distinction at the event level, i.e. EIC), `source='edf_<strand>_<year>'`, `sector_tags_raw="Defense, {capability area}"`.
7. **Sector inference**: All EDF sources → `defense` (the new 7th label, added in Step 1 of this sprint). Add an `EDF_SOURCE_SECTOR` derivation in `extract_edf.py` mirroring how `CHIPS_JU_SOURCE_SECTOR` is derived from `CALL_TO_SOURCE`, and import it into `classify.py` (same single-source-of-truth pattern).
8. **Raw data not yet acquired.** Step 0 is discovery.

---

## Context the next session needs

### What exists in the repo

- `db.sqlite` — **2,861 companies, 4,594 events** (EIC + IPCEI + EIB + Innovation Fund + Chips JU).
- [schema.sql](schema.sql) — current schema. No migration needed for EDF.
- [load_eic.py](load_eic.py) — EIC Data Hub CSV loader.
- [extract_ipcei.py](extract_ipcei.py) — Commission state-aid PDF extractor.
- [extract_eib.py](extract_eib.py) — fuzzy-match against project-detail HTML pages.
- [extract_innovation_fund.py](extract_innovation_fund.py) — coordinator + CINEA fiche PDF parser with `IF_SOURCE_SECTOR` pattern.
- [extract_chips_ju.py](extract_chips_ju.py) — **newest extractor; closest pattern match for EDF**. Uses OData API → JSON → coordinator extraction → exact / prefix / fuzzy match tiers → `CHIPS_JU_SOURCE_SECTOR` imported by classify. **Use this as the template.**
- [classify.py](classify.py) — idempotent classifier with `SPACE_TAGS / LIFE_SCIENCES_TAGS / CLEANTECH_TAGS / DEEPTECH_TAGS / DIGITAL_TAGS` and source→sector fallback maps (`IPCEI_SOURCE_SECTOR`, `IF_SOURCE_SECTOR`, `CHIPS_JU_SOURCE_SECTOR`). **You will add `DEFENSE_TAGS` and `EDF_SOURCE_SECTOR` to this file in Step 1 (taxonomy revision).**
- [sanity_check.py](sanity_check.py) — verification queries per source + DQ section. Add an EDF section mirroring the Chips JU section.
- [methodology.md](methodology.md) — already lists EDF as 🔜 Sprint 6 with the defense-label commitment in the Source coverage section. The sector taxonomy section will be updated in Step 1.

### What is already in memory (read these before starting)

- [`project_eib_workarounds.md`](memory) — SSL curl workaround for macOS Python (applies to any ec.europa.eu HTTPS), `MANUAL_SECTOR_OVERRIDES` refactor threshold at 10 entries.
- [`project_innovation_fund_workarounds.md`](memory) — methodological caveats applicable to Option A loaders (coordinator-only undercount, country=HQ-not-project-location, NULL amounts where source data is missing).
- [`project_chips_ju_workarounds.md`](memory) — the prefix-match tier in `extract_chips_ju.py` (consider lifting to a shared `match_utils.py` once EDF exercises the same pattern), country-derivation 3-tier heuristic, total-public-funding-vs-EU-only-share caveat (likely applies to EDF too — verify in Step 0).

### Current state (post-Sprint 5)

Sector distribution: 1,084 life_sciences / 942 cleantech / 513 deeptech_hardware / 149 space / 136 digital / 37 other. Entity_type: 1,690 company / 589 research_org / 9 other / 573 unknown. Zero unclassified.

After Sprint 6, expect:
- `defense` label populated with ~150–250 (EDF coordinators that aren't already in DB) + 5–20 retroactive flips from historical EIC/IPCEI/EIB rows
- Possible cross-instrument hits: large defense primes (Indra, Thales, Saab, Leonardo, Airbus Defence & Space, Naval Group, Rheinmetall, MBDA) may overlap with IPCEI MECT, EIC Pathfinder, or EIB
- Possible duplicate-row situation similar to IPCEI/Chips JU (e.g. "Thales" vs "Thales SA" vs "Thales Group") — the prefix-match tier should bridge most cases

---

## Step 0 — Pre-flight discovery (do this BEFORE writing code)

Confirm the data is accessible and choose a primary source per call. Defense data is sometimes redacted in public publications — discover the redaction profile early.

1. **Find the authoritative awarded-projects list per call**. Check in order:
   - **EDF own publication**: https://defence-industry-space.ec.europa.eu/eu-defence-industry/european-defence-fund-edf_en — look for "Funded projects", "Annual Implementation Report", or per-call results pages.
   - **F&T Portal**: https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/projects-results with programme filter `EDF` (separate `EDF-RA` and `EDF-DA` if available).
   - **CORDIS**: https://cordis.europa.eu/projects/ filtered by framework programme = EDF.
   - **EDA published lists**: the European Defence Agency may republish EDF beneficiaries.
   - **Verdict**: pick one source per call. Document the URL in the extractor's docstring.
2. **Check for downloadable manifests** (JSON / CSV / Excel) per call. EDF often publishes per-call factsheet PDFs and per-project descriptions.
3. **Identify per-project metadata available**: at minimum we need (a) project acronym, (b) coordinator name, (c) coordinator country, (d) EU contribution, (e) call ID, (f) signature date, (g) capability area / topic. Note any per-project redactions (some defense projects have classified components).
4. **Confirm download mechanism**: if HTML or PDF on ec.europa.eu, plan to use `subprocess.run(['curl', '-sL', url], ...)` (EIB memory). If JSON via portal API (similar to Chips JU), plain `requests` should work — test with one call.
5. **Verify amount semantics**: is the published number "EU contribution" (clean), "total project cost" (EU + national co-funding), or both? EDF-DA projects have member-state co-funding so this matters. Document the answer; if only total-project-cost is published, note the caveat (same pattern as Chips JU `shv_totalinvestment`).
6. **Sample a project for sensitivity check**: pick one EDF-DA project and confirm coordinator + amount + capability area are publicly available. If any of the 4 fields are routinely redacted, flag before proceeding.
7. **Stop and report back to the user with**:
   - The source URL(s) chosen per call (RA + DA for each of 2021/2022/2023/2024)
   - The estimated row count under Option A vs Option B
   - Any per-project metadata gaps or redactions
   - Amount semantics (EU contribution vs total cost)
   - A recommendation: Option A or Option B
   - Confirm before proceeding to Step 1.

---

## Step 1 — Sector taxonomy revision (BEFORE building the extractor)

This is the methodology change that's coupled to the EDF load. Do this FIRST so the classifier already understands `defense` before any EDF rows land. Then run a baseline retroactive scan to see what existing companies flip to `defense` without any new data — that number is your retroactive-flip baseline.

### 1a. Add the `defense` label to the taxonomy

In [methodology.md](methodology.md), update the Sector taxonomy section:
- **Labels table**: add a 7th row for `defense` describing what it covers (weapons systems, military electronics, secure military comms, military aerospace, naval combat systems, armoured vehicles, ammunition, defense-specific cyber capabilities).
- **Overlap resolution priority**: insert `defense` between `life_sciences` and `cleantech`. New order: `space > life_sciences > defense > cleantech > deeptech_hardware > digital > other`. Justification: if a project is EDF-funded, the defense use-domain is primary; space stays on top because launch vehicles are space even when defense-adjacent.
- **Known tensions**: add a bullet on dual-use — "a company doing AI-for-medical-imaging that *could also* serve a military client stays `life_sciences`; only companies whose primary funded project is defense-purpose go to `defense`. A future `dual_use` boolean column can layer in if cross-cutting analysis is needed."

### 1b. Update `schema.sql`

Update the `sector_inferred` column comment to list 7 labels not 6.

### 1c. Update `classify.py`

Add a `DEFENSE_TAGS` set. **The list below is a starter set based on EDF capability-area terminology as documented publicly — it has NOT been verified against the actual EDF source data.** Step 0 must surface the actual tag/category strings used in the chosen EDF source; after Step 0, revise the starter set to match. If the EDF source uses different terminology (e.g. "CC-Cyber" instead of "Cyber Defence", or a numeric capability ID), update both `DEFENSE_TAGS` AND the `sector_tags_raw` emission in `extract_edf.py` so they line up.

Starter set:
```python
DEFENSE_TAGS = {
    "Defense",  # leading tag emitted by extract_edf.py — keep this even if EDF source uses different vocab
    "Defence",  # British spelling
    # EDF capability-area starter set — REVISE AFTER STEP 0
    "Cyber Defence",
    "Information Superiority",
    "Sensors",
    "Air Combat",
    "Air and Missile Defence",
    "Ground Combat",
    "Force Protection",
    "Maritime Combat",
    "Underwater Warfare",
    "Simulation and Training",
    "Disruptive Defence Technologies",
    "Defence Materials and Components",
    "Defence Energy Resilience",
    "Defence Space",  # space-based defense — note priority interaction below
}
```

**Priority interaction with `space`**: a space-based defense project (e.g. military reconnaissance satellites) would have tags hitting both `SPACE_TAGS` and `DEFENSE_TAGS`. Per the priority order, `space` wins. This is intentional and documented in the taxonomy section.

Add a keyword fallback set:
```python
DEFENSE_KEYWORDS = [
    "military application", "national defence", "national defense",
    "defence procurement", "defense procurement",
    "weapons system", "weapon system",
    "munition", "ammunition",
    "armoured vehicle", "armored vehicle", "tank ",
    "fighter aircraft", "combat aircraft", "fighter jet",
    "missile defence", "missile defense", "anti-missile",
    "warship", "naval combat", "submarine",
    "battlefield", "tactical communication",
    "edf-ra", "edf-da", "european defence fund",
]
```

**IMPORTANT — understand what this list does and doesn't do**:
- The keyword fallback ONLY fires for events with **empty `sector_tags_raw`**. New EDF rows will always have `sector_tags_raw="Defense, …"` populated and will hit the tag-match path BEFORE the keyword fallback runs. So `DEFENSE_KEYWORDS` is NOT the primary EDF-row classification mechanism — `DEFENSE_TAGS` is.
- The keyword fallback's actual job is the **retroactive scan** over historical rows where `sector_tags_raw` is empty or non-defense. That's EIB Industry/Transport borrowers (empty tags by Sprint 3 design) and a handful of EIC/IPCEI/IF rows. **Tune the keyword list for THIS use case, not for EDF.**
- Resist the urge to add EDF-specific terminology to `DEFENSE_KEYWORDS` (e.g. specific EDF call IDs like "edf-ra"). Those should only land in `DEFENSE_TAGS` (via `extract_edf.py`'s `sector_tags_raw` emission). Keep keywords focused on terms that might appear in *non-EDF* project descriptions where the project is defense-leaning.

**Tuning carefully — false positives to avoid**:
- "defensive" (immune defense → life_sciences) is NOT in the list — only "defence" / "defense" preceded by domain context
- "cyber security" alone is NOT defense (it's digital); "defence cyber" or "cyber defence" is
- "tank" requires a trailing space to avoid matching "tankless", "tanker" (oil), etc.

Update `classify_sector` to insert `defense` between `life_sciences` and `cleantech` in the priority order:
```python
if tags & SPACE_TAGS:        return "space"
if tags & LIFE_SCIENCES_TAGS: return "life_sciences"
if tags & DEFENSE_TAGS:      return "defense"        # NEW
if tags & CLEANTECH_TAGS:    return "cleantech"
if tags & DEEPTECH_TAGS:     return "deeptech_hardware"
if tags & DIGITAL_TAGS:      return "digital"
```

Same insertion in the keyword fallback path.

### 1d. Run classifier (baseline retroactive scan)

**Back up the DB first** — the classifier is idempotent but a taxonomy revision touches every row's `sector_inferred`, and you'll want a clean rollback path if the keyword list turns out to be over-aggressive:
```bash
cp db.sqlite db.sqlite.pre_edf_taxonomy
```

Then run `python3 classify.py` BEFORE adding any EDF data. Capture:
- Sector distribution change (expected: 0–20 companies flip from `digital`/`deeptech_hardware` to `defense` via the keyword fallback over historical EIC/IPCEI/EIB/IF/Chips JU rows)
- Identify the flipped companies — do they look genuinely defense? Run a quick query:
  ```sql
  SELECT canonical_name, country FROM companies WHERE sector_inferred='defense'
  ```
- If >20 companies flip OR if any obvious false positives (e.g. cybersecurity startups flipped to defense, immune-defense biotech flipped to defense), narrow `DEFENSE_KEYWORDS` and re-run. Iterate until the flipped list looks clean.

**Decision point**: if the flipped list looks wrong AND narrowing keywords doesn't fix it, restore from backup (`cp db.sqlite.pre_edf_taxonomy db.sqlite`) and reconsider the keyword approach — maybe defense keywords only fire for specific source families (e.g. EIB only, where empty `sector_tags_raw` is common).

**Validation gate**: after this step, sector distribution should show a `defense` row with N companies, where 0 ≤ N ≤ 30. If N > 30, the keyword fallback is too aggressive — narrow it.

### 1e. Document the baseline in methodology Decision log

Add an entry: **2026-MM-DD (sprint-6 taxonomy revision)** — number of companies flipped, the flipped list (or a summary), and the rationale.

---

## Step 2 — Build `extract_edf.py` (mirror `extract_chips_ju.py`)

After Step 1 sign-off, copy the structure of `extract_chips_ju.py`. Key elements to replicate:

### Top-level constants
```python
CALL_TO_SOURCE: dict[str, tuple[str, str]] = {
    "EDF-2021-RA":  ("edf_ra_2021", "2022-XX-XX"),
    "EDF-2021-DA":  ("edf_da_2021", "2022-XX-XX"),
    "EDF-2022-RA":  ("edf_ra_2022", "2023-XX-XX"),
    "EDF-2022-DA":  ("edf_da_2022", "2023-XX-XX"),
    "EDF-2023-RA":  ("edf_ra_2023", "2024-XX-XX"),
    "EDF-2023-DA":  ("edf_da_2023", "2024-XX-XX"),
    "EDF-2024-RA":  ("edf_ra_2024", "2025-XX-XX"),
    "EDF-2024-DA":  ("edf_da_2024", "2025-XX-XX"),
    # … fill from Step 0 discovery; some calls may have additional strands (e.g. Special Topics)
}

# Single source of truth — classify.py imports this
EDF_SOURCE_SECTOR: dict[str, str] = {
    src: "defense" for src, _ in CALL_TO_SOURCE.values()
}
```

### Functions to implement
- `fetch_projects(force_refresh=False)` — fetch from the chosen Step 0 source. JSON API preferred; PDF parsing if necessary (mirror IF's right-column crop pattern).
- `parse_award_list(source_path)` — parse the per-call source into per-project dicts.
- `normalize_name(s)` — copy from `extract_chips_ju.py`.
- `derive_coordinator_country(institution, participating_countries)` — copy from `extract_chips_ju.py`; expand `_LANGUAGE_PATTERNS` and `_KNOWN_ORG_COUNTRIES` for likely EDF coordinators (Thales→FR, Indra→ES, Leonardo→IT, Saab→SE, Rheinmetall→DE, MBDA→FR, Naval Group→FR, Patria→FI, Diehl→DE, Hensoldt→DE).
- `extract_all(force_refresh=False)` — orchestrator returning rows with:
  ```python
  {
      "source": "edf_ra_2022",
      "call_id": "<source>_<acronym_normalized>",
      "project_acronym": str,
      "project_title": str,
      "coordinator_name": str,
      "country": str,                     # ISO2
      "description": str,                 # project objective
      "grant_eur": float | None,
      "awarded_date": str,
      "doc_url": str,
      "sector_tags_raw": "Defense, {capability_area}",  # e.g. "Defense, Sensors"
  }
  ```
- `match_companies(rows, conn)` — exact → name-only exact → **prefix** → fuzzy ≥ 0.92 tier ladder (copy from `extract_chips_ju.py`). New inserts get `match_method='edf'`.
- `load_events(rows, conn)` — INSERT into `public_funding_events` with `role='direct'` (matches IF and Chips JU Option A precedent). Although EDF projects have a formal coordinator role, the codebase convention is: `'coordinator'` is used only when there's a meaningful coordinator-vs-participant distinction at the event level (EIC); Option A loaders that only capture the lead use `'direct'`. Consistency with the IF/Chips JU pattern beats semantic accuracy here — downstream sanity_check queries and multi-instrument joins all assume the `'direct'` convention. Idempotent on `(source, call_id)`.
- `main()` — orchestration + CSV summary + match summary CSV.

### `sector_tags_raw` design

Format: `"Defense, {capability_area}"` (e.g. `"Defense, Cyber Defence"`, `"Defense, Sensors"`). The leading `"Defense"` tag triggers `DEFENSE_TAGS` membership in the classifier; trailing capability-area tag enables sub-sector SQL queries (`WHERE sector_tags_raw LIKE '%Sensors%'`, `'%Cyber%'`, etc.).

This mirrors the IF pattern (`"Energy, Hydrogen"` etc.) and the Chips JU pattern (`"Semiconductors, Digital Industry"`).

### Idempotency

Same `(source, call_id)` duplicate guard as Chips JU. Re-runs must insert 0 rows.

---

## Step 3 — Update `classify.py` to wire EDF source-sector fallback

After `extract_edf.py` is in place:

```python
# Top of classify.py, near the IF and Chips JU imports:
from extract_edf import EDF_SOURCE_SECTOR  # noqa: E402
```

Then in the `for src in sources:` block inside `classify_sector`, add the lookup:
```python
for src in sources:
    if src in IPCEI_SOURCE_SECTOR:    return IPCEI_SOURCE_SECTOR[src]
    if src in IF_SOURCE_SECTOR:        return IF_SOURCE_SECTOR[src]
    if src in CHIPS_JU_SOURCE_SECTOR:  return CHIPS_JU_SOURCE_SECTOR[src]
    if src in EDF_SOURCE_SECTOR:       return EDF_SOURCE_SECTOR[src]
```

This is the source-sector fallback path — fires when `sector_tags_raw` is empty (shouldn't happen for EDF rows because we always emit `"Defense, …"`, but kept for robustness and consistency with other sources).

---

## Step 4 — Update `sanity_check.py`

Mirror the Chips JU section. Add an EDF section above the DQ section with:
- Events / distinct companies / total grant sum per source (RA + DA per call year)
- Coordinator country distribution (top 15)
- Sector distribution for EDF companies (must be 100% `defense` for EDF-only companies — multi-source companies will retain their primary EIC/IPCEI sector per the multi-domain research-org methodology note)
- Top-line counts and validation (events, distinct beneficiaries, matched to existing, new inserts, NULL amounts, debt pollution, NULL country)
- Multi-instrument winners (EDF + at least one other source) — expect heavy overlap with IPCEI MECT (semiconductor defense primes), EIC Pathfinder (early-stage defense research), and EIB venture-debt (defense-adjacent startups)

Also update the `DQ: MANUAL_SECTOR_OVERRIDES applied correctly` query if any defense-specific overrides are added in Step 1.

---

## Step 5 — Run and validate

```bash
python3 extract_edf.py            # CSV only, no DB write
python3 extract_edf.py --load-db  # match and load
python3 classify.py               # re-run classifier
python3 sanity_check.py           # verify counts
```

**Validation gates** (all must pass before sign-off):

| # | Gate | Expected | How to check |
|---|---|---|---|
| 1 | Row count | 150–250 events (Option A) | `SELECT COUNT(*) FROM public_funding_events WHERE source LIKE 'edf%'` |
| 2 | No NULL country/canonical_name on EDF companies | 0 | sanity_check section |
| 3 | Zero unclassified | 0 | DQ section |
| 4 | All EDF-only companies classified as `defense` | 100% | `SELECT sector_inferred, COUNT(*) FROM companies WHERE id IN (chips-only style query) GROUP BY sector_inferred` |
| 5 | No debt pollution | 0 EDF rows with `debt_amount_eur` populated | sanity_check section |
| 6 | Per-call grant sums plausibly match published EDF call budgets | within ±10% (defense data often has redactions, looser tolerance than Chips JU) | sanity_check section |
| 7 | Idempotency | Re-run inserts 0 rows | run `extract_edf.py --load-db` twice |
| 8 | Cross-instrument overlap | ≥5 distinct EDF coordinators with another source | sanity_check multi-instrument winners query |
| 9 | Retroactive taxonomy scan (from Step 1d) | 0–30 historical companies flipped to `defense` | run before EDF load; compare baseline |
| 10 | Total `defense`-sector companies after full load | 150–280 (EDF-only ~150–250 + retroactive 0–30) | `SELECT COUNT(*) FROM companies WHERE sector_inferred='defense'` |

If gate 6 fails (large gap vs published budget), investigate: is amount = EU contribution or total project cost? Is the source up-to-date? Are some projects redacted?

If gate 8 falls below 5: investigate before concluding the loader is broken. The overlap calculation assumes that defense primes (Thales, Leonardo, Saab, Indra, Airbus DS) are already in the DB via IPCEI MECT or EIC Pathfinder. **This assumption may not hold**: IPCEI MECT is microelectronics-specific (foundries, fabless designers, materials) — pure defense primes that *buy* chips rather than make them (Thales, Leonardo) may NOT appear in IPCEI MECT. The realistic overlap is likely 3–5 with IPCEI plus a handful from EIC Pathfinder/Transition (defense-leaning research grants). If gate 8 returns 3 or 4, check the multi-instrument winners list manually — if the matches look right (clear name + country alignment) and there just aren't more, that's acceptable. If gate 8 returns 0–2, something IS wrong with matching — use the prefix-match tier audit (it bridged IPCEI shortened names in Sprint 5; same expectation here for "Thales" vs "THALES SIX GTS FRANCE SAS" type cases).

---

## Step 6 — Documentation updates

In order:

1. **`schema.sql`** — `sector_inferred` column comment updated to 7 labels (done in Step 1b); `source` field comment to add `edf_{ra,da}_{2021..2024}`.
2. **`methodology.md`** — already updated in Step 1a (taxonomy revision). Add a new "## EDF extraction" section before "## Enrichment plan (pending)", mirroring the Chips JU section. Add a Decision log entry: **2026-MM-DD (sprint-6 EDF load)**.
3. **`notes.md`** — add a "## Day 7" section with the same structure as Day 6 (goal, sourcing, parsing, DB load, results table).
4. **`README.md`** — flip the "EDF" row to ✅ loaded with actual numbers; update total company count; add `python3 extract_edf.py --load-db` to the Run section.
5. **Memory** — if any new workarounds emerge (defense data redactions, capability-area taxonomy issues, fuzzy-match edge cases for defense primes, dual-use classification borderline cases), add a `project_edf_workarounds.md` memory file linked from `MEMORY.md`. Otherwise skip.

---

## Out of scope for Sprint 6

- **PADR (2017–2019) and EDIDP (2019–2020)**: predecessor programmes outside the 2021+ time window. Could be added in a future mini-sprint if completeness is needed.
- **Classified / redacted EDF projects**: if Step 0 reveals any EDF projects with redacted coordinator/amount fields, log them as NULL with a note — do not attempt to backfill from restricted sources.
- **Member-state national defense funding**: out of scope for an EU-level tracker (German Bundeswehr R&D, French DGA contracts, UK DASA grants, etc.). Documented in methodology "Non-HE EU instruments" table.
- **Dual-use flag column on `companies`**: discussed as a future addition; not in this sprint's scope. The 7-label sector taxonomy is the primary mechanism for now.
- **Sub-capability classification beyond `sector_tags_raw`**: don't add new sector labels for "EDF Sensors" vs "EDF Cyber". Store the capability area in `sector_tags_raw` for SQL filtering; that's sufficient.

---

## Notes for the executing agent

- Sprint 5 (Chips JU) finished with the prefix-match tier proven on the IPCEI-shortened-names ↔ full-legal-names case. EDF will likely hit the same: defense primes named "Thales" in IPCEI vs "Thales SA" or "THALES SIX GTS FRANCE SAS" in EDF coordinator listings. The prefix tier should bridge most. If EDF surfaces a *new* matching pattern that the prefix tier doesn't cover, consider lifting `match_companies` into a shared `match_utils.py` (was deferred in the Sprint 5 audit pending a second caller).
- Don't re-invent the curl SSL workaround — documented in `project_eib_workarounds.md` and already used by extract_eib / extract_innovation_fund / extract_chips_ju.
- Don't re-invent the right-column PDF crop — if EDF factsheets use a two-column layout like IF fiches, `page.crop((page.width/2, 0, page.width, page.height))` is the proven approach.
- Don't duplicate `EDF_SOURCE_SECTOR` between the extractor and `classify.py`. Define once in `extract_edf.py` and import into classify (same pattern as IF and Chips JU after Sprint 4/5 cleanup).
- **Don't add `defense` to MANUAL_SECTOR_OVERRIDES proactively** — let the keyword fallback and the per-source mapping do the work. Only add an override if a specific company is misclassified after the full pipeline runs. **The dict is currently 6/10 capacity** (4 EIB-era + 2 IMEC from Sprint 5). If you find yourself adding ≥3 defense-related overrides, **stop and reconsider** — that means either the keyword list is wrong or the priority order needs revisiting. Adding 3+ overrides would push the dict to 9/10 and crowd the refactor threshold from EIB memory; better to fix the upstream classification than patch case-by-case.
- **Dual-use borderline cases**: if a company appears in both EDF AND a non-defense instrument (e.g. EIC Accelerator on medical drones + EDF on military drones), the classifier will land them as `defense` per the priority order. This is the correct call per the methodology. If you find an example where this is clearly wrong (e.g. the EIC project is the company's main business and EDF was a one-off side project), document it in `project_edf_workarounds.md` but don't override unilaterally — the priority order is the methodology contract.
- If Step 0 sourcing turns up something materially different from what this plan assumes (e.g. EDF doesn't publish a clean projects list, projects are referenced only by ID without coordinator names, or amounts are routinely redacted), **stop and report back** before coding.

---

## Definition of done

- Taxonomy expanded to 7 labels with `defense` integrated into `classify.py`, methodology.md, schema.sql
- 150–250 EDF events loaded (or whatever Option A yields after Step 0 confirms call counts), all EDF-only companies classified as `defense`
- Retroactive scan complete, ≤30 historical companies flipped, flipped list documented
- Zero unclassified, zero orphan companies, zero debt pollution, zero NULL country
- ≥5 cross-instrument matches against IPCEI MECT / EIC Pathfinder / EIB (relaxed from initial ≥10 — IPCEI MECT is microelectronics-specific and may not contain pure defense primes; see gate 8 commentary)
- Idempotent on re-run
- Documentation updates committed (schema.sql, methodology.md, notes.md, README.md)
- Decision log entries in methodology.md (one for taxonomy revision, one for EDF load)
- README total company count updated
