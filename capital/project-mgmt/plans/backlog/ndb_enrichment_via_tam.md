> **Status: BACKLOG** — drafted 2026-05-27 after Sprint 13 closed 8/8 workstreams with 3 of them at placeholder granularity. Revive when (a) a free EU Login account is obtained for the TAM API, OR (b) a willingness to maintain Playwright with stealth headers materialises, OR (c) annual-report PDF parsing tooling is built (highest manual effort but most durable).

# NDB per-company enrichment (post Sprint 13)

## Why this exists

Sprint 13 reached **8/8 institutional coverage** for Tier 1 NDBs but three workstreams landed at *placeholder* granularity (one row per fund / programme / challenge, `entity_type='other'`) rather than per-company. Two more sub-institutions inside otherwise-loaded workstreams were also deferred. This plan consolidates the path to company-level resolution for all five so the corpus reflects actual portfolio companies, not just institutional presence.

## What's deferred

| Workstream | Institution | Current state | Why | Target after enrichment |
|---|---|---|---|---|
| A | **Bpifrance (FR)** | 10 fund-vehicle placeholders | `bpifrance.fr` portfolio page returns Cloudflare 403; `lehub.bpifrance.fr` sub-pages return CloudFront 403; `data.gouv.fr` has 2 datasets, neither beneficiary-level | 400-800 direct portfolio companies + 500-2,000 grant beneficiaries |
| B | **SPRIND (DE)** | 20 challenge programmes | Challenge pages list project codenames ("CRISPR/CAS13", "iGUARD platform") not legal entities; no detail-page resolution | 50-150 funded teams resolved to GmbH spinouts |
| F | **Enterprise Ireland (IE)** | 6 programme placeholders | Press room JS-rendered; data.gov.ie has 118 EI datasets but no per-beneficiary list; annual reports not on `/en/publications` | 800-1,500 HPSU clients + R&D Fund / Commercialisation / DTIF beneficiaries |
| G | **Business Finland (FI)** | 0 events | Programme catalogue browseable but per-programme award lists not consolidated | 400-700 grants |
| H | **Vinnova (SE)** | 0 events | `projektdatabas` behind `etjanster.vinnova.se` login | 500-800 grants |
| H | **Saminvest (SE)** | 0 events | Site is a JS app; root returns 13KB shell HTML | ~30-50 fund LP commitments |

Total expected yield: **2,200-5,000 new rows** across the six sub-institutions.

## Primary path — EU State Aid Transparency Award Module (TAM)

The Commission's TAM at `webgate.ec.europa.eu/competition/transparency` publishes every state-aid award above €100k from every EU member state by law (Reg 651/2014 Art 9 / GBER). One normalised schema across all 27 countries. **This is the single biggest unlock for five of six items in the table above** (Bpifrance grants, EI grants, SPRIND grants, BFinland, Vinnova).

### Why TAM was deferred in Sprint 13

The public search UI at `/public/search?lang=en` is reachable without auth but renders results via JS-only form interactions. The underlying API at `/api/aids/search` returns the EU Login splash page on direct programmatic access — `__Secure-ECAS_SESSIONID` cookies are required. EU Login is a free signup but interactive, so we couldn't acquire credentials inside an autonomous session.

### Discovery already done (won't need to redo)

- `/api/aids/search` is the canonical endpoint (POST or GET with session)
- Form flow: GET `/public?lang=en` → POST `/public/search` (country) → GET `/public/search/results` (filter form) → POST `/public/search/results` (run query)
- Autocomplete endpoints (all GET, JSON, public): `/public/countries?all=true`, `/public/grantingAuthorities/<CountryBID>`, `/public/entrustedEntities/<CountryBID>`, `/public/regions/<CountryBID>`, `/public/aidInstruments`, `/public/sectors`, `/public/objectives`
- Country BIDs: `CountryFRA`, `CountryDEU`, `CountryIRL`, `CountryFIN`, `CountrySWE`, etc. (full list in the `/public/countries?all=true` response)
- Bpifrance appears as `"BPIFRANCE en tant que personne morale de droit public"` in the `entrustedEntities/CountryFRA` list (NOT in `grantingAuthorities` — Bpifrance is the entity that distributes state aid on behalf of ministries)
- `pageSize` larger than the default 50 triggers server timeouts; leave at default

### Implementation outline (when revived)

1. Obtain free EU Login account at `ecas.ec.europa.eu`.
2. Build a small auth-helper module that drives the login flow via Playwright once per session to capture `ECAS_SESSIONID` cookies, then feeds them to the TAM API client.
3. For each (country, entrustedEntity / grantingAuthority) pair in the table below, paginate the search results. Normalise beneficiary names + national IDs (NIF for ES, SIRENE for FR, USt-IdNr for DE, CRO for IE, Y-tunnus for FI, Org.nr for SE).
4. Match against the `companies` table using the same fuzzy + normalisation logic as `extract_cdti.py`. Where rows match an existing company that also has an `ipcei_*` event, set `ipcei_linked=1`.
5. Replace placeholders: keep the existing Bpifrance/EI/SPRIND `_fond` / `_programme` rows as `entity_type='other'` LP-layer documentation, and add per-company rows under specific source IDs (e.g. `bpifrance_france2030_2023`, `enterprise_ireland_hpsu_2024`).

### TAM query map (target search criteria per workstream)

| Workstream | TAM filter |
|---|---|
| A Bpifrance | country=`CountryFRA`, entrustedEntities=`"BPIFRANCE en tant que personne morale de droit public"` |
| B SPRIND | country=`CountryDEU`, grantingAuthorityNames matched on "Bundesagentur für Sprunginnovationen" or entrustedEntities containing "SPRIND" |
| F Enterprise Ireland | country=`CountryIRL`, grantingAuthorityNames matched on "Enterprise Ireland" |
| G Business Finland | country=`CountryFIN`, grantingAuthorityNames matched on "Business Finland" |
| H Vinnova | country=`CountrySWE`, grantingAuthorityNames matched on "Vinnova" |

### TAM coverage caveat (document in methodology)

Pure market-economy-investor equity (MEI compliance) is **excluded** from TAM by definition — TAM holds only notified state aid. So Almi Invest / Tesi / Saminvest / CDP VC pure equity tickets won't appear there, but their grant-style co-investments and quasi-equity ARE published. For Bpifrance and EI which mix grant + equity instruments, TAM covers the grant side; equity-side coverage needs the secondary paths below.

## Secondary paths (where TAM is insufficient)

| Path | Sub-institution | Notes |
|---|---|---|
| **Bpifrance.fr via Playwright stealth** | Bpifrance equity | Defeats Cloudflare on `/nos-pratiques-d-investissement/notre-portefeuille`. Fragile; site changes break the scraper. Run `pip install playwright playwright-stealth && playwright install chromium`. |
| **Annual report PDF parse** | EI, Saminvest, Bpifrance, SPRIND | All four publish annual reports listing named beneficiaries. IF fiche pattern applies (`extract_innovation_fund.py` is the reference). EI annual report should yield 200-500 named HPSU clients per year. |
| **Bundesanzeiger.de** | SPRIND | Federal Gazette publishes Zuwendungsbescheide (grant decisions). Per-team legal-entity resolution requires PDF search by recipient name. |
| **Vinnova GDPHub** | Vinnova | `gdphub.se` requires account + API key; once obtained, bulk CSV/JSON export of funded projects. |
| **Business Finland programme catalogue** | Business Finland | Multi-call scrape per programme (Tempo, Young Innovative Company grants, etc.). Lower ROI than TAM. |

## Files to add when revived

- `ETL/extract/extract_tam.py` — generic TAM search client. One extractor, multiple --source flags.
- `ETL/extract/extract_bpifrance_portfolio.py` (optional) — Playwright stealth path for equity-side enrichment.
- `ETL/extract/extract_ei_annual.py` (optional) — annual report PDF parser for HPSU clients.

## Schema impact

None. The Sprint 13 columns (`ipcei_linked`, `eif_lp_backed`, `deployment_country`, plus `grant_amount_basis` values) cover all expected TAM/portfolio fields. New `grant_amount_basis` values to register:
- `bpifrance_grant`, `bpifrance_equity` (replacing the current `bpifrance_fond`)
- `enterprise_ireland_grant`, `enterprise_ireland_equity` (already registered, will be populated)
- `sprind_grant` (already registered)
- `business_finland_grant`, `vinnova_grant`, `saminvest_lp`

## Revival checklist

- [ ] EU Login account obtained (or Playwright stealth installed, or annual-report PDFs downloaded)
- [ ] DB baseline confirmed: `sanity_check.py` clean, snapshot pre-enrichment counts
- [ ] Backup: `cp data/db.sqlite data/backups/db.sqlite.backup_pre_ndb_enrichment`
- [ ] Build TAM client + per-workstream source mappings
- [ ] Replace Bpifrance/SPRIND/EI placeholders with company-level rows (preserve placeholder rows as `entity_type='other'` LP-documentation)
- [ ] Run `ndb_helpers.backfill_ipcei_linked` across all new rows
- [ ] Re-run `classify.py` and `sanity_check.py`
- [ ] Update the Sprint 13 notes in `../../notes.md` post-enrichment, mark this backlog file resolved
