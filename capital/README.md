# EU Public Capital Tracker

**Question**: How well does EU-directed public capital predict private follow-on investment in European tech?

**Approach**: Build a structured dataset of companies receiving EU public funding (EIC, IPCEI, EIB, Chips Act, Innovation Fund, EDF) 2021–2026, then enrich with observable downstream outcomes (follow-on funding, headcount growth, survival, acquisitions) to assess each instrument's signal value.

## Project structure

```
EuroInvTracker/
├── data/
│   ├── raw/             # source files, untouched (ipcei/ PDFs, eib/ CSVs, edf/ factsheets, etc.)
│   └── processed/       # intermediate outputs (*_match_summary.csv, *_projects.csv)
├── db_backups/          # sqlite snapshots from previous sprints
├── docs/
│   ├── methodology.md   # living methodology reference
│   └── notes.md         # working notes per day
├── plans/               # sprint planning documents
├── schema.sql           # DB schema
├── load_eic.py          # EIC Data Hub loader
├── extract_ipcei.py     # IPCEI Commission-decision PDF extractor
├── extract_eib.py       # EIB venture-debt / growth-finance extractor
├── extract_innovation_fund.py  # EU Innovation Fund CINEA fiche extractor
├── extract_chips_ju.py  # Chips JU / KDT JU OData API extractor
├── extract_edf.py       # European Defence Fund PDF factsheet extractor
├── extract_eit.py       # EIT Digital + EIT Manufacturing extractor (hardcoded data)
├── classify.py          # sector + entity_type classifier
├── sanity_check.py      # verification queries
├── db.sqlite            # the built database
└── README.md
```

## Data sources

| Source | Status | Coverage |
|---|---|---|
| EIC Accelerator | ✅ loaded | 707 coordinator companies / 712 events |
| EIC Pathfinder | ✅ loaded | 1,289 companies |
| EIC Transition | ✅ loaded | 407 companies |
| IPCEI | ✅ loaded | 317 funding events / 302 distinct companies (11 decisions) |
| EIB venture/growth | ✅ loaded | see Day 4 in docs/notes.md |
| Innovation Fund | ✅ loaded | 246 events / 237 beneficiaries across 20 sub-calls (2020–2024) |
| Chips JU / KDT JU | ✅ loaded | 35 events / 25 distinct coordinators across KDT calls 2020–2023 (KDT-2023 partial; Chips JU 2024+ pending portal publication) |
| EDF (leaders only) | ✅ loaded | 276 events (2021–2025), 97% coverage; introduces `defense` sector label |
| EIT KICs | ✅ partial | EIT Digital + EIT Manufacturing: 99 events / 96 companies (Sprint 7); 6 remaining KICs deferred to Sprint 9 |
| Sprint 8 corpus audit | ✅ done | Cross-source dedup (−6 companies), entity_type shrinkage (705 → 186 unknowns), zero NULL country, totals reconciled — see [Pre-Dealroom Health Report](data/processed/pre_dealroom_health_report.md) |
| STEP Seal flag | ✅ loaded | 623 companies tagged (20.1% of corpus) via match against Commission "SEAL - data set" export. See [tag_step.py](scripts/tag_step.py) + [step_match_summary.csv](data/processed/step_match_summary.csv) |
| Dealroom enrichment | 🔜 Sprint 9 | right-hand side variable — private follow-on funding, headcount, status (`private_funding_events`) |

Total: **3,101 unique companies** across EIC + IPCEI + EIB + IF + Chips JU + EDF + EIT KICs after dedup (post Sprint 8 audit: −6 from cross-source merges). 4,969 funding events. `entity_type='unknown'` at 6.0% (down from 22.7%), zero NULL country rows.

See [methodology.md § Source coverage](docs/methodology.md#source-coverage) for the full Horizon Europe scope rationale — which HE slices are loaded, which are deferred, and why.

## Run

```bash
python3 scripts/load_eic.py        # build the DB from raw EIC export
python3 scripts/extract_ipcei.py --load-db   # extract IPCEI direct partners from PDFs
python3 scripts/extract_eib.py --load-db     # scrape and load EIB venture-debt loans
python3 scripts/extract_innovation_fund.py --load-db  # load Innovation Fund CINEA fiches
python3 scripts/extract_chips_ju.py --load-db         # load Chips JU / KDT JU projects from OData API
python3 scripts/extract_edf.py --load-db --sleep=3    # load EDF factsheet PDFs; --sleep paces requests to avoid rate-limit Sorry pages
python3 scripts/extract_eit.py --load-db              # load EIT Digital + EIT Manufacturing (hardcoded data, no live fetch)
python3 scripts/classify.py        # apply sector + entity_type heuristics (re-run after every loader)
python3 scripts/audit_dedup.py [--load-db]            # Sprint 8: cross-source dedup sweep + optional merges
python3 scripts/tag_step.py [--load-db]               # Sprint 8: match Commission STEP Seal export → companies.step_flagged
python3 scripts/sanity_check.py    # verify counts
```

Re-run `classify.py` after any loader that inserts new `companies` rows — it
is idempotent and reads sources off `public_funding_events`.

## Findings site (Sprint 9)

Static Next.js site presenting 8 exploratory analyses + synthesis memo. Source at `site/`.

```bash
cd site
npm install
npm run dev     # dev server at localhost:3000
npm run build   # static export → site/out/
```

Routes: `/` (landing) · `/01-corpus` through `/08-gaps` · `/synthesis` · `/methodology` · `/limitations`

JSON data files in `site/public/data/` are generated by `analysis/run.py` (see below).

```bash
# Regenerate data files (read-only; requires the DB)
cd analysis
python3 run.py
```

## Methodological notes

- Descriptive framing only: "does public funding *predict* private follow-on", not "cause"
- PIC (EU Participant Identification Code) is the canonical company ID for EU sources
- Multi-instrument deduplication: one company row, many event rows
- Equity amounts are not in the EIC export (reported separately by the EIC Fund) — v1 uses grants only
