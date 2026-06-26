# Europe scope — corpus filter

**Decided**: 2026-05-29 (Sprint 14, in-thread with Asger).
**Authority**: [data/europe_scope.json](../data/europe_scope.json) is the single source of truth. Every downstream consumer (SQL views, the site-data builders, country-map data generator, the front-end map component, the Python helper, the SQLite triggers) loads from or mirrors that file. Edit the JSON, not the consumers.

**Status**: Out-of-scope rows have been **deleted** from the live DB. The scope is enforced by a SQLite `BEFORE INSERT` trigger on `companies.country` so future scrapes that try to insert outside the scope will fail loudly. This is not a view-time filter only — it's a corpus-level filter, applied destructively, with a defensive layer to keep it that way. See "Enforcement: how the scope is actually held" below.

## Why a scope filter exists

The raw corpus combines records from Horizon Europe (open-call programme with non-European associated participants), CINEA factsheets (occasional Mid-East/North African co-funded projects), and IPCEI state-aid notifications (always European). Without a filter, the corpus claims to cover countries like Tunisia, South Africa, the United States, and Kazakhstan because individual companies registered there received Horizon grants on a single co-funded project. That misrepresents what the study is actually about — *EU/Europe public capital*.

Three concrete failure modes the filter eliminates:

1. **Source-data aliases / typos inflate the country count.** Greek participants appear under both `GR` (ISO-2) and `EL` (EU's Greek-language code). UK appears under both `GB` (ISO-2) and `UK` (text form). Single-row typos (`PO` for Poland, `SW` for Sweden, `GL` for Greenland-as-Denmark) get treated as distinct countries by `GROUP BY country`.
2. **Horizon-Europe associated countries outside continental Europe** (Israel, the Caucasus) hold material company counts but aren't what a reader expects under "European tech".
3. **Tail leakage** — a handful of US, Tunisian, South African, Kazakh companies on individual co-funded projects.

## The scope (40 countries)

| Group                  | Members                                                                                                                                                                                                                                                                       | Count |
|------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------|
| EU27                   | AT, BE, BG, HR, CY, CZ, DK, EE, FI, FR, DE, GR, HU, IE, IT, LV, LT, LU, MT, NL, PL, PT, RO, SK, SI, ES, SE                                                                                                                                                                  | 27    |
| EFTA                   | NO, CH, IS, LI                                                                                                                                                                                                                                                                | 4     |
| UK                     | GB                                                                                                                                                                                                                                                                            | 1     |
| Western Balkans        | AL, BA, ME, MK, RS, XK                                                                                                                                                                                                                                                        | 6     |
| Eastern Partnership    | UA, MD                                                                                                                                                                                                                                                                        | 2     |
| **Total**              |                                                                                                                                                                                                                                                                               | **40**|

### Explicitly excluded (and why)

| Code | Country     | Companies dropped | Why excluded                                                                                                                                                                                                  |
|------|-------------|-------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| IL   | Israel      | 160               | Horizon-associated but geographically Middle East. A study titled "Where Europe's public capital actually goes" should not claim Israel as European, even though Horizon participation is legitimate.        |
| TR   | Turkey      | 237               | Horizon-associated, has European territory (Istanbul), but the country is predominantly in Asia Minor and joining the EU is not in active negotiation. Excluded for the same defensible-scope reason as IL.   |
| AM, GE, AZ | Caucasus | ~20            | Horizon-associated but geographically Caucasus, not Europe.                                                                                                                                                  |
| KZ   | Kazakhstan  | <5                | Central Asia. Horizon participation on individual joint projects.                                                                                                                                              |
| RU, BY | Russia, Belarus | 0           | Suspended from Horizon Europe; not in the corpus to begin with after February 2022.                                                                                                                          |
| TN, ZA, US, GL | Leakage | 6 total      | Horizon open-call participants on individual projects (TN, ZA, US) and Greenland (Danish territory; 1 row).                                                                                                  |

### Aliases (canonicalised before filtering)

| Source code | Canonical | Note                                                |
|-------------|-----------|------------------------------------------------------|
| `EL`        | `GR`      | EU's Greek-language code for Greece (~45 rows).      |
| `UK`        | `GB`      | Text form vs ISO-2 (~50 rows).                       |
| `PO`        | `PL`      | 1-row typo for Poland.                               |
| `SW`        | `SE`      | 1-row typo for Sweden.                               |
| `GL`        | `DK`      | Greenland is Danish territory (1 row).               |

## Map rendering: three countries can't be drawn at 110m

The Europe map on the home page uses [world-110m.json](../website/frontend/public/data/world-110m.json), a simplified topology bundled with `world-atlas`. Three countries in the corpus scope are below its resolution threshold and therefore have no shape at all in the topology:

- **Malta (MT)** — 35 companies; EU27 member.
- **Liechtenstein (LI)** — 1 company; EFTA.
- **Kosovo (XK)** — 4 companies; Western Balkans (also has an empty `id` field, not a missing geometry).

These render as **labelled blue dot markers** at their approximate centre coordinates (defined in `MARKER_COUNTRIES` in [website/frontend/components/europe-map.tsx](../website/frontend/components/europe-map.tsx)). Hovering a marker opens the same tooltip as a country shape. The count "40 countries" on the home-page KPI is the count of in-scope countries, not the count of rendered shapes — to avoid the politically-odd outcome of excluding Malta (an EU member) from a study titled "European public capital".

Alternative considered and rejected: upgrade the topology to `world-50m`. The 50m file still doesn't include Liechtenstein or Kosovo reliably, and 3x larger payload doesn't seem worth it for one extra country (Malta).

## How the scope propagates through the pipeline

1. [data/europe_scope.json](../data/europe_scope.json) — authoritative country list and aliases.
2. [ETL/lib/europe_scope.py](../ETL/lib/europe_scope.py) — Python helper. **Every extractor should call `canonicalise_country()` before inserting a company.** Maps aliases (EL→GR, UK→GB, PO→PL, SW→SE, GL→DK) and returns `None` for out-of-scope codes so the caller can skip the row. Has a self-test runnable with `python3 ETL/lib/europe_scope.py`.
3. [ETL/load/schema.sql](../ETL/load/schema.sql) — defines `trg_companies_country_scope` (INSERT) and `trg_companies_country_scope_update` (UPDATE) which `RAISE(ABORT, ...)` if an out-of-scope country code is written to `companies.country`. **This is the enforcement floor**: any extractor that skips the Python helper will hit the trigger and fail with a pointer to this file.
4. [data/views.sql](../data/views.sql) — defines `v_european_companies` (defensive filter) and inner-joins it into `v_events`. Belt-and-braces — if the trigger is ever disabled (e.g. for a raw-SQL bulk import), the view layer still keeps analytics clean. Every read-side query joins through `v_events` so analyses inherit the filter automatically.
5. [website/build/country_map.py](../website/build/country_map.py) — loads `europe_scope.json`, regenerates [website/frontend/public/data/country_map.json](../website/frontend/public/data/country_map.json) (40 countries).
6. [website/frontend/components/europe-map.tsx](../website/frontend/components/europe-map.tsx) — `NUMERIC_TO_ISO2` carries the 40-country geographic-Europe subset; `MARKER_COUNTRIES` carries MT/LI/XK markers (below world-110m's resolution threshold).
7. [ETL/load/qa/sanity_check.py](../ETL/load/qa/sanity_check.py) — "DQ: Europe scope integrity" block at the end. All three values must be `0` (no out-of-scope rows, no non-canonical aliases, both triggers installed). Run after every loader.

## Enforcement: how the scope is actually held

The corpus is held in scope by **three layers of defence**, in order of how the data flows:

1. **Pre-insert filter in extractors** — `ETL/lib/europe_scope.canonicalise_country()`. Extractors call it before INSERT, alias-map their country code, and `continue` if it returns `None`. Cheap, explicit, lives in code review.
2. **Database BEFORE INSERT trigger** — `trg_companies_country_scope` in `ETL/load/schema.sql`. Fires inside the DB itself for every `INSERT INTO companies` and every `UPDATE companies SET country = ...`. Out-of-scope writes `RAISE(ABORT, ...)` with a message pointing at this doc. Cannot be bypassed by a forgetful extractor; can only be bypassed by an explicit `DROP TRIGGER`.
3. **View-time filter** — `v_european_companies` in `data/views.sql`. Inner-joined into `v_events`, so even if a row somehow lands in `companies` with an out-of-scope country (raw SQL import, trigger disabled), the analytics never see it.

The destructive step taken on 2026-05-29 — `DELETE`'ing 1,639 out-of-scope companies and their 2,527 events from the live DB — closed the question of "what does the corpus actually contain". Before Sprint 14, the corpus contained 53 countries' worth of data and a view-time filter pretended it didn't. After Sprint 14, the corpus contains 40 countries' worth of data and nothing else.

### When extractors are added or updated

Every new extractor MUST do one of two things before inserting into `companies`:

- **Recommended**: call `from scripts.europe_scope import canonicalise_country` and apply it to the country code, skipping rows where it returns `None`.
- **Acceptable**: catch the SQLite `IntegrityError` raised by the trigger and skip the row. Loud, ugly logs but functionally equivalent.

NOT acceptable: bypassing the trigger via `DROP TRIGGER`, raw `INSERT OR IGNORE` with `PRAGMA foreign_keys = OFF`, or any other workaround. If the scope ever needs to expand, edit `data/europe_scope.json` and re-run the propagation steps in the "When to revise" section below.

## Numbers after the filter (corpus delta)

| Metric                 | Before filter | After (40-country scope) | Delta            |
|------------------------|---------------|--------------------------|------------------|
| Companies              | 21,689        | 20,050                   | -1,639 (-7.6%)   |
| Events                 | 58,628        | 56,101                   | -2,527 (-4.3%)   |
| Total committed (EUR)  | €76.9B        | €76.2B                   | -€0.7B (-0.9%)   |
| Distinct countries     | 53            | 40                       | -13              |
| Source families        | 10            | 10                       | unchanged        |

Capital impact is small (<1%) because dropped companies are mostly Horizon co-funded participants with sub-€1M tickets per project.

## When to revise the scope

The scope is hard-coded in three places that must stay in sync:

1. `data/europe_scope.json` — source of truth.
2. The SQL string literal inside `trg_companies_country_scope` and `trg_companies_country_scope_update` in [ETL/load/schema.sql](../ETL/load/schema.sql).
3. The SQL string literal inside `v_european_companies` in [data/views.sql](../data/views.sql).
4. (`ETL/lib/europe_scope.py` reads the JSON at import — no edit needed.)

SQLite triggers can't read JSON files at parse time, hence the duplication. A future improvement would auto-generate the SQL from the JSON via a `make` step.

### Adding a country

1. Add the entry to `data/europe_scope.json` (with `numeric` for the topojson ID; mark `rendererFallback: "marker"` if the country is too small for world-110m).
2. Update the country-code allowlist in **both** SQL triggers in `ETL/load/schema.sql` AND in `v_european_companies` in `data/views.sql`.
3. Reinstall the triggers on the live DB: `sqlite3 data/db.sqlite "DROP TRIGGER trg_companies_country_scope; DROP TRIGGER trg_companies_country_scope_update;"` and re-apply the relevant block from `ETL/load/schema.sql`.
4. Re-run `make data` (reinstalls `data/views.sql`, then regenerates every site JSON including `country_map.json`).
5. Update `NUMERIC_TO_ISO2` (or `MARKER_COUNTRIES`) in [website/frontend/components/europe-map.tsx](../website/frontend/components/europe-map.tsx).
6. Run `python3 ETL/load/qa/sanity_check.py | grep "Europe scope integrity"` — both data values must be 0 and the trigger-presence value must be 0.
7. Re-load any extractors whose source data now contains rows for the newly-in-scope country.

### Removing a country

Same flow in reverse, plus a destructive `DELETE` on existing rows:

```sql
DELETE FROM public_funding_events WHERE company_id IN (SELECT id FROM companies WHERE country = '<ISO2>');
DELETE FROM classify_audit         WHERE company_id IN (SELECT id FROM companies WHERE country = '<ISO2>');
DELETE FROM companies WHERE country = '<ISO2>';
```

Back up the DB first.

### Treating Israel / Turkey as in-scope (likely future debate)

Single-line addition to the JSON + triggers + views, full pipeline re-run, plus a re-scrape of any extractor that previously pre-filtered the country out via `canonicalise_country()`. Memory file `project_europe_scope.md` should record the policy reversal with rationale.
