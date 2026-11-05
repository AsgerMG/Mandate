# ETL — the two data pipelines

Two tracks with deliberately different purposes, each an extract → transform →
load pipeline into its own database:

```
events/         TRACK 1 — INVESTMENT EVENTS                    ──►  data/db.sqlite
                What have comparable entities received from public institutions:
                grants, tax credits, equity-stake tracking. Quantitative,
                backward-looking, the corpus the site is built from.
  extract/        one extract_*.py per funding source (+ renew.py registry)
  transform/      classify, merge, dedup, backfill, resolve entities, rollups
  load/           load_*.py, schema.sql, migrations/, backup.py
  load/qa/        post-load integrity checks (run right after a load)

intelligence/   TRACK 2 — PUBLIC CAPITAL INTELLIGENCE          ──►  data/signals.sqlite
                Current affairs and the future: what funding to expect
                (Competitiveness Fund, Startup & Scaleup Strategy), which people
                and decisions to monitor. Qualitative, forward-looking,
                entity-linked back into db.sqlite. Public-awards-intelligence
                register, never competitor-urgency.
  extract/        news_sources.py (curated registry) + news_ingest.py (engine)
  transform/      classify_relevance → entity_link_articles → classify_signals
                  → embed_articles (bge-m3 + sqlite-vec)
  load/           load_signals.py (schema + status + QA), signals_schema.sql

lib/            shared by both tracks: etl_env.py (paths + import wiring),
                matching.py (canonical company matcher), europe_scope.py, …
```

The publish layer that reads `data/db.sqlite` and turns it into the site is a separate
block under `website/` (`website/build/` builders → `web/`). The read-side
SQL it relies on (`data/views.sql`) lives in `data/`.

## How paths and imports work (`lib/etl_env.py`)

Every stage script starts with a 2-line bootstrap:

```python
import sys; from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
from etl_env import DB, ROOT
```

Importing `etl_env` puts `extract/`, `transform/`, `load/`, `load/qa/` and `lib/` on
`sys.path` (so flat imports like `from ndb_helpers import …` resolve from any stage)
and exposes the canonical paths — `DB`, `ROOT`, `DATA_RAW`, `DATA_PROCESSED`,
`BACKUP_LOCAL`, `BACKUP_ICLOUD`. **No script recomputes `db.sqlite` by counting
`.parent` hops** — change a location once, in `etl_env.py`. A script can be run from
anywhere (`python3 ETL/events/extract/extract_ademe.py`), no `cd`, no `PYTHONPATH`.

## Running the pipeline

```bash
# 1. EXTRACT — pull fresh data (see the registry below)
make sources                       # list every source + how to renew it
make renew                         # pull every AUTO source
python3 ETL/events/extract/renew.py --source ademe cdti      # specific sources
python3 ETL/events/extract/extract_ademe.py --load-db        # or run one extractor directly

# 2. TRANSFORM — re-derive everything from the loaded rows
make transform                     # = classify + sanity
python3 ETL/events/transform/classify.py
python3 ETL/events/transform/merge_companies.py --dedup --apply   # parent rollup (reviewed step)

# 3. LOAD QA + BACKUP
python3 ETL/events/load/qa/sanity_check.py
python3 ETL/events/load/backup.py                              # db + data → local + iCloud
```

Extractors detect duplicates on `(source, call_id)` and are safe to re-run. After any
load: `classify` → `sanity_check` → `backup`. `renew.py` prints that reminder.

## Source registry — every source, and how to renew it

Triggering a renewal is `ETL/events/extract/renew.py` (registry of record:
[`events/extract/manifest.py`](events/extract/manifest.py)). Tiers:

- **🟢 auto** — fully programmatic (open API / bulk file / server-rendered page).
  `renew.py --auto` runs all of these. Renew column shows the args.
- **🟡 network** — programmatic, but the endpoint is only reachable from a specific
  host/network (national NDB APIs the build host can't reach, WAF-gated registers,
  rate-limited factsheets). Run from the right host; SATR is a two-step workflow.
- **📄 manual** — needs a downloaded file each renewal (an annual-report PDF, a
  register export, a Wayback snapshot) — mostly the Sprint-19 equity-stakes one-shots.
  `python3 ETL/events/extract/renew.py --source isif_direct -- <file> <as_of>`.
- **⛔ rejected** — evaluated and deliberately not loaded (kept for provenance).

| Source | Country/Instrument | Extractor | Renew | Tier |
|---|---|---|---|---|
| eic_fund | EIC Fund portfolio (EU equity) | `ETL/events/extract/extract_eic_fund.py` | `--load-db` | 🟢 auto |
| innovation_fund | EU Innovation Fund | `ETL/events/extract/extract_innovation_fund.py` | `--load-db` | 🟢 auto |
| eib | EIB venture/growth debt | `ETL/events/extract/extract_eib.py` | `--load-db` | 🟢 auto |
| eit | EIT KICs (all 8) | `ETL/events/extract/extract_eit.py` | `--load-db` | 🟢 auto |
| chips_ju | Chips JU / KDT JU | `ETL/events/extract/extract_chips_ju.py` | `--load-db --refresh` | 🟢 auto |
| cordis | CORDIS HORIZON projects (base) | `ETL/events/extract/extract_cordis.py` | `--load-db` | 🟢 auto |
| cordis_pillar_ii | Horizon Pillar II CL1/3/4/5/6 + JU families | `ETL/events/extract/extract_cordis_pillar_ii.py` | `--load-db` | 🟢 auto |
| bdns | Spain BDNS / SNPSAP state aid | `ETL/events/extract/extract_bdns.py` | `--load-db` | 🟢 auto |
| cdti | Spain CDTI (sub-threshold direct) | `ETL/events/extract/extract_cdti.py` | `--load-db --refresh` | 🟢 auto |
| ademe | ADEME (FR cleantech aid) | `ETL/events/extract/extract_ademe.py` | `--load-db --refresh` | 🟢 auto |
| fr_innov_grants | Bpifrance i-Nov / PM'up (FR) | `ETL/events/extract/extract_fr_innov_grants.py` | `--load-db --refresh` | 🟢 auto |
| bpifrance | Bpifrance fonds & participations (FR) | `ETL/events/extract/extract_bpifrance.py` | `--load-db` | 🟢 auto |
| innovate_uk | Innovate UK / UKRI (GB) | `ETL/events/extract/extract_innovate_uk.py` | `--load-db` | 🟢 auto |
| innovationsfonden | Innovationsfonden (DK) | `ETL/events/extract/extract_innovationsfonden.py` | `--load-db --refresh` | 🟢 auto |
| eifo | EIFO Venturelisten co-invest (DK) | `ETL/events/extract/extract_eifo.py` | `--load-db --refresh` | 🟢 auto |
| business_finland | Business Finland (FI) | `ETL/events/extract/extract_business_finland.py` | `--load-db` | 🟢 auto |
| vinnova | Vinnova / GDP Hub (SE) | `ETL/events/extract/extract_vinnova.py` | `--load-db` | 🟢 auto |
| enterprise_ireland | Enterprise Ireland (IE) | `ETL/events/extract/extract_enterprise_ireland.py` | `--load-db` | 🟢 auto |
| sprind | SPRIND challenges (DE) | `ETL/events/extract/extract_sprind.py` | `--load-db --refresh` | 🟢 auto |
| htgf | High-Tech Gründerfonds (DE) | `ETL/events/extract/extract_htgf.py` | `--load-db --refresh` | 🟢 auto |
| coparion | Coparion (DE) | `ETL/events/extract/extract_coparion.py` | `--load-db --refresh` | 🟢 auto |
| cdp_vc | CDP Venture Capital (IT) | `ETL/events/extract/extract_cdp_vc.py` | `--load-db --refresh` | 🟢 auto |
| invest_nl | Invest-NL (NL) | `ETL/events/extract/extract_invest_nl.py` | `--load-db --refresh` | 🟢 auto |
| tesi | Tesi portfolio (FI) | `ETL/events/extract/extract_tesi.py` | `--load-db --refresh` | 🟢 auto |
| almi_invest | Almi Invest (SE) | `ETL/events/extract/extract_almi_invest.py` | `--load-db --refresh` | 🟢 auto |
| ipcei | IPCEI decisions | `ETL/events/extract/extract_ipcei.py` | `--load-db` | 🟡 network |
| edf | European Defence Fund | `ETL/events/extract/extract_edf.py` | `--load-db` | 🟡 network |
| satr | SATR — EU State Aid Transparency Register | `ETL/events/extract/extract_satr.py` | two-step¹ | 🟡 network |
| innovasjon_norge | Innovasjon Norge (NO) | `ETL/events/extract/extract_innovasjon_norge.py` | `--load-db` | 🟡 network |
| nfr | Forskningsrådet / NFR (NO) | `ETL/events/extract/extract_nfr.py` | `--load-db` | 🟡 network |
| innosuisse | Innosuisse (CH) | `ETL/events/extract/extract_innosuisse.py` | `--load-db` | 🟡 network |
| tacr | TAČR / STARFOS (CZ) | `ETL/events/extract/extract_tacr.py` | `--load-db` | 🟡 network |
| baltic_ndbs | ALTUM (LV) + EIS (EE) | `ETL/events/extract/extract_baltic_ndbs.py` | `--load-db` | 🟡 network |
| sudop | SUDOP (PL) | `ETL/events/extract/extract_sudop.py` | `--load-db --refresh` | 🟡 network |
| future_fund | UK Future Fund register (GB) | `ETL/events/extract/extract_future_fund.py` | file arg | 📄 manual |
| ee_register_stakes | EE e-Business Register (SmartCap) | `ETL/events/extract/extract_ee_register_stakes.py` | file arg | 📄 manual |
| investinor_portfolio | Investinor (NO) | `ETL/events/extract/extract_investinor_portfolio.py` | file arg | 📄 manual |
| isif_direct | ISIF directs (IE) | `ETL/events/extract/extract_isif_direct.py` | file arg | 📄 manual |
| pfr_ventures | PFR Ventures (PL) | `ETL/events/extract/extract_pfr_ventures.py` | file arg | 📄 manual |
| tesi_directs | Tesi directs note (FI) | `ETL/events/extract/extract_tesi_directs.py` | file arg | 📄 manual |
| bpifrance_urd_stakes | Bpifrance URD stakes (FR) | `ETL/events/extract/extract_bpifrance_urd_stakes.py` | file arg | 📄 manual |
| eifo_note12 | EIFO annual-report Note 12 (DK) | `ETL/events/extract/extract_eifo_note12.py` | file arg | 📄 manual |
| fr_regions | FR regional SCDL | `ETL/events/extract/extract_fr_regions.py` | — | ⛔ rejected |

¹ SATR: `bash ETL/events/extract/run_satr_all.sh` (per-country pull) → `python3 ETL/events/load/load_satr.py --staging --apply`.

**25 auto · 9 network · 8 manual · 1 rejected.** When you add or change a source, update
`extract/manifest.py` and re-list with `make sources`.

## Adding a new source

Work the full checklist in order: SATR-overlap gate → extractor → loader →
`data/views.sql` + coverage indicator + `ETL/events/transform/classify.py` →
update `project-mgmt/methodology.md` → post-load QA (`ETL/events/load/qa/sanity_check.py`).
New extractors must call `ETL/lib/europe_scope.canonicalise_country()` before insert,
carry the `etl_env` bootstrap, expose `--load-db`, and get a row in `extract/manifest.py`.
