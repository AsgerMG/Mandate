# EU Public Capital Tracker — Notes

> **Historical dev journal — not current guidance.** A dated, append-only log of work
> sessions, kept for provenance. Paths and figures inside older entries reflect the repo
> as it was at that date (before the ETL / website / data / project-mgmt consolidation).
> For the current state of the project see the top-level `README.md` and `project-mgmt/methodology.md`.

## Day 20 — 2026-05-31 — Sprint 16: central NDB registers (FR + DK)

### Strategic pivot: from per-NDB scraping to central data registers

Original Sprint 16 plan: per-NDB Playwright scrapers for EIFO, Bpifrance, CDP, KfW Capital. Abandoned mid-session after discovery that most NDB portfolio pages are Cloudflare-walled (bpifrance.fr 403, cdp.it Radware bot-protected), JS-rendered with no API (innovationsfonden.dk Drupal Views, projecten.rvo.nl), or simply don't publish portfolios as structured data (eifo.dk publishes only news cards). Per-NDB scraping does not scale to 40 countries.

User steer: "find central sources... state aid reporting requirements etc. because this approach is not really scalable for 40 countries... ensure to include this in methodology so people will know."

**New pattern**: discover *central* registers — EU Open Data Portal (`data.europa.eu`), data.gouv.fr's Opendatasoft network (data.enseignementsup-recherche, data.iledefrance, opendata.caissedesdepots), Drupal-Views server-rendered HTML, NDB-published Google Sheets, BDNS API — and load them. One central register per economy where one exists.

### Three extractors shipped (4,293 events / +2,821 companies)

| Extractor | Source | Events | Volume |
|---|---|---:|---|
| [extract_fr_innov_grants.py](../ETL/extract/extract_fr_innov_grants.py) | data.enseignementsup-recherche.gouv.fr (i-Nov) + data.iledefrance.fr (PM'up) | 849 | €568M grants |
| [extract_innovationsfonden.py](../ETL/extract/extract_innovationsfonden.py) | innovationsfonden.dk Drupal-Views server-rendered HTML, 566 pages × 14 rows | 3,313 | €892M grants |
| [extract_eifo.py](../ETL/extract/extract_eifo.py) | EIFO Venturelisten Google Sheet (filtered to EIFO co-invest) | 131 | €1.24B round volume |

**Corpus**: 95,245 → 98,066 companies / 178,915 → 183,208 events. Backup at `/tmp/eit_data_backup/db.sqlite.pre-sprint16.bak` (315MB).

### Structural finding documented in methodology.md "Known limitations"

**Article 107 TFEU defines state aid as a transfer of public resources that confers an "advantage" to undertakings on selective terms.** When an NDB invests at market terms — pari passu with private co-investors, at commercial rates, in commercially viable companies — there is no advantage, therefore no state aid, therefore **no publication obligation** under SATR or any national state-aid register. This is the regime that governs the bulk of NDB equity activity by volume (Bpifrance equity ~€2-3bn/yr, KfW Capital LP commitments ~€500M-1bn/yr, CDP Equity strategic holdings ~€10bn AUM, EIFO equity tickets). The corpus catches the **grant / soft-loan / subsidy-element** layer via SATR + central registers; it does NOT catch the commercial-conform **equity / quasi-equity** layer. Recovery paths: annual report PDF parsing, Dealroom/Pitchbook, EIF Annual Transparency Report, InvestEU Operations Register — none central-source-scrapeable.

### Patterns

- **Drupal-Views server-rendered HTML**: innovationsfonden.dk renders `<td>` rows with all field data in hidden `<div class="X-hidden">` sub-elements (screen-reader pattern). Pagination via `?page=N` works server-side. Fetch loop with 0.05s throttle clears 566 pages in 4 minutes.
- **Opendatasoft API**: `/api/explore/v2.1/catalog/datasets/<slug>/exports/csv?use_labels=true` is the universal export path across data.gouv.fr-mediated portals (data.enseignementsup-recherche.gouv.fr, data.iledefrance.fr, opendata.caissedesdepots.fr).
- **Google Sheets export**: append `/export?format=csv&gid=<sheet_id>` to any public Sheet URL. EIFO Venturelisten exposes 990 Danish VC rounds 2021-2026 this way.

### Carry-over (next session targets, not deferred to a future sprint)

Second-half of session pushed all four. Results:

- **🇫🇷 ADEME loaded (BIG WIN)**: 27,697 events / €7.76B / +17,105 net new companies — discovered via [data.ademe.fr](https://data.ademe.fr/datasets/les-aides-financieres-de-l'ademe) (the central French cleantech / energy-transition NDB grant register). Now the **#1 NDB by event count** in the entire corpus. Implemented in [extract_ademe.py](../ETL/extract/extract_ademe.py) with public-entity regex filter (`COMMUNE|VILLE|UNIVERSITÉ|HÔPITAL|...`).
- **🇫🇷 Bpifrance expanded**: added Innov'up Leader PIA (144) + Plan de Relance Industrial (2,835 — no amounts) to the existing extractor. Bpifrance NDB tally now 3,841 events / €619M (up from 849 / €568M).
- **🇵🇱 PL SUDOP — pipeline proven, scaffold + 22 events shipped**: discovered the central Polish state aid register has an **async OpenAPI** at `api-sudop.uokik.gov.pl/swagger/sudop-api.yml`. Flow: GET search → 303 redirect to queue URL → poll until 303 → CSV download. Built [extract_sudop.py](../ETL/extract/extract_sudop.py) with a curated `INNOVATION_MEASURES` list of 10 SA-codes covering BGK, NCBR, PARP innovation programmes. One measure ran successfully (SA.56782 PARP B+R = 22 events / €1.6M). Rate-limited mid-run after ~5 queries; cached files cleanly resumable next session.
- **🇳🇱 NL RVO — documented as multi-hour Playwright job**: `projecten.rvo.nl` has 73,343 projecten total, search listing is JS-rendered (10 results / page = ~7,300 pages × ~3s/page = ~6 hours). Per-project pages (`/nl/projecten/<id>`) ARE server-rendered with Aanvrager + Rijksbijdrage + Subsidieregeling fields parseable via regex. **Plan for next session**: Playwright-enumerate list pages → batch-curl project detail pages → parse + load. Probable yield: ~20-40k NL events / multiple €B.
- **🇮🇹 IT RNA — documented (would double-count SATR-IT)**: Monthly XML dumps at `rna.gov.it/sites/rna.mise.gov.it/files/opendata/OpenData_Aiuti_YYYY_MM.xml`, ~935MB each × 60 months = ~25-50GB total download. XML structure rich (CAR / DENOMINAZIONE_BENEFICIARIO / CODICE_FISCALE / COMPONENTI_AIUTO / STRUMENTI_AIUTO / ELEMENTO_DI_AIUTO / IMPORTO_NOMINALE). **The Italian state aid in SATR (16,725+ events from mediocredito_centrale, invitalia, etc.) is already syndicated FROM RNA** — loading RNA fresh would substantially duplicate. Future approach: load only the **de minimis** subset (< €100k, NOT in SATR by threshold) and explicit non-SATR authorities. Streaming SAX parser scope.
- **🇪🇸 ES BDNS — hard WAF IP-block**: BDNS API at `infosubvenciones.es/bdnstrans/api` IP-banned us after our probes. Spain is NOT in SATR (Sprint 15: "Spain uses BDNS — already covered via extract_cdti.py"). All Spanish NDB coverage rides on BDNS. Carry-over: retry from a different IP, or implement very-slow-throttle (60s/request) batch with checkpointing for ENISA/ICO/COFIDES.

### Sprint 16 second-half totals (cumulative)

| | Before today | After session 1 | After session 2 |
|---|---:|---:|---:|
| Companies | 95,245 | 98,066 | **116,925** |
| Events | 178,915 | 183,208 | **213,906** |
| Top NDB by events | mediocredito_centrale (14,345) | mediocredito_centrale (14,345) | **ademe (27,697)** |
| FR coverage | Bpifrance 0 | Bpifrance 862 | Bpifrance 3,841 + ADEME 27,697 |
| DK coverage | 0 | Innovationsfonden 3,313 + EIFO 131 | unchanged |
| PL coverage | 0 | 0 | sudop_parp 22 (scaffold for ~10k more) |

---

## Day 18 — 2026-05-29 — Sprint 14: Europe-scope filter + home-page taxonomy network + map sector pies

### Europe scope (corpus filter + destructive clean-up + DB trigger)

User flagged that the home-page KPI claimed "53 countries" but the country list included Horizon open-call leakage (Tunisia, South Africa, US, Greenland), source-data aliases counted as separate countries (`EL` vs `GR`, `UK` vs `GB`, `PO` vs `PL`, `SW` vs `SE`), and Horizon-associated countries that aren't European (Israel, Turkey, Caucasus). Asked: "should probably only cover europe? ... if investments fall outside these EU/Europe countries then remove them from corpus". Followed up: "delete the data from countries out of scope, state this in methodology and ensure future scrapes etc. does not include this!"

**Decision**: 40-country EU/Europe scope. EU27 + EFTA (NO/CH/IS/LI) + UK + Western Balkans (AL/BA/ME/MK/RS/XK) + Eastern Partnership in study (UA/MD). Israel, Turkey, Caucasus, and tail-leakage countries dropped. Full rationale per-country in [europe_scope.md](europe_scope.md).

**Implementation pattern**: three layers of defence so the scope is held at every layer the data passes through.

1. **Pre-insert filter in extractors** — new helper [ETL/lib/europe_scope.py](../ETL/lib/europe_scope.py) loaded from [data/europe_scope.json](../data/europe_scope.json). Exports `canonicalise_country(code)` that maps aliases and returns None for out-of-scope codes. Every new extractor should call it; existing extractors get protection from layer 2.
2. **DB triggers** — `trg_companies_country_scope` and `trg_companies_country_scope_update` `BEFORE INSERT/UPDATE` triggers in [ETL/load/schema.sql](../ETL/load/schema.sql). Fire on every write to `companies.country`. Any out-of-scope code `RAISE(ABORT, ...)` with a message pointing at `docs/europe_scope.md` and the helper module. Verified by smoke test: `INSERT ... country = 'IL'` fails, `INSERT ... country = 'DE'` succeeds.
3. **View-time filter** — `v_european_companies` in [analysis/views.sql](../analysis/views.sql) inner-joined into `v_events`. Belt-and-braces if the triggers are ever disabled for a raw-SQL bulk import. Now thin (just a WHERE) because aliases are canonicalised in place; pre-Sprint-14 it carried a full CASE-expression alias map.

**Destructive corpus clean-up**: BEGIN TRANSACTION; `UPDATE` 98 alias rows (EL→GR etc.); `DELETE` 1,639 out-of-scope companies + 2,527 events + 3,834 `classify_audit` rows; COMMIT. Pre-Sprint-14 DB backed up at `/tmp/eit_data_backup/db.sqlite.pre-europe-scope.bak` before the transaction ran.

**Sanity check**: added "DQ: Europe scope integrity" to [ETL/load/qa/sanity_check.py](../ETL/load/qa/sanity_check.py). Three checks (out-of-scope rows, lingering aliases, both triggers installed). All three must be 0. Run after every loader.

**Smoke-test note (lesson learned)**: my first trigger test ran `INSERT ... canonical_name = 'TEST IN-SCOPE'` then `DELETE WHERE canonical_name LIKE 'TEST %'`, which matched a real Austrian Horizon company called "TEST FUCHS" (id 10277) and clobbered it. Restored from backup. **Don't use `LIKE` patterns to clean up smoke-test rows; delete by exact id**.

**Corpus delta**: 21,689 → 20,050 companies; 58,628 → 56,101 events; €76.9B → €76.2B; 53 → 40 countries. Capital impact under 1% because dropped companies are mostly Horizon co-funded participants with sub-€1M tickets.

**Cost of expansion**: adding a country requires editing three files (the JSON, the trigger string-literal in `schema.sql`, the WHERE in `views.sql`) plus re-installing the trigger on the live DB and re-scraping any extractor whose source carries the newly-in-scope country. Runbook in `europe_scope.md`'s "When to revise the scope" section.

**Map**: world-110m doesn't include Malta, Liechtenstein, or Kosovo (below resolution threshold). Decision was to add labelled dot markers for them via `MARKER_COUNTRIES` in [europe-map.tsx](../site/components/europe-map.tsx) rather than upgrade to world-50m (still misses LI/XK) or drop Malta from scope (politically odd for an EU member). The "40 countries" KPI is the in-scope count, not the rendered-shape count.

### Front-end work in the same session

- **Home-page instrument-taxonomy network** (`site/components/taxonomy-network.tsx`): fixed-cluster force-directed network linking the 9 EU instruments, 10 NDB / state agencies, and 3 private-capital placeholders. Bands fixed (EU top, NDB middle, private bottom); circle size = total EUR observed in corpus, sqrt-scaled; solid edges = shared portfolio companies, dashed = same dominant sector, dotted = expected handoff channel to private capital. Considerations note explains NDB equity-ticket gaps (most NDBs render at minimum radius because `equity_amount_eur` is NULL on `htgf_equity`, `almi_invest_equity`, etc.). Data builder: [scripts/build_taxonomy_network.py](../scripts/build_taxonomy_network.py).
- **Tooltip flip** for both the network and the Europe map. Earlier version anchored to the parent container which included the legend and notes, so bottom-row nodes pushed the tooltip into the legend area. Wrapped each SVG in its own `relative` container; flipY now triggers above ~32% of canvas height so middle and bottom nodes anchor the box above the node.
- **Europe-map tooltip** now carries two pies side-by-side (by instrument + by sector) and a narrative line e.g. "Germany ranks 2nd by company count, 1st by € committed (of 40). Portfolio is primarily cleantech and deep tech (64% combined). Mostly via Horizon EU." Rank ordinals, dominant-sector share, and dominant family derived from `narrative` + `bySector` fields added to country_map.json.

## Day 15 — 2026-05-26 — Sprint 13: Tier 1 NDB load (8 of 8 workstreams — full coverage)

**Scope**: Add the national strategic deployment layer — direct equity + strategic R&D grants from NDBs and R&D agencies across the 8 largest EU economies + Nordics. **All 8 workstreams (A-H) now have data in the DB.** Five have company-level coverage; three (Bpifrance, Enterprise Ireland, SPRIND) are at program/fund-vehicle level pending future enrichment.

**DB delta** (final, all 8 workstreams loaded): 19,261 → 21,689 companies (+2,428 net new, after dedup); 55,166 → 58,628 events (+3,462).

### Workstream 0 — foundation (all complete)

Workstream 0.1-0.4 (companies-only champion view + q02 variants + `/02-champions` toggle) were already done in a prior session. Verified intact.

Workstream 0.5 — schema migration added three columns to `public_funding_events`:
- `ipcei_linked INTEGER DEFAULT 0` (+ partial index on =1)
- `eif_lp_backed INTEGER DEFAULT 0`
- `deployment_country TEXT` (+ index)

Workstream 0.6 — `ETL/lib/ndb_helpers.py` houses `match_ipcei_linked`, `backfill_ipcei_linked`, `mark_eif_backed`, and `normalise_ticket` (ECB annual reference rates for SEK/CZK/PLN/DKK 2021-2026). Self-tested clean.

### Workstream loads — 8 of 8

| Workstream | Institution | Source | Events | Matched against EU corpus | Notes |
|---|---|---|---:|---:|---|
| A | **Bpifrance (FR)** | `bpifrance_fond` | 10 | 0 | **Fund-vehicle placeholder level.** Site Cloudflare-blocked; TAM EU-Login-gated. 10 fund vehicles from Le Hub. |
| B | KfW Capital — HTGF (DE) | `htgf_equity` | **857** | **349 exact + 4 fuzzy** | WP REST API. Sector taxonomy via WP `class_list` `branchen22-*`. **4 IPCEI overlaps** — first NDB hits. |
| B | KfW Capital — Coparion (DE) | `coparion_equity` | 52 | 9 exact + 1 fuzzy | Static HTML modals, names + websites. |
| B | **SPRIND (DE)** | `sprind_challenge` | 20 | 0 | **Program-level placeholders.** Challenge pages list project codenames not legal entities. |
| C | CDP VC (IT) | `cdp_vc_equity` + `cdp_vc_fof` | 199 | 8 exact + 16 fuzzy | 152 direct + 47 FoF. `eif_lp_backed=1` set per EIF policy. |
| D | Invest-NL (NL) | `invest_nl_equity` + `invest_nl_fof` | 13 | 0 | 6 direct + 7 FoF. Dutch verb-based name parser. |
| E | CDTI (ES) | `cdti_{programme}_{year}` × 10 programmes | **1,880** | **565 exact + 33 fuzzy** | **Loaded via BDNS API workaround.** €1.04B total state aid. 142 loan + 1,738 grant rows. |
| F | **Enterprise Ireland (IE)** | `enterprise_ireland_{hpsu,seed,ip,rd,cf,dtif}` | 6 | 0 | **Program-level placeholders.** JS-rendered site; no machine-readable HPSU client list. |
| G | Business Finland (FI) | (not loaded) | 0 | — | Sub-workstream; deferred. |
| G | Tesi (FI) | `tesi_equity` | 102 | 20 exact | Year + sector tags + manager. Pre-2021 vintage kept. |
| H | Vinnova (SE) | (not loaded) | 0 | — | Behind login. |
| H | Saminvest (SE) | (not loaded) | 0 | — | JS-only site. |
| H | Almi Invest (SE) | `almi_invest_equity` | 323 | 28 exact + 1 fuzzy | API at `/api/views/portfolio?root=3650&p=<n>`. |
| **All 8** | | | **3,462** | **988 cross-EU matches** | |

The first four sources serve plain server-rendered HTML to curl. CDTI required discovering and integrating BDNS (Base de Datos Nacional de Subvenciones) — the Spanish national subsidies database, public API at `infosubvenciones.es/bdnstrans/api`. See "BDNS API workaround" sub-section below.

### BDNS API workaround — pattern for CDTI and other ES grant agencies

The block on `cdti.es/datosabiertos` (Imperva bot detection) doesn't matter because every CDTI award must legally be published in BDNS under Ley 38/2003. The same is true for every Spanish public funder — this pattern generalises to ICEX, ENISA, regional agencies (Galicia, Castilla-La Mancha already visible in the raw data).

Discovery path:
1. Frontend SPA is at `infosubvenciones.es/bdnstrans/GE/es/inicio` (Angular) — paths under `/GE/es/api/*` all route back to the Angular shell.
2. Real API base lives at `/bdnstrans/api/*` — discovered from `servidoresApi` array in the SPA's main bundle.
3. Working endpoints: `/api/concesiones/busqueda` (awards), `/api/convocatorias/busqueda` (calls). Both paginated with default `pageSize=50`, accepting `page=N`.
4. Query parameter `vpd=GE&descripcion=CDTI` works as a text filter (`vpd` = "vista por defecto"; required for the General vista). `pageSize` larger than default triggers server timeouts — leave at default.
5. Each concesion row carries: `id`, `codConcesion`, `fechaConcesion`, `beneficiario` ("`<NIF> <name>`"), `nivel3` (órgano), `importe` (nominal), `ayudaEquivalente` (subsidy-equivalent for loans), `instrumento`, `convocatoria` (programme title), `urlBR` (BOE resolution URL).
6. Post-filter to `nivel3 = "CENTRO PARA EL DESARROLLO TECNOLÓGICO Y LA INNOVACIÓN E.P.E"` strips ~4% noise (57 ISCIII rows + 16 Galician Innovation + 4 Lorca) where the convocatoria title incidentally mentions CDTI.

Coverage caveat: BDNS publication of CDTI awards starts 2022 — zero 2021 rows. The plan's 2021-01-01 window is bound by BDNS's compliance backlog, not by our query.

Programme classifier (`PROGRAMME_RULES` in `extract_cdti.py`) maps convocatoria titles to ten source IDs:

| Source family | Events | Total €M | Default sector |
|---|---:|---:|---|
| `cdti_misiones_*` | 540 | 402.5 | deeptech_hardware |
| `cdti_idi_*` (general I+D innovation) | 597 | 305.4 | deeptech_hardware |
| `cdti_neotec_*` (startup grants) | 576 | 174.0 | deeptech_hardware |
| `cdti_cervera_*` (RTO network) | 88 | 108.3 | deeptech_hardware |
| `cdti_perte_aerosalud_*` | 59 | 39.5 | deeptech_hardware |
| `cdti_lic_*` (Línea Directa de Expansión, loans) | 20 | 7.8 | deeptech_hardware |
| **Total CDTI** | **1,880** | **€1,036.9M** | |

Instrument distribution: 1,738 SUBVENCIÓN (basis=`cdti_grant`) + 142 PRÉSTAMO (basis=`cdti_loan`). For loans the loaded `grant_amount_eur` is the `ayudaEquivalente` (subsidy-equivalent at below-market interest), which is the EU-comparable state-aid figure. Filter by `grant_amount_basis` if a strict grants-only view is needed.

### Single most impactful finding

**HTGF surfaced the first IPCEI overlaps.** Across 2,517 NDB rows before HTGF (Invest-NL, Tesi, Almi, CDP VC, CDTI) IPCEI overlap = 0. Adding HTGF's 857 companies surfaced **4 IPCEI overlaps** — companies that received BOTH HTGF early-stage equity AND were partners in an IPCEI consortium. Makes sense: HTGF is Germany's deeptech VC by mandate, and IPCEI Microelectronics / Batteries has strong German industrial-prime participation.

The wider pattern still holds for the **portfolio-scrape NDBs** (Invest-NL, Tesi, Almi, CDP VC) and **CDTI's SME R&D programmes** — those recipient pools (SMEs, scaleups, RTOs) are essentially disjoint from the IPCEI consortium pool (large-corp incumbents). HTGF is the exception because it backs the same early-stage deeptech that later graduates to IPCEI partnerships.

### Cross-instrument champions surfaced by this sprint

Spanish RTOs now dominate the top of the cross-instrument leaderboard thanks to CDTI Cervera + Pillar II + EIC overlap:
- **CSIC** (Spanish national research council) — 23 source families (EIC + EuroHPC + all 5 Pillar II clusters + CDTI IDI)
- **Tecnalia, Eurecat, Vicomtech, CARTIF, CIDETEC, Tekniker** — 12-22 source families each
- **Bedimensional SPA** (IT) — CDP VC + EIC Transition/Pathfinder + EIB + 4 Pillar II clusters
- **IQM Finland Oy** — Tesi + EIC Accelerator + EIB + CL4

### Single most impactful finding

**0 IPCEI overlaps across all 637 NDB rows.** I ran `backfill_ipcei_linked` against all NDB source prefixes and got zero hits. This is analytically meaningful — the NDB recipient pool (SMEs and scaleups: Capalo AI, Onego Bio, 2Hire, Empatica, Qualinx, etc.) is essentially disjoint from the IPCEI consortium pool (large-corp incumbents: STMicro, Renault, BMW, EnBW, etc.). The Sprint 13 plan budgeted for "150-400 events flagged" in this backfill; the right number against the four loaded NDBs is zero, and that's a real signal not a bug. Update aggregate-view methodology to reflect that the IPCEI double-count netting kicks in only for direct-investment NDBs that bet on industrial primes (Bpifrance, CDTI would surface most of these — both blocked this session).

### Workarounds executed beyond CDTI (this push)

| Workaround | Result |
|---|---|
| **HTGF WP REST API** (`/wp-json/wp/v2/portfolio`) | 857 KfW Capital deployment-layer companies with sector taxonomy from WP `class_list`. Full real data. |
| **Coparion static HTML modals** | 52 KfW Capital co-deployment companies. Names + websites; no amounts. |
| **SPRIND `/taten/challenges` listing** | 20 challenge programs loaded as program-level placeholders (`entity_type='other'`). Per-team legal-entity resolution requires Bundesanzeiger PDF parse. |
| **Bpifrance `lehub.bpifrance.fr/fonds-et-participations/`** | 10 fund vehicles loaded as program-level placeholders. Full Bpifrance.fr portfolio remains Cloudflare-gated. |
| **Enterprise Ireland known programmes** | 6 funding-programme placeholders. No public per-beneficiary list. |

### Still future-session work — biggest unlocks

1. **EU State Aid Transparency Award Module (TAM)** at `webgate.ec.europa.eu/competition/transparency` — the single biggest unlock for the program-level placeholders. By EU law (Reg 651/2014 Art 9 / GBER), every grant >€100k must be published here. Coverage spans Bpifrance, KfW grants, SPRIND grants, EI grants, Business Finland, Vinnova, and supplements CDTI. The public form requires JS interaction; the API (`/api/aids/search`) is gated behind EU Login (free account signup). Once authenticated, expect 5,000-15,000+ additional rows across the 8 workstreams.
2. **Bpifrance via Playwright stealth** — defeats Cloudflare on `bpifrance.fr/nos-pratiques-d-investissement/notre-portefeuille`. Estimated 400-800 direct portfolio companies if successful.
3. **Enterprise Ireland annual report PDF** — typically lists HPSU clients per year. IF fiche pattern applies.
4. **Vinnova GDP / GDPHub API** at `gdphub.se` — requires account, then bulk-export of funded projects.
5. **Business Finland programme catalogue** — multi-call scrape; per-programme award lists. Lower ROI than TAM.
6. **Saminvest annual report PDF** — small portfolio (~30-50 LPs).
7. **SPRIND legal-entity resolution** — Bundesanzeiger Zuwendungsbescheide or SPRIND annual report PDF.

### Coverage delta vs plan

Plan estimated ~3,700-6,380 new events. Delivered **3,462** (about 54-94% of plan range). HTGF (857) + CDTI (1,880) drove most of the volume. Of the program-level placeholder loads (Bpifrance 10, SPRIND 20, EI 6), the population they REPRESENT is 100x larger — the TAM workaround in a future session is expected to bring 5,000-15,000+ additional rows that map to those institutions.

### Files added

- `ETL/lib/ndb_helpers.py` — IPCEI linkage backfill, EIF flag, FX normalisation
- `ETL/extract/extract_invest_nl.py`, `extract_tesi.py`, `extract_almi_invest.py`, `extract_cdp_vc.py` — production extractors (company-level)
- `ETL/extract/extract_cdti.py` — production extractor (BDNS API; 1,880 events loaded)
- `ETL/extract/extract_htgf.py` — production extractor (WP REST API; 857 events loaded)
- `ETL/extract/extract_coparion.py` — production extractor (52 events loaded)
- `ETL/extract/extract_sprind.py` — program-level (20 challenge placeholders loaded; per-team resolution pending)
- `ETL/extract/extract_bpifrance.py` — program-level (10 fund-vehicle placeholders; portfolio gated)
- `ETL/extract/extract_enterprise_ireland.py` — program-level (6 funding-programme placeholders)
- `docs/sprint13_ndb_status.md` — per-institution status table
- `docs/cdti_discovery_notes.md` — historical Imperva-blocker record + BDNS path executed
- `data/raw/{invest_nl,tesi,almi_invest,cdp_vc,sprind,htgf,coparion}/` — cached source HTML/JSON
- `data/raw/cdti/pages/page_{0..39}.json` — BDNS API page cache (~2MB)
- `data/raw/htgf/page_{1..11}.json` — WP REST API page cache (~10MB)

### Files modified

- `ETL/load/schema.sql` — 3 new columns + 2 indexes documented
- `ETL/transform/classify.py` — imports the 5 new `*_SOURCE_SECTOR` dicts and uses them in the source-fallback chain
- `analysis/views.sql` — unchanged this session (the planned `v_company_funding_layers`, `v_ndb_ipcei_overlap`, `v_strategic_resilience_index` deferred)
- `site/app/02-champions/page.tsx` — unchanged (companies-only toggle already in place from a prior session)
- `site/app/national/page.tsx` — NOT added (planned future-session work)

DB backups: `db.sqlite.backup_pre_sprint13` (start of session), `db.sqlite.backup_pre_cdti_bdns` (immediately before CDTI BDNS load), `db.sqlite.backup_pre_8of8` (immediately before HTGF+Coparion+SPRIND+Bpifrance+EI load).

**Known regression in sanity-check DQ metric**: `companies with NULL sector_inferred_updated_at` rose from 1 → 1,971 across this sprint. Not a bug introduced by NDB code — it's a pre-existing pattern in classify.py: companies inserted with an initial `sector_inferred` value (which the NDB extractors do, using the source-level sector hint) bypass the classifier's timestamp setter, which only stamps on *flips* or *first-time assignments*. Treat the metric as "fraction of companies whose sector was set at extractor insert time and never re-evaluated by classify" — large but not load-blocking. Fix queued (one-line stamp on initial-set, or one-off backfill query).

**Bug fixed mid-sprint**: the three placeholder extractors (`extract_sprind.py`, `extract_bpifrance.py`, `extract_enterprise_ireland.py`) originally inserted a new `companies` row on every `--load-db` run without checking for an existing placeholder, creating 36 orphan duplicates on re-run. Fixed 2026-05-27 by adding an "look up canonical_name+country, reuse if present" guard before the INSERT. The 36 orphan rows from the second run were deleted; idempotency verified clean. The real (per-company) extractors were unaffected — their `match_companies` step already does the lookup.

### Open items entering Sprint 14

- ~~**CDTI via BDNS API**~~ — DONE 2026-05-26.
- ~~**KfW Capital via HTGF + Coparion**~~ — DONE 2026-05-26. 909 companies, 4 IPCEI overlaps.
- ~~**8/8 workstream coverage**~~ — DONE 2026-05-26 (with program-level placeholders for Bpifrance/EI/SPRIND).
- **TAM API via EU Login** — biggest remaining unlock. Expected 5,000-15,000+ rows spanning Bpifrance, EI, SPRIND, BFinland, Vinnova, Saminvest. Requires interactive EU Login signup.
- **Annual-report PDF parses** — EI, Saminvest, Bpifrance, SPRIND.
- **Vinnova GDP / Business Finland programme scrape** — Sprint 14 secondary.
- **The 3 planned analysis views** (`v_company_funding_layers`, `v_ndb_ipcei_overlap`, `v_strategic_resilience_index`) + **`/national` site page** — deferred to Sprint 14.
- **`sector_inferred_updated_at` DQ regression** — fix queued (one-line stamp at extractor insert time).

## Day 13 — 2026-05-25 — Sprint 11: Tier 2 coverage + CORDIS open-data adoption

**Scope**: Add CHP / IHI JU / EuroHPC JU as new sources; refresh Chips JU + IF + EDF + EIB; backfill thin EIT sources.

**DB delta**: 3,561 → 3,633 companies (+72); 5,484 → 5,733 events (+249).

### Single most impactful decision

**Discovering CORDIS publishes the full Horizon Europe project database as a 32MB ZIP dump** (`cordis-HORIZONprojects-csv.zip`). After Sprint 10 left CHP/IHI/EuroHPC as deferred/dead-end items requiring custom scrapers, the open-data dump made all three trivial: one unified extractor (`ETL/extract/extract_cordis.py`) filtering by topic-code prefix handled all three plus a KDT supplement that closed the Sprint 5 KDT-2023 gap. This is now the canonical path for any future Horizon partnership work.

### Workstream A/B/C — CHP + IHI + EuroHPC (CORDIS open-data)

| Family | Events | Grant total | New companies |
|---|---:|---:|---:|
| CHP (HORIZON-JTI-CLEANH2 + HORIZON-JU-CLEANH2) | 142 | €894.8M | 49 |
| IHI JU (HORIZON-JU-IHI) | 56 | €708.1M | 17 |
| EuroHPC JU R&I (HORIZON-EUROHPC) | 22 | €215.9M | 1 |
| **Total A/B/C** | **220** | **€1,818.8M** | **67** |

Heavy coordinator overlap with existing EIC/Chips JU rows — research orgs like CEA, SINTEF, Fraunhofer, ULB are already in the DB. The 5-tier matcher caught most via prefix/reverse-prefix/fuzzy.

### Workstream E — Refresh (idempotent re-runs of existing extractors)

| Source | Before | After | Delta |
|---|---:|---:|---:|
| `chips_ju_kdt_2023` (OData) | 4 events | 4 events | 0 — portal still incomplete |
| `chips_ju_kdt_2023` (incl. CORDIS supplement) | 4 | 23 | +19 — gap closed via KDT supplement workstream |
| Chips Act 2024+ era | 0 | 0 — portal `shv_jueratype` enum still only KDT (920810000) and ECSEL (920810001) |
| Innovation Fund | 246 | 246 | 0 — 7 NULL fiches still unpublished; IF25 still in "Invited to GA prep" (CINEA: final awards Q4 2026) |
| EDF 2025 (second-pass with `--sleep=15`) | 55 | 59 | +4 events, +€55M |
| EIB venture-debt incremental | 153 | 153 | 0 — EIB API returned 504; cache restored, skip |

### Workstream D — EIT thin-source backfill

| Target | Outcome |
|---|---|
| EIT InnoEnergy 2024 (14 portfolio additions) | Public sources name only Geolinks + Repono (already loaded). Other 12 not publicly disclosed. |
| EIT InnoEnergy full portfolio (200+) | innoenergy.com/for-innovators/portfolio/ requires JS rendering. Crunchbase 403'd. Needs Playwright for next attempt. |
| EIT RawMaterials portfolio | eitrawmaterials.eu portfolio URLs all returned 404. Press releases don't list cohort names. Needs alternative source. |
| EIT Health Catapult Ed 5 (2020–21) | No public winners list located. Left as 0-row source. |

D yielded no new events. Documented as a residual gap; the engineering option (Playwright headless scraper) deferred.

### Data quality fixes

1. **4 orphan companies** surfaced during KDT supplement load — ETHNICON METSOVION POLYTECHNION, ELLINIKO MESOGEIAKO PANEPISTIMIO, X FAB FRANCE, STMICROELECTRONICS FRANCE. Same root cause as Sprint 3 (extractor creates company row, then event gets dedup'd at `(source, call_id)` level, leaving orphan). Deleted directly. Follow-up: the extractor should check event dedup BEFORE inserting company; refactor planned for a future architecture sprint.
2. **TRISTAN project row had `chips_ju_kdt_unknown` source** — its topic code is `HORIZON-KDT-JU-1-IA-Focus-Topic-1` (no year embedded). Fixed manually to `chips_ju_kdt_2022` based on project_started 2022-12-01.
3. **HYDROGEN ONSITE merge** — HYDROGEN ONSITE SL (EIC) and HYDROGEN ONSITE (CHP) were the same company with different normalizations. Merged via direct SQL: events repointed, duplicate company row deleted.

### Files added/modified

- `ETL/extract/extract_cordis.py` — **New**: unified CORDIS open-data extractor (CHP / IHI / EuroHPC / KDT supplement). Adding a new partnership requires only updating the `FAMILIES` dict.
- `data/raw/cordis/` — **New**: project.csv, organization.csv, topics.csv, etc. (extracted from cordis-HORIZONprojects-csv.zip)
- `ETL/transform/classify.py` — Replaced CHP stub import with real `extract_cordis` imports; added IHI / EuroHPC source-sector lookups
- `docs/methodology.md` — Source coverage table, HE coverage table, decision log entry
- `docs/notes.md` — This entry

### DB backup

`db_backups/db.sqlite.backup_pre_sprint11`

### Open follow-ups

1. **EIT thin sources** — InnoEnergy full portfolio + RawMaterials require Playwright. Worth ~100–150 more companies. Stays open for future sprint.
2. **Innovation Fund NULL fiches** — 7 events with NULL grant. Refresh when fiches published.
3. **Innovation Fund IF25** — CINEA expects final awards Q4 2026. Re-run after that.
4. **Chips JU Chips Act–era calls** — Re-check OData when `shv_jueratype` enum changes.
5. **EIB extractor refresh** — needs work to handle 504 from `/page-provider/projects/list`.
6. **Extractor architectural fix** — pre-check event dedup before company insert, to prevent orphan rows. Same risk surfaced in Sprint 3 (EIB) and Sprint 11 (KDT supplement).

---

## Day 12 — 2026-05-25 — Sprint 10: Tier 1 coverage completion

**Scope**: Close three remaining Tier 1 data gaps: six missing EIT KICs, Eurostars, Clean Hydrogen Partnership. Formalise Tier 2/3 coverage boundaries in methodology.md.

**DB delta after backfill (2026-05-25)**: 3,101 → 3,561 companies (+460); 4,969 → 5,484 events (+515).

### Sprint 10 backfill (post-user-pushback)

Initial Sprint 10 load came in at 231 new companies — bottom of the 200–670 expected range — because (a) Eurostars + CHP were dead-ended on first pass and (b) several KIC portfolios were thinly mined. User pushed back; backfill executed same day:

| Source | Initial | After backfill |
|---|---:|---:|
| Urban Mobility | 23 events (A-D only, JS-limited portfolio) | 23 + 62 + 86 + 63 = 234 events across 4 sources |
| Climate-KIC | 22 (CDR boot camp 2022 only) | 22 + 22 + 16 + 12 = 72 events across 4 programmes |
| InnoEnergy | 38 (Highway 2021–23) | 38 + 2 = 40 (2024 partial — only 2 of 14 publicly named) |
| CHP | dead end | Reclassified to Sprint 11 deferred after confirming CORDIS topic-code path |

Sources added in backfill:
- `eit_urban_mobility_2022` (62 startups across 5 accelerator programmes)
- `eit_urban_mobility_2023` (86 startups across 8 accelerator programmes)
- `eit_urban_mobility_2024` (63 startups across 6 programmes)
- `eit_climate_kic_cdr_2023` (CDR ClimAccelerator 22 startups)
- `eit_climate_kic_asa_2024` (Amazon Sustainability Accelerator 16 startups)
- `eit_climate_kic_clean_cities_spain_2024` (12 startups)
- `eit_innoenergy_highway_2024` (2 named additions of 14 disclosed)

### Original load delta (pre-backfill, for reference)

**Initial DB delta**: 3,101 → 3,332 companies (+231); 4,969 → 5,228 events (+259).

### Workstream A — 6 EIT KICs (COMPLETED)

Extended `ETL/extract/extract_eit.py` with six new KIC sources across 25 programme×year combinations:

| KIC | Sources added | Events |
|---|---|---:|
| EIT InnoEnergy | `eit_innoenergy_highway_2021/22/23` | 38 |
| EIT Health | `eit_health_catapult_2021/22/23/24/25` | 105 |
| EIT Climate-KIC | `eit_climate_kic_cdr_2022` | 22 |
| EIT Urban Mobility | `eit_urban_mobility_portfolio` | 23 |
| EIT RawMaterials | `eit_rawmaterials_portfolio` | 8 |
| EIT Food | `eit_food_rfs_2021/22/23/24/25` | 63 |

**Grant amount basis**: `eit_kic_equity` for InnoEnergy Highway and Urban Mobility portfolio; `eit_kic_grant` for Health Catapult winners (cash prizes); `eit_kic_support` for all acceleration/cohort programmes.

**EIT Health Catapult edition mapping**: Edition 6 = 2022 cycle (42 semi-finalists), Edition 7 = 2023, Edition 8 = 2024 (30 semi-finalists), Edition 9 = 2025 (29 semi-finalists). Edition 5 (2020-21) had no accessible public data; left as empty source.

**EIT Urban Mobility caveats**: portfolio page uses JavaScript alpha-filter; WebFetch always returned A-D section only (23 companies visible). Full portfolio likely larger.

**EIT Climate-KIC note**: CDR boot camp October 2022; country not determinable for most companies from public lists (country="" for 15 of 22 entries).

### Workstream B — Eurostars (DEAD END)

Attempted three sources per plan:
1. `eurostars-eureka.eu/projects` — returned HTTP 403 Forbidden (authentication wall).
2. `eurekanetwork.org/data` — EUREKA open data portal has no downloadable CSV for project-level beneficiary data.
3. CORDIS API `?programme=EUROSTARS` — 0 results. Eurostars is administered by EUREKA network, not CORDIS; the programme does not appear in the CORDIS result database.

**Decision**: Skip per plan rule (fewer than ~10 companies accessible from any source). Stub import added to `classify.py` for future enrichment if EUREKA publishes open data.

### Workstream C — Clean Hydrogen Partnership (DEAD END)

Attempted three sources per plan:
1. `clean-hydrogen.europa.eu/projects-dashboard` — returned HTTP 404.
2. CORDIS API filtered by JU hydrogen programme codes — 0 results.
3. Alternative CHP project pages — website restructured; no accessible project repository found.

**Decision**: Skip per plan rule. Stub import added to `classify.py`. CHP data may become accessible via CORDIS when the JU publishes project metadata.

### Workstream D — Methodology (COMPLETED)

Updated `docs/methodology.md`:
- Source coverage table: EIT KIC row updated to ✅ all 8 KICs loaded; Eurostars and CHP marked ❌ Dead end.
- Added Tier 2 (known gaps, lower direct-funding signal) section.
- Added Tier 3 / scope principle (direct investments only).
- Decision log entry added.

### Files modified

- `ETL/extract/extract_eit.py` — Extended with 6 new KIC sources, sector mappings, 15 company list constants, `_build_events` basis logic, `_ALL_RAW_EVENTS` aggregation
- `ETL/transform/classify.py` — Added try/except stubs for `EUROSTARS_SOURCE_SECTOR` and `CHP_SOURCE_SECTOR`
- `docs/methodology.md` — Coverage tables, Tier 2/3 sections, decision log
- `docs/notes.md` — This entry

### DB backup

`db_backups/db.sqlite.backup_pre_sprint10` (created at sprint start, baseline 3,101 / 4,969).

---

## Day 11 — 2026-05-23 — Sprint 9: EDA + findings site

**Scope**: Read-only exploratory pass over the 3,101-company corpus. No DB writes, no new data extraction, no private-side enrichment, no deployment.

### What was built

**Analysis layer** (`analysis/`):
- `views.sql` — 3 idempotent SQL views: `v_events` (source-family normalization + `event_year` coalesced), `v_company_breadth` (per-company Gini inputs), `v_country_sector_family` (cross-tab for heatmap)
- `helpers.py` — shared utilities: `db()`, `df()`, `to_json()`, `save_table()`, `SECTOR_PALETTE`, `COUNTRY_POPULATION_M`
- `run.py` — orchestrator that runs `run_q01()` through `run_q08()` + `run_synthesis()`
- `queries/` — 15 SQL files
- `findings/q01.md` through `q08.md` + `findings/synthesis.md`

**Site** (`site/`):
- Next.js 16.2.6, Tailwind v4, Recharts 3.8.1, App Router, static export
- 15 routes: `/`, `/01-corpus` through `/08-gaps`, `/synthesis`, `/methodology`, `/limitations`
- All 15 pages prerender cleanly to `site/out/` via `npm run build`

### Per-analysis findings summary

| Analysis | Key finding |
|---|---|
| Q1 Corpus | 3,101 companies, 4,969 events, €54.2B committed across 7 instruments; EIC alone covers 70.6% of companies |
| Q2 Champions | 84 multi-instrument companies; CEA/Lynred/SINTEF each span 3 families; THALES top by capital (€449M across 2 families) |
| Q3 Country×Sector | FR/DE/NL top by volume; cleantech dominated by Nordic and southern EU; defense by FR/DE/ES |
| Q4 Concentration | EIT most concentrated (Gini=0.88, top decile 82%); EIC most egalitarian (Gini=0.49); EIB no grant data (NULL) |
| Q5 STEP cohort | EIC leads adoption (75.7%); EDF second (63%); IPCEI lowest (3.7%) — state-aid logic outside STEP mechanism |
| Q6 Time dynamics | Growth 2021→2024 driven by EIC; 317 IPCEI events have NULL `event_year` — absent from chart by design; 2025 partial |
| Q7 Co-funding network | 84 companies bridge ≥2 families; EIC↔EDF and EIC↔EIB are the most common co-funding pairs |
| Q8 Gaps | IS/EE/LU/FI/DK top per-capita; IT/ES/BG under-represented vs. population; €5.2B gap for all-zero countries |

### Gate B2 correction

Sprint 9 analysis discovered that methodology.md limitation #8 ("THALES 9 sources, CEA 8, Airbus 7") counted raw source IDs (e.g. `edf_ra_2021` as a separate source from `edf_da_2021`), not the 7 canonical source families. Correct post-normalization figures:
- **Top by families**: CEA FR (3: eic+chips_ju+edf), Lynred FR (3: ipcei+chips_ju+edf), SINTEF NO (3: eic+chips_ju+edf)
- **Top by committed capital**: THALES FR (2 families: eic+edf, 30 events, €449M)
- **Champion count**: 84 (not 81 — Sprint 8 B6 ran with 143/276 EDF events; full 276-event load adds 3 more cross-instrument companies)

Corrected in methodology.md #8 and Decision log.

### Gate scorecard

| Gate | Result |
|---|---|
| 9 JSON files in `site/public/data/` | ✓ |
| `npm run build` exits 0 | ✓ (all 15 routes static) |
| DB unchanged (no writes) | ✓ |
| Synthesis memo written | ✓ |
| methodology.md Gate B2 claim corrected | ✓ |

### Known issues / follow-ups

- **Barrel import bug fixed during build**: Next.js 16 + Turbopack resolves client components imported via a barrel that mixes server components as `undefined`. Fixed by replacing all `from "@/components"` barrel imports with direct per-file imports across all 17 files.
- **EIT Gini anomaly (0.88)**: EIT has only 96 companies, all with `grant_amount_eur = NULL` (eit_kic_support / eit_kic_equity basis). Gini is computed over event count not capital — 8 companies hold 8+ events each while most have 1. This reflects the investments portfolio companies (multiple BoostUp + investment events) vs. single-event Champions companies.
- **IPCEI NULL dates**: All 317 IPCEI events have NULL `event_year`. Correctly absent from all time-series charts. Flagged in Q6 findings and the reconciliation JSON (`eventsPre2020OrNull: 317`).

### Files added (Sprint 9)

- `analysis/views.sql`, `analysis/helpers.py`, `analysis/run.py`
- `analysis/queries/` — 15 SQL files
- `analysis/findings/` — 9 markdown files (q01–q08 + synthesis)
- `site/` — full Next.js project (built, not deployed)
- `site/public/data/` — 9 JSON output files

---

## Day 1 (2026-05-20): EIC load complete

### What's in the DB

- **2,189 unique companies** (deduplicated by PIC, the EU's stable identifier)
- **3,843 funding events** loaded across three EIC programmes
- **712 EIC Accelerator coordinator events** — this is the core startup universe
- Coverage 2021–2025, with 2025 partial (only 41 Accelerator coordinators so far — call cycle still in progress)
- **157 rows skipped** (~4%) due to malformed multi-line summaries with embedded unescaped quotes. Acceptable for v1, noted as known limitation.

### Top-line numbers worth remembering

- EIC Accelerator total grant 2021–2025: **€1.63B** across 712 coordinator projects
- Median Accelerator grant: ~€2.5M (at the programme cap, as expected)
- EIC Pathfinder total grant: **€1.47B** across 443 coordinator projects (smaller per-project, more participants per consortium)
- EIC Transition total grant: **€490M** across 208 coordinator projects

### Country distribution (Accelerator coordinators)

DE (110), FR (107), NL (78), ES (58), SE (48), IL (46), FI (37), IE (28), DK (28), BE (27), IT (26)

**Note**: Israel is funded as a Horizon-associated country and is well-represented. UK appears with only 10 — much lower than its actual share, because UK lost Horizon access mid-2023 and only rejoined for some programmes. Will need a footnote in the brief about UK eligibility windows.

### Notable signal: multi-programme winners

Four companies appear in all three EIC programmes (Pathfinder → Transition → Accelerator):
- Cherry Biotech (FR)
- Inbrain Neuroelectronics (ES)
- Quantware (NL)
- Semiqon Technologies (FI)

These are the "EU deep-tech graduation pipeline" success stories — research → translation → commercial. Worth a sidebar in the brief: how many companies actually traverse the full EIC funnel, and how does follow-on funding differ for them vs. one-shot Accelerator winners?

### Known data limitations

1. **No equity amounts.** EIC Accelerator equity tickets (up to €10M from the EIC Fund) are reported separately, not in this export. Grant-only for v1. **Action**: pull the EIC Fund portfolio list separately later; for now, flag in methodology.
2. **157 rows skipped** in parsing. Mostly long Pathfinder summaries. Will retry with manual fixup if v2 needs the missing records.
3. **2025 partial**. Call cycle still running — final 2025 numbers won't be available until early 2026. Frame the brief as 2021–2024 with 2025 noted as partial.
4. **Sector field is unstructured** (free-text comma-separated, e.g. "Medical Technologies, Non-invasive Medical Devices"). Will need LLM-assisted classification to map onto a normalized sector taxonomy.

### Schema decisions made

- One `companies` row per unique PIC. Companies appearing across multiple programmes get one row + multiple events.
- All three programmes loaded but tagged via `source` field. The Accelerator-coordinator subset is the v1 primary analysis universe.
- `entity_type` left as "unknown" for now — will populate during enrichment phase using LLM classification on name + description (universities and research orgs vs. startups vs. corporates).

### Decisions for Day 2

- IPCEI extraction from Commission state aid decisions (7 PDFs, ~100 named participants)
- Continue using PIC as canonical company ID across all EU sources where available
- Start drafting the sector taxonomy mapping (do this once, use it across all sources)

## Day 2 (2026-05-20): Sector taxonomy + classification

### Decided

- Six-label sector taxonomy with use-domain-over-technology priority. Full definition and overlap rules in [methodology.md](methodology.md).
- Methodology promoted to a living reference doc; new decisions extend it rather than spawning new files.

### Built

- [classify.py](classify.py): deterministic classifier over `sector_tags_raw` with keyword fallback for the 31 tag-empty rows. Entity-type heuristics for research orgs + Accelerator coordinators.
- All 2,189 companies now have `sector_inferred` and `entity_type` populated.

### Distribution

Sector (across the full 2,189 universe):
- life_sciences: 1011 (46%)
- cleantech: 506 (23%)
- deeptech_hardware: 396 (18%)
- space: 146 (7%)
- digital: 94 (4%)
- other: 36 (2%)

EIC Accelerator coordinators (the "startup universe"): 299 life_sciences, 181 cleantech, 112 deeptech, 69 digital, 28 space, 23 other. Mean grant ~€2.3–2.4M across all sectors (at the programme cap, as expected).

Entity type: 707 startup (Accelerator coordinators), 361 research_org (name-pattern match), 1,121 unknown (mostly Pathfinder/Transition participants needing LLM refinement).

### Entity-type pass (later same day)

Decided to use a 3-bucket scheme (`research_org` / `company` / `other`) for v1 instead of granular startup/SME/large_corp — the granular split needs Dealroom or EU registry lookup anyway, and that's a Day 3+ task.

Expanded heuristics in [classify.py](classify.py) with broad multilingual coverage:
- Research stems for English, Spanish/Portuguese, German, Italian, Nordic, Polish, Slovak, Czech, Greek, Hungarian, Icelandic, Finnish
- Corporate legal-form suffixes for 15+ jurisdictions (GmbH/SAS/SRL/SL/Ltd/AB/Oy/UAB/SRO/sp z o.o./Kft, etc.)
- Hospitals, foundations, ERIC infrastructure consortia, Belgian VZW non-profits

Final entity_type: **1,374 company (63%), 585 research_org (27%), 9 other (public bodies, 0.4%), 221 unknown (10%)**.

The 221 unknowns are almost all companies that don't carry a legal-form suffix in their canonical name (e.g. EDF, PASQAL, POIETIS, IMAGENE) — we'll resolve these in the enrichment phase via PIC lookup against the EU Funding & Tenders Portal or Dealroom matching.

### Open for Day 3

- Granular `company` split (startup / SME / large_corp) via Dealroom or EU registry lookup
- IPCEI extraction from the 11 Commission state-aid PDFs ← **completed Day 3**
- Start matching to Dealroom / Crunchbase to enable private-funding event enrichment

## Day 3 — IPCEI extraction (2026-05-20)

Extracted direct-partner data from all 11 IPCEI Commission decision PDFs.

### Numbers

| IPCEI | Funding rows | Aid extracted | vs. press release |
|---|---|---|---|
| Microelectronics 2018 | 27 | redacted | €1.75bn |
| Batteries 2019 | 23 | redacted | €3.2bn |
| EuBatIn 2021 | 40 | redacted | €2.9bn |
| Hy2Tech 2022 | 41 | €5.42bn | €5.4bn ✓ |
| Hy2Use 2022 | 31 | €5.12bn | €5.2bn ✓ |
| MECT 2023 | 68 | €8.13bn | €8.1bn ✓ |
| Cloud 2023 | 19 | €0.75bn | €1.2bn (6 redacted) |
| Hy2Infra 2024 | 31 | €5.21bn | €6.9bn (1 redacted) |
| Hy2Move 2024 | 13 | €1.44bn | €1.4bn ✓ |
| Med4Cure 2024 | 14 | €0.82bn | €1.0bn (5 redacted) |
| Tech4Cure 2025 | 10 | €0.40bn | ~€1.0bn |
| **Total** | **317** | | |

**302 distinct companies**; 7 matched to existing EIC records (exact); 295 new IPCEI-only companies.

Multi-instrument winners found: CORTEC GMBH (EIC + IPCEI Micro), BASF SE (EIC + Batteries), CORWAVE/FINEHEART/POWERFUL MEDICAL (EIC + Tech4Cure), REPSOL/SOLAR FOODS (EIC + Hy2Use).

### Methodology note

"Direct partners" in Commission press releases = distinct companies. Our DB stores one row per (company, member-state) funding event, so row counts exceed company counts for IPCEIs where the same company holds grants in multiple countries (e.g. Solvay in BE+FR+IT = 3 rows, 1 company). Primary validation signal is the **aid sum**, not the row count — see the flagged callout in methodology.md.

Legacy programs (Micro 2018, Batteries 2019, EuBatIn 2021) have fully redacted amounts in the PDFs. The `aid_amount_eur` field is NULL for these rows; `aid_amount_raw` retains the original cell text.

### Open for Day 4

- Granular `company` split (startup / SME / large_corp) via Dealroom or EU registry lookup
- EIB venture/growth extraction
- Chips JU extraction
- Dealroom/Crunchbase matching for private-funding event enrichment
- Identify the redacted Hy2Infra anchor partner manually (~€1.7bn unaccounted)

### Files

- `data/raw/eic_datahub_export_20260520.csv` — original EIC export
- `data/raw/ipcei/*.pdf` — 11 Commission state-aid decisions
- `data/processed/ipcei_partners.csv` — extraction checkpoint
- `data/processed/ipcei_match_summary.csv` — IPCEI↔EIC dedup audit
- `schema.sql`, `load_eic.py`, `extract_ipcei.py`, `classify.py`, `sanity_check.py`
- `db.sqlite` — built database (2,484 companies)

## Day 4 (2026-05-20): EIB venture-debt load

EIB direct venture-debt and growth-finance loans loaded as `source='eib_venture'`.

### Numbers

| Metric | Value |
|---|---|
| EIB events loaded | 153 |
| Distinct borrowers | 151 |
| New companies inserted | 135 |
| Matched to existing EIC/IPCEI companies | 16 |
| Total debt_amount_eur | €3,590M |
| Total companies in DB (post-load) | 2,619 |

### Discovery methodology

EIB does not publish a dedicated "venture debt portfolio" CSV. Projects were identified from the full `/page-provider/projects/list` API dump (~17k projects) by pattern-matching project titles against instrument suffixes: `(EGF VD)`, `(IEU LS)`, `(IEU TI)`, `(IEU FT)`, `(IEU GT/GT2/GT3)`, `(IEU SIW)`, `IDGF`, `TECHEU VD`, `TECHEU SCALE UP`. After filtering out programme-level entries, lending envelopes, co-investment vehicles (EGF VDC), and multi-country codes (C7), 153 signed/approved project IDs for 2021–2026 were identified.

Borrower names were scraped from individual EIB project detail pages (the "Promoter – financial intermediary" HTML field) using rate-limited `curl` subprocess (1 req/sec) to avoid EIB bot-protection. All 153 pages resolved successfully.

### Instrument structure note

EGF VD loans (2021–2022) and InvestEU VD loans (2022+) are both stored as `source='eib_venture'`. Distinguishing them at the event level from the title suffix alone is possible but fragile (some newer loans use the EGF framework retroactively), so they are unified under one source label per the sprint plan. The `project_title` field retains the original EIB title with the instrument suffix for traceability.

### Sector classification

EIB's broad sector labels (Energy, Health, Industry, Services, Transport, Telecom) were mapped to EIC-compatible tags in `sector_tags_raw` where unambiguous (Energy → `"Energy"` → `cleantech`; Health → `"Health Biotechnology"` → `life_sciences`; Telecom → `"Data & ICT"` → `digital`). For Industry/Services/Transport (the majority of loans), `sector_tags_raw` is left empty and `classify.py` uses keyword matching on the `project_summary` field (the short EIB project description) to infer the sector. This approach matches the pattern established for EIC tag-empty rows. Zero `unclassified` after classifier re-run.

### Multi-instrument winners

(See sanity_check.py "EIB: multi-instrument winners" output for the actual list.)

Expected overlap with EIC: companies that received both an EIC grant and an EIB venture-debt loan. EIB venture debt is typically co-invested alongside VC rounds, so EIC+EIB is the "strongest signal" combination for the follow-on prediction question.

### Open items

- Granular company split (startup / SME / large_corp) still deferred to enrichment pass (Dealroom/EU registry)
- EIB does not publish disbursed amounts (only approved/signed ceiling); `debt_amount_eur` is the commitment, not necessarily the final draw-down
- A handful of EIB loans have borrower project titles that include descriptive suffixes (e.g. `SNIPR BIOME RDI`) rather than just the company name; the scraped promoter name (e.g. `SNIPR BIOME APS`) is the canonical name used for matching
- `TECHEU SCALE UP - FINTECH` (€70M, IT, 2025) references Scalapay per the EIB product page; the scraped promoter name is used directly

### Files added

- `data/raw/eib/eib_project_ids.json` — 153 EIB VD project IDs with metadata
- `data/raw/eib/eib_projects_signed_20260520.csv` — full project list with scraped borrower names
- `data/raw/eib/eib_scraped_temp.csv` — intermediate curl scrape output (merged into main CSV)
- `data/processed/eib_match_summary.csv` — per-row match audit
- `extract_eib.py` — EIB extractor (discovery + scraping + matching + DB load)

## Day 3 follow-up (2026-05-20): hygiene pass before sprint 3

Review of methodology/notes/README surfaced one real data issue and a handful of doc drifts. Fixed before moving on.

### Data issue: classifier was stale after IPCEI load

`extract_ipcei.py` inserts new `companies` rows and sets `sector_inferred` per-program (Hy2Tech→cleantech, etc.) but doesn't run the entity_type classifier. We also never re-ran `classify.py` after the IPCEI load — so the 295 new IPCEI companies sat as `entity_type='unknown'`, and when I belatedly re-ran `classify.py`, it overwrote the per-program sector assignments with `unclassified` because IPCEI rows have no `sector_tags_raw` to feed the classifier.

**Fix**: extended `classify.py` with an `IPCEI_SOURCE_SECTOR` dict (the same mapping the methodology IPCEI table holds) and gave `classify_sector` a `sources` parameter. Resolution order is now: EIC tags → keyword fallback on title/summary → IPCEI source→sector mapping → `unclassified`. Idempotent re-run lands cleanly:

- Sector: 1,032 life_sciences / 677 cleantech / 482 deeptech_hardware / 146 space / 111 digital / 36 other. Zero unclassified.
- Entity_type: 1,407 company (57%) / 585 research_org (24%) / 9 other / 483 unknown (19%). Unknown share grew from EIC-only 10% → 19% because IPCEI direct-partner names in Commission PDFs typically lack legal-form suffixes ("Infineon", "Bosch", "Globalfoundries", "Carl Zeiss" are obvious corporates that the suffix-based heuristic can't see).

**Operational rule going forward**: re-run `classify.py` after any loader that inserts new `companies` rows. Captured in methodology.md.

### Doc drifts fixed

- **README project structure** was wrong (showed `src/` layout that doesn't exist; scripts live at repo root). Run commands updated to reflect actual paths.
- **EIC Accelerator count** corrected from "709 companies" to "707 distinct coordinator companies / 712 events" (the README/notes/methodology had three different numbers).
- **schema.sql comments** still listed the old taxonomy (`ai_ml`, `semiconductors`, `climate_cleantech`, `health_biotech`) and the old 6-bucket entity scheme. Aligned to the v1 labels.
- **IPCEI "~80–120 partners" estimate** in methodology was off by ~3× (actual 317). Replaced with the actual figure.
- **+6 gap between press-release "~296 partners" and DB's 302 distinct IPCEI companies** explained inline.
- **Hy2Infra −24% aid-sum gap** flagged with the likely explanation (single large redacted anchor partner, plausibly ~€1.7bn).

### Data quality verdict before sprint 3

The supply-side dataset (who got EU public capital, in what sector, in what country) is solid enough to start exploratory analysis. The actual research question — does this capital *predict* private follow-on — needs three more pieces in place:

1. **`private_funding_events` table is still empty.** Until Dealroom/Crunchbase matching is wired up, there is no right-hand-side variable to model.
2. **Dealroom matching for the 1,407 `company` rows.** The 483 unknowns can be tackled in the same pass.
3. **Decide if IPCEI partners belong in the same analysis as EIC startups.** IPCEI direct partners are overwhelmingly large corporates (Infineon, BASF, Bosch); they answer a different "strategic anchor signal" question than EIC Accelerator's "VC-stage signal" question. Stratify rather than pool.

## Day 5 (2026-05-21): Innovation Fund load

**Goal**: load EU Innovation Fund awarded projects (2020–2024) — 20 sub-call tracks, ~246 grant-signed projects — as `public_funding_events` with `source='innovation_fund_<call>'`.

### Data sourcing

Attempted F&T Portal API first; the `INNOVFUND` programme filter returned incorrect results. Switched to direct scraping of `climate.ec.europa.eu/eu-action/eu-funding-climate-action/innovation-fund/innovation-fund-projects_en`, which has a full table of all awarded projects with links to individual CINEA project fiche PDFs.

Parsed the HTML table into `data/raw/innovation_fund/projects_index.json` (246 grant-signed projects; IF25 excluded — all still in "invited to grant agreement preparation" status). Downloaded 239 fiche PDFs to `data/raw/innovation_fund/fiches/` (7 projects have no published fiche).

### PDF parsing

All IF fiches use a two-column layout: project summary on left, metadata fields (COORDINATOR, LOCATION, AMOUNT OF INNOVATION FUND GRANT, etc.) on right. `pdfplumber.extract_text()` on the full page interleaves both columns, producing corrupt coordinator names (e.g. "The ELYgator 200 megawatt (MW) Air Liquide Industrie BV"). Fixed by cropping to the right half of each page: `page.crop((width/2, 0, width, height))`. Also fixed amount field matching to handle both "AMOUNT OF INNOVATION FUND GRANT" (2020–2022 format) and "AMOUNT OF THE INNOVATION FUND GRANT" (2021+ format). One fiche (CapturEste, CINEA ID 101191951) returns HTML from ec.europa.eu — loaded using alternate ID 101190951.

**Outcome**: 239/246 fiches parsed; 7 coordinator/amount fields remain NULL (projects with no published fiche).

### DB load

- `extract_innovation_fund.py --load-db`: 246 events inserted, idempotent on `(source, call_id)`.
- Match results: 17 events matched to existing companies (of which 8 are distinct cross-instrument winners; the other 9 are within-IF repeat winners — same company across multiple sub-calls, e.g. IBERDROLA × 3 grants); 229 new `innovation_fund` inserts.
- Same `subprocess.run(['curl', ...])` SSL workaround as EIB extractor.
- `sector_tags_raw="Energy, {category}, {sector}"` at insert time (e.g. `"Energy, Energy-intensive industries, Cement & lime"`) — leading `'Energy'` tag triggers the classifier's `CLEANTECH_TAGS` check; trailing tags enable sub-sector SQL queries. *(Upgraded post-sign-off; initial implementation used `'Energy'` alone — see post-sign-off cleanup section below.)*
- Added `IF_SOURCE_SECTOR` dict to `classify.py` (all 20 IF sources → cleantech) as a secondary fallback for any IF company whose `sector_tags_raw` is blank (the 7 no-fiche rows). *(Now imported from `extract_innovation_fund.py` rather than duplicated — see post-sign-off cleanup section below.)*

### Results

| Metric | Value |
|---|---|
| Events inserted | 246 |
| Distinct beneficiaries | 237 |
| Matched to prior company | 8 distinct (6 EIC, 1 IPCEI, 1 EIB) |
| New inserts | 229 |
| NULL grant_amount_eur | 7 (no published fiche) |
| Debt pollution | 0 |
| Unclassified after classify.py | 0 |
| Total companies in DB | 2,848 |
| Total events in DB | 4,559 |

Sector: 1,085 life_sciences / 942 cleantech / 498 deeptech_hardware / 150 space / 136 digital / 37 other. Notable multi-instrument winners: AURA AERO (EIC Accelerator + lsp_2023), REVERION (EIC Accelerator + mfg_2023), BATTOLYSER (EIB + mfg_2023), ECOP TECHNOLOGIES (EIC Accelerator + mfg_2024), KITEMILL (EIC Accelerator + ssp_2020).

### Post-sign-off cleanup (same day)

After sign-off I surfaced six methodological concerns and the user asked which deserve fixing now vs. documenting. Two were fixable without scope creep, so I did them:

1. **`sector_tags_raw` upgraded from placeholder `'Energy'` to `"Energy, {category}, {sector}"`** — the climate.ec.europa.eu sector field (Hydrogen, Cement & lime, Refineries, etc.) was already in `projects_index.json` but was being discarded at insert time. Now it's stored alongside `'Energy'` so the classifier's `CLEANTECH_TAGS` match still fires AND sub-sector queries are possible from SQL. Sanity check: hydrogen €1.6bn / 30 events; cement €3.1bn / 24 events; energy storage €1.8bn / 39 events; steel €776M / 9 events. Cleanly reloaded (delete-then-reinsert IF events, no schema change). Total companies / sector distribution unchanged.

2. **`IF_SOURCE_SECTOR` deduplicated** — the dict mapping the 20 IF source IDs to `'cleantech'` was independently defined in both `extract_innovation_fund.py` and `classify.py`. Refactored so `classify.py` imports from `extract_innovation_fund.py` (which derives it from `CALL_TO_SOURCE`, the actual source of truth). Adding a new IF sub-call now requires updating one dict instead of two.

3. **Housekeeping** — removed empty per-call sub-directories under `data/raw/innovation_fund/` (everything ended up in `fiches/`); kept the CINEA reference PDFs (pre-selection lists, statistics, annexes) in `lsp_2020/`, `lsp_2021/`, `ssp_2020/` as data lineage; deleted leftover `/tmp/batch_download_fiches.py`.

Four caveats remain documented but unfixed — they're either inherent (coordinator-only capture, country=HQ-not-project-location, H2 Bank ceilings vs. disbursements) or pending external action (7 NULL-fiche projects to be backfilled when CINEA publishes their fiches, expected ~Nov 2026).

## Day 6 (2026-05-21): Chips JU / KDT JU load

**Goal**: load Chips JU / KDT JU awarded projects (call years 2020–2023, Option A — coordinator only) as `public_funding_events` with `source='chips_ju_kdt_<year>'`. Expected 30–80 events (Option A); landed at 35.

### Data sourcing

Step 0 discovery found that the chips-ju.europa.eu projects page is a Dynamics 365 / PowerApps portal that loads data via JavaScript. Inspecting the page source revealed an unauthenticated OData REST endpoint at `/_api/shv_webprojectses` — no PDF parsing, no curl SSL workaround needed beyond the existing pattern for `subprocess.run(['curl', ...])`. The endpoint returns 129 total projects across two `shv_jueratype` values: ECSEL (94 projects, pre-2021 — out of scope) and KDT (35 projects, 2020–2023 calls — in scope).

The Chips JU's own R&D&I calls under the Chips Act mandate (post-2023) are **not yet in the portal**. The portal's calls page mentions "Chips JU 2023 Calls" as open-for-applications but no awarded projects are published. Per the sprint plan these are not in scope; the loader will pick them up on idempotent re-run when published.

Cached raw response to `data/raw/chips_ju/chips_ju_projects.json` (~70KB).

### Parsing

No PDF or HTML parsing — clean JSON from the OData API. Per-project fields used: `shv_name` (acronym), `shv_titlecontent` (title), `shv_institution` (coordinator name), `shv_countries` (full participating-countries list, formatted "DE-Germany; FR-France; …"), `shv_totalinvestment` (total JU public funding in EUR), `shv_year` (call year), `shv_startdate`, `shv_category` (portal impact area: Digital Industry, Digital Society, etc.), `shv_description`, `shv_participatingorganization` (partner count).

**Amount caveat**: `shv_totalinvestment` is the **total JU public funding** — EU (Horizon Europe) + national member-state contributions to the JU combined. The EU-only share is roughly 50% but is not published per project. This is comparable to IPCEI state-aid totals (also combined cross-jurisdiction). Documented in methodology.md Chips JU section caveat #3.

**Coordinator country derivation**: the API does NOT expose the coordinator country directly — only the full list of participating consortium countries. Derived from the institution name via a 3-tier heuristic in `derive_coordinator_country()`:
1. Explicit country mention in name ("GERMANY", "AUSTRIA", "NEDERLAND", "FRANCE", etc. — case-insensitive)
2. Language-specific institution patterns (POLYTECHNEIO → GR, SCUOLA SUPERIORE/UNIVERSIT[ÀA]/CONSORZIO → IT, COMMISSARIAT/UNIVERSITE/CNRS → FR, SINTEF → NO, etc.)
3. Hardcoded org overrides for multi-country corporates (ASML→NL, INFINEON TECHNOLOGIES AG→DE, AVL LIST GMBH→AT, X-FAB France→FR, etc.)

Result is sanity-checked against the formatted `shv_countries` list. 100% coverage on the 35 rows (0 NULL country at insert).

### DB load

- `extract_chips_ju.py --load-db`: 35 events inserted, idempotent on `(source, call_id)`. Re-run inserts 0, skips 35 duplicates.
- **Match results**: 13 exact (normalised name + country) + 8 prefix + 1 fuzzy + 13 new inserts.
- **Prefix-match tier added this sprint** — IPCEI MECT/Micro stored shortened names ("ASML", "Infineon", "Bosch", "Lynred") while Chips JU has full legal names ("ASML NETHERLANDS B.V.", "INFINEON TECHNOLOGIES AG"). Fuzzy SequenceMatcher ratio between the two is ~0.6 — well below the 0.92 threshold. The prefix tier requires the existing normalised name to be ≥4 chars and a whole-word prefix of the new name (same country). This is a meaningful entity-resolution improvement: the 8 prefix-match hits (ASML, Infineon DE, Lynred, plus 5 EIC short-name → Chips JU full-name pairs) reduce the dup-row backlog from prior loads.
- `sector_tags_raw="Semiconductors, {portal_category}"` (e.g. `"Semiconductors, Digital Industry"`). `"Semiconductors"` added to `DEEPTECH_TAGS` in `classify.py` so the tag-match path resolves to `deeptech_hardware` directly; `CHIPS_JU_SOURCE_SECTOR` (derived from `CALL_TO_SOURCE` in the extractor) imported by `classify.py` as the source-sector fallback — same single-source-of-truth pattern as `IF_SOURCE_SECTOR` after Sprint 4 cleanup.

### Results

| Metric | Value |
|---|---|
| Events inserted | 35 |
| Distinct beneficiaries (companies) | 25 |
| Matched to existing | 12 (across all instruments) |
| of which IPCEI matches | 4 (ASML, Infineon, Lynred, IMEC) |
| New inserts | 13 |
| NULL grant_amount_eur | 0 |
| NULL country (Chips JU companies) | 0 |
| Debt pollution | 0 |
| Unclassified after classify.py | 0 |
| Total companies in DB | 2,861 |
| Total events in DB | 4,594 |

Per-call grant sums:
- `chips_ju_kdt_2020`: 2 projects / €138.5M (transition: ASML's ID2PPAC + SIOUX's IMOCO4.E)
- `chips_ju_kdt_2021`: 13 projects / €462.6M — matches published ~€455M JU budget within 2%
- `chips_ju_kdt_2022`: 16 projects / €609.4M — matches published ~€617M JU budget within 2%
- `chips_ju_kdt_2023`: **4 projects / €38.2M — INCOMPLETE** (expected ~€240M / ~25 projects; portal still being populated as of 2026-05-21, SMARTY added Oct 2025). Re-run extractor when more projects are published.

Sector distribution: 1,085 life_sciences / 942 cleantech / 511 deeptech_hardware (+13) / 150 space / 136 digital / 37 other. The 13 new Chips JU coordinator inserts are all deeptech_hardware; the 12 matched companies retain their primary EIC-derived sector (e.g. CEA stays `space`, IMEC stays `life_sciences`) per the methodology's overlap priority order — this is by design.

Coordinator country distribution: DE=7, FR=6, NL=6, AT=5, IT=3, GR=2, SE=2, BE=1, CZ=1, NO=1, RO=1.

Multi-instrument winners (12 distinct companies):
- **IPCEI overlap (4)**: ASML, Infineon (DE), Lynred, INTERUNIVERSITAIR MICRO-ELECTRONICA CENTRUM (IMEC)
- **EIC overlap (8)**: AVL LIST GMBH (EIC Pathfinder), CEA, CNIT, Infineon Austria, LULEA TEKNISKA UNIVERSITET, SCUOLA SUPERIORE SANT'ANNA, SINTEF AS, plus IMEC (already counted)

### Open caveats

Same 4 methodological caveats as Innovation Fund Sprint 4 under Option A, documented in methodology.md Chips JU section:
1. **Coordinator-only capture** — undercounts the 5–40 partners per KDT consortium
2. **Country = coordinator HQ** — not project location
3. **`grant_amount_eur` is total JU public funding** (EU + national), not EU-only
4. **KDT-2023 partial** — only 4 of ~25 expected projects; re-run when portal updates

## Day 7 (2026-05-21): EDF load + defense sector label

**Goal**: load European Defence Fund awarded projects (2021–2024, coordinator only) as `public_funding_events` with `source='edf_{ra,da}_{year}'`; introduce a `defense` sector label as the 7th taxonomy bucket.

### Data sourcing

EDF published factsheet PDFs live at `defence-industry-space.ec.europa.eu/funding-tenders/...`. No machine-readable export exists — each project has its own PDF. Index pages per call year were scraped to collect factsheet URLs across EDF 2021–2024. Total of 284 factsheet URLs identified (EDF 2025 projects not yet published).

EC server rate-limits the domain: 141/284 requests returned HTML "Sorry - 689127" error pages instead of PDFs. Those 141 factsheets are marked as failed; the extractor is idempotent and will pick them up on `python3 extract_edf.py --refresh` after server cooldown. **143 factsheets parsed and loaded** in this session (~50% coverage).

### PDF parsing

EDF factsheets are structured A4 PDFs (not scanned). Used `pdfplumber.extract_words()` with x-position thresholds (left column: x < 65% page width; right column: x > 65%) to resolve three layout challenges:

1. **Token fusion** — `pdfplumber` fuses "SAS(Coordinator)" or "FRANCE(Coordinator)" into single tokens. Fixed by checking `"(coordinator)" in word["text"].lower()` and splitting out the prefix if the marker appears inside the token.
2. **Multi-line company names** — long names (Greek, Polish, Spanish corporates) span 2–3 lines above the "(Coordinator)" marker. Fixed by collecting all left-column words within a 45px vertical window above the marker.
3. **Decorative headers** — 2021 PDFs render "EUROPEAN / DEFENCE / FUND / UNION / SELECTED / PROJECTS" as a word-cloud header before the project acronym. Fixed by skipping any line whose words are all in a `_EDF_SKIP_WORDS` set or are ≤4-character all-caps fragments.

Amount field: `ESTIMATED TOTALCOST:` (no space between TOTAL and COST in some years) — regex updated to `ESTIMATED\s+TOTAL\s*COST`.

### RA/DA strand determination

EDF 2022+ call titles explicitly say "Research actions" or "Development actions". EDF 2021 uses capability-area titles (e.g. "EDF-2021-OPEN-C4ISR-SENS"). For EDF 2021, RA/DA is inferred from activity-type text in the factsheet: "Generating knowledge" or "Integrating knowledge" → RA; otherwise → DA. Result: 30 RA / 29 DA split for EDF 2021 (cross-checked against published call statistics).

### Sector taxonomy revision

Added `defense` as the 7th sector label (priority: Space > Life Sciences > **Defense** > Cleantech > Deeptech > Digital > Other). All EDF sources map to `defense` via `EDF_SOURCE_SECTOR` imported by `classify.py`. Retroactive re-run flipped 7 existing companies whose sector was previously `other` or `deeptech_hardware` to `defense` — these were dual-use defense primes (e.g. Airbus DS, Thales variants, MBDA entities) loaded in earlier sprints via EIC/Chips JU that pre-dated the `defense` label.

### DB load

- `extract_edf.py --load-db`: 143 events inserted, idempotent on `(source, call_id)`.
- Match results: 54 matched to existing companies, 89 new inserts.
- `CYBERNETICA AS` (EE) country manually patched post-load — derived as NULL because the name gives no country signal and it wasn't in `_KNOWN_EDF_ORG_COUNTRIES`.

### Results

| Metric | Value |
|---|---|
| Factsheets attempted | 285 |
| Initial load (no sleep)              | 143 events |
| Refresh-with-sleep load (`--sleep=3`) | **+133 events = 276 total** |
| Remaining failures | 8 (4 EDF 2025 still rate-limited, 4 real-PDF parse failures) |
| Coverage rate | 97% (276/285) |
| Matched to existing companies | 206 (151 exact + 3 exact_name_only + 40 prefix + 12 fuzzy) |
| New inserts | 70 |
| EU contribution by year | RA 2021 €335M / DA 2021 €827M; RA 2022 €312M / DA 2022 €495M; RA 2023 €286M / DA 2023 €707M; RA 2024 €379M / DA 2024 €607M; RA 2025 €355M / DA 2025 €662M |
| Total EU contribution loaded | ~€4.96B |
| Sector flips (retroactive defense label) | 7 |
| Total companies in DB | 3,020 |
| Total events in DB | 4,870 |
| Debt pollution | 0 |
| Unclassified after classify.py | 0 |

### Sleep-pacing fix (same day, post initial load)

The initial 143-event load hit ~50% coverage because the EC server rate-limits the `defence-industry-space.ec.europa.eu` domain and returns HTML "Sorry" pages (~40KB) that the cache check (size > 5KB) accepted as valid PDFs. Added `_is_real_pdf(path)` to `fetch_pdf` (checks first 5 bytes for `%PDF-` magic), plus a `--sleep=N` CLI flag to pace requests. Re-running `extract_edf.py --load-db --sleep=3` recovered 133 of 141 missing factsheets — final coverage 97%. The 4 EDF 2025 stragglers will pick up on a later `--refresh` re-run; the 4 real-PDF parse failures (one each in 2021/2022/2023) are likely scanned-image factsheets that would need OCR.

### Open items

1. **8 remaining failures**: 4 EDF 2025 URLs still rate-limited (idempotent `--refresh --sleep=N` will pick them up); 4 real-PDF parse failures need OCR or manual extraction.
2. **`grant_amount_eur` = EU contribution ceiling** from the factsheet's "MAXIMUM EU CONTRIBUTION" field (page 1) — not the Estimated Total Cost. DA projects can have up to 20% national co-funding on top.
3. **Coordinator country derivation**: 10 rows landed with NULL country (mostly EDF 2025 defense primes not yet in `_KNOWN_EDF_ORG_COUNTRIES`); needs a Dealroom enrichment pass.

### Chips JU portal recheck (same day)

Re-queried the OData endpoint without the KDT-era filter. Portal still exposes only two `shv_jueratype` values (KDT=920810000, ECSEL=920810001). KDT-2023 still at 4 projects (SMARTY, OPEVA, Resin Green, FEDERATE — same set as Sprint 5). **No Chips JU era / Chips Act mandate projects have been published yet** as of 2026-05-21. Idempotent re-run of `extract_chips_ju.py` would insert 0 events; no action needed. Recheck quarterly.

### Cross-extractor cleanup (same day)

Standardised `match_method` writes across all five extractors. Previously each loader wrote the source name (`edf`, `eib`, `chips_ju`, `innovation_fund`, `ipcei_pdf`) into `companies.match_method` for new inserts, violating the schema's intended enum (`exact`, `fuzzy`, `manual`, `none`). All such non-standard values were renamed to `none` in both code and existing DB rows (2,950 rows updated). The per-event matching method (exact/exact_name_only/prefix/fuzzy) is still retained in the `*_match_summary.csv` files. Schema comment on `match_method` updated to clarify it is INSERT-time only.

## Day 8 (2026-05-21): methodological-debt sprint (B5/B6/B7/C8/C9)

Five items from the post-Sprint-6 audit were knocked out in one pass. All schema changes were applied with `ALTER TABLE` on the live DB and mirrored into `schema.sql` (which now rebuilds cleanly with 20+21+12+7 column tables and 10 indexes).

### B5 — `coordinator_only INTEGER` flag on `public_funding_events`

Surfaces the consortium-undercount that's invisible at the row level. Backfilled across all 4,870 events: `1` for IF / Chips JU / EDF (557 events from coordinator-only sources, 11.4% of the dataset); `0` for EIC / IPCEI / EIB (4,313 events with all-partner or single-borrower capture). All 6 loaders updated to set the flag on new inserts; the live `sanity_check.py` confirms NULL coordinator_only count = 0.

### B6 — `grant_amount_basis TEXT` column to disambiguate amount semantics

This was the biggest silent trap: `grant_amount_eur` meant six different things across sources. The new column makes the basis explicit at row level:

| basis label              | semantic                                              | events | total (EUR) |
|--------------------------|-------------------------------------------------------|--------|-------------|
| `eic_eu_grant`           | EU grant to coordinator (EIC)                         | 3,843  | €3.591B     |
| `ipcei_state_aid`        | Commission-approved state aid (incl. national)        | 317    | €27.282B (101 NULL — redacted) |
| `eib_debt_commitment`    | Committed debt ceiling, not grant                     | 153    | (debt: €3.59B) |
| `if_eu_grant`            | Actual Innovation Fund EU grant                       | 246    | €13.497B    |
| `chips_ju_total_public`  | Total JU public funding (EU + national, ~50% each)    | 35     | €1.249B     |
| `edf_eu_ceiling`         | EU contribution ceiling (DA capped at 80% co-fund)    | 276    | €4.965B     |

These totals **cannot be summed** to a meaningful overall figure. `sanity_check.py` now emits a stratified-totals report and an explicit "DO NOT sum across rows" caption. Schema comment on `grant_amount_eur` warns to always filter by basis. All 6 loaders updated. New index `idx_pfe_basis` added for filter performance.

### B7 — `sector_inferred_updated_at` + `classify_audit` table

New columns `sector_inferred_updated_at` and `entity_type_updated_at` on `companies`; new append-only `classify_audit` table (`id`, `company_id`, `changed_at`, `field`, `old_value`, `new_value`, `run_id`). `classify.py` now:
- Reads current `sector_inferred` / `entity_type` before computing new values
- Logs every flip (including NULL → value first-time assignments) to `classify_audit` with a per-run `run_id` (UTC timestamp)
- Only stamps the `_updated_at` columns when a value actually changes
- Prints a per-run audit summary at the end: top sector/entity transitions

Existing 3,020 companies were backfilled to `sector_inferred_updated_at = now()` as a migration baseline; a single migration-baseline row was logged in `classify_audit`. Future re-classifies on top of a sector-taxonomy revision (like the Sprint 6 defense addition would have been) will produce visible per-row trails.

### C8 — Lenient parser added to `load_eic.py`

Built a fallback `_parse_lenient()` that runs only when the strict `csv.reader` mis-aligns a row. The fallback splits on the literal `";"` field separator and strips outer quotes — internal unescaped quotes get absorbed into whichever text field they live in (almost always `project_summary`). The lenient parser now correctly recovers 156 rows that would otherwise be skipped.

**Verified the recovery is a no-op against the current DB**: after locating the CSV on Desktop and restoring it to `data/raw/eic_datahub_export_20260520.csv`, an incremental dedup (by `pic + project_number + role`) found **0 truly missing rows**. The DB already contains all 3,711 distinct EIC events plus 132 duplicate-role variants — total 3,843 events. The Day 1 "157 skipped" figure was either an early estimate or was resolved by some intermediate re-load before audit memory captured the state. The lenient parser remains valuable as forward insurance: any future `load_eic.py` rebuild on the same or updated CSV will no longer silently drop malformed rows.

### C9 — `sanity_check.py` hardened

Added a "DQ: cross-cutting integrity" section at the end of the file with seven new queries:
1. Per-source basis / coordinator_only / NULL coverage (one row per source × basis × coordinator_only combo)
2. **Hard checks** — `coordinator_only`, `grant_amount_basis`, and unknown-basis counts must all be 0 (acts as a CI gate for new loaders)
3. **Stratified totals** — emits per-basis sums with the "DO NOT sum across rows" caption
4. Coordinator-only coverage banner (currently 11.4%)
5. classify_audit summary (counts of sector/entity flips since baseline)
6. Last 50 flips with prior values (visible trail of taxonomy revisions)
7. Timestamp hygiene check (NULL `sector_inferred_updated_at` count, stale-stamp count)

After Sprint 7 (EIT KICs) the integrity checks #2 and #7 will surface any new loader that forgot to set the flags.

## Day 9 (2026-05-21): EIT KIC load (Sprint 7)

**Goal**: load EIT Digital (rebranded 28digital.eu in 2025) and EIT Manufacturing company-facing support and investment events.

### Data sourcing

No live web-scraping — all company data compiled from WebFetch calls into hardcoded Python lists in `extract_eit.py` (10 lists, 99 total entries). Approach chosen because EIT pages have inconsistent HTML structures and N is small enough to curate manually. EIT Manufacturing website is a frozen snapshot (ASBL ceased operations 10 April 2026).

- **EIT Digital**: Champions cohorts 2021–2025 (3+6+11+13+8 = 41 events) + VAP 2022 (10 events) = **51 events**
- **EIT Manufacturing**: Investment portfolio (21 events) + BoostUp 2021 (4) + BoostUp 2023 (17) + BoostUp 2024 (6) = **48 events**
- **BoostUp 2022 excluded**: 8 winners at €20K each, but names not published on website

### DB load

- `extract_eit.py --load-db`: 99 events inserted on first run.
- **Match results** (per `data/processed/eit_match_summary.csv`):
  - `exact`: 9 — of which 3 were within-EIT dedup (ChainTraced, Litech, DREV appeared in both investments and BoostUp)
  - `reverse_prefix`: 0 (tier added post-load as a preventive fix)
  - `none` (new inserts): 90 → after 3 post-load SQL merges (Plexigrid/Ekkono/Orange Quantum) → **87 net new companies**
- **3 duplicate rows found and merged**: `Plexigrid` (ES) → `PLEXIGRID SOCIEDAD LIMITADA`, `Ekkono` (SE) → `EKKONO SOLUTIONS AB`, `Orange Quantum Systems` (NL) → `ORANGE QUANTUM SYSTEMS OPERATIONAL BV`. Root cause: forward-prefix tier checks `new.startswith(existing + " ")`, which misses cases where the EIT short name is *shorter* than the existing EIC legal name. **Fix**: reverse-prefix tier (`ex_norm.startswith(norm + " ")`, len≥5) added to `match_companies()` in `extract_eit.py` so idempotent re-runs handle this correctly.
- **Empty-country idempotency bug found during sign-off audit**: re-running `extract_eit.py --load-db` created 11 new duplicate company rows for EIT Manufacturing entries with no country in source data (CERPRO, DigiClean Solutions, Phine.Tech, Prenomics, GridMetrics, incon.ai, Convergent Information Technologies, QualiSense, Sleeve, Mavarick, PHEE). Root cause: tier 1 had `if country and exact_key in existing` — the `country and` guard skipped the exact-match path when country was empty. Fixed by removing the guard and tagging the empty-country case as `match_method="exact_no_country"` (medium confidence). 11 dup rows merged via SQL. Re-verified idempotency: 85 exact + 11 exact_no_country + 3 reverse_prefix = 99 matches, 0 new inserts.

### Results

| Metric | Value |
|---|---|
| EIT Digital events | 51 |
| EIT Manufacturing events | 48 |
| Total EIT KIC events | 99 |
| Distinct EIT KIC companies | 96 |
| Net new company inserts | 87 |
| Matched to prior company | 9 (6 EIC cross-source; 3 within-EIT dedup) |
| NULL grant_amount_eur (support + equity) | 75 |
| BoostUp cash-prize events | 24 |
| classify.py first-time sector assignments | 87 |
| Stale sector_inferred_updated_at | 0 |
| Total companies in DB | 3,107 |
| Total events in DB | 4,969 |

### EIT Digital × EIC overlap

6 of 51 EIT Digital companies also appear in EIC: **11.8%**. Sprint-plan gate was ≥20%; shortfall documented below the gate. The overlap companies are: Connecting Food (FR), Multiverse Computing (ES), GrayMatters Health (IL), Ekkono Solutions AB (SE, via EIC Accelerator), Plexigrid (ES, via EIC Accelerator), Orange Quantum Systems (NL, via EIC Accelerator + Pathfinder).

The below-20% overlap is structurally expected: EIT Digital Champions cohorts are 3–13 companies per year from a broad tech universe; EIC Accelerator is deep-tech-biased. The 10% debug-matching threshold was not triggered (actual 11.8% > 10%), so no name-normalisation investigation needed.

### Sector distribution of new EIT companies

| Sector | Companies |
|---|---|
| `digital` | 48 |
| `deeptech_hardware` | 32 |
| `life_sciences` | 9 |
| `cleantech` | 6 |
| `defense` | 1 |

EIT Digital sources → `digital` fallback; EIT Manufacturing sources → `deeptech_hardware` fallback. keyword classifier overrode the source fallback for 15 companies (life_sciences + cleantech).

### Files added

- `files/extract_eit.py` — EIT KIC extractor (hardcoded data, 10 sources)
- `files/data/processed/eit_projects.csv` — flat event list
- `files/data/processed/eit_match_summary.csv` — per-row match audit

### Final DB state after Day 8

| Metric | Value |
|---|---|
| Total companies | 3,020 |
| Total events | 4,870 |
| coordinator_only=1 events | 557 (11.4%) |
| Schema tables | 4 (companies, public_funding_events, private_funding_events, classify_audit) |
| classify_audit rows | 1 (B7 migration baseline) |
| Outstanding | C8 recovery awaiting user-supplied EIC CSV |

---

## Day 10 — 2026-05-22 — Sprint 8 corpus bulletproofing (workstream B)

**Scope decisions** (2026-05-21):
- Workstream A (STEP Seal tagging) **skipped** — no machine-readable seal source surfaced during discovery; user opted to skip rather than escalate or hand-curate.
- Workstream B (audit) executed under "all-or-nothing per gate" rule — halt rather than ship a half-passing gate. Source patches landed in `classify.py`, `ETL/load/qa/audit_dedup.py` (new), `data/processed/dedup_candidates.csv` (new), `data/processed/pre_dealroom_health_report.md` (new).

### Headline deltas

| Metric | Pre (Day 9 close) | Post (Day 10) | Δ |
|---|---:|---:|---:|
| Companies | 3,107 | 3,101 | −6 |
| Events | 4,969 | 4,969 | 0 |
| `entity_type='unknown'` | 705 (22.7%) | 186 (6.0%) | −519 |
| NULL country | 18 | 0 | −18 |
| PIC violations | 0 | 0 | — |

### B1 dedup merges

3 same-country + 3 EL↔GR alias merges. EL is the Eurostat code for Greece, GR is ISO-3166-1 alpha-2; same entity, different code — the EIC export uses one, EDF uses the other. Targets after merge: Hellenic Mediterranean University (id 559, also flipped sector cleantech → defense after gaining an EDF event), National Technical University of Athens (id 603), Technical University of Crete (id 1461), NXP-NL (id 2389), HUN-REN Termeszettudomanyi Kutatokozpont (id 846), Air Liquide Large Industry BE (id 2928). 2 pairs (Bormioli Luigi ES/IT, Holcim RO/DE) flagged `needs_human_review` for Sprint 9 Dealroom enrichment.

### B2 unknowns shrinkage by source family

| Family | Pre | Post |
|---|---:|---:|
| ipcei | 261 | 0 |
| eic | 221 | 140 |
| innovation_fund | 82 | 0 |
| eit | 79 | 0 |
| edf | 65 | 44 |
| eib | 8 | 7 |
| chips_ju | 7 | 0 |

The big drops (ipcei, innovation_fund, eit) come from the new **source-family fallback** in `classify_entity_type()` — rows with no name match resolve to `company` if any source is in `{ipcei, innovation_fund, eit, chips_ju}`. These four programmes accept only corporate beneficiaries by design. EDF intentionally excluded (defense calls include ONERA/CERTH/Demokritos research orgs). The EIC residual is mostly EIC Pathfinder/Transition coordinators with hyper-specific project-vehicle names that pattern-matching cannot resolve without per-row enrichment — they flow to Sprint 9 Dealroom matching for resolution.

### B2 already-classified row corrections (6, all correct improvements)

- AGENCIA ESTATAL CSIC: `other` → `research_org` (was caught by `agencia` pattern; the new `consejo superior de investigaciones` pattern wins on priority)
- CSEM CENTRE SUISSE D'ELECTRONIQUE ET DE MICROTECHNIQUE SA: `company` → `research_org` (was caught by `SA` suffix; the new `centre technique`-family pattern wins)
- ASSOCIATION FOR THE ADVANCEMENT OF TISSUE ENGINEERING (PT): `company` → `research_org` (new `association` pattern)
- EXELIXIS DIACHEIRISI EREVNAS KAI EPIKOINONIA EE (EL): `company` → `research_org` (new Greek `erevnas` pattern)
- IDRYMA EPISTIMON KAI EREVNAS I.K.E. (EL): `company` → `research_org` (new Greek `idryma` pattern)
- SYNERGEIES STIN EPISTIMI KAI TECHNOLOGIA-SYNEST IDIOTIKI KEFALAIOUCHIKI (EL): `company` → `research_org` (new `epistim` pattern)

### B3 country backfill (18 rows)

7 EDF rows derived from name patterns (Nederlands→NL, French INRIA-style→FR, Greek transliteration→EL, INESC→PT, Slovenian `racunalniske`→SI). 11 EIT Manufacturing rows resolved via web search on company / cohort pages — see the table in [`pre_dealroom_health_report.md`](../data/processed/pre_dealroom_health_report.md#b3---country-coverage-cleanup) for source per row.

### B5 totals reconciliation

All 7 families pass. The only non-±5% gaps are documented in methodology (IPCEI redacted partners: Microelectronics-2018/Batteries/EuBatIn fully redacted; Hy2Infra/Cloud/Med4Cure partially redacted; Chips JU KDT-2023 portal still being populated).

### B6 multi-instrument profile

Cross-instrument winners (≥2 source families): 81 — unchanged from pre-audit. The 6 B1 merges affected non-cross-instrument rows only.

### Website coverage by source family

| Family | Companies | With website | Coverage |
|---|---:|---:|---:|
| eic | 2,188 | 2,188 | 100% |
| edf | 192 | 29 | 15% |
| chips_ju | 25 | 8 | 32% |
| eib | 151 | 16 | 11% |
| eit | 96 | 8 | 8% |
| innovation_fund | 236 | 6 | 3% |
| ipcei | 301 | 7 | 2% |

73% overall coverage, skewed entirely to EIC. Backfilling non-EIC families from `project_summary` URLs deferred to Sprint 9 (cheap to fold in alongside Dealroom matching).

### Sector regression

Re-run of `classify.py` on no-input change: 0 sector flips, 0 entity flips → idempotent. 50-row stratified spot-check: 48 clear concordance, 2 defensible borderlines (Vlasceanu loam walls → deeptech_hardware, Frisimos robotic cable assembly → digital). 96% concordance ≥ 90% gate.

### Gate scorecard

| Gate | Threshold | Result |
|---|---|---|
| B1 needs_human_review | ≤5 | 2 ✓ |
| B2 unknowns absolute | ≤300 | 186 ✓ |
| B2 unknowns share | ≤10% | 6.0% ✓ |
| B3 NULL country | ≤3 | 0 ✓ |
| B4 spot-check concordance | ≥90% | 96% ✓ |
| B4 classify.py idempotence | 0 flips on no-change | 0 ✓ |
| B5 totals reconciled | ±5% or documented | all within tolerance ✓ |
| B6 PIC integrity | 0 violations | 0 ✓ |
| sanity_check.py | all green | all green ✓ |
| `pre_dealroom_health_report.md` committed | exists | exists ✓ |

### Files added

- `ETL/load/qa/audit_dedup.py` — Sprint 8 B1 cross-source dedup sweep (idempotent; supports `--load-db`)
- `data/processed/dedup_candidates.csv` — 40-row review CSV with recommendation per pair
- `data/processed/pre_dealroom_health_report.md` — gate scorecard + per-workstream findings

### Files modified

- `ETL/transform/classify.py` — augmented entity-type patterns + new `SOURCE_FAMILY_COMPANY` fallback; signature of `classify_entity_type()` gained an optional `sources` parameter (call site updated in `main`)
- `README.md` — corpus headline updated 3,107 → 3,101; `audit_dedup.py` added to run sequence; status row added for Sprint 8 audit
- `docs/methodology.md` — Sprint 8 decision-log entry appended
- `docs/notes.md` — this Day 10 entry

### Final DB state after Day 10

| Metric | Value |
|---|---|
| Total companies | 3,101 |
| Total events | 4,969 |
| Sector distribution | life_sciences 1,090 / cleantech 941 / deeptech_hardware 529 / digital 182 / defense 173 / space 149 / other 37 |
| Entity-type distribution | company 2,233 / research_org 674 / unknown 186 / other 8 |
| coordinator_only=1 events | unchanged |
| Outstanding | 186 residual unknowns (~6%, mostly EIC Pathfinder/Transition project-vehicle names) → Sprint 9; 2 dedup pairs flagged human_review → Sprint 9; non-EIC website backfill → Sprint 9 |

---

## Day 10 addendum (2026-05-22, late) — Workstream A unblocked

User dropped the Commission "SEAL - data set" Excel export into the repo after Day-10 close. STEP Seal tagging now done — `companies.step_flagged=1` on 623 matched companies (20.1% of corpus).

### Match approach

Single-tier exact `(normalize_name, country_iso2)` against the SEAL file's `Applicant Legal Name` and `Project Country (Region)` columns. EL↔GR and UK↔GB country-equivalence sets (DB carries both). No fuzzy tier — match is strict. 4,069 unique SEAL applicants → 623 DB hits + 3,446 SEAL-only (consortium participants in Horizon projects we haven't loaded, plus universities/non-EU orgs).

### STEP coverage by source family

| Family | Companies | Step-flagged | % |
|---|---:|---:|---:|
| chips_ju | 25 | 10 | 40% |
| edf | 192 | 78 | 41% |
| innovation_fund | 236 | 88 | 37% |
| eic | 2,188 | 468 | 21% |
| eib | 151 | 15 | 10% |
| eit | 96 | 4 | 4% |
| ipcei | 301 | 10 | 3% |

### Plan assumption corrected

The Sprint 8 plan stated "EDF defense projects are explicitly out of STEP scope (different sovereignty regime); flag remains 0 for all EDF rows." This was wrong. The actual SEAL export shows EDF as a major STEP component (1,120 of 5,722 SEAL rows = 19.6%, second only to HORIZON). Defense IS in STEP's "deep tech" pillar. 78 of 192 EDF companies in our DB hold the seal.

The plan was right about IPCEI: only 10/301 (3%) — state-aid notifications operate outside the seal mechanism, and the 10 hits are direct partners with parallel Horizon projects.

### Event-level NOT tagged

The SEAL export carries proposal titles but no Horizon project numbers. Mapping proposal title → `public_funding_events.project_number` would be fuzzy and unsafe. The planned `public_funding_events.step_flagged` column was NOT added; if a researcher needs per-event tagging, they can derive `event_step = (company.step_flagged AND project_year >= 2024)` as a reasonable proxy.

### Files added

- `ETL/transform/tag_step.py` — STEP Seal tagger (idempotent; supports `--load-db`; revokes flag for any company no longer in input)
- `data/raw/step/seal_data_set.xlsx` — raw Commission export (5,722 rows / 9 columns)
- `data/processed/step_match_summary.csv` — one row per matched company (programmes, sectors, any-funded flag)

### Files modified

- `README.md` — STEP row updated to ✅ loaded; run sequence includes `tag_step.py`
- `docs/methodology.md` — Sprint 8 STEP Seal decision-log entry inserted

### DB delta

| Metric | Before | After |
|---|---:|---:|
| `companies.step_flagged=1` | 0 | 623 |
| Other tables | unchanged | unchanged |

DB backup pre-STEP write: `db_backups/db.sqlite.backup_pre_step_tagging`.
