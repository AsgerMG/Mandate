# EU Public Capital Tracker

**Question**: How well does EU-directed public capital predict private follow-on investment in European tech?

**Approach**: Build a structured dataset of companies receiving EU public funding (EIC, IPCEI, EIB, Chips Act, Innovation Fund, EDF, EIT KICs, Horizon Europe Pillar II) and national strategic deployment (Tier 1 NDBs and R&D agencies) for 2021–2026, then enrich with observable downstream outcomes (follow-on funding, headcount growth, survival, acquisitions) to assess each instrument's signal value.

## Project structure

```
EuroInvTracker/
├── data/
│   ├── raw/              # source files, untouched
│   │   ├── eib/, ipcei/, innovation_fund/, chips_ju/, edf/, step/
│   │   ├── cordis/                    # Horizon Europe bulk dump (Sprints 11+12)
│   │   ├── invest_nl/, tesi/, almi_invest/, cdp_vc/, cdti/   # Tier 1 NDB caches (Sprint 13)
│   │   ├── htgf/, coparion/, sprind/                          # KfW deployment layer + SPRIND
│   └── processed/        # *_match_summary.csv, *_projects.csv per source
├── db_backups/           # sqlite snapshots from each sprint (gitignored)
├── docs/
│   ├── methodology.md            # living methodology reference
│   ├── notes.md                  # day-by-day working log
│   ├── sprint13_ndb_status.md    # 8/8 NDB workstream rollup
│   └── cdti_discovery_notes.md   # BDNS API discovery
├── plans/                # sprint planning documents (sprint_3 through sprint_14)
│   └── backlog/          # deferred / not-currently-scheduled plans
├── scripts/
│   ├── schema.sql              # DB schema (sqlite)
│   ├── classify.py             # sector + entity_type classifier
│   ├── sanity_check.py         # verification queries
│   ├── audit_dedup.py          # cross-source dedup sweep
│   ├── tag_step.py             # STEP Seal flagger
│   ├── ndb_helpers.py          # IPCEI linkage backfill, EIF flag, FX normalisation
│   ├── load_eic.py
│   ├── extract_ipcei.py
│   ├── extract_eib.py
│   ├── extract_innovation_fund.py
│   ├── extract_chips_ju.py
│   ├── extract_edf.py
│   ├── extract_eit.py
│   ├── extract_cordis.py              # Sprint 11: CHP / IHI / EuroHPC via CORDIS dump
│   ├── extract_cordis_pillar_ii.py    # Sprint 12: CL1/CL3/CL4/CL5/CL6
│   ├── extract_invest_nl.py           # Sprint 13: Tier 1 NDBs
│   ├── extract_tesi.py
│   ├── extract_almi_invest.py
│   ├── extract_cdp_vc.py
│   ├── extract_cdti.py                # Sprint 13: via BDNS national subsidies API
│   ├── extract_htgf.py                # Sprint 13: KfW Capital deployment layer
│   ├── extract_coparion.py
│   ├── extract_sprind.py              # Sprint 13: programme-level placeholder
│   ├── extract_bpifrance.py           # Sprint 13: fund-vehicle placeholder
│   └── extract_enterprise_ireland.py  # Sprint 13: programme-level placeholder
├── analysis/             # SQL views + findings derivations for the site
├── site/                 # Next.js findings site
├── db.sqlite             # the built database
└── README.md
```

## Data sources

EU direct funding:

| Source | Status | Coverage |
|---|---|---|
| EIC Accelerator / Pathfinder / Transition | ✅ | 707 + 1,288 + 407 coordinator companies |
| IPCEI | ✅ | 317 funding events / 302 distinct companies (11 decisions) |
| EIB venture / growth | ✅ | 153 events |
| Innovation Fund | ✅ | 246 events / 237 beneficiaries across 20 sub-calls (2020–2024) |
| Chips JU / KDT JU | ✅ | KDT calls 2020–2023 |
| EDF (leaders only) | ✅ | 276 events (2021–2025), introduces `defense` sector |
| EIT KICs (Digital, Manufacturing, others) | ✅ | EIT KIC events across multiple programmes |
| Horizon Europe Pillar II (CL1/3/4/5/6) | ✅ | 49,433 events / 3,145 projects / €19.55B EU contribution (Sprint 12) |
| CHP / IHI JU / EuroHPC JU (via CORDIS) | ✅ | 220 events / €1.8B (Sprint 11) |
| STEP Seal flag | ✅ | 623 companies tagged via Commission STEP Seal export |

National strategic deployment (Sprint 13 — 8/8 Tier 1 workstreams loaded):

| Workstream | Institution | Coverage |
|---|---|---|
| A | Bpifrance (FR) | 10 fund-vehicle placeholders — per-company enrichment deferred (Cloudflare-blocked portfolio) |
| B | KfW Capital (HTGF) | **857 companies** via WP REST API |
| B | KfW Capital (Coparion) | 52 companies |
| B | SPRIND (DE) | 20 challenge programmes (placeholder; per-team resolution deferred) |
| C | CDP Venture Capital (IT) | 199 events (152 direct + 47 fund-of-funds), `eif_lp_backed=1` |
| D | Invest-NL (NL) | 13 events (6 direct + 7 fund-of-funds) |
| E | CDTI (ES) | **1,880 events / €1.04B state aid** via BDNS API workaround |
| F | Enterprise Ireland (IE) | 6 programme placeholders — per-company enrichment deferred |
| G | Tesi (FI) | 102 events; Business Finland deferred |
| H | Almi Invest (SE) | 323 events; Vinnova + Saminvest deferred |
| **All 8 workstreams** | | **3,462 events / 988 cross-EU matches / 4 IPCEI overlaps (HTGF)** |

See [docs/sprint13_ndb_status.md](docs/sprint13_ndb_status.md) for the per-institution status table and the Sprint 14 enrichment paths.

**Corpus totals**: **21,689 companies / 58,628 events** (post Sprint 13).

See [methodology.md § Source coverage](docs/methodology.md#source-coverage) for the full scope rationale — which slices are loaded, which are deferred, and why.

## Run

Each extractor supports `python3 scripts/extract_<source>.py --load-db` for idempotent re-loads. Order does not matter for already-loaded sources; for first-time builds, follow the chronological sprint sequence so cross-source dedup catches earlier rows.

```bash
python3 scripts/load_eic.py                            # Sprint 1
python3 scripts/extract_ipcei.py --load-db             # Sprint 2
python3 scripts/extract_eib.py --load-db               # Sprint 3
python3 scripts/extract_innovation_fund.py --load-db   # Sprint 4
python3 scripts/extract_chips_ju.py --load-db          # Sprint 5
python3 scripts/extract_edf.py --load-db --sleep=3     # Sprint 6
python3 scripts/extract_eit.py --load-db               # Sprint 7
python3 scripts/audit_dedup.py [--load-db]             # Sprint 8
python3 scripts/tag_step.py [--load-db]                # Sprint 8

# Sprint 11/12 — Horizon Europe partnerships + Pillar II via CORDIS open-data dump
python3 scripts/extract_cordis.py --load-db
python3 scripts/extract_cordis_pillar_ii.py --load-db

# Sprint 13 — Tier 1 NDBs (8/8 workstreams)
python3 scripts/extract_invest_nl.py --load-db
python3 scripts/extract_tesi.py --load-db
python3 scripts/extract_almi_invest.py --load-db
python3 scripts/extract_cdp_vc.py --load-db
python3 scripts/extract_cdti.py --load-db              # via BDNS API
python3 scripts/extract_htgf.py --load-db              # KfW deployment layer
python3 scripts/extract_coparion.py --load-db
python3 scripts/extract_sprind.py --load-db
python3 scripts/extract_bpifrance.py --load-db
python3 scripts/extract_enterprise_ireland.py --load-db

# Always re-run after any loader inserts rows
python3 scripts/classify.py
python3 scripts/sanity_check.py
```

`classify.py` is idempotent and reads sources off `public_funding_events`. Every extractor performs duplicate detection on `(source, call_id)`.

## Findings site (Sprint 9)

Static Next.js site presenting 8 exploratory analyses + synthesis memo. Source at `site/`.

```bash
cd site
npm install
npm run dev     # dev server at localhost:3000
npm run build   # static export → site/out/
```

Routes: `/` (landing) · `/01-corpus` through `/08-gaps` · `/synthesis` · `/methodology` · `/limitations`. JSON data files in `site/public/data/` are generated by `analysis/run.py`.

## Methodological notes

- Descriptive framing only: "does public funding *predict* private follow-on", not "cause"
- PIC (EU Participant Identification Code) is the canonical company ID for EU sources
- Multi-instrument deduplication: one company row, many event rows
- NDB equity tickets often NULL — listings publish names but not amounts (CDTI is the exception via BDNS)
- `grant_amount_basis` flags semantic differences across sources — never sum across mixed basis values without filtering
- `ipcei_linked`, `eif_lp_backed`, `deployment_country` columns (Sprint 13) flag double-count + LP-passthrough patterns for the NDB layer
