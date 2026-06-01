# Sprint 13 plan — Tier 1 National Development Banks + strategic R&D agencies

**Owner**: Claude (next session), executing against `/Users/asgermollergrimberg/EuroInvTracker/`.

**Status**: Not started. Follows Sprint 12 (Horizon Europe Pillar II). Target baseline at start: **~13,000 companies / ~45,000 events** (Sprint 12 projected outcome — confirm at pre-flight).

**Purpose**: Add the **national strategic deployment layer** — eight institutions across the eight largest EU economies + Nordics that act as the operational arm of EU industrial policy. These NDBs and R&D agencies are how the national share of IPCEI, the Horizon Europe co-funding, and standalone domestic strategic-tech support actually reaches companies. Without them the "access map" stops at the EU level and misses how strategic capital is genuinely deployed at member-state scale.

---

## TL;DR for a fresh Claude session

Eight ingestions, eight institutions, eight CSV exports. Each is a self-contained workstream against a public portfolio page or annual disclosure. Pattern is closer to EIT (multi-source within one extractor, hardcoded portfolio lists or scraped tables) than CORDIS (clean bulk CSV). Expect data heterogeneity — different languages, different ticket-size disclosures, different equity-vs-grant mixes. The schema accommodates all of it (`equity_amount_eur`, `debt_amount_eur`, `grant_amount_eur` already exist on `public_funding_events`).

**Scoping discipline (locked in user discussion 2026-05-25)**: We include only **direct equity, quasi-equity, and strategic R&D grants**. We exclude plain-vanilla SME loans, working-capital guarantees, intermediated commercial bank lending, and export credit unrelated to strategic tech. This keeps the dataset focused on the "scale strategically" question and avoids drowning it in tens of thousands of low-signal events.

**Tier 1 institutions (this sprint)**:
- **A — Bpifrance** (FR) — direct equity, deeptech grants
- **B — KfW Capital** (DE) — VC fund-of-funds with disclosed underlying companies; **SPRIND** federal innovation agency (separate sub-source)
- **C — CDP Venture Capital** (IT) — Italian state VC, portfolio disclosed
- **D — Invest-NL** (NL) — sovereign deeptech / energy fund
- **E — CDTI** (ES) — Spanish R&D grants for strategic tech
- **F — Enterprise Ireland** (IE) — state VC, ~€0.3-0.5B/yr equity
- **G — Business Finland + Tesi** (FI) — Finnish national innovation funding + state VC
- **H — Vinnova + Saminvest + Almi Invest** (SE) — Swedish R&D agency + state FoF + early-stage equity

---

## Scope decisions (locked before scripting)

1. **Time window**: 2021-01-01 to today. Match Horizon Europe period.
2. **Schema fit — equity field finally used**: `equity_amount_eur` has been NULL across all 5,733 events. NDB equity investments populate it. `grant_amount_eur` stays for R&D grant programs (CDTI, Business Finland, Vinnova). Mixed-instrument NDBs may populate both on the same row (rare but possible).
3. **New `grant_amount_basis` values**:
   - `bpifrance_equity`, `bpifrance_grant`
   - `kfw_capital_equity`, `sprind_grant`
   - `cdp_vc_equity`
   - `invest_nl_equity`
   - `cdti_grant`
   - `enterprise_ireland_equity`
   - `business_finland_grant`, `tesi_equity`
   - `vinnova_grant`, `saminvest_equity`, `almi_invest_equity`
4. **Source IDs**: `<institution>_<programme>_<year>` where granular, or `<institution>_portfolio` where aggregated.
5. **IPCEI double-count avoidance**: every NDB row that funds an IPCEI participant gets `ipcei_linked=1` (new column — see Step 0.5). Aggregate views net these out when computing "total European capital deployed" to avoid counting national IPCEI share twice (once under `ipcei_<wave>` and once under e.g. `bpifrance_equity`).
6. **EIF passthrough handling**: KfW Capital, Saminvest, parts of Bpifrance are funded as LPs by the European Investment Fund. We track at the **deployment layer** (NDB → company) and treat EIF LP commitments as upstream metadata. Document this so methodology doesn't claim the same euro is two separate investments.
7. **Geography of investment**: the NDB's country, not the company's HQ country, defines the "national strategic capital channel." A French Bpifrance investment into a Belgian company is captured under `bpifrance_*` with the company's actual HQ in `companies.country`. Both perspectives are useful in analysis.
8. **No DB writes until validation passes**. Each workstream: CSV mode first, sanity check, then `--load-db`.

---

## Pre-flight

1. Confirm DB baseline: `sanity_check.py` clean. Snapshot expected event/company counts post-Sprint 12.
2. Back up: `cp db.sqlite db_backups/db.sqlite.backup_pre_sprint13`.
3. **Schema migration (small)** — Step 0.5. See below.
4. Install Playwright (already done in Sprint 11) — confirm working. Several NDB portfolio pages are JS-rendered.

---

## Workstream 0 — Analytical hygiene: company-only champion view

**Why first**: Sprint 12 grew the cross-instrument champion count from 84 → 1,293 by loading 49k Pillar II events. Most of the new "champions" are research orgs (CEA, SINTEF, VTT, DLR, TNO, Tecnalia, CNR, AIT) leading multi-instrument consortia — mechanically correct but analytically blunt. The original Sprint 9 "84 champions" insight was about *companies* punching across instruments, and that signal is now buried.

Fix is small and surgical: add an `entity_type='company'` filter to the champion analytics so the original startup/scaleup signal is recoverable alongside the all-entities view. Do this **before** the NDB ingestion because:
- NDBs will further inflate the all-entities count with state-owned tech-transfer arms and research consortia.
- The /02-champions page would otherwise present a misleading headline once NDBs land.
- The fix is 1-2 hours of work and unblocks honest analytical claims in the meantime.

### Step 0.1 — Split `v_company_breadth` into all-entities + companies-only variants

In `analysis/views.sql`:

```sql
-- v_company_breadth stays as the all-entities view (existing semantics).
-- Add a companies-only sibling for analytics that want the startup/scaleup signal.
DROP VIEW IF EXISTS v_company_breadth_companies;
CREATE VIEW v_company_breadth_companies AS
SELECT * FROM v_company_breadth WHERE entity_type = 'company';
```

Note: `v_company_breadth` doesn't currently expose `entity_type`. Extend its SELECT list first (one-line change). No data migration needed.

### Step 0.2 — Add q02 query variants

For each of `q02_cross_instrument.sql`, `q02b_cooccurrence.sql`, `q02c_sector_compare.sql`, add a companion `_companies` variant that selects from `v_company_breadth_companies` (or joins with `companies.entity_type='company'`). Existing files unchanged so the "all entities" series stays intact and traceable.

New files:
- `analysis/queries/q02_cross_instrument_companies.sql`
- `analysis/queries/q02b_cooccurrence_companies.sql`
- `analysis/queries/q02c_sector_compare_companies.sql`

### Step 0.3 — Emit both sets from `analysis/run.py::run_q02`

Bundle `championsAll` and `championsCompanies` (each with its own `count`, `topChampions`, `coOccurrence`, `sectorCompare`) into a single q02.json so the page renders both. Don't break existing keys — keep the all-entities series at the top level for backwards compatibility, and add a nested `companiesOnly: {...}` block.

### Step 0.4 — Update `/02-champions` page

Add a toggle or side-by-side view: "All entities" (current default) vs "Companies only". The companies-only view restores the original Sprint 9 framing.

Headline expectations (rough):
- All entities: ~1,293 champions (research-org dominated at the top)
- Companies only: ~300-500 champions (closer to the original 84 once SME-only EIC + IF + IPCEI overlaps are netted; NDBs in Workstream A-H will grow this further)

### Step 0.5 — Schema migration

```sql
ALTER TABLE public_funding_events ADD COLUMN ipcei_linked INTEGER DEFAULT 0;
ALTER TABLE public_funding_events ADD COLUMN eif_lp_backed INTEGER DEFAULT 0;
ALTER TABLE public_funding_events ADD COLUMN deployment_country TEXT;  -- ISO 2-letter of the NDB / EU body
CREATE INDEX idx_pfe_ipcei_linked ON public_funding_events(ipcei_linked) WHERE ipcei_linked = 1;
```

Update `schema.sql` to match. Update `docs/methodology.md` schema section.

### Step 0.6 — Shared NDB helpers

New module `scripts/ndb_helpers.py`:
- `match_ipcei_linked(company_id)` — checks if company has any existing `ipcei_*` event; returns 1/0.
- `mark_eif_backed(institution_code)` — returns 1 if the institution is a known EIF LP-funded vehicle (KfW Capital, Saminvest, parts of CDP VC).
- `normalise_ticket(amount_eur, currency, year)` — handles SEK/CZK/PLN inputs with annual ECB reference rates. (Cached lookup table; no live API.)

---

## Workstream A — Bpifrance (FR)

**Why**: Largest single NDB by deployment volume; explicitly the operational arm of France's DeepTech 2030 plan and IPCEI national share for batteries / semis / hydrogen / health.

### Step A0 — Discovery

Three layers:
1. **Bpifrance direct equity portfolio** — published on `bpifrance.com/nos-pratiques-d-investissement/notre-portefeuille/` (or successor URL). Searchable, paginated, JS-heavy. Filter by sector → DeepTech, Health, Industry, Climate.
2. **Bpifrance grants and aid programmes** (Aides) — `bpifrance.fr/catalogue-offres`. Many programmes; we focus on Deeptech "Plan Deeptech" laureates (annually published list of winners).
3. **Bpifrance press releases** — gap-filler for round announcements not yet on the portfolio page.

### Step A1 — Build `scripts/extract_bpifrance.py`

Playwright scraper for the portfolio page; per-company HTML extraction for ticket sizes where disclosed; fallback to "ticket NULL, marker present" for undisclosed deals (which is most of them — Bpifrance discloses participation, not amount, for many investments).

Schema mapping:

| Field | Value |
|---|---|
| `source` | `bpifrance_equity` (default), `bpifrance_deeptech_<year>` for grant-side |
| `role` | `direct` |
| `grant_amount_eur` | populated for grant tracks; NULL otherwise |
| `equity_amount_eur` | populated where disclosed; NULL where Bpifrance reports "investor" without amount |
| `deployment_country` | `FR` |
| `ipcei_linked` | computed post-load |
| `eif_lp_backed` | 0 (Bpifrance is sovereign-funded, not EIF-backed at the holding level) |
| `grant_amount_basis` | `bpifrance_equity` or `bpifrance_grant` |
| `raw_source_url` | source page |

### Step A2 — Load and validate

```bash
python scripts/extract_bpifrance.py            # CSV mode
python scripts/extract_bpifrance.py --load-db
python scripts/classify.py
python scripts/sanity_check.py
```

Validation gates:
- Expect 400-800 portfolio companies; ~30-50% with disclosed ticket sizes.
- Cross-overlap with IPCEI (especially IPCEI Microelectronics MECT, Batteries): set `ipcei_linked=1` for ~50-100 events.
- Sector breakdown should skew `deeptech_hardware`, `cleantech`, `life_sciences`, `digital_ai`.

---

## Workstream B — KfW Capital + SPRIND (DE)

**Why**: Germany's strategic-tech capital is fragmented — KfW Capital handles VC LP commitments (which we resolve to underlying portfolio companies where disclosed), and SPRIND (Bundesagentur für Sprunginnovationen) runs federal frontier-innovation challenges with direct grants. Two sub-sources.

### Step B0 — Discovery

**KfW Capital**:
- `kfw-capital.de` publishes fund LP commitments (not underlying companies). To resolve to companies, intersect with **High-Tech Gründerfonds (HTGF)** and **Coparion** portfolio pages — both German government-backed VCs with public portfolios.
- KfW Capital itself rarely discloses individual company tickets; treat at the "LP commitment to fund X" layer and **link to underlying companies via secondary sources where present**.

**SPRIND**:
- `sprind.org/en/projects/` — direct grants under federal challenges (e.g. "Wasserstoff", "Synthetische Biologie", "Antiviral Drugs"). Clean per-project disclosure.

### Step B1 — Build `scripts/extract_kfw_sprind.py`

Two-source extractor. SPRIND is straightforward; KfW Capital is the "fund LP commitment with linked portfolio company" pattern that requires careful methodology framing.

For SPRIND:

| Field | Value |
|---|---|
| `source` | `sprind_<year>` |
| `grant_amount_eur` | from project page |
| `grant_amount_basis` | `sprind_grant` |
| `deployment_country` | `DE` |
| `eif_lp_backed` | 0 |

For KfW Capital:

| Field | Value |
|---|---|
| `source` | `kfw_capital_<fund>_<year>` |
| `equity_amount_eur` | NULL (KfW commits at the fund layer, not direct) |
| `notes` | "LP commitment via fund X; underlying portfolio resolved via HTGF/Coparion disclosure" |
| `grant_amount_basis` | `kfw_capital_equity` |
| `deployment_country` | `DE` |
| `eif_lp_backed` | 1 (KfW Capital is partly EIF-backed under InvestEU) |

### Step B2 — Load and validate

```bash
python scripts/extract_kfw_sprind.py            # CSV mode
python scripts/extract_kfw_sprind.py --load-db
python scripts/classify.py
python scripts/sanity_check.py
```

Validation gates:
- SPRIND: ~40-80 active projects. ~€200-400M total committed since 2021.
- KfW Capital via HTGF/Coparion: ~300-500 underlying companies surfaced; ticket sizes mostly NULL.

---

## Workstream C — CDP Venture Capital (IT)

**Why**: Italy's state VC, runs the National Innovation Fund and several thematic vehicles (Boost Innovation Fund, Italia Venture, Tech4Planet). Italian IPCEI national share flows substantially through CDP at the company layer.

### Step C0 — Discovery

`cdpventurecapital.it/en/portfolio` publishes per-company portfolio. Some ticket disclosure; most amounts undisclosed publicly. Annual report (Italian) supplements.

### Step C1 — Build `scripts/extract_cdp_vc.py`

Playwright + portfolio page parsing. Schema same pattern as Bpifrance.

### Step C2 — Load and validate

Expect ~200-350 portfolio companies. ~25-40% with disclosed tickets.

---

## Workstream D — Invest-NL (NL)

**Why**: Sovereign Dutch deeptech / energy transition fund. Smaller (€1.7B fund total) but high signal — concentrated bets on strategic resilience (semiconductors via ASML ecosystem, hydrogen, quantum).

### Step D0 — Discovery

`invest-nl.nl/en/our-investments` — portfolio page, partially disclosed tickets in press releases.

### Step D1 — Build `scripts/extract_invest_nl.py`

Smaller portfolio (~50-80 investments). Likely manual hardcoded list with press-release amounts.

### Step D2 — Load and validate

Expect ~50-80 events. High `cleantech` and `deeptech_hardware` skew.

---

## Workstream E — CDTI (ES)

**Why**: Centro para el Desarrollo Tecnológico Industrial — Spain's central R&D grant agency. €1.5-2B/yr deployed. Critical for Spanish IPCEI national share (batteries, hydrogen) and standalone PERTE (Proyectos Estratégicos para la Recuperación y Transformación Económica) flagship programmes.

### Step E0 — Discovery

`cdti.es` publishes grant awards under several programmes:
- **Misiones Ciencia e Innovación** (strategic missions)
- **NEOTEC** (startup grants)
- **CDTI Innovación Global** (industrial R&D)
- **PERTE** sub-programmes (sector-specific national strategic projects)

Bulk award lists published as PDFs per programme per year on BOE (Boletín Oficial del Estado) — same SSL/curl workaround needed as for Innovation Fund (see [project_eib_workarounds.md]).

### Step E1 — Build `scripts/extract_cdti.py`

Pattern matches `extract_innovation_fund.py` — PDF extraction with `CDTI_PROGRAMME_TO_SOURCE` mapping. Export `CDTI_SOURCE_SECTOR`.

### Step E2 — Load and validate

Expect ~600-1,200 events across the four sub-programmes (CDTI is high-volume). Strong overlap with IPCEI Spain participants (set `ipcei_linked=1`).

---

## Workstream F — Enterprise Ireland (IE)

**Why**: Ireland's state VC, unusually active for country size. Strong in life sciences and software. ~€300-500M/yr equity deployment.

### Step F0 — Discovery

`enterprise-ireland.com` publishes annual investment lists ("HPSU — High Potential Startups") and quarterly press releases. Annual report has aggregate numbers; per-deal in press releases.

### Step F1 — Build `scripts/extract_enterprise_ireland.py`

Annual HPSU list + quarterly press scraping. Schema: equity investments with disclosed tickets.

### Step F2 — Load and validate

Expect ~150-300 events per year × 5 years = ~800-1,500 events. Smaller average ticket than Bpifrance.

---

## Workstream G — Business Finland + Tesi (FI)

**Why**: Finnish twin model — Business Finland for R&D grants (~€800M/yr), Tesi (Finnish Industry Investment) for state equity. Both publish well.

### Step G0 — Discovery

Business Finland: `businessfinland.fi/en/for-finnish-customers/services/funding/all-funding-services-list` — programme catalogue. Annual award lists per programme (Tempo, Young Innovative Company grants, etc.).

Tesi: `tesi.fi/en/portfolio/` — portfolio page, per-company.

### Step G1 — Build `scripts/extract_business_finland_tesi.py`

Two-source pattern (like KfW+SPRIND).

### Step G2 — Load and validate

Business Finland: ~400-700 events (multi-programme); Tesi: ~80-120 portfolio companies.

---

## Workstream H — Vinnova + Saminvest + Almi Invest (SE)

**Why**: Sweden's three-layer model — Vinnova (R&D grants, ~€300M/yr), Saminvest (state fund-of-funds), Almi Invest (early-stage equity, regional). Sweden is over-indexed in the EU on battery, AI, and gaming/digital — strategic-resilience signal.

### Step H0 — Discovery

Vinnova: `vinnova.se` award lists (Swedish; bilingual programme names). Annual programme awards.

Saminvest: `saminvest.se/en/our-portfolio/` — LP commitments, mostly undisclosed underlying companies.

Almi Invest: `almi.se/en/almi-invest` portfolio. Per-company portfolio published.

### Step H1 — Build `scripts/extract_vinnova_saminvest_almi.py`

Three-source pattern. Currency conversion (SEK → EUR) using ECB annual reference rates.

### Step H2 — Load and validate

Vinnova: ~500-800 events; Almi Invest: ~150-250 portfolio companies; Saminvest: ~30-50 fund commitments.

---

## Cross-workstream post-load tasks

### Post-1 — IPCEI linkage backfill

```sql
UPDATE public_funding_events
SET ipcei_linked = 1
WHERE id IN (
  SELECT pfe.id
  FROM public_funding_events pfe
  JOIN public_funding_events ipcei ON pfe.company_id = ipcei.company_id
  WHERE ipcei.source LIKE 'ipcei_%'
    AND pfe.source IN (<list of NDB sources>)
    AND pfe.id != ipcei.id
);
```

Expected: ~150-400 events flagged (across all 8 NDBs).

### Post-2 — Methodology update

- Add "National Development Banks and R&D Agencies" section.
- Document IPCEI double-count netting approach with worked example.
- Document EIF passthrough policy.
- Update the access-map narrative: "the EU access map has 3 layers — EU direct (Pillar I+II+III), national strategic deployment (NDBs + R&D agencies), and private follow-on (Sprint 10 backlog)."

### Post-3 — New analysis views

`analysis/views.sql`:
- `v_company_funding_layers` — companies receiving funding from `eu_direct` + `national_ndb` + `private` (post-Sprint 10).
- `v_ndb_ipcei_overlap` — flags double-counted euros for netting.
- `v_strategic_resilience_index` — companies receiving ≥2 strategic-flag instruments (IPCEI, EDF, Chips JU, Innovation Fund + NDB equity).

### Post-4 — Site refresh

Regenerate `site/public/data/*.json`. Add a new findings page on "national strategic deployment" — top recipients per NDB, cross-country comparison.

---

## File manifest

| File | Action |
|---|---|
| `scripts/extract_bpifrance.py` | **New** |
| `scripts/extract_kfw_sprind.py` | **New** |
| `scripts/extract_cdp_vc.py` | **New** |
| `scripts/extract_invest_nl.py` | **New** |
| `scripts/extract_cdti.py` | **New** |
| `scripts/extract_enterprise_ireland.py` | **New** |
| `scripts/extract_business_finland_tesi.py` | **New** |
| `scripts/extract_vinnova_saminvest_almi.py` | **New** |
| `scripts/ndb_helpers.py` | **New**: shared NDB utilities (IPCEI linkage, EIF flag, FX normalisation) |
| `scripts/classify.py` | Import 8+ new `*_SOURCE_SECTOR` dicts |
| `schema.sql` | Add `ipcei_linked`, `eif_lp_backed`, `deployment_country` columns + index |
| `analysis/views.sql` | New views above |
| `analysis/run.py` | New rollups |
| `docs/methodology.md` | NDB section + access-map framing |
| `docs/notes.md` | Day 15 entry |
| `site/app/national/page.tsx` | **New**: national strategic deployment findings page |

---

## Validation gates

| Gate | Criterion |
|---|---|
| G1 Baseline | `sanity_check.py` clean (post-Sprint 12 counts) |
| G2 Schema | New columns + indexes applied; existing data unaffected |
| G3 Equity field | First non-NULL `equity_amount_eur` rows now present; total equity €B reported in sanity_check |
| G4 IPCEI linkage | Post-load `ipcei_linked=1` count is 150-400; no false positives (manual spot-check 20) |
| G5 EIF flag | KfW Capital, Saminvest events flagged `eif_lp_backed=1`; documented |
| G6 FX consistency | All SEK/CZK amounts converted via the same ECB rate table; spot-check 5 |
| G7 Coverage % | Methodology update: company-direct identifiable universe coverage moves from ~60% to ~75-80% |
| G8 Site | New `/national` page renders; cross-country comparison chart populated |

---

## Expected corpus growth (rough pre-discovery estimates)

| Institution | New events | New companies (post-dedup) |
|---|---:|---:|
| Bpifrance | ~500-800 | ~300-500 |
| KfW Capital + SPRIND | ~350-550 | ~200-350 |
| CDP Venture Capital | ~200-350 | ~150-250 |
| Invest-NL | ~50-80 | ~40-70 |
| CDTI | ~600-1,200 | ~400-800 |
| Enterprise Ireland | ~800-1,500 | ~500-1,000 |
| Business Finland + Tesi | ~500-800 | ~350-600 |
| Vinnova + Saminvest + Almi Invest | ~700-1,100 | ~500-800 |
| **Total** | **~3,700-6,380** | **~2,440-4,370** |

Heavy overlap expected with existing EIC and Pillar II companies — many of these NDB recipients also won EU grants. Net new company growth ~50-65% of organisation count.

**Sprint 13 corpus target: ~15,500-18,500 companies / ~50,000-53,000 events.**

---

## Execution order

**E → A → C → F → G → H → D → B.** Reasoning:
- **CDTI (E) first** — highest volume, well-known pattern (PDF extraction matches Innovation Fund), exercises the schema migration end-to-end.
- **Bpifrance (A) second** — biggest strategic signal, Playwright load most likely to surface scraper issues.
- **CDP (C), Enterprise Ireland (F), Business Finland+Tesi (G), Vinnova+Saminvest+Almi (H)** in the middle — established patterns.
- **Invest-NL (D)** — small, easy.
- **KfW Capital+SPRIND (B) last** — most methodologically complex (LP layer vs direct), most likely to need a documented caveat rather than clean data.

Each workstream loads independently; `classify.py` + `sanity_check.py` between each.

---

## Out of scope (explicit)

- **EIB and EIF at the institutional layer**: EIB venture debt is already in DB (Sprint 3). EIF LP positions are tracked at the NDB receiving end, not separately.
- **Plain SME loans / working-capital lines** from any NDB.
- **Export credit agencies** (SACE, EKN, OeKB export arm) unless the credit funds strategic-tech investment specifically.
- **Regional sub-state NDBs** (PMV Flanders, SRIW Wallonia, German Land-banks, Italian regional fondazioni) — see Sprint 14 plan.
- **Czech, Hungarian, Slovak, Baltic, SE-Europe NDBs** — Tier 2; see Sprint 14.
- **Norwegian Innovation Norway, Swiss Innosuisse** — non-EU; out of scope by geography.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Portfolio pages JS-heavy and Playwright extraction fragile | Use stable URL patterns and CSS selectors; if a page restructures, document gracefully rather than fabricate. |
| Ticket sizes mostly undisclosed for equity NDBs | Accept NULL amounts where source doesn't publish; record participation as event with `equity_amount_eur=NULL`. The participation signal alone is analytically valuable. Document the coverage gap. |
| IPCEI double-counting if `ipcei_linked` logic is wrong | Run Post-1 backfill before any aggregate view publishes; spot-check 20 flagged events manually. |
| FX rate cherry-picking | Use ECB annual reference rates (one rate per year), not deal-date rates. Document. |
| Languages — Italian / Swedish / Spanish portfolio pages | Use Playwright with auto-translate disabled (raw HTML); rely on language-agnostic structural selectors. Translation only for sector classification at the end. |
| Methodology drift — "is CDTI an NDB or an R&D agency?" | Methodology entry defines: "national strategic deployment layer = institutions that deploy direct equity, quasi-equity, or strategic R&D grants to companies." Both NDBs and dedicated R&D agencies (CDTI, Vinnova, Business Finland, FFG-equivalents) qualify. SME-loan-only NDBs do not. |
| EIF LP passthrough confusion in headlines | The "total European capital deployed" number nets out `ipcei_linked=1` events and uses NDB-side amounts only for EIF-backed cases. Document with a worked example. |
| Press-release fishing for ticket sizes risks publication bias (loud rounds get captured, quiet ones don't) | Treat press-derived ticket sizes as `match_confidence='medium'`; default to portfolio-page disclosure where available. |

---

## Definition of done

- All 8 Tier 1 NDBs/R&D agencies loaded.
- `equity_amount_eur` populated for the first time across the DB.
- `ipcei_linked` flag correctly applied.
- New `/national` site page renders.
- `docs/methodology.md` documents the 3-layer access map.
- Memory file `project_tier1_ndb_workarounds.md` written, with per-institution caveats.
- MEMORY.md index updated.
- Coverage estimate in methodology updated to ~75-80% of company-direct identifiable EU strategic universe.
