# Sprint 13 — Tier 1 NDB execution status (final 2026-05-26 — 8/8 workstreams)

## Loaded — 8 of 8 workstreams, 3,462 events / +2,428 net new companies

### Company-level coverage (5 workstreams, 3,426 events)

| Workstream | Institution | Source IDs | Events | Notes |
|---|---|---|---:|---|
| B | KfW Capital (HTGF) | `htgf_equity` | 857 | WP REST API. Sector via `branchen22-*` class taxonomy. 349 exact + 4 fuzzy EU corpus matches. **4 IPCEI overlaps** — first NDB hits. |
| B | KfW Capital (Coparion) | `coparion_equity` | 52 | Static HTML modals; 9 exact + 1 fuzzy match. |
| C | CDP VC | `cdp_vc_equity`, `cdp_vc_fof` | 199 | 152 direct + 47 FoF; `eif_lp_backed=1`; 8 exact + 16 fuzzy. |
| D | Invest-NL | `invest_nl_equity`, `invest_nl_fof` | 13 | 6 direct + 7 FoF. |
| E | CDTI (via BDNS) | `cdti_{programme}_{year}` × 10 | 1,880 | €1.04B state aid; 565 exact + 33 fuzzy; 142 loan rows. |
| G | Tesi | `tesi_equity` | 102 | 20 exact matches against EU corpus. |
| H | Almi Invest | `almi_invest_equity` | 323 | API at `/api/views/portfolio?root=3650&p=<n>`; 28 exact + 1 fuzzy. |
| **Company-level total** | | | **3,426** | |

### Programme / fund-vehicle placeholder coverage (3 workstreams, 36 events, `entity_type='other'`)

| Workstream | Institution | Source IDs | Events | Notes |
|---|---|---|---:|---|
| A | Bpifrance | `bpifrance_fond` | 10 | 10 fund vehicles from `lehub.bpifrance.fr/fonds-et-participations/`. Cloudflare blocks portfolio page. |
| B | SPRIND | `sprind_challenge` | 20 | 20 challenges from `sprind.org/taten/challenges`. Pages list project codenames not legal entities. |
| F | Enterprise Ireland | `enterprise_ireland_{hpsu,seed,ip,rd,cf,dtif}` | 6 | 6 known funding programmes. JS-rendered site has no machine-readable HPSU list. |
| **Placeholder total** | | | **36** | |

### Workarounds executed this sprint

| Block | Workaround | Outcome |
|---|---|---|
| `cdti.es` Imperva | **BDNS API** at `infosubvenciones.es/bdnstrans/api/concesiones/busqueda` | 1,880 events |
| KfW Capital LP layer | **HTGF WP REST API** at `/wp-json/wp/v2/portfolio` + Coparion static HTML | 909 events |
| `bpifrance.fr` Cloudflare | Le Hub fund-vehicle listing (placeholder) | 10 events; full portfolio still gated |
| SPRIND no per-team disclosure | Challenge programs as placeholders | 20 events; per-team requires Bundesanzeiger PDF |
| EI no HPSU list | Programme metadata as placeholders | 6 events; per-company requires annual report PDF or TAM |

### Future-session unlocks (Sprint 14)

| Path | Estimated yield | Effort | Notes |
|---|---:|---|---|
| **EU TAM API** (EU Login required) | 5,000-15,000+ rows | High signup; medium scrape | Mandated state-aid >€100k publication. Covers Bpifrance, EI, SPRIND, BFinland, Vinnova grants. |
| Bpifrance Playwright stealth | ~400-800 companies | Medium | Defeats Cloudflare on the portfolio page. Adds equity-side coverage TAM doesn't capture (MEI-compliant equity is excluded from state-aid notification). |
| Enterprise Ireland annual report PDF | ~200-500 companies/year | Medium | IF fiche pattern. Lists named HPSU clients. |
| Saminvest annual report PDF | ~30-50 LPs | Low | Small portfolio. |
| Vinnova GDP / GDPHub | ~500-800 events | Medium | Requires account + bulk CSV/API export. |
| Business Finland programme catalogue | ~400-700 events | Medium-High | Multi-call scrape; per-programme award lists. |
| SPRIND Bundesanzeiger / annual report | ~50-150 team→entity mappings | Medium | PDF parse. |

## Methodology decisions captured in DB

- New columns on `public_funding_events`: `ipcei_linked` (4 HTGF rows flagged; rest are 0); `eif_lp_backed` (1 for `cdp_vc_*` only); `deployment_country` (NL/FI/SE/IT/ES/DE/FR/IE across the 8 workstreams).
- `grant_amount_basis` values added: `invest_nl_equity`, `tesi_equity`, `almi_invest_equity`, `cdp_vc_equity`, `cdti_grant`, `cdti_loan`, `htgf_equity`, `coparion_equity`, `bpifrance_fond`, `sprind_grant`, `enterprise_ireland_equity`, `enterprise_ireland_grant`.
- 36 placeholder rows have `entity_type='other'`; filter `WHERE entity_type='company'` for company-count rollups.
- `equity_amount_eur` NULL across all 8 workstreams (no portfolio-level ticket disclosure); CDTI populates `grant_amount_eur` from BDNS `importe`/`ayudaEquivalente`.

## DB delta vs Sprint 13 start

| Metric | Pre-Sprint-13 | Post-Sprint-13 |
|---|---:|---:|
| Companies | 19,261 | 21,689 |
| Events | 55,166 | 58,628 |
| NDB events | 0 | 3,462 |
| Cross-instrument NDB→EU matches | — | 988 |
| IPCEI ↔ NDB overlaps | — | 4 (all HTGF) |
