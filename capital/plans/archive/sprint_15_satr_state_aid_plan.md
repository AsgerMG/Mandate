# Sprint 15 plan — EU State Aid Transparency Register (SATR) + repository refactor

**Owner**: Claude (next session), executing against `/Users/asgermollergrimberg/EuroInvTracker/`.

**Status**: In progress (Phase A complete; Phase B scope revised mid-execution — see "Scope revision" section below). Baseline at start: **20,050 companies / 56,101 events** (sprint 14 outputs).

## Scope revision (2026-05-29 mid-sprint)

The original filter ("equity instruments OR R&D objectives") was too narrow — caught only ~0.4% of NL state aid (20 of 4,800 rows in NL 2023). Missed Direct grants for R&D, IPCEI-style strategic industrial aid, and Net-Zero industrial scale-up — which are exactly the public-capital deployment EuroInvTracker is meant to track.

**Revised filter:** 
- Equity-instrument pass kept as safety net
- Objective pass **greatly expanded** to cover the full GBER R&D&I block (Art. 21-30 with all 2022/2023 revisions and sub-bids 252a/b/c/d), SME investment aid (Art. 17, 23, 24), IPCEI (AR79411), Net-Zero/decarbonisation (Art. 36/36a/36b/38/38a/40/41/42/43/46/47/48 with 2023 revisions and notified versions AR79411/AR79417/AR7948/AR7949), and notified RDI/risk-finance/SME (AR79419/AR79421/6938/6948/6952/6955)
- **TCTF exclusion**: Temporary Crisis (and Transition) Framework — COVID + Ukraine energy crisis emergency aid — is excluded at the staging-load step by `aid_measure_title` pattern. This is critical because ~99% of Italy's 2022-2023 equity rows are TCTF (Fondo di Garanzia / SACE liquidity guarantees) which would dwarf the innovation signal and create misleading IT-vs-DE ratios.

**Filter implementation**: `scripts/lib/satr_filters.py` (frozen lists) + `scripts/load_satr.py::is_tctf()` (multilingual title regex: `TCF:`, `TCTF`, `Temporary Crisis Framework`, `Quadro Temporaneo`, `Encadrement temporaire`, `Befristeter Krisenrahmen`).

After revision: full re-scrape of all 25 EC-portal countries (cache cleared, DB restored from backup). Expected per-year-2023 floor counts: IT ~5,200 / DE ~4,900 / NL ~1,250 / FI ~600 / AT ~840 / SE ~250. Total 5-year corpus growth: ~100k-200k companies (vs original narrow filter's 70k).

**Purpose**: Add the EU State Aid Transparency Register (SATR) as a primary source of *national* state-aid-classified investment activity, covering 26 countries that report via the EC portal at `webgate.ec.europa.eu/competition/transparency/public/search/home`. SATR captures the **legal-instrument view** of public capital deployment — anything classified as state aid above each Member State's reporting threshold, with the granting authority, aid instrument, and objective tagged. This sits one layer below the EU-direct instruments (Pillar I/II/III, DEP, IPCEI) and partially overlaps with the Tier 1/Tier 2 NDB scrapers from Sprints 13–14.

Sprint 15 is **also a refactor sprint**: the bespoke per-extractor pattern that has grown to 18+ scripts is becoming hard to maintain and inconsistent across loaders. SATR is the right occasion to consolidate that.

---

## TL;DR for a fresh Claude session

Three workstreams, executed in a specific order:

- **A — Overlap audit (run BEFORE retiring anything)**: Load SATR into a staging schema. Match by Tax/National ID + name + amount + date window against existing Tier 1 NDB rows (HTGF, CDTI, ALMI, CDP VC, Tesi, Coparion, Invest-NL, Bpifrance, SPRIND, EI). Produce an `overlap_audit_*.csv` per institution showing: % of NDB rows covered by SATR, % of SATR rows not in NDB, sub-threshold gap estimate. **No retirement decisions until this audit lands.**
- **B — SATR core integration**: 26 countries via the EC portal, HTML pagination (export is email-only — confirmed in discovery), filter = (equity instruments OR R&D objectives), date window 2021-01-01 → today. New `scripts/extract_satr.py` with auto-period-splitting when a country/period exceeds the 100k limit. Three new national portals: Poland (SUDOP), Romania (REGAS), Slovenia (gov.si) — Spain (BDNS) is already covered via the CDTI extractor, factor that for reuse.
- **C — Repository refactor**: Consolidate the 18+ bespoke `extract_*.py` scripts behind a common `Extractor` protocol in `scripts/lib/`. Move shared logic (HTTP session, CSRF handling, retry, FX, IPCEI linkage, EIF flag, Europe-scope filter, classifier) out of per-extractor scripts. **No behaviour change** — refactor is mechanical, audited by snapshot diffs against db.sqlite.

After Sprint 15, the dataset spans EU direct + national state aid (legal-instrument view) + national NDB direct (institutional view), with overlaps explicitly modelled rather than implicit. The repo has one extractor abstraction instead of 18 bespoke scripts.

---

## Honest assessment: does SATR replace the NDB scrapers?

**No, not fully.** This needs to be settled before any retirement decision is made.

| Existing source | Does SATR replace it? | Why |
|---|---|---|
| EU instruments (EIB, EIC, IF, Chips JU, EDF, EIT, Horizon Pillar II, DEP, IPCEI) | ❌ No | These are Commission-/agency-managed, not "state aid from Member States". They do not appear in SATR at all. |
| Tier 1 NDBs (HTGF, CDTI, ALMI, CDP VC, Tesi, Coparion, Invest-NL, Bpifrance, SPRIND, EI) | ⚠️ Partial | SATR only captures **awards classified as state aid AND above the reporting threshold** (€100k general, €10k agri, €30k fisheries). Below-threshold seed tickets (common at HTGF, SPRIND) and on-market investments by NDBs (not classified as aid) are invisible to SATR. |
| Spain CDTI awards | ⚠️ Likely high overlap | CDTI extractor already pulls from BDNS (Spain's national portal). SATR ES would duplicate. Decision: prefer BDNS as primary since granularity matches. |
| Tier 2 NDBs (Sprint 14: PMV, AWS, FFG, PFR, NCBR, EIFO, Innovationsfonden, Wallonia) | ⚠️ Partial | Same threshold/classification issue. |
| Poland, Romania, Slovenia | ❌ Not in SATR | Use national portals (SUDOP / REGAS / gov.si). |

**What SATR adds that we don't have:**
1. **15 countries with no current scraper**: Italy, Belgium federal, Netherlands, Denmark national-aid (separate from EIFO), Czechia, Slovakia, Hungary, Croatia, Cyprus, Estonia, Latvia, Lithuania, Luxembourg, Malta, Greece, Iceland, UK pre-Brexit residual.
2. **Cross-validation**: TM reference numbers and granting-authority strings let us verify NDB scraper coverage and catch missing rows.
3. **Aid instrument / objective taxonomy**: standardised across all Member States; we don't currently have a uniform classifier for "equity vs grant vs guarantee".

**What gets retired (only after Workstream A audit, gated on ≥95% overlap):**
- A Tier 1 NDB scraper is a candidate for retirement only if SATR coverage of that institution's awards is ≥95% AND the sub-threshold gap is documented as not materially affecting corpus composition. Likely retirement candidates: Coparion (only 52 events, all above threshold), Invest-NL (13 events). Likely keepers: HTGF (~857 events; many sub-threshold), CDTI (~1,880 events; BDNS already granular).

**Bottom line**: SATR is a **complementary primary source**, not a replacement. It widens the geographic net, validates existing scrapers, and provides the instrument taxonomy. A handful of small NDB scrapers may retire; the rest stay.

---

## Scope decisions (locked before scripting)

1. **Time window**: 2021-01-01 to today. Same as previous sprints.
2. **Filter (SATR query-side)**: `aidInstruments ∈ {PRC, PRVRISKFIN, OFEI, SubordDebt, Lradv, SL, G}` ∪ `objectives ∈ {GBER Art. 25, 25a, 25b, 25c, 25d, 25e, 26, 26a, 27, 28, 29, 30, SME-related arts.}`. Run as **separate searches** per filter (the form's magicSuggest does not robustly accept the union) and dedupe by TM reference. Document the exact instrument/objective bid list as a frozen constant in `scripts/lib/satr_filters.py`.
3. **Download method**: HTML pagination (`?offset=N&max=100` GET requests on a Playwright-established session). Email-based CSV export is confirmed working but rejected for automation. `max=100` confirmed acceptable; do not exceed 100 per request (matches the portal default and avoids triggering rate-limit pages).
4. **Per-batch budget**: 1 country × 1 year × 1 filter must stay under SATR's 100k record cap. If it doesn't, auto-split to semi-annual, then quarterly, then monthly. Code the splitter as part of the extractor.
5. **Schema additions**: see Workstream E below — `satr_tm_id`, `aid_instrument`, `aid_objective`, `granting_authority`, `granting_authority_country`. Migration required (one-time, idempotent ALTER).
6. **Source IDs**: `satr_<country_a2>_<instrument_or_objective_short>_<year>` (e.g. `satr_de_prc_2023`, `satr_fr_gber25c_2024`). Country-level granularity matches NDB sources; instrument/objective shortcode disambiguates filter family.
7. **`grant_amount_basis` new values**: `satr_nominal_amount` (the `Nominal Amount, expressed as full amount` SATR field) and `satr_aid_element` (the `Aid element, expressed as full amount` SATR field). These differ for guarantees and soft loans where aid element ≠ nominal. Default: `satr_aid_element` if present, else `satr_nominal_amount` — document this in `grant_amount_basis` semantics in schema.sql.
8. **National portals**:
   - Poland (SUDOP): `scripts/extract_sudop.py` — JSON API, no Playwright needed.
   - Romania (REGAS): `scripts/extract_regas.py` — static HTML, paginated; manual table parsing.
   - Slovenia (gov.si): `scripts/extract_gov_si_aid.py` — annual PDFs; PDF parser.
   - **Spain (BDNS): no new script** — CDTI extractor already covers BDNS. Document the choice in methodology.
9. **Currency**: SATR exposes amounts in the currency of the granting authority (SEK, CZK, PLN, DKK, GBP, etc.). Use `ndb_helpers.normalise_ticket()` with deal *year* per Sprint 13 convention.
10. **UK SATR data is in scope** despite Brexit — UK records remain on the EC portal for grants before 2020 and for state-aid-equivalent published under EU-UK TCA. Tag `deployment_country='GB'`; the Europe-scope filter permits GB.
11. **Refactor scope**: only mechanical consolidation of duplicated logic. No behaviour changes. Snapshot db.sqlite before and after, compare row-by-row.
12. **No DB writes until validation** for both SATR and refactor. CSV mode + diff first.

---

## Pre-flight

1. Confirm DB baseline: `sanity_check.py` clean post-Sprint 14.
2. Back up: `cp db.sqlite db_backups/db.sqlite.backup_pre_sprint15`.
3. Snapshot existing source distribution: `analysis/queries/source_distribution_pre_sprint15.sql` — row counts per `source` value. Used as the diff baseline for the refactor.
4. Verify Playwright installed and working (Sprint 15 discovery confirmed it works for the SATR site).
5. Confirm `data/processed/satr/` is gitignored — raw CSV cache will be ~5–20 GB.
6. Settle the equity-instrument and R&D-objective bid lists by inspecting the live portal for one large country (Germany). Freeze the lists in `scripts/lib/satr_filters.py` before any scraping.

---

## Workstream A — Overlap audit (NO retirement until this completes)

### Step A0 — Discovery & match-key design

For each Tier 1 NDB scraper, identify the match key against SATR:

| NDB scraper | Match key candidates | Confidence |
|---|---|---|
| HTGF | Beneficiary name + DE + award date (±90 days) + amount (±5%) | Medium — HTGF tickets often co-funded, partial matches expected |
| CDTI | Beneficiary name + ES + Tax ID — Tax ID is in both | High |
| Almi Invest | Beneficiary name + SE + amount | Medium |
| CDP VC | Beneficiary name + IT + date | Medium |
| Tesi | Beneficiary name + FI + date + amount | Medium |
| Coparion | Beneficiary name + DE | High (small N) |
| Invest-NL | Beneficiary name + NL | High (very small N) |
| Bpifrance (placeholder fund-level) | Not applicable — fund-level, not company-level | Skip |
| SPRIND (placeholder) | Not applicable — challenge-level | Skip |
| Enterprise Ireland (placeholder) | Not applicable | Skip |

### Step A1 — Build the staging-only SATR loader

Load SATR for the *minimum* set of countries needed for overlap audit: DE (HTGF, Coparion, SPRIND), ES (CDTI; cross-check BDNS), SE (ALMI), IT (CDP VC), FI (Tesi), NL (Invest-NL). Skip FR initially (Bpifrance is fund-level so no overlap to audit yet).

Load into a staging table `satr_staging` with all SATR fields verbatim. Do **not** write to `public_funding_events` yet.

### Step A2 — Compute overlap matrix

For each NDB, produce `analysis/findings/overlap_<ndb>_<country>.md` with:

| Metric | Value |
|---|---|
| NDB rows total | N |
| NDB rows above SATR threshold (estimated) | M |
| SATR rows for that institution | S |
| Matched (NDB ↔ SATR) | X |
| NDB rows unmatched but above threshold (potential SATR gaps) | M − X |
| SATR rows unmatched in NDB (cases NDB missed) | S − X |
| Sub-threshold NDB rows (kept regardless) | N − M |

### Step A3 — Retirement decision matrix

For each NDB, output: **keep / retire / merge**.

- **Retire** if X/M ≥ 0.95 AND the NDB scraper is fragile (bespoke HTML scrape with frequent breakage). Coparion, Invest-NL are likely retirement candidates.
- **Merge** if both sources contribute distinct rows that should be unioned (e.g. CDTI/BDNS + SATR ES). Keep both extractors; dedup by Tax ID.
- **Keep** otherwise. HTGF, CDTI, Bpifrance, EI, SPRIND likely stay.

Document all retirement decisions in `docs/notes.md` and `docs/methodology.md`.

---

## Workstream B — SATR core integration

### Step B0 — Discovery & filter taxonomy freeze

Already largely complete from Sprint 15 discovery. Confirmed:
- Form action: POST `/public/search/home` → redirect → advanced search at `/public/search/results`.
- Pagination: GET `?offset=N&max=100` once search is in session.
- Required: CSRFTOKEN, `countries=CountryXXX` (bid format), date filters `dateGrantedFrom`/`dateGrantedTo` as DD/MM/YYYY.
- Export button IDs: `#newUserCriteriaToExportCsv` (under-limit), `#refineSearchWarningCsv` (over-limit).
- Email-based export rejected.

Freeze the filter constants:

```python
# scripts/lib/satr_filters.py
EQUITY_INSTRUMENTS = (
    "StateAidInstrumentPRC",          # Provision of risk capital
    "StateAidInstrumentPRVRISKFIN",   # Provision of risk finance
    "StateAidInstrumentOFEI",         # Other forms of equity intervention
    "StateAidInstrumentSubordDebt",   # Subordinated debt
    "StateAidInstrumentLradv",        # Loan / repayable advances
    "StateAidInstrumentSL",           # Soft loan
    "StateAidInstrumentG",            # Guarantee
)

RND_OBJECTIVES = (
    # GBER R&D&I block (Art. 25 family)
    "StateAidObjectiveGberArt25", "StateAidObjectiveGberArt25a",
    "StateAidObjectiveGberArt25b", "StateAidObjectiveGberArt25c",
    "StateAidObjectiveGberArt25d", "StateAidObjectiveGberArt25e",
    "StateAidObjectiveGberArt26",     # Research infrastructures
    "StateAidObjectiveGberArt26a",
    "StateAidObjectiveGberArt27",     # Innovation clusters
    "StateAidObjectiveGberArt28",     # Innovation aid for SMEs
    "StateAidObjectiveGberArt29",     # Process / organisational innovation
    "StateAidObjectiveGberArt30",     # R&D in fisheries
    # SME-block (Art. 17 onwards) — keep narrow to avoid pulling all SME aid
    "StateAidObjectiveGberArt22",     # Aid to start-ups
    # Risk-finance block
    "StateAidObjectiveGberArt21",     # Risk-finance aid (pre-2023)
    "StateAidObjective2022GberArt21", # Risk-finance aid (post-2023 revision)
)
```

Validate this list against the live portal for DE before scripting — some bids will not exist for all countries and the API surfaces them per-country.

### Step B1 — Build `scripts/extract_satr.py`

The skeleton at [scripts/extract_satr.py](scripts/extract_satr.py) is already drafted. Sprint 15 work:

1. Replace the email-based export with HTML pagination. After the Playwright-established search, switch to `requests` with the captured session cookie + CSRFTOKEN for fast pagination (`GET /public/search/results?offset=N&max=100`).
2. HTML table parser — extract one row per `<tr>`. Field order is fixed (confirmed in Sprint 15 discovery). Build a tolerant parser that handles missing `<td>`s.
3. Auto-period-splitter: when `over_limit` flag triggers, recurse from year → semi-annual → quarterly → monthly. If monthly still exceeds 100k, narrow by filter (split equity vs R&D as separate runs).
4. Run two passes per (country, period): equity-instrument filter, then R&D-objective filter. Dedup by `satr_tm_id` (the TM-XXXXXX reference) before any DB write.
5. Per-country output: `data/processed/satr/satr_<a2>_<period>_<filter>.csv`. Cached; idempotent re-runs skip already-downloaded batches.
6. Apply `ndb_helpers.normalise_ticket()` for non-EUR currencies (SEK, CZK, PLN, DKK, HUF, GBP, RON, BGN, HRK→EUR-pegged-after-2023).
7. Map SATR fields to schema:

| SATR field | DB field |
|---|---|
| Country | `deployment_country` (granting authority country) |
| Aid Measure Title | `project_title` |
| SA.Number | `call_id` |
| Reference Number (TM-…) | `satr_tm_id` (new column) |
| National ID | (matcher key only; not stored unless we add a beneficiary_id column) |
| Name of the beneficiary | `companies.raw_name` → matched/created |
| Beneficiary Type | (informational; could populate `entity_type` heuristically) |
| Region | (informational; not stored in v1) |
| Sector (NACE) | `sector_tags_raw` |
| Aid Instrument | `aid_instrument` (new column) |
| Objectives of the Aid | `aid_objective` (new column) |
| Nominal Amount | `grant_amount_eur` if no Aid element |
| Aid element | `grant_amount_eur` (preferred), `grant_amount_basis='satr_aid_element'` |
| Date of granting | `project_started` |
| Granting Authority Name | `granting_authority` (new column) |
| Entrusted Entity | (informational) |
| Financial Intermediaries | (informational) |
| Published Date | (audit-only) |
| Another Beneficiary Member State | `companies.country` if non-NULL (HQ country of beneficiary) |
| Third country outside of the EU | (rare; skip rows where this is set — out of Europe scope) |

### Step B2 — Build national-portal extractors (PL / RO / SI)

- `scripts/extract_sudop.py` — Polish UOKiK portal. JSON API at `https://sudop.uokik.gov.pl/`. Documented. No Playwright needed.
- `scripts/extract_regas.py` — Romanian Competition Council. Static HTML at `https://regas.consiliulconcurentei.ro/transparenta/`. Paginated table; manual parser.
- `scripts/extract_gov_si_aid.py` — Slovenian gov.si. Annual XLSX/PDF dumps; parse via `openpyxl` / `pdfplumber`.

Map to the same schema fields as Workstream B1.

### Step B3 — Load and validate

```bash
python scripts/extract_satr.py --country DE         # smoke test
python scripts/extract_satr.py                      # full run
python scripts/extract_sudop.py
python scripts/extract_regas.py
python scripts/extract_gov_si_aid.py
python scripts/load_satr.py --staging              # to satr_staging
python scripts/load_satr.py --apply                # promotes to public_funding_events
python scripts/classify.py
python scripts/sanity_check.py
```

Validation gates: see G3–G6 below.

---

## Workstream C — Repository refactor

### Why now

The repo has accumulated **18+ `extract_*.py` scripts**, each with bespoke HTTP, retry, parsing, FX, and DB-write logic. SATR adds 4 more. The duplication is becoming hard to maintain — e.g. Europe-scope filter (Sprint 14) had to be retro-fitted into every extractor. Adding Sprint 15's scrapers without first consolidating means 4× more places to update on the next schema migration.

### Step C0 — Inventory and pattern extraction

Read every `scripts/extract_*.py` and tabulate:
- HTTP pattern (raw `requests`, `httpx`, Playwright, file-based)
- Pagination pattern (offset, cursor, none)
- Output format (CSV intermediate then DB load, or direct DB write)
- FX handling (uses `ndb_helpers` or inline)
- Europe-scope handling (inline check or relies on DB trigger)
- Match/dedup logic (PIC, tax ID, name fuzzy, none)

Output: `docs/extractor_inventory.md` (one-off audit doc; can be deleted post-refactor).

### Step C1 — Define the `Extractor` protocol

```python
# scripts/lib/extractor.py
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

@dataclass
class RawEvent:
    """One funding event before classification / DB write."""
    source: str
    raw_name: str
    country: str | None
    grant_amount: float | None
    grant_currency: str
    grant_year: int | None
    # ... all public_funding_events columns ...
    raw_row: dict  # original parsed dict, for audit

class Extractor(ABC):
    """Common interface for every source loader."""
    source_family: str             # e.g. 'satr', 'htgf', 'cordis'
    deployment_country: str | None # ISO 2-letter, None for Commission-managed

    @abstractmethod
    def discover(self) -> Iterator[dict]: ...
    """Fetch and yield raw rows from the source. Pure I/O."""

    @abstractmethod
    def parse(self, raw: dict) -> RawEvent | None: ...
    """Convert one raw row into a RawEvent. Returns None to skip."""

    def normalise(self, ev: RawEvent) -> RawEvent:
        """FX, Europe-scope filter, default values. Has a sensible base impl."""
        ...

    def write_csv(self, out_dir: Path) -> int: ...
    def write_db(self, conn) -> int: ...
```

Plus shared helpers in `scripts/lib/`:
- `lib/http.py` — common requests Session with retry, polite throttle, UA string.
- `lib/playwright_session.py` — Playwright context manager for sites that need it.
- `lib/match.py` — common matcher (PIC > tax ID > name+country exact > prefix > fuzzy).
- `lib/europe_scope.py` — already exists at `scripts/europe_scope.py`; move here.
- `lib/fx.py` — split out from `ndb_helpers.py`; the IPCEI/EIF parts stay in `ndb_helpers.py`.
- `lib/satr_filters.py` — equity / R&D bid lists.

### Step C2 — Migrate one extractor as the reference implementation

Pick `extract_htgf.py` (representative WP REST API extractor, ~300 lines today). Refactor to the new protocol. Verify output matches current behaviour by:
1. Run current `extract_htgf.py` → snapshot output rows.
2. Run new `extract_htgf_v2.py` → compare row-for-row.
3. Confirm zero diff.

If clean, proceed to migrate the others.

### Step C3 — Migrate remaining extractors

In order of complexity (simplest first to build muscle memory):
1. `extract_invest_nl.py` (smallest, simplest).
2. `extract_coparion.py`.
3. `extract_tesi.py`, `extract_almi_invest.py`, `extract_cdp_vc.py`.
4. `extract_htgf.py` (done in C2).
5. `extract_cdti.py` (BDNS API; complex).
6. `extract_bpifrance.py`, `extract_sprind.py`, `extract_enterprise_ireland.py` (placeholder-level; small).
7. `extract_eib.py`, `extract_innovation_fund.py`, `extract_chips_ju.py`, `extract_edf.py`, `extract_eit.py`, `extract_ipcei.py`.
8. `extract_cordis.py`, `extract_cordis_pillar_ii.py` (largest).
9. **`extract_satr.py`** — write directly against the new protocol.
10. The three national-portal extractors.

Each migration: snapshot-diff against current output before merge.

### Step C4 — Delete unused helpers

After all extractors migrated:
- Remove duplicate HTTP / retry blocks across scripts.
- Remove ad-hoc CSV write helpers.
- Confirm `audit_dedup.py`, `classify.py`, `sanity_check.py` still work (they don't depend on extractor internals).

### Step C5 — Snapshot diff and validate

```bash
sqlite3 db.sqlite ".dump" > pre_refactor_dump.sql
# (run all extractors via the new pipeline against a fresh DB)
sqlite3 db_refactored.sqlite ".dump" > post_refactor_dump.sql
diff pre_refactor_dump.sql post_refactor_dump.sql
```

The diff should be empty (or limited to timestamps / autoincrement IDs).

---

## Workstream D — Schema additions

### One-time migration

Append to `scripts/schema.sql` (and write a separate `scripts/migrations/004_satr_columns.sql` for idempotent apply against the live DB):

```sql
ALTER TABLE public_funding_events ADD COLUMN satr_tm_id TEXT;
ALTER TABLE public_funding_events ADD COLUMN aid_instrument TEXT;
ALTER TABLE public_funding_events ADD COLUMN aid_objective TEXT;
ALTER TABLE public_funding_events ADD COLUMN granting_authority TEXT;
ALTER TABLE public_funding_events ADD COLUMN granting_authority_country TEXT;

CREATE INDEX idx_pfe_satr_tm_id ON public_funding_events(satr_tm_id) WHERE satr_tm_id IS NOT NULL;
CREATE INDEX idx_pfe_aid_instrument ON public_funding_events(aid_instrument);
CREATE INDEX idx_pfe_aid_objective ON public_funding_events(aid_objective);
```

New `grant_amount_basis` values to document in the schema comment:
- `satr_aid_element` — preferred; what the EC reports as the aid-element-in-EUR.
- `satr_nominal_amount` — fallback when aid_element is NULL.
- `sudop_aid_element`, `regas_aid_element`, `gov_si_aid_element` — national-portal equivalents.

---

## Workstream E — Cross-workstream post-load tasks

### Post-1 — Source family taxonomy refresh

`scripts/classify.py` SOURCE_SECTOR routing — add `satr_*` family. The classifier should:
1. Read `sector_tags_raw` (NACE sector from SATR).
2. Map NACE to internal 7-bucket sector.
3. Fallback to `aid_objective` → sector heuristic (R&D objectives → infer the most specific tech bucket from `aid_measure_title` text).
4. Fallback to `granting_authority` → sector (e.g. "Bundesministerium für Verkehr und digitale Infrastruktur" → digital).

### Post-2 — Update `analysis/views.sql`

- `v_state_aid_layer` — all rows where `source LIKE 'satr_%' OR source LIKE 'sudop_%' OR source LIKE 'regas_%' OR source LIKE 'gov_si_%'`. The "national state aid" layer.
- `v_company_funding_layers` — for each company, columns:
  - `received_eu_direct` (EIB/EIC/IF/Chips/EDF/EIT/Horizon/DEP/IPCEI)
  - `received_state_aid` (SATR + national portals)
  - `received_ndb_direct` (Tier 1/2 NDBs)
  - `received_private` (private_funding_events)
  - Boolean flags + amount sums per layer.
- Update `v_access_map` from Sprint 14 to include the state-aid layer.

### Post-3 — Site refresh

- Update `/access-map` Sankey to include the state-aid layer as a fourth channel.
- New page `/state-aid` showing instrument-type / objective distribution across countries.
- Update `/methodology` with the SATR caveats (thresholds, country gaps, overlap with NDB scrapers).

### Post-4 — Methodology consolidation

`docs/methodology.md` final section:
- The 4-layer model: EU direct, state aid, NDB direct, private.
- Each layer's coverage caveats.
- Decision log for which NDB scrapers were retired vs kept.
- Coverage estimate update — expected jump from ~85–90% → ~92–96% for company-direct identifiable EU strategic universe.

---

## File manifest

| File | Action |
|---|---|
| `scripts/lib/__init__.py` | **New** package |
| `scripts/lib/extractor.py` | **New** — `Extractor` protocol + `RawEvent` |
| `scripts/lib/http.py` | **New** — shared HTTP session |
| `scripts/lib/playwright_session.py` | **New** — shared Playwright context |
| `scripts/lib/match.py` | **New** — common matcher |
| `scripts/lib/fx.py` | **New** — split out from `ndb_helpers.py` |
| `scripts/lib/europe_scope.py` | **Move** from `scripts/europe_scope.py` |
| `scripts/lib/satr_filters.py` | **New** — equity / R&D bid lists |
| `scripts/extract_satr.py` | **Rewrite** against new protocol (skeleton exists from Sprint 15 discovery) |
| `scripts/extract_sudop.py` | **New** — Poland |
| `scripts/extract_regas.py` | **New** — Romania |
| `scripts/extract_gov_si_aid.py` | **New** — Slovenia |
| `scripts/load_satr.py` | **New** — staging → public_funding_events loader |
| `scripts/migrations/004_satr_columns.sql` | **New** — idempotent ALTER |
| `scripts/extract_*.py` (existing 17) | **Refactor** to new protocol; no behaviour change |
| `scripts/ndb_helpers.py` | **Trim** — FX moved to `lib/fx.py`; IPCEI/EIF stay |
| `scripts/classify.py` | Add `satr_*` source family routing |
| `scripts/schema.sql` | Add SATR columns + indexes |
| `analysis/views.sql` | `v_state_aid_layer`, `v_company_funding_layers`, updated `v_access_map` |
| `analysis/findings/overlap_*.md` | **New** per-NDB overlap audit reports |
| `docs/methodology.md` | 4-layer model section; retirement decision log |
| `docs/notes.md` | Day 17–20 entries |
| `docs/extractor_inventory.md` | **New** (transient) — audit doc; delete post-refactor |
| `site/app/state-aid/page.tsx` | **New** — instrument/objective distribution |
| `site/app/access-map/page.tsx` | Update — 4-layer Sankey |
| `site/app/methodology/page.tsx` | Update — SATR caveats |
| `.gitignore` | Add `data/processed/satr/` (large) |

---

## Validation gates

| Gate | Criterion |
|---|---|
| G1 Baseline | `sanity_check.py` clean post-Sprint 14; backup exists |
| G2 Overlap audit complete | One `overlap_<ndb>.md` per Tier 1 NDB; retirement decisions logged |
| G3 SATR core load | All 26 EC-portal countries loaded; per-country event counts within ±30% of an a priori estimate from `data/europe_scope.json` × Eurostat NDB activity figures |
| G4 National portals | PL/RO/SI loaded; combined ~10–30k events expected |
| G5 No equity > cost | Zero events with `grant_amount_eur > total_project_cost_eur` post-SATR-load |
| G6 Dedup integrity | After load, no two `public_funding_events` rows share the same `satr_tm_id` |
| G7 Schema migration idempotent | Running `004_satr_columns.sql` twice does not error |
| G8 Refactor zero-diff | Snapshot dump of db.sqlite pre-refactor vs post-refactor identical (modulo timestamps/autoinc) |
| G9 Source family taxonomy | `classify.py` updated; spot-check 20 SATR rows for sensible sector_inferred |
| G10 Views | `v_company_funding_layers` populated; the 4-layer Sankey on the site renders coherently |
| G11 Coverage % | Methodology updated to ~92–96% coverage of company-direct identifiable EU strategic universe |
| G12 Audit log | `analysis/findings/` includes the SATR caveats: thresholds per country, missing-country list (PL/RO/SI handled separately), instrument/objective filter rationale |

---

## Expected corpus growth (rough estimates)

Highly uncertain — depends on SATR threshold behaviour by country and filter restrictiveness.

| Source | Records (pre-dedup) | Net new companies (post-dedup vs existing corpus) |
|---|---:|---:|
| SATR — 26 countries × (equity OR R&D) × 5 years | ~150,000–500,000 | ~3,000–8,000 |
| Poland (SUDOP) | ~30,000–80,000 | ~500–1,500 |
| Romania (REGAS) | ~10,000–30,000 | ~200–500 |
| Slovenia (gov.si) | ~5,000–15,000 | ~100–300 |
| **State-aid layer subtotal** | **~195,000–625,000 records** | **~3,800–10,300 new companies** |
| Refactor (W/C) | 0 | 0 |
| Schema migration (W/D) | 0 | 0 |

**Sprint 15 corpus target: ~21,000–32,000 companies / ~250,000–680,000 events.**

The big spread reflects two unknowns: (a) how restrictive the equity-instrument filter actually is in practice (Germany alone might be 50–200k records), and (b) how many of those companies are duplicates of existing rows. The audit (Workstream A) tightens the estimate.

---

## Execution order

**A → D → B → C → E.**

- **A first**: don't build anything until the overlap audit is done. The audit determines whether SATR is additive or partially redundant. Three-day check.
- **D second**: schema migration is small and unblocks everything else. Apply before any SATR loading.
- **B third**: SATR core integration — biggest data-volume workstream. Get it loaded into staging, validate counts, then promote.
- **C fourth**: refactor — do *after* SATR is loaded so the new extractor protocol is tested against the most complex new extractor as a forcing function. Refactor older extractors only after SATR is stable.
- **E last**: site / views / methodology — finishes the sprint with the user-facing surface.

Each step: `classify.py` + `sanity_check.py` + `audit_dedup.py --report` between extractions.

---

## Out of scope (explicit)

- **Sub-threshold state aid**: SATR thresholds (€100k general, €10k agri, €30k fisheries) cut off small grants. NDB direct scrapers cover this gap; we don't try to fill it from any other source.
- **De minimis aid**: not reported in SATR by design (separate Article 108(3) TFEU regime). Out of scope.
- **Agricultural state aid**: GBER/ABER Art. 13–28 (agricultural block). Our filter excludes these — we focus on R&D / equity / SME aid only.
- **Pre-2021 SATR records**: window matches the rest of the corpus.
- **Non-EU SATR records**: SATR includes a "Third country outside of the EU" field; we skip those rows (out of Europe scope).
- **National portals beyond PL/RO/SI**: any other Member State that maintains a parallel disclosure portal (some German Länder have one) is out of scope; the SATR feed is treated as authoritative.
- **Cross-language matching for SATR↔NDB overlap**: the audit uses normalised name+ID matching, no translation. Documented as a known limitation.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| SATR portal restructures mid-sprint | Cache raw HTML snapshots per page; resume from cache if portal changes. Discovery proves the form is stable Spring framework — low churn. |
| Equity / R&D filter bids change per country | Refresh `satr_filters.py` from live API at the start of each country's run; log any bid not recognised. |
| Period auto-splitter loops infinitely | Hard floor at monthly granularity. If a single month still exceeds 100k, narrow by filter; if still over, log and accept the cap with a warning row. |
| Pagination breaks on session loss | Detect redirect to `/search/home` mid-pagination → re-establish session via Playwright → resume from last offset. |
| Beneficiary names spread across multiple SATR rows for the same award | Same award shows up once per beneficiary; we treat each as a separate row (not a duplicate). Document. |
| Currency conversion year mismatch | Use deal year (grant year) consistently — Sprint 13 convention. Add 2026 ECB rate refresh as a pre-flight step. |
| Refactor introduces silent behaviour change | Snapshot-diff every migration step. If diff is non-zero, halt and review row-by-row. |
| Overlap audit false negatives (NDB row exists in SATR but matcher misses it) | Audit reports include unmatched-on-both-sides counts; manual spot check of 50 random unmatched per institution. |
| Coparion / Invest-NL retired but later found to have unique sub-threshold data | Don't retire — keep as documented "secondary cross-check" scrapers; comment them out in the master extractor list with a note. Reversible. |
| State aid layer dwarfs the rest of the corpus on the site | Visual / narrative emphasis on the 4-layer Sankey explicitly distinguishes state aid (legal-instrument view) from NDB direct (institutional view); methodology page makes this overlap explicit. |
| Polish SUDOP / Romanian REGAS data quality unknown until parsed | Build the parsers behind a `--smoke-test` mode that downloads 1 page and exits; defer full load until smoke test passes. |
| Sprint scope balloon (3 new portal extractors + refactor + 17 migrations is large) | If schedule slips, drop Workstream C (refactor) to Sprint 16. Workstreams A/B/D/E stand alone. The refactor is the longest-tail piece; SATR data delivery is the higher-priority outcome. |

---

## Definition of done

- Workstream A: overlap audit reports written for all Tier 1 NDBs with retirement decisions documented in `docs/methodology.md`.
- Workstream B: SATR + Poland (SUDOP) + Romania (REGAS) + Slovenia (gov.si) loaded into `public_funding_events`. ~200k–600k new records, ~4–10k new companies.
- Workstream C: all extractors migrated to the `Extractor` protocol; snapshot-diff zero. `scripts/lib/` package consolidates shared logic. **OR**: documented deferral of refactor to Sprint 16 with clear hand-off.
- Workstream D: schema migration applied; SATR columns indexed; `grant_amount_basis` expanded.
- Workstream E: `v_state_aid_layer`, `v_company_funding_layers` views built; `/access-map` page renders 4-layer Sankey; `/state-aid` page renders.
- `docs/methodology.md` updated with 4-layer model and SATR caveats.
- Memory file `project_sprint_15_satr.md` written with: country-by-country event counts, retirement decisions, overlap %s.
- `MEMORY.md` index updated.
- Coverage estimate at ~92–96% of company-direct identifiable EU strategic universe — clearly stated with denominator math.
- **The dataset is now the most complete public-domain map of EU strategic capital deployment available, spanning EU-direct + state aid + NDB direct + private (Sprint 10).** Sprint 16 becomes site polish + analytical narrative.
