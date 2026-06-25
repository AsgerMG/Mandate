# CDTI extractor — discovery notes (Sprint 13 Workstream E)

Status: **RESOLVED 2026-05-26 — production extractor loaded 1,880 events / €1.04B via BDNS API.** Historical discovery record below preserved.

## Goal

Load CDTI (Centro para el Desarrollo Tecnológico Industrial) awarded grants for 2021-today, covering at minimum: Misiones, NEOTEC, Innovación Global, and PERTE sub-programmes. Schema → `cdti_<programme>_<year>` source IDs, `cdti_grant` basis, `deployment_country='ES'`.

## What was tried (session 2026-05-26)

1. **`cdti.es/datosabiertos`** — landing page exists but actual datasets are reached through "Consultar" JS links behind **Imperva / Incapsula bot detection**. `curl` returns the Incapsula challenge HTML (~200 bytes) instead of content. WebFetch is similarly blocked.
2. **`cdti.es/index.asp?TR=A&IDR=37`** — programme index loads (curl works for this older asp page; 149KB HTML). Links to programme sub-pages but no machine-readable beneficiary lists.
3. **`datos.gob.es`** (Spanish national open-data catalogue) — WebFetch returned blank content; needs in-browser exploration or direct CKAN API.
4. **`infosubvenciones.es` (BDNS — Base de Datos Nacional de Subvenciones)** — most promising. National subsidies database with documented API. Every CDTI award must be published here by law (Ley 38/2003). Not yet probed against the actual API.

## What was implemented (next-session work, executed 2026-05-26 same day)

BDNS API workaround landed in `ETL/extract/extract_cdti.py` (replacing the empty scaffold). See `docs/methodology.md` "BDNS API integration" sub-section for the full technical description.

Discovery findings worth keeping for future Spanish-public-funder work:
- **Real API base is `/bdnstrans/api`**, not the `/GE/es/api/*` paths exposed in the SPA URLs. Those routes return the Angular shell. The actual base lives in the SPA's `servidoresApi` config object inside `main.<hash>.js`.
- **Working query**: `GET /bdnstrans/api/concesiones/busqueda?vpd=GE&descripcion=<text>&page=<N>`. `vpd=GE` is required ("vista por defecto: General"). `pageSize` larger than 50 triggers server timeouts — leave at default.
- **Programme classifier** (`PROGRAMME_RULES` in `extract_cdti.py`) was discovered empirically from the 39 distinct convocatoria titles in the live data — NEOTEC, Misiones, PERTE Aeroespacial/Salud, IDI, Cervera, LIC. Real BDNS programmes turned out to differ from the placeholder list this doc originally proposed (no separate PERTE Chip / VEC / ERHA / Naval rows in scope; "PERTE Aeroespacial y de Salud de Vanguardia" is a single combined programme).
- **Cross-organisation contamination is real**: `descripcion=CDTI` text-filter matches convocatoria titles, which catches 77 awards from ISCIII (Salud Carlos III), Galician Innovation, and a Lorca city programme whose titles happen to mention CDTI. Post-filter on `nivel3 = "CENTRO PARA EL DESARROLLO TECNOLÓGICO Y LA INNOVACIÓN E.P.E"`.

Fall-back paths (still good to know):
- Playwright + stealth against `cdti.es/datosabiertos` — never tried since BDNS sufficed.
- Direct BOE PDF parsing (`boe.es/diario_boe`) — `urlBR` field in every BDNS row already points there, so this becomes the second-pass enrichment if we ever want full project-level metadata (objetivo, beneficiaries' role in consortium, etc).

## Out of scope per Sprint 13 scoping

- Plain CDTI loans (PID, PIDI, Línea Directa de Innovación as pure loan) — these are SME working-capital instruments and fall outside Sprint 13's "direct equity / strategic R&D grant" filter.
- Cervera Network calls funding research orgs only — keep if they also fund consortium companies; skip if pure-RTO.

## Schema-side prep (done; CDTI rows now loaded)

- `extract_cdti.py` shipped (BDNS API edition; replaces the scaffold).
- `data/raw/cdti/pages/page_{0..39}.json` cached (~2MB total; re-download via `python3 extract_cdti.py --refresh`).
- `ETL/lib/ndb_helpers.py` provides IPCEI-linkage backfill; ran after load, flagged 0 CDTI rows (no IPCEI overlap — see methodology).
- DB columns populated: `ipcei_linked=0`, `eif_lp_backed=0`, `deployment_country='ES'` on all 1,880 CDTI rows.
