# Sprint 19 plan — Site visualisation + extractor refactor

**Owner**: Claude (next session), executing against `/Users/asgermollergrimberg/EuroInvTracker/`.

**Status**: Not started. Follows Sprint 18 (regional NDB + R&D agency deep dives). Target baseline at start: **~133,000-177,000 companies / ~239,000-304,000 events** (Sprint 18 projected, calibrated to Sprint 16's actual 116,925 / 213,906).

**Purpose**: Two parallel deliverables:

1. **Site visualisation** of the now-complete 4-layer access map and NDB-distributor view. Adds two new pages: `/state-aid` and `/ndb-map`. Updates `/access-map` to include the state-aid layer as the fourth Sankey channel. Updates methodology + limitations pages. **Must surface the Art. 107 TFEU structural blind spot** (commercial-conform NDB equity invisibility) on the limitations page and `/ndb-map` so users understand what the corpus does NOT cover.

2. **Extractor refactor (Workstream C from the original Sprint 15 plan)**: consolidate 30+ bespoke `extract_*.py` scripts behind a common `Extractor` protocol in `scripts/lib/`. The Sprint 16 central-register pattern (Opendatasoft CSV pull, server-rendered Drupal Views scrape, Google Sheets export, async SUDOP API) is the natural template — generalise into reusable adapters. Mechanical refactor; zero behaviour change validated by snapshot diff.

These two are bundled because they're both "consolidation" work that benefits from being done after the data layer is settled (post-Sprint 18). Both have moderate effort and high long-term-maintenance value.

### What Sprint 19 inherits from Sprint 16

Sprint 16 shipped 7 new extractors that need site coverage:
- `bpifrance_inov`, `bpifrance_pmup_idf`, `bpifrance_innovup_leader_idf`, `fr_relance_industrie` — Bpifrance grant programmes
- `ademe_aid` — France's #1 NDB by event count (27,697 events / €7.76B)
- `innovationsfonden_*` — Denmark's central R&D grant register
- `eifo_coinvest` — Denmark venture co-investment
- `sudop_*` — Polish state aid (scaffold; full load completes in Sprint 17)

The `/ndb-map` page must include cards for each. The 4-layer Sankey must include the new state-aid sources (after Sprint 17 completes PL/RO/SI/ES-multi).

---

## TL;DR for a fresh Claude session

Two workstreams:

- **A — Site visualisation**: Build `/state-aid` page (per-country state-aid distribution + aid-instrument + aid-objective breakdowns). Build `/ndb-map` page (institutional view: per-NDB summary cards with portfolio companies, capital deployed, sector mix). Update `/access-map` to 4-layer Sankey. Update home page taxonomy network with state-aid layer. Update methodology and limitations. **Read `node_modules/next/dist/docs/` before writing any TSX** — the site uses a non-standard Next.js variant (see `site/AGENTS.md`).

- **B — Extractor refactor**: Define `Extractor` protocol in `scripts/lib/extractor.py` with discover / parse / normalise / write_csv / write_db methods. Migrate 25+ existing extractors one at a time, snapshot-diff before/after each migration. Move shared helpers (HTTP session, Playwright session, FX, Europe scope, IPCEI linkage) into `scripts/lib/`. Goal: a new SATR-class scraper should be addable in <1 day instead of a week.

These are independent; can be parallelised but execute Workstream A first because the site delivers user-visible value, and B carries refactor risk.

---

## Workstream A — Site visualisation

### Step A0 — Pre-flight (read the Next.js variant docs)

The site uses a custom Next.js per `site/AGENTS.md`. Conventions differ from standard. Before writing any component:

```bash
cd site
ls node_modules/next/dist/docs/   # find the canonical guide
```

Confirm:
- Server-component / client-component split conventions
- Static-export build flow
- Component import patterns (Sprint 9 memory note: never barrel-import client+server mixed components)
- Tremor / Recharts / d3 chart library versions

### Step A1 — Data export script

Build `analysis/build_q09_data.py` that emits a single `site/public/data/q09.json` consumed by both new pages:

```python
{
  "byCountry": [{"country": "DE", "events": 29948, "companies": 19858, "billionEur": 72.7}, ...],
  "byInstrument": [{"instrument": "Direct grant", "events": 52000, ...}, ...],
  "byObjective": [{"objective": "Art. 25c R&D", "events": 8000, ...}, ...],
  "byNdbDistributor": [{"ndbId": "mediocredito_centrale", "label": "...", "country": "IT",
                        "events": 14345, "companies": 12248, "millionEur": 15082,
                        "viaSatr": 14345, "viaDirect": 0}, ...],
  "accessMap": {
    "EU_only": 14702,
    "stateAid_only": 75195,
    "NDB_only": 2121,
    "EU_stateAid": 2702,
    "EU_NDB": 272,
    "stateAid_NDB": 189,
    "all_three": 64
  },
  "topMultiChannel": [
    {"name": "NORDIC REN-GAS OY", "country": "FI", "eu_eur": 87100000, "sa_eur": 300000, "ndb_eur": 0},
    ...
  ]
}
```

### Step A2 — `/state-aid` page

`site/app/09-state-aid/page.tsx`:

- Header: "National state aid layer" — explains what SATR is and what we filtered out (TCTF/COVID emergency aid).
- KPI grid: total events / companies / aid value / countries covered.
- **By country chart**: horizontal bar chart, top 15 countries by aid value, with sector colour-coding.
- **By aid instrument**: donut/pie chart of Direct grant vs Equity vs Loan vs Guarantee vs Tax advantage.
- **By aid objective**: bar chart of GBER article distribution (Art. 22, 25c, 28, 41, etc.).
- **NDB distributor table**: paginated table of NDBs with events / companies / €M / country / via_satr / via_direct counts.
- Findings prose: bullets calling out IT/DE/FR top, Italian Fondo di Garanzia dominance, German Land-bank fragmentation.

Use existing component patterns from `site/app/01-corpus/page.tsx` as the template.

### Step A3 — `/ndb-map` page

`site/app/10-ndb-map/page.tsx`:

- Header: "The European NDB layer" — institutional view of public capital deployment.
- KPI grid: total NDBs identified / events tagged / companies funded.
- **Per-NDB cards**: scrollable list. Each card shows:
  - NDB name + country flag
  - Events / companies / €M deployed
  - Top 3 portfolio companies by amount
  - Sector mix donut
  - "Via SATR" vs "Via direct scraper" badge
- **Country grid**: map of Europe with NDB count per country (e.g. Germany shows "15 NDBs identified" with hover-detail).
- **Cross-channel table**: NDBs visible via both SATR and direct scrapers (the 3 currently — Enterprise Ireland, ALMI, Bpifrance).

### Step A4 — `/access-map` 4-layer Sankey update

Update existing `/access-map` page (if it exists from Sprint 14; otherwise create):

- Sankey diagram: 4 source columns (EU direct, State aid, NDB direct, Private-pending-Sprint10) → middle column of sector buckets → right column of countries.
- Filter controls: by year, by sector, by minimum amount.
- Top-20 multi-channel companies table below the Sankey.

### Step A5 — Home page update

`site/app/page.tsx`:

- Update taxonomy network to include state-aid layer (new node cluster, yellow tone matching Sprint 15 palette addition).
- Update headline KPIs to reflect post-Sprint 18 corpus size.
- Add a "Sprint 15-18 additions" callout linking to the new pages.

### Step A6 — Methodology + limitations updates

`site/app/methodology/page.tsx`:

- Section on SATR scope (innovation + IPCEI + Net-Zero) + TCTF exclusion logic.
- Section on the NDB-distributor taxonomy.
- Coverage table updated to ~98-99%.

`site/app/limitations/page.tsx`:

- Data quality caveats: NACE descriptions limit sector classification accuracy (~33% unclassified by intent).
- TCTF exclusion is conservative — some legitimate post-COVID schemes may be filtered out as collateral damage.
- Bpifrance grants are now covered via i-Nov + PM'up + Innov'up Leader + PdR-Industriel (Sprint 16); Bpifrance **commercial-conform equity** remains structurally invisible — see next bullet.
- **Art. 107 TFEU structural blind spot** (Sprint 16 finding): commercial-conform NDB equity (Bpifrance equity, KfW Capital LP, CDP Equity, EIFO equity tickets) is by EU competition law not state aid and not published in any central register. The corpus catches the subsidy-element grant + soft-loan layer comprehensively; the equity layer requires annual-report PDF parsing, EIF/InvestEU central reports, or Dealroom/Pitchbook commercial-data licensing. See `docs/methodology.md` § "Structural blind spot: commercial-conform NDB equity" and `plans/backlog/commercial_conform_ndb_equity.md` for recovery paths.

This must render prominently on `/limitations` and be linked from `/ndb-map` — when a user looks at e.g. the Bpifrance card showing €619M in grants, they need to immediately see that the €2-3bn/yr equity layer is not captured.

### Step A7 — Build + smoke test

```bash
cd site
npm install
npm run build
npm run start  # smoke test on localhost
```

Verify all new pages render without console errors. Check the 4-layer Sankey is coherent. Check NDB cards load all 43 NDBs.

### Step A8 — Static export validation

If site is statically exported:
- `npm run export`
- Verify `site/out/09-state-aid/`, `site/out/10-ndb-map/`, etc. exist
- Spot-check a few generated pages in a browser

---

## Workstream B — Extractor refactor

### Step B0 — Inventory current extractors

Catalogue all `extract_*.py`:

```bash
ls scripts/extract_*.py
```

Per extractor, table:
- HTTP pattern (requests / Playwright / file-based)
- Pagination pattern (offset / cursor / none / per-year file)
- FX handling (uses `ndb_helpers` or inline)
- Output format (direct DB write vs CSV intermediate)
- Match / dedup logic (PIC / tax ID / name)
- Europe scope handling (relies on trigger vs inline)

Output: `docs/extractor_inventory.md` (transient — delete post-refactor).

### Step B1 — Define `Extractor` protocol

```python
# scripts/lib/extractor.py

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

@dataclass
class RawEvent:
    """One funding event before classification / DB write. Mirrors
    public_funding_events columns. Optional fields default to None."""
    source: str
    raw_name: str
    country: str | None
    grant_amount: float | None
    grant_currency: str
    grant_year: int | None
    ndb_distributor: str | None
    role: str = "beneficiary"
    project_title: str | None = None
    project_summary: str | None = None
    sector_tags_raw: str | None = None
    raw_source_url: str | None = None
    # ... all public_funding_events columns ...
    raw_row: dict = None    # original parsed dict, audit

class Extractor(ABC):
    """Common interface for every source loader."""
    source_family: str             # e.g. 'satr', 'htgf', 'cordis'
    deployment_country: str | None # ISO 2-letter, None for Commission-managed
    canonical_ndb: str | None      # ndb_distributor for all rows from this extractor

    @abstractmethod
    def discover(self) -> Iterator[dict]:
        """Fetch and yield raw rows from the source. Pure I/O."""

    @abstractmethod
    def parse(self, raw: dict) -> RawEvent | None:
        """Convert one raw row into a RawEvent. Returns None to skip."""

    def normalise(self, ev: RawEvent) -> RawEvent:
        """FX, Europe-scope filter, default values. Has a sensible base impl."""
        ...

    def write_csv(self, out_dir: Path) -> int: ...
    def write_db(self, conn) -> int: ...
```

Plus shared library:
- `scripts/lib/http.py` — common `requests.Session` with retry, polite throttle, UA.
- `scripts/lib/playwright_session.py` — Playwright context manager.
- `scripts/lib/match.py` — common matcher (PIC > national ID > normalised name + country exact > prefix > fuzzy).
- `scripts/lib/fx.py` — split out from `ndb_helpers.py`. The IPCEI / EIF flag parts stay in `ndb_helpers.py`.
- `scripts/lib/europe_scope.py` — move from `scripts/europe_scope.py`.

### Step B2 — Migrate one extractor as the reference

Pick `extract_htgf.py` (representative WP REST API extractor). Refactor to the new protocol. Verify:
1. Run current `extract_htgf.py` → snapshot output rows.
2. Run new `extract_htgf_v2.py` → compare row-for-row.
3. Confirm zero diff.

If clean, proceed.

### Step B3 — Migrate remaining extractors

In order of complexity (simplest first):
1. `extract_invest_nl.py` (smallest)
2. `extract_coparion.py`
3. `extract_tesi.py`, `extract_almi_invest.py`, `extract_cdp_vc.py`
4. `extract_htgf.py` (done in B2)
5. `extract_cdti.py` (BDNS API; complex)
6. `extract_bpifrance.py` (or its v2 from Sprint 16)
7. `extract_sprind.py`, `extract_enterprise_ireland.py` (small)
8. `extract_eib.py`, `extract_innovation_fund.py`, `extract_chips_ju.py`, `extract_edf.py`
9. `extract_eit.py`, `extract_ipcei.py`
10. `extract_cordis.py`, `extract_cordis_pillar_ii.py` (largest)
11. **`extract_satr.py`** — write directly against the new protocol (or upgrade in-place).
12. Sprint 16 extractors (`extract_eifo.py`, `extract_cdp.py`, `extract_kfw_capital.py`).
13. Sprint 17 national portals (`extract_sudop.py`, `extract_regas.py`, `extract_gov_si_aid.py`).
14. Sprint 18 extractors.

Each migration: snapshot-diff against current output before merge.

### Step B4 — Delete unused helpers

After all migrations:
- Remove duplicate HTTP / retry blocks across scripts.
- Remove ad-hoc CSV write helpers.
- Confirm `audit_dedup.py`, `classify.py`, `sanity_check.py` still work (they don't depend on extractor internals).

### Step B5 — Snapshot diff validation

```bash
sqlite3 db.sqlite ".dump" > pre_refactor_dump.sql
# (run all extractors via the new pipeline against a fresh DB)
sqlite3 db_refactored.sqlite ".dump" > post_refactor_dump.sql
diff pre_refactor_dump.sql post_refactor_dump.sql
```

Diff should be empty (or limited to timestamps / autoincrement IDs).

---

## Cross-workstream post-load tasks

### Post-1 — Update site for refactor

After Workstream B completes, no site changes are needed — extractors are loader-only, not consumer-facing.

### Post-2 — Update methodology

`docs/methodology.md`: brief section on the Extractor protocol. Don't over-document — the code is the source of truth.

### Post-3 — Memory updates

- `project_sprint_19_site.md` — site additions, screenshots if useful, narrative summary.
- `project_sprint_19_refactor.md` — extractor inventory + refactor outcome. Delete `docs/extractor_inventory.md` (transient).
- `MEMORY.md` index updated.

---

## File manifest

### Workstream A — Site

| File | Action |
|---|---|
| `analysis/build_q09_data.py` | **New** — emits q09.json |
| `site/public/data/q09.json` | **New** — site data |
| `site/app/09-state-aid/page.tsx` | **New** |
| `site/app/09-state-aid/charts.tsx` | **New** |
| `site/app/10-ndb-map/page.tsx` | **New** |
| `site/app/10-ndb-map/charts.tsx` | **New** |
| `site/app/access-map/page.tsx` | Update (4-layer Sankey) |
| `site/app/page.tsx` | Update (home taxonomy network + KPIs) |
| `site/app/methodology/page.tsx` | Update (SATR + NDB taxonomy sections) |
| `site/app/limitations/page.tsx` | Update (NACE classifier caveat, Bpifrance/CDP/EIFO underrepresentation) |
| `site/lib/palette.ts` | Already updated in Sprint 15 |
| `site/components/sankey-4-layer.tsx` | **New** component |
| `site/components/ndb-card.tsx` | **New** component |

### Workstream B — Refactor

| File | Action |
|---|---|
| `scripts/lib/extractor.py` | **New** — protocol + RawEvent |
| `scripts/lib/http.py` | **New** — shared session |
| `scripts/lib/playwright_session.py` | **New** — shared context manager |
| `scripts/lib/match.py` | **New** — common matcher |
| `scripts/lib/fx.py` | **New** — split from ndb_helpers |
| `scripts/lib/europe_scope.py` | **Move** from scripts/europe_scope.py |
| `scripts/extract_*.py` (~25 files) | **Refactor** — no behaviour change |
| `docs/extractor_inventory.md` | **Transient** — delete post-refactor |

---

## Validation gates

| Gate | Criterion |
|---|---|
| G1 Baseline | `sanity_check.py` clean post-Sprint 18 |
| G2 Q09 data | `q09.json` generated; spot-check sample rows |
| G3 /state-aid renders | Page loads without console errors; charts populate |
| G4 /ndb-map renders | All 43+ NDB cards render; portfolio companies visible |
| G5 /access-map 4-layer | Sankey shows EU + State Aid + NDB Direct + (Private placeholder) flows |
| G6 Static export | `site/out/` produced; spot-check generated HTML |
| G7 Extractor refactor zero-diff | Pre- vs post-refactor DB dump identical (modulo timestamps) |
| G8 Methodology + limitations | Updated with NACE caveat, Sprint 15-18 additions |
| G9 Memory | Sprint 19 memory files written, index updated |

---

## Expected corpus growth

Zero. Sprint 19 is consumer-facing surface + internal refactor; no new data sources.

---

## Execution order

**A → B.**

- **A first**: site delivers visible value; refactor risk is contained to later.
- **B second**: refactor is mechanical; do once data layer is stable.

Each workstream is independent — could be split across two sprints if scope is tight.

---

## Out of scope (explicit)

- **Dealroom enrichment** (Sprint 10 stub): separate sprint covering private follow-on. Sprint 19 only shows the public-capital side of the access map.
- **Backend API**: site is static export. No server-side API.
- **User interactivity beyond filters**: no per-company drilldown / detail page in this sprint.
- **Mobile responsive design beyond what existing site provides**: site already has mobile breakpoints; don't add new patterns.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Next.js custom variant breaks site build mid-edit | Read `node_modules/next/dist/docs/` BEFORE writing TSX (per `site/AGENTS.md`). Test locally before committing. |
| Sankey component for 4-layer is non-trivial | Use established Sankey library (e.g. nivo, react-sankey, or d3-sankey-circular). Fallback: split into two Sankeys (EU-to-companies, companies-to-NDBs). |
| Refactor introduces silent behaviour change | Snapshot-diff every migration step. If diff non-zero, halt + review row-by-row. |
| Refactor scope balloons | Each extractor migration is independent; can ship in batches. Don't block site work on refactor completion. |
| Site build slows past 2 minutes | Static export caps large data files; ensure q09.json is <5MB (pre-aggregate where possible). |
| 43+ NDB cards make /ndb-map slow to render | Virtualise scroll, lazy-load below-fold cards. |

---

## Definition of done

- `/state-aid` and `/ndb-map` pages live in static export.
- `/access-map` updated to 4-layer Sankey.
- Methodology + limitations pages reflect Sprint 15-18 additions.
- All ~25 extractors refactored behind common `Extractor` protocol; snapshot-diff zero.
- Refactor enables a new SATR-class scraper to be added in <1 day.
- Sprint 19 memory files written.
- `MEMORY.md` updated.
- **EuroInvTracker is now publication-ready as a complete map of European public capital deployment.** The story is end-to-end: scope → ingestion → classification → cross-channel visualisation. Future sprints add private capital (Sprint 10), more recent data refreshes, or analytical deep-dives.
