# BACKLOG — Private follow-on enrichment via paid API (Dealroom / Crunchbase / equivalent)

> **Status: BACKLOG / reference only** (deferred 2026-05-22). Originally drafted Sprint 9. Two reasons it's parked:
> 1. **No paid-API budget or access** — user confirmed zero spend on Dealroom / Crunchbase / PitchBook / CB Insights / Tracxn. Crunchbase free API was discontinued 2021; current cheapest is $49/mo Basic, $99/mo Pro. Academic Research Access requires institutional affiliation + multi-week sales approval.
> 2. **Strategic pivot** — user opted to first do a proper supply-side exploratory study (Sprint 9). The reasoning: explore the corpus we have before deciding what specific private data we actually need; a sharp finding from the supply side may make paid enrichment unnecessary, or may pinpoint exactly which subset to enrich.
>
> **When to revive**:
> - If institutional Crunchbase / Dealroom access materialises (UoX research credentials, partnership, paid subscription) — this plan slots in directly with endpoint swap.
> - If a specific narrow analysis (e.g. only the 81 cross-instrument champions, or only the EIC-Accelerator cohort) is in scope and worth the per-call cost on a paid tier.
>
> **Companion plan** ([`private_side_enrichment.md`](private_side_enrichment.md)) is the free-source fallback path (GLEIF + OpenAlex + Wikidata + EU-Startups scrape). Lower coverage, higher noise; use when paid is impossible but the analysis needs *some* private signal.
>
> **STALE in places** — the original draft below predates Sprints 4–8. The 2,619-company figure is pre-IF; current corpus is 3,101. Sector taxonomy now includes `defense`. Reuse the structural approach (Dealroom-style match → `private_funding_events` populate) but refresh counts and roadmap context before execution.

## Goal

Populate the empty `private_funding_events` table by matching the 2,619 EU public capital recipients against Dealroom, then loading their private VC / growth / debt rounds and M&A outcomes. This is the **right-hand-side variable** for the project's research question — without it, no follow-on prediction is possible. Supply-side data (EIC + IPCEI + EIB) is sufficient to start; do this BEFORE adding more public sources (Chips Act, Innovation Fund, EDF).

End state after this sprint:
- All `entity_type IN ('company', 'unknown')` companies attempted against Dealroom (research_orgs skipped)
- ≥80 % match rate for `company` rows (2,619 → ~1,535 attempted → ~1,228 matched)
- `private_funding_events` populated with VC / growth / debt rounds and M&A events
- `companies` enriched with `dealroom_id`, `founded_year`, `headcount_latest`, `total_raised_eur`, `dealroom_status`
- Sanity-check counts in `notes.md` Day 5 entry
- Decision log entry in `methodology.md`

## Pre-flight (DO THIS FIRST — do not skip)

Before writing any code, confirm the following with the user. If any answer is "no" or "unknown," stop and report back — do not invent credentials or skip steps.

1. **Dealroom API access**: Does the user have a Dealroom API key? Which plan tier (Starter / Growth / Enterprise — affects rate limits and field availability)?
2. **Auth method**: Bearer token in `Authorization` header? OAuth? Confirm exact format.
3. **Base URL**: `https://api.dealroom.co/api/v2/` is the standard but confirm.
4. **Rate limit**: typical paid plan is 100 req/min; confirm. Plan must respect it (use `time.sleep(60/rate_limit)` between calls or a token bucket).
5. **Storage of secret**: Where does the user want the API key stored? Recommended: `~/.dealroom_token` (read at script start, never echoed). Do NOT commit it.
6. **Fallback if no Dealroom access**: see "Plan B" at the bottom of this file. Ask the user which fallback to take.

If credentials look good, run a smoke test fetch (`GET /companies/{some_known_id}`) and confirm a 200 + JSON before proceeding to Step 1.

## Step 1 — Schema migration

Edit `schema.sql` to add Dealroom-derived fields. Apply with `ALTER TABLE` against the existing `db.sqlite` (no rebuild — preserves the 2,619 already-loaded rows).

`companies` table additions:
```sql
ALTER TABLE companies ADD COLUMN dealroom_id INTEGER;          -- Dealroom canonical ID; NULL = unmatched / not attempted
ALTER TABLE companies ADD COLUMN dealroom_slug TEXT;           -- URL slug, useful for raw_source_url
ALTER TABLE companies ADD COLUMN founded_year INTEGER;         -- from Dealroom; useful for sanity checks
ALTER TABLE companies ADD COLUMN headcount_latest INTEGER;     -- current employee count (snapshot)
ALTER TABLE companies ADD COLUMN total_raised_eur REAL;        -- lifetime private capital raised, EUR
ALTER TABLE companies ADD COLUMN dealroom_status TEXT;         -- active / acquired / inactive / ipo / unknown
ALTER TABLE companies ADD COLUMN acquired_by TEXT;             -- acquirer name if acquired
ALTER TABLE companies ADD COLUMN acquired_year INTEGER;
ALTER TABLE companies ADD COLUMN dealroom_match_method TEXT;   -- website / name_country_exact / name_country_fuzzy / manual / none
ALTER TABLE companies ADD COLUMN dealroom_match_score REAL;    -- 1.0 for exact, fuzzy ratio otherwise
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_dealroom_id ON companies(dealroom_id) WHERE dealroom_id IS NOT NULL;
```

`private_funding_events` table — first check whether it exists and has the right columns. The expected schema (from earlier work — confirm against `schema.sql`):
```sql
CREATE TABLE IF NOT EXISTS private_funding_events (
    id INTEGER PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    source TEXT NOT NULL,                       -- 'dealroom'
    dealroom_event_id INTEGER,                  -- Dealroom round/event ID
    event_type TEXT NOT NULL,                   -- funding_round | acquisition | ipo
    round_type TEXT,                            -- seed | series_a | series_b | ... | growth | debt | grant | secondary | NULL for non-rounds
    round_stage TEXT,                           -- derived: early | growth | late | debt | other
    announce_date TEXT NOT NULL,                -- ISO YYYY-MM-DD
    round_size_eur REAL,                        -- NULL if undisclosed
    round_size_original REAL,                   -- raw amount in original currency
    round_size_currency TEXT,
    investors_json TEXT,                        -- JSON array of investor names
    lead_investors_json TEXT,                   -- JSON array of lead investors
    raw_source_url TEXT,                        -- https://app.dealroom.co/companies/{slug}
    inserted_at TEXT DEFAULT (datetime('now')),
    UNIQUE(source, dealroom_event_id)           -- idempotency guard
);
CREATE INDEX IF NOT EXISTS idx_pfe_company_date ON private_funding_events(company_id, announce_date);
```

If the existing `private_funding_events` schema differs, add the missing columns with `ALTER TABLE` rather than dropping the table.

## Step 2 — Build `dealroom_match.py`

Single script, runs in two modes:
- `python3 dealroom_match.py`           → match only, write `data/processed/dealroom_match_summary.csv`, no DB writes
- `python3 dealroom_match.py --load-db` → match + fetch funding events + write to DB

Skeleton:
```python
"""Match EuroInvTracker companies to Dealroom and load private funding events."""
import sqlite3, json, time, sys, csv, os, re
from pathlib import Path
from difflib import SequenceMatcher
import requests

DB = Path("data/db.sqlite")
RAW_DIR = Path("data/raw/dealroom"); RAW_DIR.mkdir(parents=True, exist_ok=True)
PROC_DIR = Path("data/processed"); PROC_DIR.mkdir(parents=True, exist_ok=True)
TOKEN = Path.home().joinpath(".dealroom_token").read_text().strip()
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Accept": "application/json"}
BASE = "https://api.dealroom.co/api/v2"
RATE_SLEEP = 0.6   # seconds between calls — adjust to user's plan limit

def fetch(path, params=None):
    # Cache-then-fetch wrapper; persist every response to data/raw/dealroom/
    ...

def normalize_name(s): ...   # reuse logic from extract_eib.py if possible

def match_one(company_row):
    # Returns (dealroom_id, match_method, match_score, snapshot_dict) or None
    # Order: website match → name+country exact → name+country fuzzy ≥0.92 → None
    ...

def fetch_funding(dealroom_id):
    # GET /companies/{id}/funding-rounds — paginate if needed
    # GET /companies/{id}/exit (if status != 'active')
    ...
```

Matching rules — apply in priority order, stop on first hit:

1. **Website match**: if `companies.website` is non-empty, query Dealroom `/companies?website=<host>` (host-only, strip protocol + path). Match if returned company's website host matches.
2. **Name + country exact**: query `/companies?name=<canonical_name>&country=<ISO2>`. Match if any returned row's `name` equals the canonical name (case-insensitive, post-suffix-normalized — see `extract_eib.py`'s normalisation).
3. **Name + country fuzzy**: same query, then `SequenceMatcher(name, returned_name).ratio() ≥ 0.92`. Use the same threshold as `extract_eib.py` for consistency.
4. **None** — leave `dealroom_id = NULL`, record in unmatched CSV.

For each candidate match, also write a **sanity check**: if `founded_year > earliest_public_funding_year + 1`, log a WARN (suggests wrong company). Don't auto-reject; let the user audit.

## Step 3 — Run matching pass (no DB writes)

```bash
python3 dealroom_match.py
# Produces:
#   data/processed/dealroom_match_summary.csv  — every attempted company with chosen Dealroom ID or NULL
#   data/processed/dealroom_unmatched.csv      — only the NULL rows, for manual review
```

Inspect `dealroom_match_summary.csv` before loading. Expected match-rate distribution:
- `entity_type='company'`: ≥80 %
- `entity_type='unknown'`: ≥50 %
- `entity_type='research_org'`: SKIPPED (not loaded into the matcher)
- `entity_type='other'` (public bodies): SKIPPED

If match rates fall below thresholds, investigate before loading. Likely causes: legal-form suffix differences, country mismatches (registered country vs. HQ country), Dealroom not covering some smaller countries.

## Step 4 — Load private funding events

```bash
python3 dealroom_match.py --load-db
```

For each matched company:
1. Fetch all funding rounds → insert into `private_funding_events` with `event_type='funding_round'`.
2. Fetch exit data (if `status != 'active'`) → insert with `event_type='acquisition'` or `'ipo'`.
3. Update `companies` row with snapshot fields (`dealroom_id`, `founded_year`, `headcount_latest`, `total_raised_eur`, `dealroom_status`, `acquired_by`, `acquired_year`, `dealroom_match_method`, `dealroom_match_score`).

Idempotency:
- `UNIQUE(source, dealroom_event_id)` on `private_funding_events` blocks duplicate inserts.
- Updates to `companies` use `UPDATE … WHERE id = ?` (no duplicate rows possible).
- The raw JSON for every API response is cached in `data/raw/dealroom/{dealroom_id}.json` (companies) and `…/funding/{dealroom_id}.json` (rounds). On re-run, prefer cache if file exists and `--refresh` not passed.

Currency handling:
- If Dealroom provides `amount_eur` directly, use it.
- If not, store `round_size_original` + `round_size_currency` AND convert to EUR using ECB ref rate at `announce_date`. Use the `frankfurter.dev` free API (`GET https://api.frankfurter.dev/v1/{date}?symbols={ccy}&base=EUR`). Cache rates per (date, currency) to avoid re-fetching.
- If `announce_date` is in the future relative to today, log WARN and skip the row.

## Step 5 — Entity-type refinement pass

After matching, refresh `entity_type` for matched rows using Dealroom's `company_type` field:
- `startup` / `scaleup` → `entity_type = 'company'` (and set a new `companies.company_stage` column if useful — defer if not)
- `corporate` / `large_corp` → `entity_type = 'company'` (same bucket — granular split deferred)
- `non_profit` / `government` → `entity_type = 'other'`
- `university` / `research` → `entity_type = 'research_org'` (these may slip through despite the skip filter — correct them)

Then re-run `classify.py` (operational rule — anything that touches `companies` triggers this).

## Step 6 — Validation gates

All gates must pass before declaring the sprint done. Add the queries below to `sanity_check.py` under a new `### Dealroom-specific queries` section.

| Gate | Query / check | Pass criterion |
|---|---|---|
| Match rate (company) | `SELECT 1.0 * SUM(dealroom_id IS NOT NULL) / COUNT(*) FROM companies WHERE entity_type='company'` | ≥ 0.80 |
| Match rate (unknown) | same, `entity_type='unknown'` | ≥ 0.50 |
| Research-org skip | `SELECT COUNT(*) FROM companies WHERE entity_type='research_org' AND dealroom_id IS NOT NULL` | = 0 (sanity — none should be matched) |
| Coverage of matches | `SELECT 1.0 * COUNT(DISTINCT company_id) / SUM(dealroom_id IS NOT NULL) FROM private_funding_events JOIN companies USING(company_id... )` (i.e. fraction of matched companies that have ≥1 round) | ≥ 0.70 |
| Currency populated | `SELECT COUNT(*) FROM private_funding_events WHERE round_size_eur IS NULL AND round_size_original IS NOT NULL` | = 0 (every disclosed round must have an EUR value) |
| No future dates | `SELECT COUNT(*) FROM private_funding_events WHERE announce_date > date('now')` | = 0 |
| Orphans | existing DQ query in sanity_check.py | = 0 |
| Unclassified | existing DQ query | = 0 |
| Multi-source winners | EIC + EIB + Dealroom rounds → flag companies with ≥2 public sources AND ≥1 private round | log them as "graduation pipeline" |

## Step 7 — Documentation updates

In this order:

1. **`methodology.md`**:
   - Add a `## Dealroom matching` section under the existing `## EIB venture debt extraction` section. Cover: match strategy, threshold (≥0.92), sanity check (founded_year), currency conversion approach (frankfurter.dev / ECB rates), entity-type refinement rule.
   - Update the `Source coverage` table at the top: add a `Dealroom (private rounds)` row marked ✅.
   - Add a decision log entry dated the run date covering match-rate distribution and any borderline calls.
2. **`notes.md`**:
   - Add a `## Day 5 ({date}): Dealroom matching` section with the numbers table (matched / unmatched / new private events / total private capital captured EUR, etc.).
3. **`README.md`**:
   - Update Data sources table: Dealroom = ✅ loaded, X private events.
   - Update the total counts line.
   - Add `python3 dealroom_match.py --load-db` to the Run block.

## Files added (expected)

```
dealroom_match.py
data/raw/dealroom/{dealroom_id}.json            # one per matched company (snapshot)
data/raw/dealroom/funding/{dealroom_id}.json    # one per matched company (rounds)
data/raw/dealroom/_fx_rates.json                # cached frankfurter.dev rates
data/processed/dealroom_match_summary.csv       # per-row audit
data/processed/dealroom_unmatched.csv           # NULL rows for manual review
```

## Open decisions (settle BEFORE writing code)

1. **Round-type taxonomy** — Recommendation: keep Dealroom's raw labels in `round_type`, add a derived `round_stage` bucket (`early` = pre-seed/seed/series_a, `growth` = series_b/series_c, `late` = series_d+, `debt` = debt rounds, `other` = secondary/grants/crowdfunding). Settle the exact bucket boundaries with the user.
2. **Date filter** — load ALL historical rounds (lifetime), or only post-public-funding rounds? Recommendation: load all (cheaper than re-fetching later) but flag in the analysis layer which are pre/post the first public event.
3. **Acquisition partial-match** — Dealroom sometimes shows acquirer as just a name (no Dealroom ID). Recommendation: store the name string in `acquired_by`; don't try to match the acquirer back to a `companies` row (out of scope).
4. **NOMAGIC INC + NOMAGIC SP ZOO** — see [methodology.md decision log, 2026-05-20 (sprint-3 EIB load), workaround #3]. If both resolve to the same Dealroom ID, merge them by re-pointing all events from one company_id to the other and DELETE the dupe. Do the same for any other duplicate-entity pairs surfaced by the matching pass.
5. **Failed matches** — `dealroom_unmatched.csv` should be hand-spotchecked by the user before the next sprint. Don't aggressively retry — most failures will be (a) very small EIC companies not in Dealroom, (b) research_orgs miscategorized as `company`.

## Out of scope for Sprint 4

- Chips Act / Chips JU loading (Sprint 5a if doing more public sources)
- Innovation Fund loading (Sprint 5b)
- EDF / STEP seal flag (Sprint 5c)
- LinkedIn / Glassdoor headcount enrichment (Sprint 6)
- Modeling / regression / actual analysis (separate analysis sprint)
- Granular `company` subtypes (startup/SME/large_corp) — deferred until needed for the analysis

## Operational rules (extend `methodology.md` if not already there)

- Re-run `classify.py` after `dealroom_match.py --load-db` finishes (entity_type changes).
- Re-run `sanity_check.py` after every loader run; all DQ gates must pass before declaring done.
- All API responses cached under `data/raw/dealroom/` — never delete the cache, even if a re-run is needed (use `--refresh` flag if forcing a refetch).

---

## Plan B — if Dealroom access is unavailable

If the user does NOT have Dealroom API access and isn't willing to procure it, do NOT default to Crunchbase silently — bring the choice back to the user with these options ranked by analytical value:

1. **Crunchbase Enterprise API** — closest substitute, similar coverage in EU. Same plan structure as above; rewrite the script for Crunchbase endpoints.
2. **Pitchbook** — better EU coverage for late-stage, weaker for very early. Often the most expensive.
3. **EU Open Data + LinkedIn scraping** — free but much lower fidelity; no round-amount disclosures. Skip if analytical rigor matters.
4. **Defer outcome data and complete supply-side first** — Sprint 4 becomes Chips Act + Innovation Fund + EDF instead. Risk: more supply data without outcome data doesn't unlock the research question. Recommend only if the user wants to keep loading without spending on a data subscription.

Report back with the user's choice — do not pick one autonomously.
