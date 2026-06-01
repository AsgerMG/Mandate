# Sprint 16 plan — NDB direct scrapers for the largest blind spots

**Owner**: Claude (next session), executing against `/Users/asgermollergrimberg/EuroInvTracker/`.

**Status**: Not started. Follows Sprint 15 (SATR integration + NDB-distributor layer). Target baseline at start: **95,245 companies / 178,915 events / €165B aid** (Sprint 15 outputs — confirm at pre-flight).

**Purpose**: Build dedicated company-level extractors for the **four largest NDB blind spots** identified by the Sprint 15 NDB-distributor analysis. These institutions deploy massive amounts of public capital (combined €25-40B/year) but are essentially invisible to SATR because their activity is structured as commercial-conform investments (no advantage → not state aid under Art. 107 TFEU) or sits below SATR's €100k reporting threshold.

After Sprint 16 the institutional NDB layer should cover all major Western European public-capital channels at company level.

---

## TL;DR for a fresh Claude session

Four workstreams, four different institutions:

- **A — EIFO (Denmark) + legacy Vækstfonden + Innovationsfonden**: Merged in 2024; portfolio page exists at `eifo.dk`. Pre-2024 Vækstfonden data is archived. Innovationsfonden (Danish R&D agency) is a separate body with its own award database. Combined annual deployment ~€2.5B; currently **0 events** in our corpus.
- **B — Bpifrance company-level upgrade**: Current `extract_bpifrance.py` is fund-level placeholder (10 fund rows). Real Bpifrance deploys €5-10B/yr in equity + debt + grants. Bpifrance publishes portfolio pages per investment vehicle (Tibi, Innov'up, Crowdsourcing, French Tech). Combined company-level corpus should be ~3-5k companies.
- **C — CDP parent group + CDP VC company-level**: Current `extract_cdp_vc.py` is 82 events from CDP Venture Capital sgr only. CDP parent group deploys €15-20B/yr across CDP Equity, CDP Industria, FSI, CDP RETI, and 8 sub-funds. The full Cassa Depositi e Prestiti portfolio is published in the annual Bilancio + the CDP Equity / Industria portfolio pages.
- **D — KfW Capital company-level**: KfW Capital (the equity-investment arm of KfW) commits ~€500M-1B/yr to German VC funds (LP role) plus direct co-investments. KfW Capital publishes a portfolio page. Currently only KfW federal disbursements (645 SATR events / €885M) are visible — KfW Capital direct portfolio is invisible.

After Sprint 16, expect **+8,000-15,000 new events / +5,000-10,000 new companies** with the institutional NDB view dramatically more complete on the Western European side.

---

## Scope decisions (locked before scripting)

1. **Time window**: 2021-01-01 to today. Same as previous sprints.
2. **Schema**: no migration needed. The Sprint 15 schema (5 SATR columns + 3 NDB-implementer columns) already supports the granularity. Direct-scraper rows will populate `source` + `ndb_distributor` and leave SATR columns NULL.
3. **Source IDs**:
   - EIFO: `eifo_equity`, `eifo_growth_loan`, `eifo_export_credit`, `eifo_green_finance`, `vaekstfonden_legacy_*` (pre-2024), `innovationsfonden_*`
   - Bpifrance: `bpifrance_equity_<vehicle>`, `bpifrance_debt`, `bpifrance_innov_grant`. Vehicles: tibi, innovup, fr_tech, deeptech_fund, accelerateur, frenchtech_tremplin.
   - CDP: `cdp_equity_<sub_vehicle>`, `cdp_industria`, `cdp_vc_<fund>` (extending the existing `cdp_vc_*` namespace). Sub-vehicles: cdp_equity_main, fsi, cdp_industria, fii (Italian Investment Fund).
   - KfW Capital: `kfw_capital_lp` (LP commitments to VCs), `kfw_capital_direct` (direct co-investments).
4. **`grant_amount_basis` new values** (extend SQL comment in schema.sql):
   - `eifo_equity_commitment`, `eifo_debt_commitment`
   - `bpifrance_equity_commitment`, `bpifrance_debt_commitment`, `bpifrance_grant`
   - `cdp_equity_commitment`, `cdp_debt_commitment`
   - `kfw_capital_lp_commitment`, `kfw_capital_direct_equity`
5. **`ndb_distributor` mapping**: All Sprint 16 sources tag through to canonical NDB ids already defined in `scripts/lib/ndb_taxonomy.py`: `eifo`, `vaekstfonden`, `innovationsfonden`, `bpifrance`, `cdp`, `cdp_vc`, `kfw_capital`. Add `SOURCE_PREFIX_TO_NDB` entries for the new source prefixes.
6. **Currency**: Most rows in EUR. Bpifrance and KfW Capital use EUR; CDP uses EUR. EIFO uses DKK (already in FX series).
7. **Match against existing companies**: All four scrapers should match against existing companies first (by normalised name + country) and only insert new rows where no match exists. Sprint 15's matcher logic in `scripts/load_satr.py::apply_staging` is a good reference.
8. **`coordinator_only = 0` everywhere** — all four institutions invest at the company level, not consortium level.
9. **No DB writes until validation**. CSV mode + dry-run apply first.

---

## Pre-flight

1. Confirm baseline: `sanity_check.py` clean post-Sprint 15.
2. Back up: `cp db.sqlite db_backups/db.sqlite.backup_pre_sprint16`.
3. Verify Sprint 15's `ndb_taxonomy.py` is in place — Sprint 16's source prefixes need to be added to `SOURCE_PREFIX_TO_NDB`.
4. Snapshot current NDB-distributor rollup: `sqlite3 db.sqlite "SELECT * FROM v_ndb_distributor_rollup ORDER BY events DESC" > pre_sprint16_ndb_rollup.tsv`. Use as diff baseline.
5. Identify Tier-1 candidate companies for spot-validation: pick 20 known portfolio companies per institution (from press, LinkedIn, news), check whether they end up in the scraped output.

---

## Workstream A — EIFO + Vækstfonden legacy + Innovationsfonden (Denmark)

### Step A0 — Discovery

- **EIFO** portfolio page: `eifo.dk/investeringer` (or successor URL). Lists current portfolio companies with vehicle (equity / growth loan / export credit / green finance) + country + sector.
- **Vækstfonden** (pre-2024) historical: archived on eifo.dk under "historik" or similar. Press releases on `borsen.dk`, `finansoptaeller.dk` may need supplementation. Annual reports 2021/2022/2023 (PDFs).
- **Innovationsfonden** awards: published at `innovationsfonden.dk/uddelinger` per call/year. Sub-programmes: Grand Solutions, InnoBooster, Industrial PhD, Talents.

Data quality check: do these pages publish per-investment amounts? If yes — full ingestion. If no — programme-level placeholder rows (same pattern as current `extract_bpifrance.py`).

### Step A1 — Build `scripts/extract_eifo.py`

Pattern: portfolio-page HTML scrape (Playwright if JS-rendered, otherwise requests + BeautifulSoup). One row per portfolio company per vehicle.

Schema mapping:

| Field | Value |
|---|---|
| `source` | `eifo_equity` / `eifo_growth_loan` / `eifo_export_credit` / `eifo_green_finance` |
| `role` | `portfolio_company` |
| `project_title` | NULL (or vehicle name if useful) |
| `equity_amount_eur` | committed amount in EUR (FX from DKK via `ndb_helpers.normalise_ticket`) |
| `grant_amount_basis` | `eifo_equity_commitment` etc |
| `deployment_country` | `DK` |
| `ndb_distributor` | `eifo` |
| `raw_source_url` | portfolio page URL |
| `sector_tags_raw` | sector classification from EIFO's own taxonomy |

### Step A2 — Build `scripts/extract_vaekstfonden_legacy.py` and `scripts/extract_innovationsfonden.py`

Vækstfonden: archive PDFs or wayback machine for pre-2024 portfolio. Annual report PDFs have summary tables.

Innovationsfonden: scrape `uddelinger` pages per year (2021-2025) — each award page has company name + amount + programme.

### Step A3 — Load and validate

```bash
python scripts/extract_eifo.py                    # CSV mode
python scripts/extract_eifo.py --load-db
python scripts/extract_vaekstfonden_legacy.py --load-db
python scripts/extract_innovationsfonden.py --load-db
python scripts/classify.py
python scripts/sanity_check.py
python scripts/backfill_ndb_distributor.py
```

Validation gates:
- EIFO: expect ~400-700 company-level rows. Spot-check against `eifo.dk` portfolio page.
- Vækstfonden legacy: expect ~200-400 historical rows (2021-2023).
- Innovationsfonden: expect ~800-1,500 R&D award rows (annual call data).
- `ndb_distributor` should be `eifo` / `vaekstfonden` / `innovationsfonden` after backfill.

---

## Workstream B — Bpifrance company-level upgrade

### Step B0 — Discovery

Current `extract_bpifrance.py` writes 10 fund-level placeholder rows. The real Bpifrance has at least 8 investment vehicles + grant programmes that publish company-level data:

1. **Bpifrance Investissement** — direct equity (~€2-3B/yr to ~150-200 companies)
2. **Le Tibi initiative** — late-stage tech funds aggregator (~€6B raised)
3. **French Tech Tremplin** — pre-seed grants
4. **Aide pour le Développement de l'Innovation** (AIR / ADI) — innovation grants
5. **InnovUp** — innovation loans to SMEs
6. **Concours i-Nov** — public innovation grant competition
7. **PIA (Programme d'Investissements d'Avenir) coordination** — government-of-France innovation programme; Bpifrance is the executing agency
8. **DeepTech 2030 plan** initiatives

Portfolio data sources:
- `bpifrance.fr/nos-financements/portfolio-equity` (or current URL) — equity holdings list
- Press releases on `presse.bpifrance.fr` — typically announce major rounds with amount
- Annual report PDFs — have aggregate stats + named "champion" portfolio companies

### Step B1 — Build `scripts/extract_bpifrance_v2.py` (replacing placeholder)

This is an **upgrade**, not a fresh-load. Pattern:
1. Keep the 10 fund-level rows as a header layer (`source = bpifrance_fund_<vehicle>`)
2. Add company-level rows from each vehicle's portfolio page
3. Delete the placeholder rows once company-level coverage is validated (manual review step before deletion)

Schema mapping (per company event):

| Field | Value |
|---|---|
| `source` | `bpifrance_equity_<vehicle>` / `bpifrance_debt` / `bpifrance_innov_grant` |
| `role` | `portfolio_company` |
| `equity_amount_eur` | committed amount EUR (Bpifrance reports €) |
| `grant_amount_basis` | `bpifrance_equity_commitment` / `bpifrance_debt_commitment` / `bpifrance_grant` |
| `deployment_country` | `FR` |
| `ndb_distributor` | `bpifrance` |

### Step B2 — Load and validate

Expect ~3,000-5,000 company-level rows (Bpifrance portfolio is large).

Validation gates:
- Bpifrance equity total across rows should be in €15-25B range over 2021-2026.
- Spot-check 20 known portfolio companies (Mistral AI, Doctolib, Mirakl, BlaBlaCar, Aledia, Pasqal, Doctolib, etc.) — all should appear.
- After loading: re-run overlap audit; Bpifrance match-rate vs SATR should remain ~0% (different ingestion paths).

---

## Workstream C — CDP parent group + CDP VC upgrade

### Step C0 — Discovery

Cassa Depositi e Prestiti (CDP) is Italy's main NDB. Operating units:

1. **CDP Equity** (€10B+ AUM) — strategic industrial investments (Open Fiber, Nexi, Saipem, Webuild, Fincantieri, Eni, Snam, etc.)
2. **CDP Industria** — direct industrial financing
3. **CDP Venture Capital sgr** — venture arm (currently 82 events in our corpus)
4. **Fondo Italiano d'Investimento (FII)** — private equity fund-of-funds (Bpifrance equivalent)
5. **FSI / Fondo Strategico Italiano** — strategic investments
6. **CDP Reti** — utilities holding (Snam, Terna, Italgas, FEI)
7. **Sace** (subsidiary) — export credit & guarantees (already in SATR partially; TCTF rows filtered)
8. **Simest** (subsidiary) — internationalisation support

Data sources:
- `cdp.it/sitointernet/page/it/portafoglio_partecipazioni` — equity portfolio
- `cdpventurecapital.it/portfolio` — VC arm portfolio (Sprint 13 source — extend)
- Annual Bilancio (PDF) — comprehensive financial statements with portfolio appendix
- CDP press centre — announcements of major investments

### Step C1 — Build `scripts/extract_cdp_v2.py`

Multi-vehicle scraper:
- Reuse existing `extract_cdp_vc.py` for the VC arm (verified working — 82 events)
- Add CDP Equity portfolio scrape
- Add CDP Industria + FSI scrapes
- Add FII fund-of-funds layer (placeholder rows acceptable here — FII invests in funds, not directly in companies)

Schema mapping:

| Field | Value |
|---|---|
| `source` | `cdp_equity_<vehicle>` / `cdp_industria` / `cdp_vc_<fund>` / `fsi` |
| `role` | `strategic_holding` / `portfolio_company` |
| `equity_amount_eur` | committed amount EUR |
| `grant_amount_basis` | `cdp_equity_commitment` / `cdp_debt_commitment` |
| `deployment_country` | `IT` |
| `ndb_distributor` | `cdp` / `cdp_vc` |

### Step C2 — Load and validate

Expect ~500-1,500 company-level rows. Italian state-strategic-holdings (Eni, Snam, Saipem, Webuild, Fincantieri) should appear with large position sizes.

Validation gates:
- Total CDP equity exposure should be in €15-25B range.
- Spot-check the 8 main strategic holdings (Open Fiber, Saipem, Webuild, Fincantieri, etc.).
- CDP VC unchanged at ~82 events (or slightly higher after refresh).

---

## Workstream D — KfW Capital company-level

### Step D0 — Discovery

KfW Capital is the equity investment arm of KfW Bankengruppe. Three layers of activity:

1. **LP commitments** — KfW Capital commits to German + EU VC funds (HTGF, Cherry Ventures, Earlybird, La Famiglia, etc.). Currently invisible.
2. **Co-investments** — direct minority equity in selected portfolio companies. Currently invisible.
3. **ERP Innovation Fund** — KfW Capital programme funded by the German Economic Recovery Programme (ERP). Sub-vehicles: Wachstumsfonds Deutschland, Greentech Fonds Deutschland.

Data sources:
- `kfw-capital.de/en` — institutional portfolio page (fund LP commitments)
- Annual report PDFs
- ERP Innovationsfond press releases

### Step D1 — Build `scripts/extract_kfw_capital.py`

Two-tier scraper:
- LP layer: one row per VC fund KfW Capital invests in, `source = kfw_capital_lp`
- Direct co-investment layer: one row per portfolio company, `source = kfw_capital_direct`

The LP layer is fund-level (placeholder pattern from Sprint 13 bpifrance). The direct layer is company-level (real beneficiary data).

Schema mapping (LP):

| Field | Value |
|---|---|
| `source` | `kfw_capital_lp` |
| `role` | `lp_in_fund` |
| `project_title` | fund name (e.g. "Cherry Ventures IV") |
| `equity_amount_eur` | LP commitment EUR |
| `grant_amount_basis` | `kfw_capital_lp_commitment` |
| `eif_lp_backed` | 0 (KfW Capital is the LP, not EIF) |
| `deployment_country` | `DE` |
| `ndb_distributor` | `kfw_capital` |

Schema mapping (direct):
- Same as Sprint 13 NDB scrapers but with `source = kfw_capital_direct`.

### Step D2 — Load and validate

Expect ~30-80 LP rows + ~50-150 direct co-investment rows.

Validation gates:
- LP fund list should include known German VCs (HTGF, Cherry, Earlybird, La Famiglia, etc.).
- Direct co-invest rows should not duplicate the LP-fund-derived rows (different mechanism).
- After loading: HTGF should NOT lose its existing events even though KfW Capital is its parent — HTGF rows stay tagged `ndb_distributor='htgf'` (Sprint 15 taxonomy: `htgf` wins over `kfw_capital` via pattern order).

---

## Cross-workstream post-load tasks

### Post-1 — Update NDB taxonomy lookups

After each workstream:
- Add the new source prefixes to `SOURCE_PREFIX_TO_NDB` in `scripts/lib/ndb_taxonomy.py`.
- Re-run `python scripts/backfill_ndb_distributor.py` to tag new rows with their `ndb_distributor`.
- Verify with `sqlite3 db.sqlite "SELECT ndb_distributor, COUNT(*) FROM public_funding_events WHERE source LIKE '<new_prefix>%' GROUP BY 1"`.

### Post-2 — Classifier sector mapping

Extend `classify.py` with source-family routing:
- `EIFO_SOURCE_SECTOR`: sector defaults per EIFO vehicle (green_finance → cleantech, growth_loan → fallback to NACE).
- `BPIFRANCE_SOURCE_SECTOR`: extend the existing dict for new vehicles.
- `CDP_SOURCE_SECTOR`: strategic-holding default to "deeptech_hardware" (CDP's industrial focus); CDP VC keeps Sprint 13 mapping.
- `KFW_CAPITAL_SOURCE_SECTOR`: LP rows default to "other" (fund-level); direct co-invest fall through to keyword classify.

### Post-3 — Re-run overlap audit

Cross-check the 4 new NDBs against any SATR overlap:
- EIFO: still 0% (confirmed Sprint 15 finding — EIFO operates on commercial terms).
- Bpifrance: now 3 SATR + ~3,000 direct events; verify <1% overlap.
- CDP: still 0% via SATR (CDP parent didn't appear); CDP VC ~30% expected.
- KfW Capital: 0% expected (commercial-conform investments).

### Post-4 — Site updates

- `/access-map` 4-layer Sankey: now meaningfully populated with French / Danish / Italian institutional flows.
- New `/ndb-map` page (planned for Sprint 19): per-NDB summary cards with portfolio companies.

### Post-5 — Memory and methodology

Update `docs/methodology.md` with the four new sub-extractors. Update `project_sprint_15_satr.md` memory file: change "known gaps" to "Sprint 16 outcomes".

---

## File manifest

| File | Action |
|---|---|
| `scripts/extract_eifo.py` | **New** (EIFO main scrape) |
| `scripts/extract_vaekstfonden_legacy.py` | **New** (legacy data 2021-2023) |
| `scripts/extract_innovationsfonden.py` | **New** (Danish R&D agency) |
| `scripts/extract_bpifrance_v2.py` | **New** (replaces fund-level placeholder) |
| `scripts/extract_bpifrance.py` | **Deprecate** after `v2` validation |
| `scripts/extract_cdp.py` | **New** (CDP Equity + Industria + FSI) |
| `scripts/extract_cdp_vc.py` | Keep (Sprint 13; minor refresh) |
| `scripts/extract_kfw_capital.py` | **New** |
| `scripts/lib/ndb_taxonomy.py` | Extend `SOURCE_PREFIX_TO_NDB` |
| `scripts/classify.py` | Add EIFO/Bpifrance/CDP/KfW Capital SOURCE_SECTOR dicts |
| `analysis/views.sql` | No change (v_ndb_distributor_rollup already in place) |
| `docs/methodology.md` | New sub-section per institution |
| `docs/notes.md` | Sprint 16 daily log entries |

---

## Validation gates

| Gate | Criterion |
|---|---|
| G1 Baseline | `sanity_check.py` clean post-Sprint 15; backup exists |
| G2 EIFO load | 400-700 EIFO + 200-400 Vækstfonden legacy + 800-1,500 Innovationsfonden events |
| G3 Bpifrance upgrade | 3,000-5,000 company-level rows replacing the 10 fund-level placeholders |
| G4 CDP load | 500-1,500 CDP Equity/Industria/FSI events + ~82 CDP VC (unchanged) |
| G5 KfW Capital load | 30-80 LP rows + 50-150 direct co-invest rows |
| G6 NDB taxonomy | All new sources tag through to canonical NDB ids after backfill |
| G7 No equity > cost | Zero events with `equity_amount_eur > total_project_cost_eur` (where both set) |
| G8 Dedup integrity | No company appears multiple times in the same `source` (e.g. no double-counted Bpifrance equity rounds in the same vehicle) |
| G9 Spot-check | 20 known portfolio companies per institution all present and correctly attributed |
| G10 Audit log | `analysis/findings/` includes Sprint 16 notes on per-institution data-quality caveats |

---

## Expected corpus growth (estimates)

| Workstream | New events | New companies (post-dedup) |
|---|---:|---:|
| Workstream A — EIFO + Vækstfonden + Innovationsfonden | 1,400-2,600 | 1,000-2,000 |
| Workstream B — Bpifrance v2 | 3,000-5,000 | 2,000-3,500 |
| Workstream C — CDP parent + VC upgrade | 500-1,500 | 400-1,200 |
| Workstream D — KfW Capital | 80-230 | 60-180 |
| **Grand total** | **5,000-9,330** | **3,460-6,880** |

**Sprint 16 corpus target: ~100,000-104,000 companies / ~185,000-190,000 events.**

---

## Execution order

**A → D → B → C.**

- **A first** (EIFO etc.): smallest scope, validates Sprint 16 pattern + extends Danish coverage which has the cleanest data-source story.
- **D second** (KfW Capital): also small scope, validates LP-layer pattern.
- **B third** (Bpifrance v2): biggest pure-volume workstream; do after pattern is validated on smaller ones.
- **C last** (CDP): trickiest because the parent group has 8 sub-vehicles with overlapping disclosure; do once Sprint 16 has muscle memory.

---

## Out of scope (explicit)

- **Polish NDBs** (PFR, NCBR, BGK, PARP): captured via Sprint 17 (SUDOP national portal).
- **Belgian regional NDBs** (PMV, SOGEPA, SRIW): Sprint 14 already attempted; rescope after Sprint 17.
- **Norwegian / Swiss NDBs** (Innovation Norway, Innosuisse): non-EU; out of corpus scope.
- **All EIF LP-backed funds**: tracked via `eif_lp_backed` flag, not separately scraped.
- **Tier 2 R&D agencies** beyond FFG / Innovationsfonden / Vinnova / Business Finland (all already in SATR or scope): Tekes (now Business Finland), VTT, etc. — deferred.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| EIFO portfolio page restructures | Cache raw HTML snapshots on first fetch; if page changes mid-sprint, work from cache. |
| Vækstfonden historical PDFs missing some years | Use wayback machine; document any year-coverage gap. |
| Bpifrance fund-level placeholder rows conflict with v2 company-level | Two-step: v2 validates first as `bpifrance_equity_<vehicle>_v2` namespace, then placeholder rows deleted manually. |
| CDP parent vs CDP VC dedup | Strict source-prefix discipline: `cdp_equity_*` (parent), `cdp_vc_*` (VC arm). Same company can appear under both with different equity rounds. |
| KfW Capital LP vs HTGF rows double-count | LP rows = `lp_in_fund` role (fund-level placeholder). HTGF rows = `htgf_*` source. Different roles, different `ndb_distributor`. Document the LP-passthrough caveat. |
| Bpifrance attribution to wrong vehicle | Spot-check 20 known names per vehicle. If misattribution >10%, restructure scraper. |

---

## Definition of done

- All four workstreams loaded with per-institution caveats documented.
- `ndb_distributor` taxonomy now covers EIFO, Vækstfonden, Innovationsfonden, Bpifrance (company-level), CDP, KfW Capital with substantive event counts.
- `v_ndb_distributor_rollup` shows the four new institutions in top 20 by event count.
- Sprint 16 memory file written with per-institution event counts + data-quality caveats.
- `MEMORY.md` index updated.
- Spot-checks pass: 20 known portfolio companies per institution all visible.
- **The European NDB layer is now substantively complete for DK / FR / IT / DE.** Sprint 17 takes the remaining Eastern European gaps via national portals.
