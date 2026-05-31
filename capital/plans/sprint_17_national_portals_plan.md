# Sprint 17 plan — National state-aid portals (PL extend / RO / SI / ES retry)

**Owner**: Claude (next session), executing against `/Users/asgermollergrimberg/EuroInvTracker/`.

**Status**: Partially started in Sprint 16 (PL SUDOP scaffold + 22 events). Target baseline at start: **116,925 companies / 213,906 events** (Sprint 16 actual, not the original 100k-104k/185k-190k estimate).

**Purpose**: Close the **state-aid blindspots** that don't report via the EC SATR portal. Spain (BDNS) was assumed covered via `extract_cdti.py` in Sprint 15, but Sprint 16 confirmed only CDTI is loaded — ENISA, ICO, COFIDES remain absent. Plus the original three target countries: Poland (SUDOP), Romania (REGAS), Slovenia (gov.si).

After Sprint 17, the **state-aid layer covers 27+1 of 27+1 European-scope countries with central coverage for major NDB grant programmes**.

---

## What changed since the original Sprint 17 plan (Sprint 16 outcomes)

Sprint 16 reshaped this sprint:

1. **🇵🇱 PL SUDOP is no longer a fresh-build** — [`extract_sudop.py`](../scripts/extract_sudop.py) is shipped. The async API client (GET → 303 queue → poll → CSV) works end-to-end; one PARP measure (SA.56782) loaded 22 events. The remaining 9 measures hit rate-limits mid-batch but are cache-resumable.
2. **🇪🇸 Spain is NOT actually in SATR** — the Sprint 15 memo "Spain uses BDNS — already covered via extract_cdti.py" turned out to mean only CDTI is in the corpus. ENISA (~€120M/yr seed-stage venture-debt), ICO (~€1bn/yr financing), COFIDES (internationalisation) remain uncovered. BDNS API has same async pattern as SUDOP and same WAF-throttling behaviour.
3. **Baselines updated**: corpus has grown 95k → 116,925 companies via Sprint 16 central registers, not the projected 100-104k.

---

## TL;DR for a fresh Claude session

Four workstreams, four different national portals:

- **A — PL SUDOP extend (FAST PATH)**: scaffold already exists in `extract_sudop.py` with proven async client. Need to (1) widen `INNOVATION_MEASURES` curated list from 10 to ~40 SA-codes covering all current BGK/NCBR/PARP/PFR innovation programmes, (2) implement slow throttle (15-30s between queue submissions) to survive the API rate limit, (3) checkpoint/resume per measure. Yield estimate: 5,000-25,000 PL events.
- **B — ES BDNS multi-organo extend (RETRY)**: BDNS API WAF IP-blocked us in Sprint 16; needs different network egress (VPN, proxy) or several days for the IP ban to clear. Extend `extract_cdti.py` pattern to query for ENISA / ICO / COFIDES `nivel3` filters. Yield estimate: 2,000-8,000 ES events covering ENISA seed-debt + ICO innovation financing + COFIDES grants.
- **C — REGAS (Romania)**: `https://regas.consiliulconcurentei.ro/transparenta/`. Romanian Competition Council. Static HTML, paginated. Romanian NDB: EximBank Romania. Yield estimate: 10,000-30,000 events.
- **D — gov.si (Slovenia)**: Slovenian Ministry of Finance + Competition Authority. Annual XLSX/PDF dumps per category. Slovenian NDBs: SID Banka, Slovenski podjetniški sklad (SPS). Yield estimate: 5,000-15,000 events.

After Sprint 17, expect **+22,000-78,000 new events / +15,000-50,000 new companies**.

---

## Scope decisions (locked before scripting)

1. **Time window**: 2021-01-01 to today.
2. **Filter scope**: innovation + IPCEI + Net-Zero + SME investment + start-ups. Each portal has its own taxonomy; map by purpose-keyword on aid-measure title:
   - Include: "R&D", "Badania i Rozwój" (PL), "Cercetare-Dezvoltare" (RO), "Raziskave in Razvoj" (SI), "Innowac", "Inovaț", "Inovacij", "Startup", "Start-Up", "MŚP" (PL SME), "IMM" (RO SME), "MSP" (SI SME), "I+D+i" (ES).
   - Exclude: agriculture, cultural, sport, audio-visual, COVID/anti-crisis emergency, disaster aid.
3. **TCTF / COVID exclusion**: Sprint 15 multilingual regex + Polish ("Tymczasowe Ramy"), Romanian ("Cadrul Temporar"), Slovenian ("Začasni Okvir") TCTF terms.
4. **Schema**: no migration. New `grant_amount_basis` values already pre-declared: `sudop_aid_element`, `regas_aid_element`, `gov_si_aid_element`. Add `bdns_enisa_aid_element`, `bdns_ico_aid_element`, `bdns_cofides_aid_element` for ES.
5. **Source IDs**:
   - PL SUDOP: `sudop_<measure_slug>` (already in `extract_sudop.py`)
   - ES BDNS: `bdns_enisa_<year>`, `bdns_ico_<programme>_<year>`, `bdns_cofides_<programme>_<year>`
   - RO REGAS: `regas_<filter>_<year>`
   - SI gov.si: `gov_si_<filter>_<year>`
6. **NDB taxonomy**: PL/ES NDBs already pre-mapped in `scripts/lib/ndb_taxonomy.py`. Add SID Banka, SPS for SI. EximBank Romania already present.
7. **Currency**: PL=PLN, RO=RON, SI=EUR, ES=EUR. All in FX series.
8. **No DB writes until validation**.

---

## Pre-flight

1. Confirm baseline: `python3 scripts/sanity_check.py` clean.
2. Back up: `cp db.sqlite /tmp/eit_data_backup/db.sqlite.pre-sprint17.bak`.
3. Verify Sprint 16's `extract_sudop.py` works on cached `data/raw/sudop/parp_rd.csv` (`--measures parp_rd`).
4. Confirm BDNS WAF status: probe `https://www.infosubvenciones.es/bdnstrans/api/concesiones/busqueda?vpd=GE&descripcion=CDTI&page=0` with browser headers. If still 403/blocked, defer Workstream B until network egress is sorted.

---

## Workstream A — PL SUDOP extension (BUILD ON SCAFFOLD)

### Step A0 — Curate full measure list

The `INNOVATION_MEASURES` dict in [`extract_sudop.py`](../scripts/extract_sudop.py) currently has 10 SA-codes. Extend to ~40 by querying the dictionary:

```python
# Fetch active innovation aid measures
curl https://api-sudop.uokik.gov.pl/sudop-api/slownik/srodek-pomocowy > slownik.json
# Filter to 2020+ + keywords (innowac, badani, rozwoj, parp, ncbr, pfr, bgk, badawcz, technologic)
```

Target SA-codes (in addition to those already in INNOVATION_MEASURES):
- SA.62057, SA.62058 (Polish R&D investment 2021)
- SA.63082, SA.63083 (2022 R&D programmes)
- SA.66401, SA.66402 (Recovery & Resilience grants)
- SA.105xxx series (2024 GBER regional aid)
- PFR-specific measures (anti-crisis programmes excluded via TCTF filter; growth + innovation included)
- BGK guarantee schemes
- NCBR ścieżka SMART (2024 R&D programme — major)

### Step A1 — Slow-throttle batch runner

Add a `--rate-limit-seconds` CLI flag to [`extract_sudop.py`](../scripts/extract_sudop.py) with default 30. Between queue submissions, sleep N seconds to avoid the WAF kick-in that hit us in Sprint 16. Total run time will be ~40 measures × (30s wait + 60s queue + 8s poll) = ~1 hour.

```python
# Pseudo-code
for measure, slug, sector, desc in measures:
    if not (RAW_DIR / f"{slug}.csv").exists():
        path = client.fetch_measure(...)
        time.sleep(rate_limit_seconds)
```

### Step A2 — Polish-language TCTF filter

Add to `_TCTF_PATTERNS` in `scripts/load_satr.py`:
- `r"Tymczasowe\s+Ramy"` — Polish TCTF
- `r"Pomoc\s+covid"`     — COVID aid
- `r"Tarcza\s+(?:antykryzy|finansowa)"` — anti-crisis shield (already in Sprint 17 original plan)
- `r"Tarcza\s+PFR"`

### Step A3 — Load + validate

```bash
python3 scripts/extract_sudop.py --rate-limit-seconds 30 --load-db
python3 scripts/classify.py
python3 scripts/sanity_check.py
```

Validation gates:
- Expect 5,000-25,000 SUDOP rows post-filter (smaller than original plan's 30-80k because we cap at innovation-relevant measures, not all GBER aid).
- Distribution: pfr / ncbr / bgk / parp NDB tags substantial.
- Spot-check: Brainly, ICEYE-Poland, MIM Solutions, Booksy should appear.

---

## Workstream B — ES BDNS multi-organo (RETRY + EXTEND)

### Step B0 — BDNS WAF status check

Confirm at session start whether BDNS API is reachable from current network. If blocked (HTTP 0 / 403), defer this workstream and document in carry-over.

### Step B1 — Extend `extract_cdti.py` pattern

The existing CDTI extractor in [`extract_cdti.py`](../scripts/extract_cdti.py) uses:
```python
SEARCH_URL = f"{API_BASE}/concesiones/busqueda?vpd=GE&descripcion=CDTI&page={{p}}"
CDTI_ORGANO = "CENTRO PARA EL DESARROLLO TECNOLÓGICO Y LA INNOVACIÓN E.P.E"
```

Build a parameterised `extract_bdns_multi.py` (or factor `extract_cdti.py`) that runs the same fetch + parse + nivel3-filter pipeline for:

| Organo (nivel3) | Search keyword | NDB | Expected rows |
|---|---|---|---|
| `EMPRESA NACIONAL DE INNOVACIÓN, S.M.E., S.A. (ENISA)` | `ENISA` | `enisa` | ~1,500 |
| `INSTITUTO DE CRÉDITO OFICIAL (ICO)` | `ICO%20Instituto%20Crédito` | `ico` | ~800-2,000 |
| `COMPAÑÍA ESPAÑOLA DE FINANCIACIÓN DEL DESARROLLO (COFIDES)` | `COFIDES` | `cofides` | ~300 |
| `RED.ES` | `RED.ES` | (new — add to taxonomy) | ~500 |

### Step B2 — Throttling

Use slow throttle (30s between page fetches) given Sprint 16's WAF-block experience. Total run: ~5,000 page-fetches × 30s = ~40 hours sequential. Either:
- Accept the time (run overnight in batch)
- Reduce throttle empirically (start at 5s; back off on first 403)
- Use the existing CDTI cached approach + extend with overnight resumable batch

### Step B3 — Load + validate

```bash
python3 scripts/extract_bdns_multi.py --organo enisa --rate-limit-seconds 10
python3 scripts/extract_bdns_multi.py --organo ico --rate-limit-seconds 10
python3 scripts/extract_bdns_multi.py --organo cofides --rate-limit-seconds 10
python3 scripts/classify.py
```

Validation gates:
- Expect 2,000-8,000 new ES rows.
- ENISA appears in `v_ndb_distributor_rollup`.
- Spot-check: Cabify (ENISA-backed), Glovo, Devo, Wallapop should appear.

---

## Workstream C — REGAS (Romania)

### Step C0 — Discovery

- Portal URL: `https://regas.consiliulconcurentei.ro/transparenta/`
- Format: static HTML with paginated tables. No JSON API. `requests` + BeautifulSoup; Playwright as fallback if JS-rendered.
- Reporting threshold: RON 500,000 (~€100k) — matches SATR.
- Romanian state-aid landscape: EximBank Romania, Ministerul Finanțelor, AIMMAIPE (SME agency), Patria Bank consortium.

### Step C1 — Build `scripts/extract_regas.py`

Same schema mapping as SUDOP but `granting_authority_country = 'RO'`, `source = 'regas_<filter>_<year>'`, FX from RON.

### Step C2 — Romanian TCTF filter

Add to `_TCTF_PATTERNS`:
- `r"Cadrul\s+Temporar"` — Romanian TCTF
- `r"Schemă\s+de\s+ajutor.*COVID"` — Romanian COVID aid schemes
- `r"IMM\s+Invest(?:\s+Plus)?"` — Romanian SME COVID liquidity programme

### Step C3 — Load + validate

Expect 10,000-30,000 REGAS rows.

Validation gates: EximBank Romania appears; UiPath, eMag, FintechOS spot-check.

---

## Workstream D — gov.si (Slovenia)

### Step D0 — Discovery

- Portal: `https://www.gov.si/teme/objava-vecjih-prejemnikov-pomoci/`
- Format: annual XLSX/PDF per category. Manual per-year + per-category download.
- Reporting threshold: €500 (very granular). Filter at staging step: `aid_element_eur >= 5000`.
- Slovenian NDB landscape: SID Banka, SPS (Slovene Enterprise Fund).

### Step D1 — Build `scripts/extract_gov_si_aid.py`

Per-year XLSX/PDF download, parse with `openpyxl` (Excel) or `pdfplumber` (PDF).

### Step D2 — Slovenian TCTF filter

Add to `_TCTF_PATTERNS`:
- `r"Začasni\s+Okvir"` — Slovenian TCTF
- `r"Krizni\s+ukrep"` — generic crisis measure

### Step D3 — Load + validate

Expect 5,000-15,000 rows.

Validation: SID Banka, SPS appear; Outfit7, Bia Separations spot-check.

---

## Cross-workstream post-load tasks

### Post-1 — Refresh NDB-distributor rollup

After each workstream: `python3 scripts/backfill_ndb_distributor.py`.

### Post-2 — Update `v_state_aid_layer` view

Extend the view in `analysis/views.sql` so `sudop_*`, `regas_*`, `gov_si_*`, `bdns_enisa_*`, `bdns_ico_*`, `bdns_cofides_*` are part of the state-aid family.

### Post-3 — Update methodology + memory

`docs/methodology.md`: extend coverage table with PL/RO/SI portals + ES BDNS multi-organo. Update the "structural blind spot" section if ES coverage expands.

Sprint 17 memory file `project_sprint_17_national_portals.md`: per-portal event counts, TCTF coverage, caveats.

### Post-4 — Site updates

Defer site changes to Sprint 19.

---

## File manifest

| File | Action |
|---|---|
| `scripts/extract_sudop.py` | **Extend** INNOVATION_MEASURES to ~40 codes; add `--rate-limit-seconds` flag |
| `scripts/extract_bdns_multi.py` | **New** (parameterised over CDTI pattern; or extend `extract_cdti.py` with org filter) |
| `scripts/extract_regas.py` | **New** (Romanian SATR-equivalent) |
| `scripts/extract_gov_si_aid.py` | **New** (Slovenian SATR-equivalent) |
| `scripts/load_satr.py` | Extend `_TCTF_PATTERNS` with PL/RO/SI native + ES regional |
| `scripts/lib/ndb_taxonomy.py` | Add SID_banka, SPS labels; ensure enisa/ico/cofides/red_es labels present |
| `analysis/views.sql` | Extend `v_state_aid_layer` to cover new source prefixes |
| `docs/methodology.md` | Coverage table extension |

---

## Validation gates

| Gate | Criterion |
|---|---|
| G1 Baseline | `sanity_check.py` clean post-Sprint 16; backup at `/tmp/eit_data_backup/db.sqlite.pre-sprint17.bak` |
| G2 SUDOP extend | 5,000-25,000 PL events; pfr/ncbr/bgk/parp NDB tags substantial |
| G3 ES BDNS multi | 2,000-8,000 ES events; enisa/ico/cofides NDB tags substantial |
| G4 REGAS load | 10,000-30,000 RO events; EximBank Romania appears |
| G5 gov.si load | 5,000-15,000 SI events; SID Banka, SPS appear |
| G6 TCTF coverage | Each portal's COVID/crisis aid filtered out (sample spot-check) |
| G7 No equity > cost | Zero events with `equity_amount_eur > total_project_cost_eur` |
| G8 4-layer view | `v_state_aid_layer` now includes PL/RO/SI/ES-multi rows |
| G9 Coverage doc | Methodology updated with per-portal caveats |

---

## Expected corpus growth

| Workstream | New events | New companies (post-dedup) |
|---|---:|---:|
| PL SUDOP (extend from 22 to full curated list) | 5,000-25,000 | 3,000-15,000 |
| ES BDNS (ENISA + ICO + COFIDES) | 2,000-8,000 | 1,500-5,000 |
| REGAS (RO) | 10,000-30,000 | 6,000-18,000 |
| gov.si (SI) | 5,000-15,000 | 3,000-10,000 |
| **Grand total** | **22,000-78,000** | **13,500-48,000** |

**Sprint 17 corpus target: ~130,000-165,000 companies / ~235,000-292,000 events.**

---

## Execution order

**A → C → D → B.**

- **A (PL SUDOP extend) first**: scaffold exists; quickest path to results once rate-limit tuned.
- **C (REGAS) + D (gov.si)** second: parallel; small new build, no rate-limit risk.
- **B (ES BDNS) last** because: (i) blocked on WAF clearance / network egress, (ii) longest run time at 30s throttle.

---

## Out of scope (explicit)

- **Pre-2021 historical**: matches Sprint 15 window.
- **Sub-threshold awards**: same €100k floor as SATR for cross-country comparability.
- **TCTF / COVID emergency aid**: explicitly excluded.
- **NDB commercial-conform equity in PL/RO/SI**: same Art. 107 TFEU blind spot as everywhere else — see [`backlog/commercial_conform_ndb_equity.md`](backlog/commercial_conform_ndb_equity.md).

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| BDNS WAF still blocking ES queries | Defer Workstream B; document at end of sprint as the one remaining gap. Try network egress alternative (Mullvad / Tailscale exit node). |
| SUDOP rate limits even at 30s throttle | Increase to 60s; or queue measures across multiple sessions with cache resume. |
| REGAS HTML structure breaks scraper mid-run | Cache raw HTML; tolerate 5% noisy rows. |
| gov.si annual files in inconsistent formats per year | Per-year format adapter; tolerate format drift. |
| Polish/Romanian/Slovenian name-matching diacritic issues | Sprint 15's `unicodedata.normalize("NFKD")` matcher handles these — spot-check 50 rows manually. |

---

## Definition of done

- All four national-portal workstreams loaded (B may be partially blocked, document the gap).
- State-aid layer covers all 27+1 European-scope countries' central registers where one exists.
- Polish + Spanish + Romanian + Slovenian NDBs substantively visible in `v_ndb_distributor_rollup`.
- TCTF coverage extended with PL/RO/SI/ES native-language patterns.
- Sprint 17 memory file written.
- `MEMORY.md` index updated.
- **State-aid grant layer is now complete** — only the structural commercial-conform NDB equity blind spot remains (deferred to [`backlog/commercial_conform_ndb_equity.md`](backlog/commercial_conform_ndb_equity.md)).
