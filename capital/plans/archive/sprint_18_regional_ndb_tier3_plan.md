# Sprint 18 plan — Tier 3 regional NDBs + Tier 2 R&D agency direct portfolios

**Owner**: Claude (next session), executing against `/Users/asgermollergrimberg/EuroInvTracker/`.

**Status**: Not started. Follows Sprint 17 (national state-aid portals PL/ES/RO/SI). Target baseline at start: **~130,000-165,000 companies / ~235,000-292,000 events** (Sprint 17 projected, post-Sprint-16 reality of 116,925 / 213,906).

**Purpose**: Capture the remaining **regional NDB layer** that operates below federal/national level + add **direct-portfolio granularity** to Tier-2 R&D agencies already aggregated in SATR. Three categories:

1. **Belgian regional NDBs**: PMV (Flanders) + SOGEPA / SRIW / Wallonie Entreprendre (Wallonia) + SFPIM (federal). Sprint 14 attempted these — partial coverage only.
2. **German Land bank venture-arm portfolios**: Sprint 15 captured 15 German Land banks via SATR at the aid-measure level, but the **per-portfolio-company detail** (which startups each Land bank's venture arm holds equity in) is missing. NRW.BANK.Venture Fonds, IBB Ventures, BayBG (LfA Bayern), L-Bank venture, etc. each publish their own portfolio page.
3. **Tier-2 R&D agencies that need company-level granularity beyond SATR aggregation**: FFG (Austria — 2,277 SATR events), AWS, Vinnova, Business Finland direct project databases — these portals publish proposal abstracts + partner consortia detail that SATR omits.

After Sprint 18, every **>€100M/year publicly-disclosed European NDB grant programme** has company-level visibility. The **commercial-conform equity layer remains the only structural blind spot** (deferred to [`backlog/commercial_conform_ndb_equity.md`](backlog/commercial_conform_ndb_equity.md)).

---

## What changed since the original Sprint 18 plan (Sprint 16 outcomes)

Sprint 16 reshaped this sprint:

1. **Commercial-conform NDB equity is moved out** to the backlog. The Bpifrance / KfW Capital LP / CDP Equity / EIFO equity-ticket layer is structurally invisible under Art. 107 TFEU (no advantage → no state aid → no register obligation). The recovery paths (annual-report PDF parsing, EIF + InvestEU central reports, Dealroom/Pitchbook) are scoped in [`backlog/commercial_conform_ndb_equity.md`](backlog/commercial_conform_ndb_equity.md). **Sprint 18 covers only the grant + soft-loan + portfolio-equity-with-public-disclosure layer**.
2. **Coverage baseline shifted upward**: corpus is at 116,925 / 213,906 (Sprint 16 actual). Sprint 18 marginal yield is smaller in proportional terms — ~3-9% net growth.
3. **AT FFG already heavy in SATR** — Sprint 16 confirmed 2,277 FFG events. Direct-portal scrape adds granular project abstracts but not new beneficiaries; mark FFG direct as "supplementary, validation only" in methodology.

---

## TL;DR for a fresh Claude session

Three workstreams:

- **A — Belgian regional NDBs (finish Sprint 14)**: PMV (Flanders) annual deployment ~€150M / 200+ portfolio companies. SRIW / SOGEPA / Wallonie Entreprendre combined ~€100M/year. SFPIM (federal) ~€50M/year. All publish portfolio pages; names fragmented across multiple sub-funds per region.
- **B — German Land bank venture-arm portfolios**: NRW.BANK.Venture Fonds (~€2B AUM, biggest by far), IBB Ventures (Berlin), BayBG (LfA Bayern sub-fund), L-Bank venture mandates, TGFS Sachsen (already in `extract_sprind.py` partially). Each publishes named portfolio.
- **C — Tier-2 R&D agency direct portfolios**: AWS company-level portfolio, FFG project finder, Vinnova award database, Business Finland funded-projects database. Adds **proposal abstracts + partner consortia** detail not in SATR.

Expected: **+2,000-6,000 events / +1,500-4,500 companies**. Marginal value: granularity (proposal abstracts, sector mix, sub-fund attribution) rather than absolute coverage expansion.

---

## Scope decisions (locked before scripting)

1. **Time window**: 2021-01-01 to today.
2. **Threshold**: NDB / agency must publish per-company portfolio data with named beneficiaries ≥€100k/yr. Sub-€100k seed remains out of corpus.
3. **Source IDs**:
   - Belgium: `pmv_<vehicle>`, `sogepa_<vehicle>`, `sriw_<vehicle>`, `wallonie_entreprendre_<vehicle>`, `sfpim`, `finance_brussels`.
   - Germany Länder: `nrw_bank_venture`, `ibb_berlin_venture`, `baybg_lfa`, `l_bank_venture`, `tgfs_sachsen`.
   - R&D agencies: `awssg_<programme>` (extends `extract_aws.py`-equivalent), `ffg_<programme>` (supplementary to SATR), `vinnova_<programme>`, `business_finland_tekes`.
4. **NDB taxonomy**: Already in `scripts/lib/ndb_taxonomy.py`. Add SOURCE_PREFIX_TO_NDB for new prefixes.
5. **Currency**: All EUR except SE = SEK (in FX series).
6. **Dedup against SATR**: don't dedup. Tag with different source IDs (`l_bank_venture` for direct, `satr_de_*` for SATR). Same company may legitimately appear in both — a portfolio holding vs. an aid award are different events.
7. **No DB writes until validation**.

---

## Pre-flight

1. Confirm baseline: `python3 scripts/sanity_check.py` clean post-Sprint 17.
2. Back up: `cp db.sqlite /tmp/eit_data_backup/db.sqlite.pre-sprint18.bak`.
3. Disclosure-quality check per institution (Step A0 from Sprint 14 template): for each target NDB / agency, confirm portfolio page exists and is parseable.
4. Snapshot `v_ndb_distributor_rollup` as the diff baseline.

---

## Workstream A — Belgian regional NDBs

### Step A0 — Discovery

| Institution | Region | Annual deployment | Portfolio disclosure |
|---|---|---|---|
| **PMV** (Participatie Maatschappij Vlaanderen) | Flanders | ~€150M/yr | Strong — `pmv.eu/portfolio` |
| **SRIW** + **SOGEPA** + **Wallonie Entreprendre** | Wallonia | ~€100M/yr combined | Partial — sometimes only top 10 disclosed; merged 2024 |
| **finance.brussels** + **SFPIM** | Brussels + Federal | ~€50M/yr | Sparse — annual reports only |
| **PMV-x ICT, PMV-x Industry, ARKimedes** (PMV sub-funds) | Flanders sectoral | Subset of PMV | Public quarterly updates |

### Step A1 — Per-institution extractors

- `scripts/extract_pmv.py` — Flanders, extend Sprint 14 attempt to sub-funds (ARKimedes, PMV-x, FIVA).
- `scripts/extract_wallonia_ndb.py` — combined SRIW + SOGEPA + Wallonie Entreprendre (merged 2024).
- `scripts/extract_brussels_ndb.py` — finance.brussels + SFPIM (placeholder-acceptable if disclosure too sparse).

Schema mapping:
| Field | Value |
|---|---|
| `source` | `pmv_arkimedes` / `wallonie_entreprendre_equity` / etc. |
| `role` | `portfolio_company` |
| `equity_amount_eur` | committed amount EUR (where disclosed) |
| `grant_amount_basis` | `pmv_equity_commitment` / etc. |
| `deployment_country` | `BE` |
| `ndb_distributor` | `pmv` / `sogepa` / `sriw` / `wallonie_entreprendre` / `sfpim` / `finance_brussels` |

### Step A2 — Load + validate

Expect:
- PMV: 200-400 events
- Wallonia combined: 80-200 events
- Brussels: 30-100 events
- Total Belgium: ~310-700 events

Spot-check: Aleph Alpha (PMV-funded via Flemish fund), Antwerp/Ghent biotech (Aelin, ImmunXperts), Materialise.

---

## Workstream B — German Land bank venture-arm portfolios

### Step B0 — Discovery

Sprint 15 surfaced 15 German Land-level NDBs via SATR (aid-measure level). Sprint 18 adds **venture-arm portfolio holdings**:

| Institution | Land | Venture arm | Disclosure |
|---|---|---|---|
| **NRW.BANK** | Nordrhein-Westfalen | NRW.BANK.Venture Fonds | Strong portfolio page |
| **IBB Berlin** | Berlin | IBB Ventures | Strong portfolio page |
| **L-Bank** | Baden-Württemberg | Various venture mandates | Annual report |
| **LfA Bayern** | Bayern | BayBG (sub-fund) | Partial |
| **SAB Sachsen** | Sachsen | TGFS Sachsen | TGFS public (partly in `extract_sprind.py`) |

The others (IFB Hamburg, ILB Brandenburg, IB SH) lack sufficient public data — document as placeholder coverage.

### Step B1 — Per-Land extractors

- `scripts/extract_nrw_bank.py` — NRW.BANK.Venture Fonds portfolio
- `scripts/extract_ibb_berlin_venture.py` — IBB Ventures portfolio
- `scripts/extract_baybg_lfa.py` — LfA Bayern venture sub-fund
- `scripts/extract_l_bank_venture.py` — L-Bank venture mandate portfolio

Schema mapping: same as Workstream A.

### Step B2 — Load + validate

Expect:
- NRW.BANK: 80-150 events
- IBB Berlin Ventures: 50-100 events
- L-Bank venture: 60-120 events
- BayBG (LfA): 40-80 events
- Total Germany: ~230-450 events

Spot-check: DeepL via NRW.BANK; FlixBus via L-Bank.

---

## Workstream C — Tier-2 R&D agency direct portfolios

### Step C0 — Discovery

The R&D agencies already heavily present in SATR (FFG 2,277 events, Business Finland 1,988 events, Vinnova 514) report at **aid-measure** granularity. Each individual award has more detail than what SATR exposes — direct scrape captures the per-project beneficiary detail including project title, proposal abstract, and partner consortium.

| Agency | Country | SATR events | Direct portfolio available? |
|---|---|---:|---|
| FFG | AT | 2,277 | Yes — `ffg.at/projekt-finder` |
| AWS | AT | 662 | Yes — `aws.at/foerderungen-leistungen` |
| Vinnova | SE | 514 | Yes — `vinnova.se/sok-finansiering/utlysningar` per-call beneficiary lists |
| Business Finland | FI | 1,988 | Yes — `businessfinland.fi/funded-projects` |
| FCT (Portugal) | PT | 0 in SATR (Portugal small) | Yes — `fct.pt/concursos` |
| Innovate UK | GB | 0 in SATR (post-Brexit) | Yes — `iuk.ktn-uk.org/projects` |

### Step C1 — Per-agency extractors

- `scripts/extract_ffg.py` — Austrian R&D agency project finder (mark as supplementary to SATR)
- `scripts/extract_aws_company.py` — AWS company-level portfolio
- `scripts/extract_vinnova.py` — Swedish innovation agency funded-projects database
- `scripts/extract_business_finland.py` — Finnish innovation agency (extends Sprint 13's Tier-1 scraper)
- `scripts/extract_fct.py` — Portuguese science foundation (NEW — Portugal absent from SATR for R&D)
- `scripts/extract_innovate_uk.py` — UK Innovate UK (NEW — post-Brexit residual)

### Step C2 — Cross-reference with SATR

Where possible, use SATR's `satr_tm_id` field to link direct-scrape rows to SATR rows for the same award. Adds redundancy + cross-validation.

### Step C3 — Load + validate

Expect:
- FFG direct: 500-1,500 additional events (granular project data; mostly redundant with SATR)
- AWS direct: 200-500
- Vinnova direct: 300-800
- Business Finland direct: 400-1,000
- FCT (Portugal): 1,500-5,000 (NEW)
- Innovate UK: 800-2,000 (NEW for post-Brexit period)
- Total: ~3,700-10,800 events

---

## Cross-workstream post-load tasks

### Post-1 — Refresh NDB-distributor rollup

After each workstream: `python3 scripts/backfill_ndb_distributor.py`.

### Post-2 — Coverage % update

Recompute the "company-direct identifiable EU strategic universe" coverage:
- After Sprint 16: ~96-98% of grant + soft-loan layer
- **After Sprint 18: ~98-99% of grant + soft-loan layer**

The remaining gap is:
- **(a) The commercial-conform NDB equity layer** — structurally invisible under Art. 107 TFEU; deferred to [`backlog/commercial_conform_ndb_equity.md`](backlog/commercial_conform_ndb_equity.md).
- **(b) Sub-threshold seed-stage tickets** (<€100k) that no public registry captures.
- **(c) Micro-NDBs in smaller economies** (Malta Dev Bank, Cyprus, Luxembourg-specific).

### Post-3 — Audit redundancy

Some Sprint 18 sources (FFG direct, AWS direct, Vinnova direct, Business Finland direct) will heavily overlap with existing SATR events for the same agency. Build a "Sprint 18 redundancy audit" report at `analysis/findings/sprint_18_redundancy.md` showing per-agency match rates. If redundancy ≥95%, deprecate the direct extractor as "SATR view is authoritative; direct extractor used only for proposal-abstract enrichment".

### Post-4 — Site updates

Defer site changes to Sprint 19. Sprint 19's `/ndb-map` page will now include regional / Land-bank cards in addition to federal NDBs.

### Post-5 — Methodology update

Update `docs/methodology.md`:
- Coverage section bumped to ~98-99% (grant + soft-loan layer).
- Explicit cross-reference to the commercial-conform NDB equity blind spot section ("complete recovery requires Path A / B / C of `backlog/commercial_conform_ndb_equity.md`").
- Per-Land-bank portfolio caveats (which Länder published; which didn't).

---

## File manifest

| File | Action |
|---|---|
| `scripts/extract_pmv.py` | **New** or **Update** (extends Sprint 14 attempt) |
| `scripts/extract_wallonia_ndb.py` | **New** |
| `scripts/extract_brussels_ndb.py` | **New** |
| `scripts/extract_nrw_bank.py` | **New** |
| `scripts/extract_ibb_berlin_venture.py` | **New** |
| `scripts/extract_baybg_lfa.py` | **New** |
| `scripts/extract_l_bank_venture.py` | **New** |
| `scripts/extract_ffg.py` | **New** (supplementary to SATR) |
| `scripts/extract_aws_company.py` | **New** |
| `scripts/extract_vinnova.py` | **New** |
| `scripts/extract_business_finland.py` | **New** (extends Sprint 13's Tier-1) |
| `scripts/extract_fct.py` | **New** (Portuguese — net new country) |
| `scripts/extract_innovate_uk.py` | **New** (UK post-Brexit residual) |
| `scripts/lib/ndb_taxonomy.py` | Add SOURCE_PREFIX_TO_NDB entries for all new sources |
| `analysis/findings/sprint_18_redundancy.md` | **New** — per-agency SATR-vs-direct redundancy report |
| `docs/methodology.md` | Coverage section bump + cross-reference to backlog |

---

## Validation gates

| Gate | Criterion |
|---|---|
| G1 Baseline | `sanity_check.py` clean post-Sprint 17 |
| G2 Belgium load | PMV + Wallonia + Brussels combined ~310-700 events |
| G3 Germany Land bank load | ~230-450 events across 4-5 Land banks |
| G4 R&D agency direct load | ~3,700-10,800 events, mostly net-new for FCT + Innovate UK |
| G5 ndb_distributor coverage | All new sources tagged with canonical NDB id |
| G6 Redundancy audit | Per-agency SATR-vs-direct match rate documented |
| G7 Coverage % | Methodology updated to ~98-99% (grant + soft-loan layer) |
| G8 Sanity | Zero scope violations; views refresh OK |
| G9 Backlog cross-reference | Methodology explicitly points to `commercial_conform_ndb_equity.md` for the equity gap |

---

## Expected corpus growth

| Workstream | New events | New companies (post-dedup) |
|---|---:|---:|
| Belgium regional NDBs | 310-700 | 200-500 |
| German Land bank venture arms | 230-450 | 180-380 |
| R&D agency deep dives | 3,700-10,800 | 2,500-7,000 |
| **Grand total** | **4,240-11,950** | **2,880-7,880** |

**Sprint 18 corpus target: ~133,000-177,000 companies / ~239,000-304,000 events.**

---

## Execution order

**A → C → B.**

- **A first** (Belgium): smallest scope, validates regional-NDB pattern + builds on Sprint 14.
- **C second** (R&D agencies): largest pure-volume workstream; mostly net-new for FCT + Innovate UK.
- **B last** (German Land banks): most fragmented disclosure; tackle last when sprint has muscle memory.

Each: `classify.py` + `sanity_check.py` + `backfill_ndb_distributor.py` between.

---

## Out of scope (explicit)

- **Commercial-conform NDB equity layer** (Bpifrance equity, KfW Capital LP, CDP Equity, EIFO equity tickets, AWS Gründerfonds, Saminvest): **MOVED TO BACKLOG** — see [`backlog/commercial_conform_ndb_equity.md`](backlog/commercial_conform_ndb_equity.md). Structurally invisible under Art. 107 TFEU; requires annual-report PDF parsing, EIF/InvestEU reports, or commercial-data licensing.
- **Bulgarian, Romanian, Hungarian, Slovak regional NDBs**: sparse disclosure; deferred.
- **Greek Hellenic Development Bank deep dive**: already in SATR as `hdb`; portfolio detail not publicly disclosed.
- **Norwegian, Swiss, Icelandic NDBs**: non-EU; out of scope.
- **Sub-€100k seed tickets**: same threshold as Sprints 13/14/15/16/17.
- **Federal NDBs already covered**: Sprint 16 outcomes (Bpifrance grants, ADEME, EIFO grants, Innovationsfonden, KfW grants) are complete; Sprint 18 only extends with regional siblings + R&D agency project-level granularity.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Belgian regional NDBs publish only top-10 portfolio | Document the coverage gap; supplement with PMV's quarterly updates + press releases. |
| German Land bank annual reports are PDF-only | Build per-Land PDF parsers (reuse pattern from Sprint 17 gov.si). |
| FFG / AWS / Vinnova direct scrapes redundant with SATR ≥95% | Deprecate to "supplementary, validation only"; SATR remains authoritative. Document in `analysis/findings/sprint_18_redundancy.md`. |
| Innovate UK post-Brexit data quality | UK left Horizon Europe + EDF; Innovate UK is now the sole national channel. Cross-check with UK Companies House to validate names. |
| FCT Portugal mixes companies + academic projects | Filter for `entity_type='company'` aggressively. |
| Cross-language matching for Portuguese / Swedish / Finnish names | Sprint 15 matcher uses ASCII transliteration; spot-check 50 rows manually per language. |
| Sprint 18 marginal value diminishing | Document "minimum viable Sprint 18" stopping point: complete A + C, defer B (German Land banks) if budget is tight. |

---

## Definition of done

- All three workstreams loaded (or documented deferred per "minimum viable" stopping point).
- NDB taxonomy includes all Sprint 18 source prefixes.
- Per-agency redundancy report shows where direct scraping adds vs. duplicates SATR.
- Coverage % updated in methodology to ~98-99% (grant + soft-loan layer).
- Methodology cross-references the commercial-conform NDB equity backlog explicitly.
- Sprint 18 memory file written.
- `MEMORY.md` index updated.
- **The European public-capital grant + soft-loan NDB layer is now substantively complete.** Sprint 19's site work showcases this. The remaining commercial-conform equity layer is the one acknowledged structural gap, deferred to [`backlog/commercial_conform_ndb_equity.md`](backlog/commercial_conform_ndb_equity.md).
