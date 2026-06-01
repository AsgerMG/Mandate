# Sprint 4 plan — EU Innovation Fund extraction

**Purpose of this doc**: a self-contained brief for a fresh Claude session to execute the Innovation Fund load without needing to re-derive context. Read top-to-bottom before touching code.

**Owner of this sprint**: Claude Sonnet, executing against `/Users/asgermollergrimberg/EuroInvTracker/files/`.

---

## TL;DR

Load EU Innovation Fund awarded projects (calls 2020–2025) into the existing SQLite DB as new `source='innovation_fund_<call>'` slices of `public_funding_events`. Expected size **~180–260 rows** across ~10 calls. Schema needs **no migration** (reuses `grant_amount_eur`). End state: corpus grows from 2,619 companies to roughly 2,750–2,820 (significant overlap with IPCEI cleantech expected), classifier re-run leaves zero `unclassified`, docs updated, decision log entry added.

Why this sprint and not Dealroom: the supply-side dataset needs to be complete before private-follow-on matching, so a single Dealroom pass covers the full corpus instead of being re-run per loader. Innovation Fund is the largest remaining public source by capital deployed (~€12–14B awarded to date) and by analytical weight for the cleantech hypothesis.

---

## Assumptions baked in (override at top of session if wrong)

1. **Time window**: 2020-07-01 (first IF call published) to today (2026-05-20). Match the existing corpus' upper bound; do NOT load post-today calls.
2. **Innovation Fund scope = awarded projects only**, NOT shortlisted / reserve-list / withdrawn. Awarded = a Grant Agreement was signed (or "selected for funding" per CINEA's published list).
3. **Calls in scope** (confirm against CINEA site at run time — names/numbering may have evolved):
   - IF Large-Scale 2020 (first call, awarded Nov 2021)
   - IF Small-Scale 2020 (awarded Apr 2022)
   - IF Large-Scale 2021 (awarded Jul 2022)
   - IF Small-Scale 2021 (awarded Feb 2023)
   - IF Large-Scale 2022 (awarded Jul 2023)
   - IF Small-Scale 2022 (awarded Feb 2024)
   - IF Large-Scale 2023 (Net-Zero Tech, Clean-Tech Manufacturing topics — awarded mid-2024)
   - IF Hydrogen Bank Auction Round 1 (2023 pilot, awarded Apr 2024, **in scope** — see #4)
   - IF 2024 calls (Net-Zero Tech, Mid-sized, Battery Cell Mfg — check awarded status)
   - IF Hydrogen Bank Auction Round 2 (Dec 2024–2025 — check awarded status before loading)
4. **Hydrogen Bank Auction is IN SCOPE.** It uses Innovation Fund budget and is administered by CINEA, even though the mechanism is auction (€/kg subsidy for green H₂ production) rather than CAPEX grant. Treat each successful auction bidder as one event row, with `grant_amount_eur` = total committed subsidy ceiling. Note the mechanism difference in methodology.
5. **Raw data not yet acquired.** Step 1 is acquisition.
6. **Schema migration**: NONE. Reuse existing `grant_amount_eur`, `role='direct'`, source pattern `innovation_fund_<short_call>` (one source per call, mirroring IPCEI).
7. **Consortia**: most IF projects have a single lead applicant ("Project Promoter") and that is the row inserted. If a call publishes consortium partners explicitly AND amounts are split per partner, load each partner as a separate event row (same as IPCEI's per-member-state split). If only the lead is published, load only the lead.
8. **Sector inference**: Innovation Fund is overwhelmingly cleantech. Treat as IPCEI-style — add an `IF_SOURCE_SECTOR` entry in `classify.py` mapping every `innovation_fund_*` source to `cleantech` as the source-level default. Edge cases (e.g. a future IF call funds biotech-for-decarbonization) override via `sector_tags_raw` at insert time.

---

## Context the next session needs

### What exists in the repo

- `db.sqlite` — 2,619 companies, 4,313 events (EIC + IPCEI + EIB).
- [schema.sql](schema.sql) — current schema, `debt_amount_eur` already added in Sprint 3.
- [load_eic.py](load_eic.py) — CSV loader pattern.
- [extract_ipcei.py](extract_ipcei.py) — **closest analogue**: multi-call PDF extractor with `PROGRAM_META` mapping + per-call `IPCEI_SOURCE_SECTOR` in classify.py. Innovation Fund's structure is nearly identical.
- [extract_eib.py](extract_eib.py) — pattern for scraper + name-matching when PIC codes are absent.
- [classify.py](classify.py) — idempotent classifier with `IPCEI_SOURCE_SECTOR` map, `MANUAL_SECTOR_OVERRIDES` dict (4 entries; keep an eye on it — if it grows past ~10, refactor).
- [sanity_check.py](sanity_check.py) — verification queries, includes DQ section (orphans, unclassified, manual overrides).
- [methodology.md](methodology.md), [notes.md](notes.md), [README.md](README.md) — living docs.

### Lessons from prior sprints (don't repeat)

1. **Classifier-after-loader is mandatory.** Every loader must end with `python3 classify.py`. Sprint 2 (IPCEI) shipped without this and 295 rows sat unclassified for hours. Sprint 3 made the rule explicit. Bake it into this sprint's script: `extract_innovation_fund.py --load-db` should print "next: run python3 classify.py".
2. **Per-source sector defaults > per-row keyword inference.** Sprint 3 needed 50+ new keywords in `classify.py` because EIB sector_tags_raw was empty for Industry/Services/Transport. **For IF, ALWAYS set `sector_tags_raw` to a non-empty EIC-compatible tag at insert time** (e.g. `"Energy"` → cleantech via existing CLEANTECH_TAGS, OR rely on the `IF_SOURCE_SECTOR` map which always returns cleantech). Don't repeat the keyword-bloat path.
3. **Idempotency.** `(source, call_id)` blocks duplicate events but does NOT block duplicate `companies` rows if name normalisation drifts. Use the existing `_normalize_name` helper from `extract_eib.py` (or copy it) and don't reinvent the normaliser. Re-runs must be safe.
4. **Don't auto-delete orphans.** The DQ check in `sanity_check.py` will report any orphans created; surface them to the user, do not silently delete.

### Research question recap (frames every decision)

"Does EU-directed public capital predict private follow-on investment?" — descriptive, not causal. Innovation Fund is the **strategic-decarbonization anchor capital** end of the spectrum, complementing IPCEI's industrial-anchor capital and EIC/EIB's startup-stage capital. Many IF beneficiaries are large incumbents (ArcelorMittal, BASF, Sasol) — they answer a different "signal" question than EIC. Stratify by `entity_type` in the analysis layer, not by pooling everything.

---

## Step-by-step execution

### Step 1 — Discovery + acquire raw data

Check `data/raw/innovation_fund/` first. If files are present, skip to Step 2.

If not present, the agent must do a brief discovery pass before scraping. **Do not assume URL structure from this doc — verify against the live site.**

1. **Canonical source**: CINEA Innovation Fund projects page.
   - Start at `https://cinea.ec.europa.eu/programmes/innovation-fund/innovation-fund-projects_en`.
   - The page lists awarded projects per call. Each call typically has either an aggregate PDF list OR individual one-page project sheets (also PDF) OR an Excel/CSV export.
   - Use WebFetch to get the index page and enumerate the call list. Save the index as `data/raw/innovation_fund/_index.html`.
2. **Per-call sources**: for each call in scope, find and download the canonical project list. Acceptable formats in priority order:
   - (a) Excel/CSV export (preferred — cleanest parse)
   - (b) Aggregate PDF with table of all projects
   - (c) Individual per-project one-pagers (worst — requires per-file parsing)
3. **Hydrogen Bank Auction**: separate page, likely `https://cinea.ec.europa.eu/programmes/innovation-fund/european-hydrogen-bank_en`. Save awarded-bidder lists per round.
4. **Backup source**: the EU Funding & Tenders Portal may also expose IF projects under topic codes starting with `INNOVFUND-*`. If CINEA pages are sparse, query the portal API (same pattern as EIC) with `programme=INNOVFUND` filter. **This may include PIC codes**, which is a big win for company matching — check this before deciding to skip the portal.
5. **Rate limit**: 1 req/sec for CINEA, same as EIB scraper.
6. **Last resort**: if scraping is blocked or CINEA's structure has changed significantly, ask the user to download the relevant PDFs / CSVs manually and place them in `data/raw/innovation_fund/`. **Don't fake data.**

Expected on-disk layout when Step 1 is done:
```
data/raw/innovation_fund/
├── _index.html                                          # CINEA index snapshot
├── lsp_2020/projects.{csv,pdf}                          # one folder per call
├── lsp_2020/projects.json                               # parsed checkpoint (Step 3 output)
├── ssp_2020/projects.{csv,pdf}
├── lsp_2021/...
├── ssp_2021/...
├── lsp_2022/...
├── ssp_2022/...
├── lsp_2023/...
├── hbank_2024/auction_results.{csv,pdf}                 # H2 Bank round 1
├── lsp_2024/...                                         # if awarded
└── nzt_2024/...                                         # if awarded
```

**Don't proceed past Step 1 without raw data on disk.** If acquisition fails for >2 calls, stop and report back.

### Step 2 — Schema check

No migration needed. Sanity-check before writing code:

```bash
sqlite3 db.sqlite "PRAGMA table_info(public_funding_events);" | grep -E "grant_amount_eur|debt_amount_eur|role|source"
```

Confirm `grant_amount_eur REAL` and `role TEXT` exist. If anything is missing, halt and ask — something has drifted.

Update [schema.sql](schema.sql) ONLY to update the column comments:
- Add `innovation_fund_lsp_2020`, `innovation_fund_ssp_2020`, …, `innovation_fund_hbank_2024` to the `source` field comment (illustrative list — full list goes in `PROGRAM_META` in the extractor).

### Step 3 — Build `extract_innovation_fund.py`

Mirror the structure of [extract_ipcei.py](extract_ipcei.py). Key constants at the top:

```python
PROGRAM_META = {
    "innovation_fund_lsp_2020":  {"call_label": "IF LSP 2020",      "raw_dir": "lsp_2020",  "awarded_date": "2021-11-16", "default_role": "direct"},
    "innovation_fund_ssp_2020":  {"call_label": "IF SSP 2020",      "raw_dir": "ssp_2020",  "awarded_date": "2022-04-12", "default_role": "direct"},
    "innovation_fund_lsp_2021":  {"call_label": "IF LSP 2021",      "raw_dir": "lsp_2021",  "awarded_date": "2022-07-12", "default_role": "direct"},
    "innovation_fund_ssp_2021":  {"call_label": "IF SSP 2021",      "raw_dir": "ssp_2021",  "awarded_date": "2023-02-09", "default_role": "direct"},
    "innovation_fund_lsp_2022":  {"call_label": "IF LSP 2022",      "raw_dir": "lsp_2022",  "awarded_date": "2023-07-13", "default_role": "direct"},
    "innovation_fund_ssp_2022":  {"call_label": "IF SSP 2022",      "raw_dir": "ssp_2022",  "awarded_date": "2024-02-15", "default_role": "direct"},
    "innovation_fund_lsp_2023":  {"call_label": "IF LSP 2023 NZT",  "raw_dir": "lsp_2023",  "awarded_date": "2024-07-XX", "default_role": "direct"},
    "innovation_fund_hbank_2024":{"call_label": "H2 Bank Round 1",  "raw_dir": "hbank_2024","awarded_date": "2024-04-30", "default_role": "direct"},
    # … add calls as they're confirmed in Step 1
}
```

(Verify exact `awarded_date` values against CINEA press releases; they're often cited explicitly.)

**Per-row fields written to `public_funding_events`:**

| Field | Innovation Fund value |
|---|---|
| `source` | `innovation_fund_<short_call>` (e.g. `innovation_fund_lsp_2022`) |
| `call_id` | CINEA project ID if published (e.g. `101076432`); else `<source>_<short_project_name>` slugified |
| `role` | `direct` (lead applicant); `participant` only if a call explicitly lists consortium partners with per-partner amounts |
| `project_title` | Project name as published |
| `project_summary` | Short technical description from project sheet (first 500 chars max) |
| `project_started` | Awarded date from `PROGRAM_META` (Grant Agreement signature date if available — otherwise use the call's awarded_date) |
| `call_deadline` | The call's submission deadline (find in CINEA call documentation) — optional but useful |
| `grant_amount_eur` | Requested OR awarded grant in EUR. CINEA usually publishes "Maximum grant amount" — use that. **Convert millions to units** if the source uses `€M`. |
| `debt_amount_eur` | NULL (this is a grant programme) |
| `equity_amount_eur` | NULL |
| `sector_tags_raw` | `"Energy"` (which CLEANTECH_TAGS already matches) for all rows by default. Override only if a project is clearly outside cleantech (rare). |
| `raw_source_url` | URL to the CINEA project sheet (PDF) or aggregate page |

**Source-level sector default**: also add to [classify.py](classify.py):

```python
IF_SOURCE_SECTOR = {
    "innovation_fund_lsp_2020":  "cleantech",
    "innovation_fund_ssp_2020":  "cleantech",
    "innovation_fund_lsp_2021":  "cleantech",
    "innovation_fund_ssp_2021":  "cleantech",
    "innovation_fund_lsp_2022":  "cleantech",
    "innovation_fund_ssp_2022":  "cleantech",
    "innovation_fund_lsp_2023":  "cleantech",
    "innovation_fund_hbank_2024":"cleantech",
    # extend with any new calls
}
```

And extend `classify_sector` so the resolution order is: EIC tags → keyword fallback → IPCEI source map → IF source map → `unclassified`. This is the same lift as the IPCEI follow-up from Sprint 2.

### Step 4 — Company matching

Innovation Fund publishes the lead applicant's **legal name** but rarely a PIC (some recent calls via Funding & Tenders Portal do — check Step 1d). Match strategy mirrors `extract_ipcei.py` exactly:

1. **If PIC available** (Funding & Tenders Portal): exact PIC match → `match_confidence='high'`.
2. **Else exact normalised-name + country** match (using the same `_normalize_name` function used in `extract_eib.py` — copy it, don't fork it) → `match_confidence='high'`.
3. **Else fuzzy** (SequenceMatcher ≥ 0.92, same country) → `match_confidence='medium'`.
4. **No match** → insert new row, `match_method='innovation_fund'`, `pic=NULL`, `match_confidence='unmatched'`.

Expected overlap:
- **EIC**: low, 5–15 matches (IF is mostly large industrials, not EIC SMEs).
- **IPCEI**: higher, 15–30 matches (BASF, ArcelorMittal, Solvay, Northvolt etc. appear in both — esp. Hy2Tech/EuBatIn vs IF H2/battery calls).
- **EIB venture**: very low, 0–5 matches (different stage profile).

Write the match audit to `data/processed/innovation_fund_match_summary.csv` mirroring `ipcei_match_summary.csv`. Include columns: `source`, `call_id`, `published_name`, `country`, `matched_company_id`, `matched_canonical_name`, `match_method`, `match_confidence`, `fuzzy_score` (NULL if exact).

### Step 5 — Run classifier and sanity check

```bash
python3 classify.py        # idempotent re-classification, picks up IF_SOURCE_SECTOR
python3 sanity_check.py    # verify counts + DQ gates
```

Add an Innovation Fund section to [sanity_check.py](sanity_check.py), mirroring the IPCEI and EIB sections:
- Events and distinct beneficiaries per call.
- Country distribution.
- Sector distribution (sanity — should be ≥99 % cleantech).
- Per-call grant-sum aggregation (validation target — see Step 6).
- Top-line: total events, distinct beneficiaries, matched to EIC, matched to IPCEI, matched to EIB, new IF-only inserts.
- Multi-instrument winners (IF + at least one other source).

### Step 6 — Validation gates

Before declaring done, verify:

- [ ] Row count in `public_funding_events` WHERE `source LIKE 'innovation_fund%'`: 180–260 (flag if outside range; could mean missed calls or filter wrong).
- [ ] Every row has non-NULL `country`, `canonical_name`, `grant_amount_eur` (unless CINEA explicitly redacted — should be rare).
- [ ] Zero new `sector_inferred='unclassified'` rows after classifier run.
- [ ] Zero rows where `debt_amount_eur` is populated for `source LIKE 'innovation_fund%'` (grants must not pollute debt aggregations).
- [ ] **Per-call grant-sum validation**: for each call, sum of `grant_amount_eur` should be within ±5 % of CINEA's published total. CINEA press releases cite the total cleanly ("€1.4 billion awarded to 17 projects"). If gap >5 %, an FX issue or M€-vs-€ unit error is the most likely cause — fix before proceeding.
- [ ] **Beneficiary-count validation**: count of distinct beneficiaries per call should match CINEA's published count.
- [ ] No duplicate `(source, call_id)` pairs.
- [ ] DQ section in `sanity_check.py` shows zero orphans, zero unclassified.
- [ ] Multi-instrument winners (IF + EIC/IPCEI/EIB) is non-empty AND includes plausible candidates (e.g. Northvolt should appear in both EuBatIn and an IF Battery call).

### Step 7 — Documentation updates

Update three docs in this order:

1. **[methodology.md](methodology.md)** — add a new top-level section `## Innovation Fund extraction` after the EIB section. Structure mirrors IPCEI/EIB sections: scope, calls table (with awarded date, projects count, total grant), schema mapping table, sector mapping rationale (all cleantech, with the H2 Bank mechanism note from Assumption #4), matching strategy, validation results. Update the `## Source coverage` table to mark Innovation Fund as ✅ Loaded with N rows. Add a row to the decision log dated the run date.
2. **[notes.md](notes.md)** — add `## Day 5 (2026-05-2X): Innovation Fund load`. Numbers table, multi-instrument winners found, methodology notes (esp. on Hydrogen Bank Auction's auction-vs-grant mechanism), open items, files added.
3. **[README.md](README.md)** — flip Innovation Fund row in the Data sources table from `pending` to `✅ loaded`. Update total company count. Add `python3 extract_innovation_fund.py --load-db` to the Run block (between `extract_eib.py` and `classify.py`).

---

## Anti-goals — don't do any of these

- **Don't load shortlisted/reserve-list/withdrawn projects.** Only awarded (Grant Agreement signed OR officially "selected for funding"). Reserve-list is signal that should not be conflated with funded.
- **Don't load Connecting Europe Facility (CEF) projects** even if they're climate-themed. CEF is a different budget line. Out of scope.
- **Don't load LIFE programme projects.** Different programme, different scope. Out of scope.
- **Don't reverse-link IPCEI beneficiaries that ALSO got IF funding** as a single event. They're separate instruments → separate events on the same `companies` row. The multi-instrument-winner query surfaces them; don't conflate at the event level.
- **Don't expand the schema.** No new columns. Reuse what exists.
- **Don't add Hydrogen Bank Auction Round 2 if it hasn't been awarded** at run time. Check the CINEA page; if Round 2 results aren't published yet, skip it and add to "open items" in notes.
- **Don't start Dealroom matching, Chips Act, EDF, or STEP seal as part of this sprint.** Each is a separate sprint.
- **Don't impute missing grant amounts.** If CINEA redacts (rare for IF — they usually publish), leave NULL and document.
- **Don't keyword-expand `classify.py`.** Set `sector_tags_raw='Energy'` at insert time and let the existing CLEANTECH_TAGS match handle it. If a project is genuinely non-cleantech, set `sector_tags_raw` to the right EIC tag explicitly.

---

## Definition of done

A future session should be able to run these queries and get sensible answers:

```sql
-- Should return a number between 180 and 260
SELECT COUNT(*) FROM public_funding_events WHERE source LIKE 'innovation_fund%';

-- Should return ≥10 (calls split per Year × LSP/SSP/HBank)
SELECT COUNT(DISTINCT source) FROM public_funding_events WHERE source LIKE 'innovation_fund%';

-- Should return 0
SELECT COUNT(*) FROM companies WHERE sector_inferred IS NULL OR sector_inferred = 'unclassified';

-- Should return 0 (no debt pollution)
SELECT COUNT(*) FROM public_funding_events
WHERE source LIKE 'innovation_fund%' AND debt_amount_eur IS NOT NULL;

-- Per-call grant sums (sanity — compare each to CINEA press release total)
SELECT source,
       COUNT(*) AS projects,
       ROUND(SUM(grant_amount_eur) / 1e6, 1) AS total_grant_m_eur
FROM public_funding_events
WHERE source LIKE 'innovation_fund%'
GROUP BY source
ORDER BY source;

-- Multi-instrument winners involving IF: should return 15-40 rows
SELECT c.canonical_name, c.country,
       GROUP_CONCAT(DISTINCT pfe.source) AS sources,
       COUNT(DISTINCT pfe.source) AS n_sources
FROM companies c
JOIN public_funding_events pfe ON pfe.company_id = c.id
GROUP BY c.id
HAVING n_sources >= 2
   AND SUM(CASE WHEN pfe.source LIKE 'innovation_fund%' THEN 1 ELSE 0 END) > 0
ORDER BY n_sources DESC, c.canonical_name;

-- Sector distribution within IF: should be ≥99% cleantech
SELECT c.sector_inferred, COUNT(DISTINCT c.id) AS companies
FROM companies c
JOIN public_funding_events e ON e.company_id = c.id
WHERE e.source LIKE 'innovation_fund%'
GROUP BY c.sector_inferred
ORDER BY companies DESC;
```

Documentation reads consistently: README, methodology IF-extraction section, and notes Day 5 all use the same final row count and same per-call grant figures.

---

## After this sprint

Suggested order for remaining sources (don't start without user confirmation):

1. **Sprint 5 — Chips JU / Chips Act** (~30–50 rows, semiconductor — expect heavy IPCEI Micro/MECT overlap)
2. **Sprint 6 — EDF leaders** (~80–120 rows, defence — introduces dual-use angle; check defence-disclosure constraints)
3. **Sprint 7 — STEP seal tagging** (overlay on existing rows, not a new source; small but methodologically valuable)
4. **Sprint 8 — Dealroom matching** (the right-hand-side variable for the research question — see [sprint_8_dealroom_plan.md](sprint_8_dealroom_plan.md))

Each loader follows the same template established by IPCEI/EIB/IF. Once Dealroom matching is in place, the project moves from data engineering to analysis.

---

## If you get stuck

- **CINEA project pages have inconsistent formats across calls.** Build a per-call parser; don't try to write one parser that handles every layout. A small dispatcher (`parse_call_lsp_2020(path)`, `parse_call_ssp_2022(path)`, …) is fine and easier to debug than one giant function.
- **Project sheet PDF parses produce garbled text** (CINEA PDFs sometimes use embedded images for tables): try `pdfplumber` first, then `pypdf` as fallback. If both fail for a given call, fall back to the CSV/Excel export — most calls have one even if it's buried in the press kit.
- **Lead-beneficiary name is ambiguous** (e.g. "Project consortium led by X with Y, Z"): use X only as the canonical row. Note the consortium members in `project_summary`. Don't try to load consortium members as separate rows unless amounts are published per partner (rare for IF outside the LSP track).
- **Grant amount unit confusion**: CINEA mixes `€`, `€M`, and `EUR million` across documents. Always store EUR units (i.e. €100M = 100_000_000) — same convention as the rest of the DB. If validation Step 6 shows a 1,000,000× mismatch, this is the cause.
- **Hydrogen Bank Auction amounts**: the published number is € per kg subsidy × max production volume × duration. Use the **maximum total commitment** as `grant_amount_eur` (it's what CINEA cites in press totals). Document the auction-vs-grant distinction in methodology.
- **Match score borderline (0.85–0.92)**: prefer "no match" + new insert over false positive. False merges are harder to undo than missed merges.
- **Some IF beneficiaries are SPVs created for the project** (e.g. "H2 Green Steel Boden AB" is a SPV of H2 Green Steel AB). Use the published legal entity name as canonical — don't try to roll up to parent at this stage. SPV→parent rollup is a future enrichment step.
- **CINEA pages return 403/429 (rate limiting)**: back off to 2-3 sec/req. Don't try to evade. If still blocked after backoff, ask the user.
- **Funding & Tenders Portal has IF data with PIC codes**: prefer this source for any call where it's available; it gives the cleanest matching against existing EIC companies. Only fall back to the CINEA-only scrape for calls the portal doesn't expose yet.

---

## Files added (expected)

```
extract_innovation_fund.py
data/raw/innovation_fund/_index.html                        # CINEA index snapshot
data/raw/innovation_fund/<call_short>/projects.{csv,pdf}    # per-call raw data
data/raw/innovation_fund/<call_short>/projects.json         # parsed checkpoint
data/processed/innovation_fund_match_summary.csv            # per-row match audit
```

Updates to existing files:
- `schema.sql` (column comments only)
- `classify.py` (add `IF_SOURCE_SECTOR` and extend `classify_sector` resolution order)
- `sanity_check.py` (add IF queries section)
- `methodology.md`, `notes.md`, `README.md` (Step 7)
