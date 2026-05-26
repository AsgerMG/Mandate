# BACKLOG — Private-side enrichment (free-source pivot from Dealroom)

> **Status: BACKLOG** (deferred 2026-05-22). Originally drafted as Sprint 9; user decided to defer private-side enrichment in favour of a supply-side exploratory study ([`sprint_9_exploratory_study_plan.md`](../sprint_9_exploratory_study_plan.md)). Reasoning: free-source coverage (~10–25% via EU-Startups scrape, biased toward EIC-funded startups) would risk producing biased "EU funding → private follow-on" claims against a self-selected sample, and the supply-side corpus itself is genuinely under-explored. Better to find the sharp research question first, then decide what specific private data we actually need.
>
> **When to revisit**: when (a) institutional Crunchbase access materialises, (b) a sharper research question emerges from the EDA work that justifies the coverage trade-offs, or (c) the user accepts the coverage bias for a specific narrow analysis (e.g. only the EIC-funded cohort). See the companion [`private_side_paid_api_reference.md`](private_side_paid_api_reference.md) for the paid-API path.
>
> **No edits needed if revived** — this plan is execution-ready as written; just delete this banner and renumber the sprint header.

---

**Owner of this sprint (when revived)**: Claude Sonnet 4.6, executing against `/Users/asgermollergrimberg/EuroInvTracker/scripts/`.

**Hard constraint (set by user 2026-05-22)**: zero budget for paid APIs (Crunchbase / Dealroom / PitchBook / CB Insights / Tracxn / Sifted Pro). This plan uses only **freely-accessible APIs with no commercial license required and no long signup process**. This means we cannot deliver "comprehensive private follow-on rounds with amounts and investors" because that dataset is genuinely a paid product. We instead deliver a **multi-signal proxy** for the same research question.

---

## TL;DR for a fresh Claude session

You are populating the right-hand-side variable for a research question: *do companies that received EU public funding go on to attract private capital / survive / grow?* The supply-side dataset is frozen at 3,101 companies / 4,969 events after Sprint 8 (see `docs/notes.md` Day 10 + addendum). Sprint 9 attaches private-side and activity signals from free sources only.

Five workstreams, executed sequentially. Each writes its own loader script following the existing patterns in `scripts/extract_chips_ju.py` (free-API loader), `scripts/audit_dedup.py` (audit script with `--load-db`), `scripts/tag_step.py` (single-tier exact match with country aliases), `scripts/classify.py` (regex-heavy classifier with audit log).

Each workstream is independently re-runnable. Each ends with a verifiable gate. **If a gate fails, stop and report — do not paper over.**

End state after this sprint:
- `private_funding_events` populated from EU-Startups.com news scrape (~200–600 events expected; honest about coverage)
- New `companies` columns: `lei`, `legal_entity_status`, `legal_form`, `founded_year`, `website_status`, `last_activity_year`, `n_publications`, `n_patents` (subset populated per company; NULL OK)
- New `company_status` column with values `{active, inactive, acquired, merged, dissolved, unknown}` derived from combined signals
- Pre-Analysis Health Report at `data/processed/post_sprint9_enrichment_report.md`
- All scripts idempotent and re-runnable
- Decision log entry in `methodology.md`; Day 11 note in `notes.md`

---

## Free sources actually used (verify before scripting; URLs as of 2026-05-22)

| Source | What it gives us | URL | Auth | Rate limit |
|---|---|---|---|---|
| **GLEIF** | LEI + legal status (`ACTIVE`/`LAPSED`/`MERGED`/`INACTIVE`/`PENDING_TRANSFER`/etc.), official legal name, jurisdiction, legal form | `https://api.gleif.org/api/v1/lei-records` | None | Polite throttle (1 req / 0.5 s) |
| **OpenCorporates** | Company number + status per jurisdiction; covers EU corporates well | `https://api.opencorporates.com/v0.4/companies/search` | Free API key after signup (email-only) | Free tier: 500 reqs/month — use sparingly; chunk to top-N companies |
| **OpenAlex** | Publication count + citation count for research orgs and corporate R&D | `https://api.openalex.org/works`, `/institutions` | None (polite-pool via email in `mailto=` query param) | 10 reqs/s polite, 100k/day |
| **Wikidata SPARQL** | founding date, total employees, owned-by/subsidiary-of, dissolved date for well-known set | `https://query.wikidata.org/sparql` | None | Aim for ≤30 reqs/min |
| **EU-Startups.com** | Weekly funding round announcements for European startups (the most consistently structured free European funding-round source) | `https://www.eu-startups.com/category/funding/page/{N}/` | None | Polite, ≤1 req / 2 s |
| **HTTP HEAD on website column** | Website liveness (200 / 3xx / 4xx / 5xx / timeout) | n/a | None | 1 req / 0.5 s per host, concurrent ≤5 |
| **EPO OPS** (optional, tier C) | Patent count per applicant | `https://ops.epo.org/3.2/rest-services/...` | Free API key after signup | 3.6 reqs/s; 4 GB/week free |
| **Crossref** (optional, tier C) | DOI / publication metadata; backup for OpenAlex | `https://api.crossref.org/works` | None | Polite via mailto query param |

**Explicitly NOT used** (paid or long-process):
- Crunchbase (paid since 2021; "Open Data Map" is paid)
- Dealroom (paid; no free tier)
- PitchBook / CB Insights / Tracxn (paid)
- LinkedIn (TOS forbids scraping at scale)
- News-aggregator APIs (NewsAPI free tier insufficient; rate limits make 3k-company sweep impractical)
- Companies House (UK-only, narrow coverage of our corpus)

---

## Scope decisions (locked before scripting)

1. **Private funding events go in `private_funding_events`** (existing schema, columns: `event_date, round_type, amount_eur, lead_investor, all_investors, investor_geography, source, source_url, confidence, notes`). Default `source='eu_startups'` for this sprint; future tiers can add `source='wikipedia'` / `source='crossref_news'` / etc. without schema change.
2. **`confidence` column values**: `exact_name_country` / `exact_name_only` / `fuzzy_high` (≥0.92) / `manual`. Same convention as existing match scripts.
3. **`round_type` values**: `pre_seed`, `seed`, `series_a`, `series_b`, `series_c`, `series_d_plus`, `growth`, `debt`, `grant`, `secondary`, `ipo`, `acquisition`, `unknown`. Same vocab as the Dealroom plan used. EU-Startups text often gives round letter verbatim; parse aggressively, default to `unknown`.
4. **`amount_eur` parsing**: EU-Startups uses formats like "€2 million" / "$5M" / "€450K". Use single regex with multipliers `K/M/B = 1e3/1e6/1e9`. Currency conversion: `$ → € * 0.92`, `£ → € * 1.17` (snapshot rates 2026-05-22; document in script comment, no live FX). For ambiguous cases, NULL.
5. **Company-status derivation rule** (computed in last workstream):
   - GLEIF `LAPSED`/`MERGED`/`RETIRED` → `merged` (if merged into named entity) or `inactive`
   - GLEIF `ACTIVE` AND website returns 200/3xx → `active`
   - GLEIF `ACTIVE` AND website 4xx/5xx/timeout AND no news ≥ 24 months → `inactive`
   - Acquisition event in `private_funding_events` → `acquired` (overrides above)
   - Default → `unknown`
6. **No new schema migrations live without first updating `scripts/schema.sql`** and re-confirming via `PRAGMA table_info()`. Always backup DB before any `--load-db` step.

---

# Workstream A — Entity identity & legal status (foundation)

Two-script workstream. Establishes which of our 3,101 companies have a canonical LEI / OpenCorporates ID, and what their current legal status is. This is the cleanest free signal of "is this entity still alive."

## Step A1 — Schema additions

Add columns to `companies` (backup DB first):

```sql
ALTER TABLE companies ADD COLUMN lei TEXT;                            -- 20-char LEI from GLEIF
ALTER TABLE companies ADD COLUMN legal_entity_status TEXT;            -- ACTIVE / LAPSED / MERGED / INACTIVE / PENDING_*
ALTER TABLE companies ADD COLUMN legal_form TEXT;                     -- "GMBH", "SARL", etc. from GLEIF
ALTER TABLE companies ADD COLUMN founded_year INTEGER;                -- earliest of: GLEIF initial_registration, Wikidata inception, OpenCorporates incorporation
ALTER TABLE companies ADD COLUMN website_status TEXT;                 -- live / redirect / dead / timeout / unchecked
ALTER TABLE companies ADD COLUMN website_checked_at TIMESTAMP;
ALTER TABLE companies ADD COLUMN last_activity_year INTEGER;          -- computed in D
ALTER TABLE companies ADD COLUMN n_publications INTEGER DEFAULT 0;    -- OpenAlex count
ALTER TABLE companies ADD COLUMN n_patents INTEGER DEFAULT 0;         -- EPO OPS count (optional tier)
ALTER TABLE companies ADD COLUMN company_status TEXT;                 -- computed: active/inactive/acquired/merged/dissolved/unknown
ALTER TABLE companies ADD COLUMN company_status_basis TEXT;           -- which signal(s) drove the classification
```

Mirror in `scripts/schema.sql`. Verify with `PRAGMA table_info(companies)` after ALTER.

## Step A2 — Build `enrich_gleif.py`

Pattern: see `scripts/tag_step.py` (two-mode loader: write CSV first, then `--load-db`). Output: `data/processed/gleif_match_summary.csv`.

Strategy:
- For each `companies` row, query `https://api.gleif.org/api/v1/lei-records?filter[entity.legalName]=<name>&filter[entity.legalAddress.country]=<ISO2>&page[size]=5`. Take first result whose `entity.legalName` ≈ canonical_name (case-insensitive, suffix-normalized via the shared `normalize_name` from `extract_chips_ju.py`).
- Apply EL↔GR and UK↔GB country aliases (lesson from Sprint 8 dedup + STEP loaders).
- On match, store `lei` + `legal_entity_status` (from `attributes.registration.status`) + `legal_form` (from `attributes.entity.legalForm.id`) + `founded_year` (from `attributes.registration.initialRegistrationDate[:4]`).
- Idempotent: on re-run, UPDATE existing rows; only INSERT new LEI for rows previously NULL.

**Gate A2**: ≥40% of `entity_type='company'` rows get an LEI match. If <40%, escalate before A3 — likely indicates name-normalisation mismatch we need to fix in `normalize_name`.

Realistic expectation: corporates with EU regulatory exposure (banks, listed cos, IF/EDF/Chips JU coordinators) have LEIs at ~70%+; small startups often don't (~30%). Aggregate target ~50%.

## Step A3 — Build `enrich_opencorporates.py` (optional, top-N only)

OpenCorporates free tier = 500 reqs/month. We cannot sweep all 3,101 companies. Restrict to:
- Companies that **did not** get an LEI match in A2 AND
- have at least one funded event with `grant_amount_eur ≥ 1,000,000` (filters to material entities) AND
- are not `entity_type='research_org'`

Expected N ≈ 200–400 companies. Within budget.

Query `https://api.opencorporates.com/v0.4/companies/search?q=<name>&jurisdiction_code=<iso2_lowercase>&api_token=<key>`. Take first hit where name matches. Store `OpenCorporates id` in `companies.lei` ONLY IF lei was NULL (we'll fold this into status via the OpenCorporates `current_status` field, mapped to GLEIF-style values).

API key: read from `~/.opencorporates_token` (text file with key only; never commit). Document the signup URL in script header.

**Gate A3**: among the targeted top-N, ≥60% get an OpenCorporates hit. If <60%, debug name normalisation OR accept the gap (these are likely sub-incorporated entities).

---

# Workstream B — Website liveness & activity signal

Cheapest, highest-signal workstream. Pure HTTP probes on `companies.website` for the 2,263 rows where it's populated.

## Step B1 — Build `enrich_website_status.py`

For each company with non-NULL `website`:
1. Normalise URL: prepend `https://` if missing scheme; strip path/query so we hit the root.
2. `HEAD` request with 10 s timeout, `User-Agent: EuroInvTracker/1.0 (+https://github.com/...)` — be a good citizen. Use `requests` with `allow_redirects=True` and inspect final status.
3. On non-2xx/3xx, retry once with `GET` (some sites reject HEAD).
4. Classify:
   - 200 / 3xx → `live`
   - 301 chain to a parked-domain page → `parked` (detect via `Location` containing `sedo.com`, `dan.com`, `godaddy.com`, etc.)
   - 404 / 410 → `dead`
   - 5xx / connection refused / timeout → `dead` (multi-week trend; will rerun to differentiate transient issues from genuine dead)
   - DNS NXDOMAIN → `dead`
5. Concurrency: `concurrent.futures.ThreadPoolExecutor(max_workers=8)`. Total time for 2,263 hosts ≈ 5 minutes.

Store `website_status` + `website_checked_at` per row.

**Gate B1**: ≥85% of attempted rows yield a definitive status (live/parked/dead). If <85% are unclassified, lengthen timeout or add a second-pass retry.

## Step B2 — Build `enrich_website_backfill.py`

For the 838 rows without a website (non-EIC families: IPCEI/EIB/IF/EIT/EDF/Chips JU), try to derive one from `project_summary` URLs in their events (the field often contains a project page URL whose hostname is the company website).

Strategy:
1. Extract all `http*://` URLs from `project_summary` text via regex.
2. Filter to URLs whose hostname is **not** `*.europa.eu`, `cordis.europa.eu`, `eic.ec.europa.eu`, or any other EU portal (these are project pages, not company sites).
3. If exactly one company-looking hostname survives → write that as `companies.website` (mark `match_method='website_from_summary'`).
4. If multiple → log to `data/processed/website_backfill_ambiguous.csv` for review; do not auto-pick.
5. Re-run B1 on the newly-populated subset.

**Gate B2**: ≥30% of the 838 NULL-website rows get backfilled. If <30%, that's the natural ceiling — Don't force it.

---

# Workstream C — Private funding events (best-effort coverage)

The hardest workstream because the data is genuinely paid. EU-Startups.com is the most usable free European source — they publish weekly "funding round" posts with structured "Round" / "Amount" / "Investors" sections. We scrape, parse, and match against our corpus.

## Step C1 — Build `scrape_eustartups.py`

Pattern: see `extract_edf.py` for paginated scrape with retry + persistence to `data/raw/`.

Strategy:
1. Iterate `https://www.eu-startups.com/category/funding/page/{N}/` from N=1 upward. Each page lists ~10 round-announcement teasers; each links to a full post.
2. For each teaser, fetch the post page. Persist raw HTML to `data/raw/eu_startups/<post_slug>.html` (idempotent — skip if file exists). Polite throttle: `time.sleep(2)` between fetches.
3. Stop pagination when we reach a post dated >= 36 months old (most public funding in our corpus is post-2020; older rounds are out of analysis window).
4. Estimated total: ~600 round posts over 24–36 months @ ~10/page = ~60 pages = ~10–20 min total runtime.

## Step C2 — Build `parse_eustartups.py`

Parse persisted HTML into structured rows:
1. Extract post title (usually contains company name + "raises €X" pattern).
2. Extract publication date from `<meta property="article:published_time">`.
3. Body parsing: regex out the first occurrence of `(?P<company>[A-Z][\w ]+?)(?:\s*[—-]\s*)?\s*(?:has\s+)?raised?\s+(?P<amount>[€$£][\d.,]+\s*(?:K|M|B|million|billion)?)` and similar templates. EU-Startups is consistent enough that 2–3 regex variants cover ≥80% of posts.
4. Round-type detection: look for `seed`, `pre-seed`, `series\s*[A-D]`, `growth`, `bridge`, `debt`, `convertible` in the first 500 chars after the amount mention.
5. Country detection: look for `[A-Za-z]+-based` (`Berlin-based`, `Paris-based`) in the lede; map city → ISO2 via a small dict (we already have one in `extract_chips_ju.py` derive_coordinator_country).
6. Investors list: many posts have a "led by" or "with participation from" clause. Best-effort regex; NULL when ambiguous.

Output: `data/processed/eu_startups_rounds.csv` with columns `(post_url, post_date, company_name, country_hint, round_type, amount_eur, amount_currency_original, lead_investors, all_investors)`.

**Gate C2**: ≥70% of fetched posts yield at least `(company_name, amount_eur)`. The remaining 30% can be NULL — those are usually exit announcements, hiring news, or product-launch posts mis-tagged as funding. Acceptable noise.

## Step C3 — Build `match_rounds_to_corpus.py`

Match the parsed rounds against `companies` table:
1. Tier 1: exact `(normalize_name(company_name), country)` match → `confidence='exact_name_country'`
2. Tier 2: `normalize_name` exact across any country → `confidence='exact_name_only'`
3. Tier 3: SequenceMatcher ratio ≥ 0.92 against name in same country → `confidence='fuzzy_high'`
4. Tier 4: skip (don't load); log to `data/processed/eu_startups_unmatched.csv`

For each matched row, INSERT into `private_funding_events`:
```sql
INSERT INTO private_funding_events
  (company_id, event_date, round_type, amount_eur,
   lead_investor, all_investors, investor_geography,
   source, source_url, confidence, notes)
VALUES (?, ?, ?, ?, ?, ?, NULL, 'eu_startups', ?, ?, ?);
```

Deduplicate via `(company_id, event_date, round_type)` triple before INSERT (idempotent re-run).

**Gate C3**: of the parsed rounds that have a clear company_name + country, ≥40% match a DB company. Realistic given coordinator-only scope (Sprint 8 STEP showed similar 15% overall coverage; rounds skew toward EIC-funded startups which we cover 100%, so 40% is realistic). If <25%, debug name normalisation. If >60%, suspect false positives — sample 30 matches by hand.

---

# Workstream D — Research & innovation activity signals

Two thin tiers that work cleanly with our cohort split.

## Step D1 — Build `enrich_openalex.py`

OpenAlex covers ~240M scholarly works. Critical for the 674 `entity_type='research_org'` rows + the deep-tech corporates (Chips JU, IPCEI MECT, EDF research participants).

Strategy:
1. For each company, query `https://api.openalex.org/institutions?search=<name>&filter=country_code:<ISO2>&mailto=<email>&per_page=5`.
2. On match, fetch `https://api.openalex.org/works?filter=authorships.institutions.id:<openalex_id>,from_publication_date:2020-01-01` to count publications since 2020.
3. Store `n_publications`.
4. Polite-pool via `mailto=`: use whatever email is in `git config user.email`.

**Gate D1**: ≥80% of `entity_type='research_org'` rows get matched. If <80%, the OpenAlex country filter likely needs the EL↔GR alias added.

## Step D2 — Build `enrich_wikidata.py` (well-known set only)

Wikidata SPARQL for the multinationals + cross-instrument-winner set (81 companies + the IPCEI top-100). For each:

```sparql
SELECT ?company ?inception ?employees ?dissolved ?ownedBy WHERE {
  ?company rdfs:label "Continental"@en;
           wdt:P17 wd:Q183 .                  # country=DE
  OPTIONAL { ?company wdt:P571 ?inception }   # inception date
  OPTIONAL { ?company wdt:P1128 ?employees }  # employees (latest)
  OPTIONAL { ?company wdt:P576 ?dissolved }   # dissolution date
  OPTIONAL { ?company wdt:P127 ?ownedBy }     # owner
} LIMIT 1
```

Use Wikidata's Python `SPARQLWrapper` (single dep). Throttle to ≤30 reqs/min.

Store `founded_year` (overrides GLEIF if Wikidata has it; Wikidata is usually right for famous companies).

**Gate D2**: skip — this is opportunistic; whatever we get is bonus. Don't fail the sprint on this.

## Step D3 — `enrich_epo_patents.py` (OPTIONAL — only if signup is friction-free)

EPO OPS requires free signup at `https://developers.epo.org/`. Quick signup, takes 5 min, no business verification. If user is OK with the friction, run this; otherwise SKIP — patents are nice-to-have, not blocking.

For each `entity_type='company'` row with grant_amount_eur ≥ 1M, query EPO OPS `/published-data/search?q=pa="<canonical_name>"&Range=1-100` and count results. Store `n_patents`.

Skip-criterion: if user says no, leave `n_patents` at default 0 and move on.

---

# Workstream E — Compute derived `company_status`

Pure SQL workstream. No external calls.

## Step E1 — Build `derive_company_status.py`

Single-pass over `companies` applying the rule from "Scope decisions" §5:

```python
def derive_status(c):
    # Acquisition event takes precedence
    if has_acquisition_event(c.id): return ('acquired', 'private_event=acquisition')
    # GLEIF terminal states
    if c.legal_entity_status in ('LAPSED','MERGED','RETIRED'): 
        return ('merged' if c.legal_entity_status=='MERGED' else 'inactive', f'gleif={c.legal_entity_status}')
    # Website + activity combination
    if c.legal_entity_status == 'ACTIVE' and c.website_status in ('live','redirect'):
        return ('active', 'gleif=ACTIVE+website=live')
    if c.website_status == 'dead' and not has_recent_event(c, years=2):
        return ('inactive', 'website=dead+no_events_2y')
    # Default
    return ('unknown', 'insufficient_signal')
```

Run once, populate `company_status` + `company_status_basis`. Idempotent.

**Gate E1**: ≤30% of companies end up `company_status='unknown'`. If >30%, the upstream workstreams under-delivered — investigate which signal is missing.

---

# Sanity check + health report

## Step F1 — Extend `sanity_check.py`

Add a "Sprint 9 enrichment" section:
- Companies with LEI: count + per-source-family share
- Companies with `website_status='live'`: count + share
- `private_funding_events` total rows + per-source breakdown
- `private_funding_events` per-company concentration (top 10 most-funded — sanity check, no famous startup should have 50+ rounds)
- `company_status` distribution
- `n_publications` distribution for research_orgs (≥1 should be ≥80% by D1 gate)

## Step F2 — Write `post_sprint9_enrichment_report.md`

Same shape as `pre_dealroom_health_report.md`: gate scorecard table + per-workstream findings + final corpus stats. Append to `data/processed/`.

---

# Validation gates (consolidated; all must pass before sign-off)

| # | Gate | Threshold |
|---|---|---|
| A2 | LEI match rate on `entity_type='company'` rows | ≥40% |
| A3 | OpenCorporates hit rate on targeted top-N | ≥60% (or document why lower) |
| B1 | Website-status classification rate | ≥85% definitive |
| B2 | Website backfill rate on NULL-website rows | ≥30% |
| C2 | EU-Startups parse success | ≥70% posts yield (name, amount) |
| C3 | Round-to-corpus match rate | ≥40% (suspect FP if >60% — sample-check) |
| D1 | OpenAlex match on research_orgs | ≥80% |
| D2 | Wikidata | opportunistic — no gate |
| D3 | EPO patents | optional — skip if friction |
| E1 | Companies with `company_status='unknown'` | ≤30% |
| F | `sanity_check.py` baseline gates remain green | no regressions |
| F | `post_sprint9_enrichment_report.md` committed | exists |

---

# Out of scope (deferred or rejected outright)

- **Crunchbase / Dealroom / PitchBook integration** — paid; rejected per user budget constraint.
- **LinkedIn scraping** — TOS violation; rejected.
- **Full consortium-participant load** — would re-scope Sprints 4–7 (we'd need to re-extract IF/Chips JU/EDF with full beneficiary lists). Defer to a future "v2 scope expansion" sprint.
- **STEP event-level tagging** — still blocked by missing project-number column in the Commission SEAL export. Defer until they publish per-project IDs.
- **News scraping beyond EU-Startups** — Sifted, TechCrunch europe, Reuters Tech: too noisy / too rate-limited for the gain. EU-Startups is the single best free European source; one source is cleaner than three messy ones.
- **Real-time / streaming updates** — this is a one-shot enrichment pass. Re-run quarterly if needed.

---

# Documentation updates required after sprint

- `methodology.md`: new "Private-side enrichment scope (Sprint 9)" section explaining the free-source pivot, what each signal means, and what the EU-Startups coverage bias looks like (heavy European bias, light on UK post-Brexit + US-headquartered startups). New decision-log entry.
- `notes.md`: Day 11 entry with per-workstream stats + gate scorecard.
- `README.md`: add the new loader scripts to the run section; update headline numbers if any.
- `schema.sql`: re-export to confirm new `companies` columns.
- New memory file `project_sprint_9_enrichment.md`: source-of-truth decisions (free-source pivot rationale, EU-Startups parser regex patterns, GLEIF status mapping); index entry in MEMORY.md.

---

# End-state checklist (paste into final sign-off)

- [ ] A1 schema migration applied + mirrored in `schema.sql`
- [ ] A2 `enrich_gleif.py` written, idempotent, LEI ≥40% on companies → PASS
- [ ] A3 `enrich_opencorporates.py` (top-N, optional gate)
- [ ] B1 `enrich_website_status.py` written, ≥85% definitive → PASS
- [ ] B2 `enrich_website_backfill.py`, ≥30% backfill → PASS
- [ ] C1 `scrape_eustartups.py` written, raw HTML persisted to `data/raw/eu_startups/`
- [ ] C2 `parse_eustartups.py` written, ≥70% parse → PASS
- [ ] C3 `match_rounds_to_corpus.py` written, ≥40% match → PASS, `private_funding_events` populated
- [ ] D1 `enrich_openalex.py` written, ≥80% on research_orgs → PASS
- [ ] D2 `enrich_wikidata.py` (opportunistic)
- [ ] D3 `enrich_epo_patents.py` (optional; user-gated)
- [ ] E1 `derive_company_status.py` written, ≤30% unknown → PASS
- [ ] F1 `sanity_check.py` extended; baseline gates remain green
- [ ] F2 `post_sprint9_enrichment_report.md` committed
- [ ] `methodology.md`, `notes.md`, `README.md`, `schema.sql` updated
- [ ] `project_sprint_9_enrichment.md` memory written; MEMORY.md indexed
- [ ] Final headline counts honest about coverage (don't claim "private rounds loaded for 3,101 companies" — claim "private rounds loaded for N companies where source coverage allowed")

---

# Notes for Claude Sonnet 4.6 specifically

This plan is deliberately decomposed for sequential execution by a single agent. Observations from Sprint 8 retrospective:

1. **Read existing pattern files before writing each new script**. The patterns in `tag_step.py` (single-tier exact match with country aliases + idempotent re-run with revoke), `audit_dedup.py` (`--load-db` flag convention), `classify.py` (regex-heavy classifier with audit log), and `extract_chips_ju.py` (free-API loader with polite throttle + JSON-cache layer) cover every pattern you need.
2. **Always backup DB before `--load-db`**. Convention: `db_backups/db.sqlite.backup_pre_<step_id>` per Sprint 8.
3. **Idempotency is non-negotiable**. Every loader must be safely re-runnable. Test by running twice in a row and confirming zero net change on the second run.
4. **Use `Read` / `Grep` to verify patterns before writing**. Don't recreate `normalize_name` from memory — import or copy from `extract_chips_ju.py` and reference it. Same for country-name → ISO2 dicts.
5. **CSV outputs at each tier, not just final state**. Both the audit trail and the inspectable artefact for the user.
6. **If a gate fails, STOP and report**. Don't paper over with a lower threshold. The user explicitly chose "all-or-nothing per gate" semantics in Sprint 8 and should be consulted before relaxing any gate.
7. **Country aliases are EL↔GR + UK↔GB**. Both came up in Sprints 1, 5, 7, 8 — assume any new loader needs them.
8. **No external tools beyond `curl`/`requests`/`openpyxl`/`SPARQLWrapper` (Wikidata only)**. Stay simple. If a workstream seems to need a heavy dep, re-scope.
9. **Don't decide the sprint is done until `sanity_check.py` is green AND `post_sprint9_enrichment_report.md` exists AND `MEMORY.md` is updated**. The Sprint 8 retrospective showed these closing-tasks slip easily.
10. **If you genuinely need to call a paid API or face an unforeseen blocker, STOP. Report to user. Do not invent credentials, do not hand-curate data without asking, do not silently downgrade a gate.**
