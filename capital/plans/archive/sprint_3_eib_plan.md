# Sprint 3 plan — EIB venture-debt extraction

**Purpose of this doc**: a self-contained brief for a fresh Claude session to execute the EIB load without needing to re-derive context. Read top-to-bottom before touching code.

**Owner of this sprint**: Claude Sonnet, executing against `/Users/asgermollergrimberg/EuroInvTracker/files/`.

---

## TL;DR

Load EIB direct venture-debt and growth-equity loans (2021–2026) into the existing SQLite DB as a new `source='eib_venture'` slice of `public_funding_events`. Expected size ~60–120 rows. Schema gets a new `debt_amount_eur` column. End state: corpus grows from 2,484 companies to ~2,550–2,600, classifier re-run leaves zero `unclassified`, docs updated.

---

## Assumptions baked in (override at top of session if wrong)

1. **Time window**: 2021-01-01 to 2026-05-20 (matches existing corpus).
2. **EIB scope = direct corporate venture debt + growth equity only.** Exclude:
   - EIF (European Investment Fund) — fund-of-funds, indirect, different instrument
   - EIB loans to other banks ("intermediated lending")
   - Pure infrastructure project finance unless the borrower is a single corporate entity in a scope sector
   - Public-sector borrowers (ministries, regional authorities)
3. **Raw data not yet acquired.** Step 1 is acquisition.
4. **Schema migration**: add `debt_amount_eur REAL` to `public_funding_events`. Do NOT rename `grant_amount_eur` (would break the EIC + IPCEI rows).
5. **Role value**: `borrower`.
6. **Sector tagging**: EIB publishes "Sector" per project; map per-loan to the 6-label taxonomy (no source-level default — EIB spans sectors).

---

## Context the next session needs

### What exists in the repo

- `db.sqlite` — 2,484 companies, 3,843 EIC events + 317 IPCEI events.
- [schema.sql](schema.sql) — current schema (companies, public_funding_events, private_funding_events).
- [load_eic.py](load_eic.py) — pattern for CSV loader.
- [extract_ipcei.py](extract_ipcei.py) — pattern for PDF/multi-source extractor with PROGRAM_META mapping.
- [classify.py](classify.py) — idempotent sector + entity_type classifier. **Must be re-run after every loader.**
- [sanity_check.py](sanity_check.py) — verification queries.
- [methodology.md](methodology.md), [notes.md](notes.md), [README.md](README.md) — living docs.

### The IPCEI lesson (don't repeat)

Day 3 had a real bug: `extract_ipcei.py` inserted 295 new `companies` rows but the classifier wasn't re-run, so they sat as `entity_type='unknown'` AND `sector_inferred=NULL` until much later. When the classifier was eventually re-run, it overwrote per-program sectors with `unclassified` because IPCEI rows have no `sector_tags_raw`. Fix landed in [classify.py](classify.py) (added `IPCEI_SOURCE_SECTOR` and `sources` arg).

**Operational rule**: every loader must end with a `python3 classify.py` call OR set `sector_inferred` directly during insert AND ensure `classify.py` knows not to overwrite it. For EIB, set sector directly per-loan based on EIB's published "Sector" field; classifier will then have `sector_tags_raw` populated and will not fall through to `unclassified`.

### Research question recap (frames every decision)

"Does EU-directed public capital predict private follow-on investment?" — descriptive, not causal. EIB venture debt is the **closest-to-equity** public instrument we'll load; it's the most analytically interesting source for the follow-on question because EIB venture debt is typically co-invested alongside VC rounds.

---

## Step-by-step execution

### Step 1 — Acquire raw EIB data

Check `data/raw/eib/` first. If files are already there, skip to Step 2.

If not present, acquire from the EIB Project Finance public database:

1. URL: `https://www.eib.org/en/projects/all/index.htm` (verify current URL; EIB occasionally renames paths)
2. Filter UI: Status = `Signed` OR `Approved`; Signature date = 2021-01-01 onward; Product/Instrument = `Venture debt` and/or `Growth finance` if those filters exist; otherwise filter by free-text search "venture debt" and "growth" in the project description.
3. **Preferred**: use the CSV export button if present. Save as `data/raw/eib/eib_projects_signed_20260520.csv`.
4. **Fallback**: if no CSV export, scrape the listing pages. For each project, you need: project number, project name, borrower name, country, sector, signature date, approved amount EUR, project description URL. Use `requests` + `BeautifulSoup`. Rate-limit to 1 req/sec.
5. **Last resort**: if scraping is blocked or the search UI is unworkable, ask the user to download the CSV manually from the EIB site and place it in `data/raw/eib/`. Don't try to brute-force around bot protection.

**Don't proceed past Step 1 without raw data on disk.** If acquisition fails, stop and report back — don't make up data or use sparse fallback sources like press releases without explicit user confirmation.

### Step 2 — Schema migration

Add `debt_amount_eur` to `public_funding_events`. The DB has data — `DROP TABLE` is not safe. Use `ALTER TABLE`:

```sql
ALTER TABLE public_funding_events ADD COLUMN debt_amount_eur REAL;
```

Also update [schema.sql](schema.sql) so a fresh build matches:

- Add `debt_amount_eur REAL,` after `equity_amount_eur REAL` line.
- Update the column comment for `source` to include `eib_venture`.
- Update the column comment for `role` to include `borrower`.

Run the ALTER against `db.sqlite` directly (one-line `sqlite3 db.sqlite "ALTER TABLE ..."`); verify with `PRAGMA table_info(public_funding_events);`.

### Step 3 — Build `extract_eib.py`

Mirror the structure of [extract_ipcei.py](extract_ipcei.py). Key differences from IPCEI:

- Input: CSV (or scraped JSON), not PDF.
- One row per loan (no country-split issue like IPCEI).
- Sector is set per-loan from EIB's "Sector" field, mapped to the 6-label taxonomy via an `EIB_SECTOR_MAP` constant at the top of the file. Common EIB sectors and their mapping:
  - "Health" / "Life sciences" / "Biotech" → `life_sciences`
  - "Energy" / "Renewable energy" / "Climate action" / "Environmental protection" → `cleantech`
  - "Industry" with deep-tech context (semis, quantum, advanced materials) → `deeptech_hardware`
  - "Services" / "Telecommunications" / "Information technology" → `digital`
  - "Transport" — case-by-case: space launch → `space`, mobility → `other`
  - Default → `other` (and log a warning so the user can review)
- Loan amount goes in `debt_amount_eur`, NOT `grant_amount_eur`.
- `role = 'borrower'`.
- `source = 'eib_venture'` for venture debt; `source = 'eib_growth'` for growth equity if you can distinguish. If you can't reliably split them, use `eib_venture` and note in methodology.
- `call_id` = EIB project number (e.g. `20210123` or whatever format EIB uses).
- `raw_source_url` = link to the EIB project page.

### Step 4 — Company matching

EIB borrowers will not have PIC codes (PIC is Horizon-specific). Match against existing `companies` by canonical_name + country, using the same strategy as `extract_ipcei.py`:

1. Normalise name: lowercase, strip legal-form suffixes, collapse whitespace.
2. Exact normalised-name match within same country → link to existing `companies.id`, set `match_confidence='high'` (or keep prior if already higher).
3. Fuzzy match (SequenceMatcher ratio ≥ 0.92, same country) → link with `match_confidence='medium'`.
4. No match → insert new row, `match_method='eib'`, `pic=NULL`, `match_confidence='unmatched'`.

Expected overlap with EIC: 5–20 borrowers (EIB venture debt skews to scale-ups, many of which are EIC Accelerator graduates). Track these as multi-instrument winners.

Write the match audit to `data/processed/eib_match_summary.csv` with the same columns as `ipcei_match_summary.csv`.

### Step 5 — Run classifier and sanity check

```bash
python3 classify.py        # idempotent re-classification of all companies
python3 sanity_check.py    # verify counts
```

Add an EIB section to [sanity_check.py](sanity_check.py) mirroring the IPCEI block:
- Total EIB events, distinct borrowers, matched to EIC, new EIB-only.
- Country distribution.
- Sector distribution.
- Sum of `debt_amount_eur` (sanity-check vs EIB annual report figures — see Step 7).

### Step 6 — Validation gates

Before declaring done, verify:

- [ ] Row count in `public_funding_events` WHERE `source='eib_venture'`: 60–120 (flag if outside range; could mean filter wrong).
- [ ] Every row has non-NULL `country` (ISO-2), `canonical_name`, `debt_amount_eur`, `sector_inferred` after classifier run.
- [ ] Zero new `sector_inferred='unclassified'` rows.
- [ ] Zero rows where `grant_amount_eur` is populated for `source='eib_venture'` (loans must not pollute grant aggregations).
- [ ] Total `debt_amount_eur` for 2021–2025 within ±20% of the figure EIB publishes annually for venture-debt commitments (find on EIB.org Annual Report or stats portal). If gap is >20%, investigate scope mismatch before publishing.
- [ ] Companies count went up by `new_eib_borrowers` (the new IDs in the match summary).
- [ ] No duplicate `(source, call_id)` pairs in `public_funding_events`.

### Step 7 — Documentation updates

Update three docs in this order:

1. **[methodology.md](methodology.md)** — add a new top-level section `## EIB venture debt extraction` after the IPCEI section. Structure mirrors the IPCEI section: scope, schema mapping table, sector mapping rationale, matching strategy, validation results. Update the `## Source coverage` table to mark EIB as ✅ Loaded with N rows. Add a row to the decision log dated `2026-05-2X` (whatever date you actually run this).

2. **[notes.md](notes.md)** — add `## Day 4 (2026-05-2X): EIB venture-debt load`. Mirror the Day 3 structure: numbers, multi-instrument winners found, methodology notes, open items, files added.

3. **[README.md](README.md)** — flip EIB row in the Data sources table from `pending` to `✅ loaded`. Update the total company count. Add `python3 extract_eib.py` to the Run block in the right position.

---

## Anti-goals — don't do any of these

- **Don't load EIF investments.** EIF is fund-of-funds — money goes to VC funds, not directly to companies. Different research question, different schema fit. If user wants EIF later, separate sprint.
- **Don't load EIB intermediated lending** (loans to local banks who then lend to SMEs). Borrower is the bank, not the SME. Out of scope.
- **Don't expand the schema beyond `debt_amount_eur`.** No new tables, no new metadata columns. Keep the migration boring.
- **Don't start Dealroom matching as part of this sprint.** That's sprint 4+ and is a much bigger workstream.
- **Don't impute missing loan amounts.** EIB usually publishes approved amounts; if they're missing, leave `debt_amount_eur` NULL and add `debt_amount_redacted` to `raw_source_url` notes (or accept the NULL and document in methodology).
- **Don't rename `grant_amount_eur`.** Tempting, but it breaks all existing aggregation logic and analysis notebooks (none exist yet, but rename later if needed).
- **Don't add a `defense` sector label** even if EIB has defence-tagged projects. Methodology already decided dual-use stays at enrichment time.
- **Don't backfill EIC equity tickets in the same sprint.** Separate work. Mention in notes as still-open if you spot a clean source while doing EIB.

---

## Definition of done

A future session should be able to run these queries and get sensible answers:

```sql
-- Should return a number between 60 and 120
SELECT COUNT(*) FROM public_funding_events WHERE source LIKE 'eib%';

-- Should return 0
SELECT COUNT(*) FROM companies WHERE sector_inferred IS NULL OR sector_inferred = 'unclassified';

-- Should return 0
SELECT COUNT(*) FROM public_funding_events
WHERE source LIKE 'eib%' AND (grant_amount_eur IS NOT NULL OR debt_amount_eur IS NULL);

-- Multi-instrument winners: should return 5-25 rows
SELECT c.canonical_name, c.country,
       GROUP_CONCAT(DISTINCT pfe.source) AS sources
FROM companies c
JOIN public_funding_events pfe ON pfe.company_id = c.id
GROUP BY c.id
HAVING COUNT(DISTINCT pfe.source) >= 2 AND sources LIKE '%eib%'
ORDER BY c.canonical_name;
```

Documentation reads consistently: README, methodology IPCEI-style table, and notes Day 4 all use the same final row count and same EIB volume figure.

---

## After this sprint

Suggested order for remaining sources (don't start without user confirmation):

1. Innovation Fund (~200 rows, climate/cleantech — biggest volume increment)
2. Chips JU (~30–50 rows, semiconductor — expect heavy IPCEI Micro/MECT overlap)
3. EDF leaders (~80–120 rows, defence — introduces dual-use angle)
4. STEP seal (overlay, not a source)

Then sprint to Dealroom matching, which is the actual gate to the research question.

---

## If you get stuck

- **EIB site blocks scraping**: stop and ask user. Don't try to evade.
- **CSV export has fewer fields than expected**: scrape project detail pages to enrich; only the borrower-page is the source of truth for amounts.
- **Sector mapping is ambiguous for a given loan**: read the project description, apply use-domain-over-enabler rule from methodology.md. If still ambiguous after that, default to `other` and add to a list in notes for user review.
- **Match score is borderline (0.85–0.92)**: prefer "no match" + insert new row over false positive. Users can manually merge later via a dedup pass.
- **Loan amount in non-EUR currency**: convert using EIB's published EUR exchange rate as of signature date; store original in `raw_source_url` notes field. Don't silently drop or guess.
