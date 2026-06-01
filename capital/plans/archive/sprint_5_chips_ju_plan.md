# Sprint 5 plan — Chips Joint Undertaking (Chips JU / KDT JU) extraction

**Purpose of this doc**: a self-contained brief for a fresh Claude session to execute the Chips JU load without needing to re-derive context. Read top-to-bottom before touching code.

**Owner of this sprint**: Claude Sonnet, executing against `/Users/asgermollergrimberg/EuroInvTracker/files/`.

---

## TL;DR

Load EU-funded semiconductor R&D consortia projects from the **Chips Joint Undertaking** (Chips JU, from 2023+) and its predecessor **KDT JU** (Key Digital Technologies, 2021–2023) into the existing SQLite DB as `source='chips_ju_<call>'` entries in `public_funding_events`. Expected size **~30–80 events** depending on whether we load lead applicants only (~30–50) or all consortium beneficiaries (~80+). Schema needs **no migration**. End state: corpus grows from 2,848 companies to roughly 2,880–2,930 (heavy overlap with EIC and IPCEI MECT/Microelectronics expected), classifier re-run leaves zero `unclassified`, all Chips JU rows classified as `deeptech_hardware`.

**Why this sprint and not EDF, STEP, or Dealroom**:
- EDF is bigger and methodologically heavier (defense sector taxonomy gap) — defer to Sprint 6
- STEP is a tagging-layer cross-cut, not a new loader — defer to Sprint 7
- Dealroom is the highest-value enrichment but should run once after the supply side is complete — see `sprint_8_dealroom_plan.md`

Chips JU is a natural close-out to the supply-side: it completes the semiconductor coverage that IPCEI MECT/Microelectronics started, it follows the same Joint Undertaking PDF/CSV-list pattern as IPCEI, and it's the last bounded-scope public source.

---

## Assumptions baked in (override at top of session if wrong)

1. **Time window**: KDT JU's first call onwards (2021) through today (currently 2026-05-21). Match the existing corpus' upper bound; do NOT load post-today calls.
2. **Scope = awarded projects only**, NOT shortlisted / reserve list. Awarded = Grant Agreement signed, listed in the published award table.
3. **In-scope programmes**:
   - **KDT JU calls** (Key Digital Technologies JU, 2021–2023): KDT-2021, KDT-2022 (typically two strands: "Innovation Action" and "Research and Innovation Action"), KDT-2023 (final KDT call before transition).
   - **Chips JU calls** (Chips Joint Undertaking, 2023+): the first Chips JU calls under Pillar 2 of the European Chips Act. Typically separated into "Chips JU Industry-Academia Pilot Lines", "Chips JU Design Platform", "Chips JU Competence Centres", "Chips JU R&D&I Calls" etc.
4. **What is NOT in scope**:
   - The Chips Act *Pillar 1* large-scale manufacturing subsidies (these are state-aid notifications, not a Chips JU call — they are partially covered by IPCEI MECT and IPCEI Microelectronics already in the DB)
   - The Chips Fund (a private investment vehicle, not a public grant)
   - ECSEL JU (the pre-2021 predecessor to KDT JU — out of the project's 2021+ time window)
5. **Consortium handling — DECISION REQUIRED IN STEP 2**: Chips JU projects are large consortia (often 20–50 partners per project, like IPCEI). Two options:
   - **Option A — lead applicants only**: one row per project, the coordinator. ~30–50 rows total. Mirrors Innovation Fund pattern.
   - **Option B — all beneficiaries**: every participant as a separate event row. ~600–2,000 rows total. Mirrors IPCEI pattern.
   - **Recommended**: Option A by default to keep the corpus comparable across instruments (EIC Accelerator, EIB, IF are all lead-only). Document the limitation in methodology (see [project_innovation_fund_workarounds.md](../../../.claude/projects/-Users-asgermollergrimberg-EuroInvTracker/memory/project_innovation_fund_workarounds.md) item #1 — same caveat applies). If the user explicitly asks for Option B, flag the increased corpus size before proceeding.
6. **Schema migration**: NONE. Reuse `grant_amount_eur`, `role='direct'` (or `'coordinator'` if Option A is chosen and we want to distinguish from IPCEI's `'direct'`), `source='chips_ju_<call_short>'`.
7. **Sector inference**: All Chips JU sources → `deeptech_hardware` (semiconductors by definition). Add a `CHIPS_JU_SOURCE_SECTOR` derivation in `extract_chips_ju.py` mirroring how `IF_SOURCE_SECTOR` is derived from `CALL_TO_SOURCE`, and import it into `classify.py` (same pattern that resolved Sprint 4 cleanup item #6).
8. **Raw data not yet acquired.** Step 1 is acquisition.

---

## Context the next session needs

### What exists in the repo

- `db.sqlite` — **2,848 companies, 4,559 events** (EIC + IPCEI + EIB + Innovation Fund).
- [schema.sql](schema.sql) — current schema. `debt_amount_eur` added Sprint 3; no changes since.
- [load_eic.py](load_eic.py) — CSV loader pattern.
- [extract_ipcei.py](extract_ipcei.py) — Joint Undertaking analogue. Multi-call PDF extractor with `PROGRAM_META` mapping. **Closest pattern match for Chips JU** because Chips JU/KDT JU are also Joint Undertakings with consortium award decisions.
- [extract_innovation_fund.py](extract_innovation_fund.py) — recently added (Sprint 4). Uses curl-based download (SSL workaround), right-column PDF crop, and `CALL_TO_SOURCE` → derived `IF_SOURCE_SECTOR` that `classify.py` imports. **This is the cleanest current template — copy the structure.**
- [extract_eib.py](extract_eib.py) — fuzzy-match pattern when PIC codes are absent.
- [classify.py](classify.py) — idempotent classifier. Already imports `IF_SOURCE_SECTOR` from `extract_innovation_fund.py`. Add `from extract_chips_ju import CHIPS_JU_SOURCE_SECTOR` and consult it in the same `for src in sources` block.
- [sanity_check.py](sanity_check.py) — verification queries including IF section, DQ section (orphans, unclassified, manual overrides). Add a Chips JU section mirroring the IF section.

### What is already in memory (read these before starting)

- [`project_eib_workarounds.md`](../../../.claude/projects/-Users-asgermollergrimberg-EuroInvTracker/memory/project_eib_workarounds.md) — SSL curl workaround for macOS Python (applies to any ec.europa.eu HTTPS).
- [`project_innovation_fund_workarounds.md`](../../../.claude/projects/-Users-asgermollergrimberg-EuroInvTracker/memory/project_innovation_fund_workarounds.md) — methodological caveats from Sprint 4 (coordinator-only capture, country=HQ, etc.). These same caveats apply to Chips JU if Option A is chosen — call them out at the bottom of the methodology entry, don't re-derive them.

### Current state (post-Sprint 4 cleanup)

Sector distribution: 1,085 life_sciences / 942 cleantech / 498 deeptech_hardware / 150 space / 136 digital / 37 other. Entity_type: 1,683 company / 585 research_org / 571 unknown / 9 other. After Chips JU expect deeptech_hardware to grow by ~30–50 (or much more if Option B). High overlap likely with IPCEI MECT/Microelectronics companies (Infineon, Bosch, ST, NXP, IMEC, CEA, Fraunhofer) — these should match existing rows via exact/fuzzy.

---

## Step 0 — Pre-flight discovery (do this BEFORE writing code)

Confirm the data is accessible before designing the loader. The Innovation Fund sprint wasted time on F&T Portal API attempts before pivoting to direct HTML scraping; do the discovery first this time.

1. **Find the authoritative awarded-projects list per call**. Check in order:
   - https://www.chips-ju.europa.eu/projects/ — Chips JU's own project list (most likely authoritative for Chips JU calls)
   - https://www.kdt-ju.europa.eu/ — KDT JU site (may redirect to chips-ju.europa.eu since the transition)
   - F&T Portal: https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/projects-results with `programmePeriod=2021-2027` and programme filter `KDT-JU` and `CHIPS-JU`
   - CORDIS: https://cordis.europa.eu/projects/ filtered by framework programme
   - **Verdict**: pick one source per call. Document the URL in the extractor's docstring.
2. **Look for a downloadable manifest** (CSV / JSON / Excel) for each call's awards. Joint Undertakings often publish per-call result tables.
3. **Identify per-project metadata available**: at minimum we need (a) project acronym, (b) coordinator name, (c) coordinator country, (d) total EU contribution, (e) call ID, (f) project signature date. If only some fields are present, document gaps before coding.
4. **Confirm download mechanism**: if the source is HTML or PDF on ec.europa.eu, plan to use `subprocess.run(['curl', '-sL', url], ...)` to avoid the macOS Python SSL issue (see EIB memory). If it's JSON, plain `requests` should work — test with one call.
5. **Stop and report back to the user with**:
   - The source URL(s) chosen per call (KDT-2021, KDT-2022, KDT-2023, Chips-JU-2024, …)
   - The estimated row count under Option A vs Option B
   - Any per-project metadata gaps
   - A recommendation: Option A or Option B
   - Confirm before proceeding to Step 1.

---

## Step 1 — Build `extract_chips_ju.py` (mirror `extract_innovation_fund.py`)

After Step 0 sign-off, copy the structure of `extract_innovation_fund.py`. Key elements to replicate:

### Top-level constants
```python
CALL_TO_SOURCE: dict[str, tuple[str, str]] = {
    # call name (from source) → (source_id, awarded_date)
    "KDT JU 2021 Call": ("chips_ju_kdt_2021", "2022-XX-XX"),
    "KDT JU 2022 Call (IA)": ("chips_ju_kdt_2022_ia", "2023-XX-XX"),
    "KDT JU 2022 Call (RIA)": ("chips_ju_kdt_2022_ria", "2023-XX-XX"),
    "KDT JU 2023 Call": ("chips_ju_kdt_2023", "2024-XX-XX"),
    "Chips JU 2024 R&D&I": ("chips_ju_rdi_2024", "2025-XX-XX"),
    "Chips JU 2024 Pilot Lines": ("chips_ju_pilot_2024", "2025-XX-XX"),
    # … fill from Step 0 discovery
}

# Single source of truth — classify.py imports this
CHIPS_JU_SOURCE_SECTOR: dict[str, str] = {
    src: "deeptech_hardware" for src, _ in CALL_TO_SOURCE.values()
}
```

### Functions to implement
- `parse_award_list(source_path)` — read the per-call CSV / PDF / HTML and return per-project dicts. Per-source-type parser branches OK.
- `normalize_name(s)` — copy from `extract_innovation_fund.py` (same legal-form stripping regex).
- `ensure_download(url, target_path)` — curl-based download for any ec.europa.eu source (mirror IF's `ensure_fiche`).
- `extract_all(download_missing=False)` — orchestrator returning a list of row dicts with this shape:
  ```python
  {
      "source": "chips_ju_kdt_2022_ia",
      "call_id": "<source>_<acronym_normalized>",
      "project_acronym": str,
      "coordinator_name": str,
      "country": str,                    # ISO2
      "description": str,                # project objective from source
      "grant_eur": float | None,
      "awarded_date": str,               # ISO8601
      "doc_url": str,
      "sector_tags_raw": "Semiconductors",  # constant; classifier handles deeptech_hardware
  }
  ```
- `match_companies(rows, conn)` — exact-then-fuzzy match against `companies` (≥0.92 threshold; mirror IF). New inserts get `match_method='chips_ju'`.
- `load_events(rows, conn)` — INSERT into `public_funding_events`. Idempotent on `(source, call_id)`. Use `role='direct'`, `sector_tags_raw="Semiconductors"` (or `"Semiconductors, {sub-topic}"` if Step 0 turns up a useful sub-topic field).
- `main()` — orchestration + CSV summary + match summary CSV.

### `sector_tags_raw` design
Set `sector_tags_raw="Semiconductors"` for all Chips JU rows.

**Important**: "Semiconductors" is **not** currently in any of the classifier's tag sets (`SPACE_TAGS`, `LIFE_SCIENCES_TAGS`, `CLEANTECH_TAGS`, `DEEPTECH_TAGS`, `DIGITAL_TAGS`). If you set this without action, the classifier will see non-empty unmatched tags and return `"other"` — **NOT** `deeptech_hardware`. Two options:
- **A**: Add `"Semiconductors"` to `DEEPTECH_TAGS` in `classify.py`. Lowest risk; tag is reused if any future source emits it.
- **B**: Set `sector_tags_raw=""` (blank) so the classifier falls through to the `CHIPS_JU_SOURCE_SECTOR` fallback.
- **Recommended: A.** Adding "Semiconductors" to `DEEPTECH_TAGS` makes the data more self-describing. Verify post-classify that no existing rows have `sector_tags_raw='Semiconductors'` and would shift sector as a result.

### Idempotency
Same `(source, call_id)` duplicate guard as IF. Re-runs must insert 0 rows (verify by running twice in succession).

---

## Step 2 — Update `classify.py`

After `extract_chips_ju.py` is in place:

```python
# Top of classify.py, near the IF import:
from extract_chips_ju import CHIPS_JU_SOURCE_SECTOR  # noqa: E402
```

Then in the `for src in sources:` block inside `classify_sector`, add the lookup:
```python
for src in sources:
    if src in IPCEI_SOURCE_SECTOR:
        return IPCEI_SOURCE_SECTOR[src]
    if src in IF_SOURCE_SECTOR:
        return IF_SOURCE_SECTOR[src]
    if src in CHIPS_JU_SOURCE_SECTOR:
        return CHIPS_JU_SOURCE_SECTOR[src]
```

And — if Option A from the `sector_tags_raw` design was chosen — add `"Semiconductors"` to `DEEPTECH_TAGS`.

---

## Step 3 — Update `sanity_check.py`

Mirror the IF section. Add a Chips JU section above the DQ section with:
- Events / distinct companies / total grant sum per source
- Country distribution (top 15)
- Top-line counts and validation (events count, distinct beneficiaries, matched to existing, new inserts, NULL amounts, debt pollution)
- Multi-instrument winners (Chips JU + at least one other source) — heavy overlap expected with IPCEI MECT/Microelectronics and EIC Pathfinder; this is a strong signal

---

## Step 4 — Run and validate

```bash
python3 extract_chips_ju.py            # CSV only, no DB write
python3 extract_chips_ju.py --load-db  # match and load
python3 classify.py                    # re-run classifier
python3 sanity_check.py                # verify counts
```

**Validation gates** (all must pass before sign-off):

| # | Gate | Expected | How to check |
|---|---|---|---|
| 1 | Row count | 30–80 events (Option A) or 600–2,000 (Option B) | `SELECT COUNT(*) FROM public_funding_events WHERE source LIKE 'chips_ju%'` |
| 2 | No NULL country/canonical_name on Chips JU companies | 0 | sanity_check section |
| 3 | Zero unclassified | 0 | DQ section |
| 4 | All Chips JU rows classified as deeptech_hardware | 100% | `SELECT sector_inferred, COUNT(*) FROM companies WHERE id IN (SELECT company_id FROM public_funding_events WHERE source LIKE 'chips_ju%') GROUP BY sector_inferred` |
| 5 | No debt pollution | 0 Chips JU rows with `debt_amount_eur` populated | sanity_check section |
| 6 | Per-call grant sums plausibly match published totals | within ±5 % of Chips JU press-release figures | sanity_check section |
| 7 | Idempotency | Re-run inserts 0 rows | run `extract_chips_ju.py --load-db` twice |
| 8 | High overlap with IPCEI MECT / Microelectronics | expect ≥10 cross-instrument matches | multi-instrument winners query |

If gate 8 fails (zero or very low overlap), something is wrong with the matching — Infineon, Bosch, ST, NXP, IMEC, CEA, Fraunhofer are all in IPCEI MECT/Microelectronics and should match.

---

## Step 5 — Documentation updates

In order:
1. **`schema.sql`** — add `chips_ju_{kdt,rdi,pilot}_{year}` to the `source` field comment.
2. **`methodology.md`** — add a "## Chips JU extraction" section before "## Enrichment plan (pending)", mirroring the IF section. Add a Decision log entry: **2026-MM-DD (sprint-5 Chips JU load)**.
3. **`notes.md`** — add a "## Day 6" section with the same structure as Day 5 (goal, sourcing, parsing, DB load, results table).
4. **`README.md`** — flip the "Chips Act / Chips JU" row to ✅ loaded with the actual numbers; update total company count; add `python3 extract_chips_ju.py --load-db` to the Run section.
5. **Memory** — if any new workarounds emerge (PDF parsing quirks, data quality issues, fuzzy-match edge cases), add a `project_chips_ju_workarounds.md` memory file linked from `MEMORY.md`. Otherwise skip.

---

## Out of scope for Sprint 5

- **Chips Act Pillar 1 (manufacturing subsidies)**: state-aid notifications, not a Chips JU call. Partially covered by IPCEI MECT/Microelectronics already. Defer to a future "Chips Act state aid" mini-sprint.
- **ECSEL JU (pre-2021)**: out of the project's 2021+ time window.
- **The Chips Fund**: private vehicle, not a public grant. Will be picked up via Dealroom enrichment (Sprint 8) if any Chips JU recipient took Chips Fund money.
- **Sub-topic classification** (e.g., "advanced node logic" vs. "power electronics" vs. "photonics"): not required for v1. Store in `sector_tags_raw` if the source has it; do NOT add new sector taxonomy labels.

---

## Notes for the executing agent

- Sprint 4 (IF) finished with 4 open methodological caveats that apply equally to Chips JU under Option A: coordinator-only capture, country=HQ, NULL amounts where source data is missing, and amount-mechanism caveats for unusual call types. Cite them in the methodology entry rather than re-arguing.
- Don't re-invent the curl SSL workaround — it's documented in `project_eib_workarounds.md` and already used by both `extract_eib.py` and `extract_innovation_fund.py`.
- Don't re-invent the right-column PDF crop — if Chips JU fiches use the same two-column layout as IF fiches, `page.crop((page.width/2, 0, page.width, page.height))` is the proven approach.
- Don't duplicate `CHIPS_JU_SOURCE_SECTOR` between the extractor and `classify.py`. Define once in the extractor and import into classify (same pattern as IF after Sprint 4 cleanup).
- Don't add a "Semiconductors" sector label to the taxonomy. Keep the 6-label taxonomy intact; map at source level.
- If the data sourcing in Step 0 turns up something materially different from what this plan assumes (e.g., no per-project amounts available, calls reorganised, KDT and Chips JU merged in published lists), **stop and report back** before coding. Do not invent placeholders.

---

## Definition of done

- 30–80 Chips JU events loaded (or whatever Option B yields if explicitly chosen), all classified as deeptech_hardware
- Zero unclassified, zero orphan companies, zero debt pollution
- ≥10 cross-instrument matches against IPCEI MECT/Microelectronics
- Idempotent on re-run
- Documentation updates committed
- Decision log entry in methodology.md
- README total company count updated
