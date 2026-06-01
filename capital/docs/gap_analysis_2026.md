# EuroInvTracker: Comprehensive Coverage Gap Analysis
*Compiled 2026-06-01. Journalism-grade audit of current coverage vs. full universe of EU investment vehicles and national industrial policy tools.*

---

## Current Database State
**213,906 events / 116,246 companies / ~€252B tracked**

| Source family | Events | Companies | €B grant/invest |
|---|---|---|---|
| SATR (state aid) | 122,814 | 78,150 | 169.7 |
| Horizon Europe CL1/3/4/5/6 | 47,289 | 15,529 | 19.0 |
| ADEME (France) | 27,697 | 18,801 | 7.8 |
| NDB direct (HTGF/CDTI/Almi/CDP VC/Tesi/Coparion/Invest-NL/Bpifrance/SPRIND/EIFO/Innovationsfonden/EI) | ~13,800 | ~10,500 | ~2.8 |
| EIC (Pathfinder/Accelerator/Transition) | 3,732 | 2,108 | 3.4 |
| CDTI (Spain direct) | 1,880 | 1,513 | ~0.5 |
| Innovationsfonden (Denmark) | 3,313 | 2,460 | 0.9 |
| IPCEI (11 projects) | 317 | 301 | — |
| EDF (RA/DA 2021-2025) | 280 | 194 | ~0.7 |
| Innovation Fund (all windows 2020-2024) | 246 | 236 | ~6.5 |
| EIT KICs (8 of 10) | 463 | 451 | — |
| EIB Venture | 153 | 151 | — |
| Clean Hydrogen Partnership | 141 | 94 | — |
| Chips JU / KDT JU (2020-2023) | 60 | 36 | — |
| IHI (2022-2025) | 56 | 41 | — |
| EuroHPC | 22 | 14 | — |
| SUDOP Poland (partial) | 22 | 20 | — |
| FR Relance Industrie | 2,835 | 2,735 | — |

---

## SECTION 1: EU-LEVEL INSTRUMENTS — Gap Table

### 1A. Horizon Europe

| Instrument | Budget (2021-27) | In DB? | Gap notes | Priority |
|---|---|---|---|---|
| Cluster 1 (Health) | ~€8.2B | **YES** (2021-2024) | Missing 2025-2026 WP data (populates in CORDIS ~6-12m post-call) | Low |
| Cluster 2 (Culture/Creativity) | ~€2.3B | NO | Low innovation-company relevance; mostly universities/NGOs | Skip |
| Cluster 3 (Civil Security) | ~€1.7B | **YES** (2021-2024) | — | Low |
| Cluster 4 (Digital/Industry/Space) | ~€15.3B | **YES** (2021-2024) | Missing 2025-2026 data | Low |
| Cluster 5 (Climate/Energy/Mobility) | ~€15B | **YES** (2021-2025) | Mostly current | Low |
| Cluster 6 (Food/Bioeconomy) | ~€10B | **YES** (2021-2025) | Mostly current | Low |
| Cluster 7 (Civil Security II) | — | NO (not a real cluster) | CL3 already is Civil Security | N/A |
| **EU Missions** (HORIZON-MISS-* topics) | ~€1.9B | **NO** | Topic prefix `HORIZON-MISS-*` not caught by cluster extractor. Could add hundreds of company records. Easy fix in `extract_cordis_pillar_ii.py` | **HIGH** |
| **EIE / Eurostars** (HORIZON-EIE-*) | ~€500M | **NO** | Explicitly company-led SME cross-border R&D. Topic prefixes `HORIZON-EIE-*`, `HORIZON-INNOVSMES-*`. CORDIS data available | **HIGH** |
| ERC main grants (STG/COG/ADG/SyG) | ~€16B | NO | Academic-oriented; companies are minority of hosts | Skip |
| **ERC Proof of Concept** (ERC-PoC) | ~€35-40M/yr | **NO** | Explicitly commercial bridge grants; ~200-300/yr at €150k each. Easy CORDIS filter on `HORIZON_ERC-*-POC` | Medium |
| MSCA Doctoral Networks | ~€6.6B | NO | MSCA-DN Industrial Doctorates involve companies; niche | Low |
| Widening (HORIZON-WIDERA-*) | ~€3.5B | NO | Mainly academic capacity-building in EU-13 | Skip |
| 2026-2027 Work Programme | €14B total | Partial | Data populates in CORDIS as projects signed; no action needed | Passive |

### 1B. Joint Undertakings

| JU | Budget (total) | In DB? | Gap notes | Priority |
|---|---|---|---|---|
| Chips JU / KDT JU | ~€11B | **YES** (2020-2023) | Missing 2024+ calls; **KDT-2023 portal incompleteness documented** | Medium |
| Clean Hydrogen JU (CH JU) | >€2B | **YES** (as `chp_*`) | Appears to be covered via `extract_chips_ju.py` approach; verify completeness | Low |
| Innovative Health Initiative (IHI) | €2.4B | **YES** (2022-2025) | 56 events — likely thin; IHI partners often large pharma, not startups | Low |
| EuroHPC JU | ~€7B | **YES** (small, 22 events) | Infrastructure mainly; AI Factories (2024+) may add company-accessible compute grants | Low |
| **Clean Aviation JU** | €4.1B | **NO** | No extractor. CORDIS prefix `HORIZON-JU-CLEANAV-*`. Aerospace primes + deep tech | **MEDIUM** |
| **Circular Bio-based Europe JU (CBE JU)** | €2B | **NO** | No extractor. CORDIS prefix `HORIZON-JU-CBE-*`. Biotech/cleantech companies | **MEDIUM** |
| **Europe's Rail JU** | ~€2.2B | **NO** | No extractor. CORDIS prefix `HORIZON-JU-RAIL-*`. Rail technology suppliers | Low |
| **SNS JU (6G)** | ≥€1.8B | **NO** | No extractor. CORDIS prefix `HORIZON-JU-SNS-*`. 6G tech companies | Low |
| SESAR 3 JU | >€1.6B | NO | ATM research; mostly incumbents (Airbus, Thales, etc.) | Low |
| Global Health EDCTP3 JU | €1.84B | NO | African/European health research; low company-level relevance for innovation tracker | Skip |

### 1C. IPCEIs

| IPCEI | Approval | In DB? | Gap notes | Priority |
|---|---|---|---|---|
| IPCEI Microelectronics I ("ME") | Dec 2018 | **NO** | First Micro IPCEI; ~29 companies. Pre-DB period, 6 countries | Low |
| IPCEI Batteries I ("EuBat") | Dec 2019 | **PARTIAL** (as `ipcei_batteries`) | Needs cross-check — 23 events could be EuBat or EuBatIn | Low |
| IPCEI EuBatIn | Jan 2021 | **YES** (`ipcei_eubatin`) | — | — |
| IPCEI Hy2Tech | Jul 2022 | **YES** (`ipcei_hy2tech`) | — | — |
| IPCEI Hy2Use | Sep 2022 | **YES** (`ipcei_hy2use`) | — | — |
| IPCEI Hy2Infra | Feb 2024 | **YES** (`ipcei_hy2infra`) | — | — |
| IPCEI Hy2Move | Late 2024 | **YES** (`ipcei_hy2move`) | — | — |
| IPCEI ME/CT (MECT) | Jun 2023 | **YES** (`ipcei_mect`) | — | — |
| IPCEI Micro I | — | **YES** (`ipcei_micro`) | — | — |
| IPCEI CIS (Cloud) | Dec 2023 | **YES** (`ipcei_cloud`) | — | — |
| IPCEI Med4Cure | May 2024 | **YES** (`ipcei_med4cure`) | — | — |
| IPCEI Tech4Cure | Jul 2025 | **YES** (`ipcei_tech4cure`) | Very recent; verify completeness | Low |
| **IPCEI-AI** | Expected 2027 | NO | Matchmaking phase now; no data yet | Future |
| **IPCEI-CIC** (Compute) | Expected 2027 | NO | In design phase | Future |
| **IPCEI-AST** (Advanced Semiconductors) | TBD | NO | EOI phase | Future |

### 1D. EIB Group

| Instrument | Scale | In DB? | Gap notes | Priority |
|---|---|---|---|---|
| EIB Venture Debt | >€1B/yr to deep tech | **YES** (153 events) | Limited to named projects on eib.org; intermediated loans invisible | Low |
| EIF-backed VC fund portfolios | €145B+ mobilised | **NO (structural)** | EIF does not publish company-level portfolio data; intermediary-level only. Not tractable | Structural gap |
| **EIC Fund** (direct equity arm) | €3B (2021-27) | **NO** | EIC Fund makes direct equity investments in ~400+ companies. Portfolio published at eic.ec.europa.eu/eic-fund. Separate from EIC grants already tracked | **HIGH** |
| InvestEU intermediated | €38B guarantee | NO | Company-level invisible; structural gap same as EIF | Structural gap |
| **ETCI** (European Tech Champions Initiative) | €3.9B → €20B+ mobilised | **NO** | 13 growth-stage funds backed; 38+ portfolio companies (ETCI 1). Fund names published. Company-level partially on Crunchbase/Dealroom. Partial extract possible | Medium |
| European Angels Fund (EAF) | >€800M | NO | Individual co-investments not systematically published | Low |

### 1E. Other EU Programmes

| Programme | Budget (2021-27) | In DB? | Gap notes | Priority |
|---|---|---|---|---|
| Innovation Fund (all windows) | ~€40B (2020-30) | **YES** (2020-2024) | Full coverage. Missing IF25 (2025 call, awards ~late 2025-2026) | Low |
| EDF (European Defence Fund) | €7.3B + €1.5B STEP | **YES** (2021-2025) | ~50% factsheet coverage; 2024 amounts pending F&T Portal population; 2025 call TBD | Medium |
| **EDIP** (European Defence Industry Programme) | €1.5B (2025-27) | **NO** | Adopted Dec 2025. First direct EU defence industrial grants. First results likely 2026. Monitor DG DEFIS | **MEDIUM** |
| Digital Europe Programme (DEP) | €7.5B | **NO** | No CORDIS equivalent; data on HADEA press releases + F&T portal. AI/HPC calls relevant to deep tech companies | Medium |
| LIFE Programme (companies) | €5.4B | **NO** | CINEA public database (life3.0). Company beneficiaries in Clean Energy Transition sub-programme | Low |
| **CASSINI** (space startups) | €1B VC + prizes | **NO** | Challenge winners published (EUSPA); ~30 companies/yr. Easy to add | Low |
| CEF Digital | €2.07B | NO | Telecom operators mainly; not startup-relevant | Skip |
| **ERDF/Cohesion (PO1/TO1 companies)** | >€75B PO1 | **NO** | Kohesio.ec.europa.eu has 1.7M projects for 2014-2020 + growing 2021-27. Filtering for private sector + innovation = tens of thousands of company records | **HIGH (long-term)** |
| RRF/NGEU company grants | €723B total | **NO (structural)** | Top-100 per country only required. Major transparency gap; not tractable EU-wide | Structural gap |
| Just Transition Fund | €17.5B | NO | No EU-level company register; national/regional managed | Structural gap |
| EU4Health | €2.4B | NO | HaDEA publishes awards; relevant for health tech | Low |
| ERC-PoC (see 1A above) | ~€35-40M/yr | NO | Covered above | Medium |
| **eAid Register** (de minimis, from Jan 2026) | NEW | **NO (new)** | Central register of all de minimis aid (≤€300k/3yrs) across EU. Live Jan 2026; data maturing. Will be biggest single new data source once populated. Monitor aid-register.ec.europa.eu | **CRITICAL (2027)** |

---

## SECTION 2: NATIONAL DEVELOPMENT BANKS — Gap Table by Country

### Status codes: ✅ = in DB | 🟡 = partial/via SATR only | ❌ = not in DB | — = no open register exists

---

### Germany

| Institution | Type | Status | Gap/Notes | Open data? |
|---|---|---|---|---|
| KfW | National bank | 🟡 SATR only | Domestic loan portfolio not public | — |
| KfW Capital | VC FoF | ❌ | Future Fund vehicles (DTCF, Growth Fund) — FoF, no company register | — |
| HTGF | VC | ✅ direct scraper | 857 events | Yes (website) |
| Coparion | VC co-invest | ✅ direct scraper | 52 events | Yes (website) |
| SPRIND | Challenge/grants | ✅ direct scraper | 20 events | Yes (website) |
| Rentenbank | Agri/rural bank | 🟡 SATR | 1,281 SATR events | — |
| All 16 Landesbanken (ILB, L-Bank, SAB, IFB, IBB, LfA, NBank, WIBank, TAB, IB.SH, etc.) | State dev banks | 🟡 SATR | In DB via state aid grants. NRW.BANK (Germany's largest) among them | — |
| BMBF company grants | Federal R&D grants | ❌ | ~€4-6B/yr to industry via Projektträger — NO central open register | — |
| Bayern Kapital | VC (Bavaria) | ❌ | ~€350M AUM; portfolio website only | — |

### France

| Institution | Type | Status | Gap/Notes | Open data? |
|---|---|---|---|---|
| Bpifrance grants (IDF) | Innovation grants | ✅ partial | Sprint 16: i-Nov, PM'up, Innov'up Leader, PdR-Industriel (3,841 events €619M) | data.gouv.fr SCDL |
| ADEME | Environment grants | ✅ direct | 27,697 events €7.76B | data.ademe.fr (open) |
| FR Relance Industrie | Industrial policy | ✅ | 2,835 events | — |
| Bpifrance equity/VC portfolio | VC | ❌ | 1,500+ investments, NO official open register | — |
| Caisse des Dépôts direct | Equity | ❌ | Partial SATR; no open company register | — |
| **French regions (12 remaining)** | Innovation grants | ❌ | data.gouv.fr "données essentielles" (SCDL schema, ≥€23k mandatory disclosure). Occitanie, AURA, PACA, Grand Est, Bretagne, Nouvelle-Aquitaine + 6 more | **data.gouv.fr SCDL — open** |
| France 2030 | Multi-sector | ❌ | €54B programme via Bpifrance + ANFr; beneficiary data partially on data.gouv.fr | Partial |

### Italy

| Institution | Type | Status | Gap/Notes | Open data? |
|---|---|---|---|---|
| CDP (parent) | National bank | 🟡 SATR | No open company portfolio register | — |
| CDP Venture Capital | VC | ✅ partial | 81 events; Sprint 13 scraper | Website only |
| Invitalia | Grants | 🟡 SATR | Large SATR presence (invitalia NDB tag: 2,298 events) | Via RNA |
| MedioCredito Centrale | Guarantee fund | 🟡 SATR | 14,345 SATR events; Fondo di Garanzia sub-threshold invisible | Via SATR |
| **RNA (Registro Nazionale Aiuti)** | National aid register | ❌ | Covers ALL Italian state aid incl. de minimis not in SATR. rna.mimit.gov.it. IODL open license but needs registration for bulk access | **Partial open** |
| SACE | Export credit | 🟡 SATR | Not innovation-core | — |
| SIMEST 394 Fund | Internationalisation loans | ❌ | €800M+/yr; no open beneficiary register | — |
| Regional Italian DFIs (Finlombarda, FILAS, Puglia Sviluppo, etc.) | Regional equity/grants | 🟡 SATR | Partially in SATR; no direct extractors | — |

### Spain

| Institution | Type | Status | Gap/Notes | Open data? |
|---|---|---|---|---|
| CDTI | R&D grants | ✅ direct | 1,880 events | Via BDNS API |
| **Spain BDNS (all public bodies)** | National grant register | ❌ | REST API at pap.hacienda.gob.es covers ALL Spanish public bodies: ENISA, AEI, ICO, 17 autonomous communities (SPRI Basque, AGAUR Catalonia, GAIN Galicia, IVACE Valencia, ACCIÓ, etc.). Python lib `bdns-fetch` available. Daily updates | **OPEN API — top priority** |
| ICO | Loan guarantees | 🟡 SATR | Loans not grant-equivalent; 813 SATR events | — |
| ENISA | SME loans | ❌ | ~€80-90M/yr, 514 loans in 2025; in BDNS | Via BDNS |
| AEI (research agency) | R&D grants | ❌ | ~€1.4B/yr; mostly academic; in BDNS | Via BDNS |
| COFIDES | Equity/quasi-equity | ❌ | Small scale (~€50-100M); no open register | — |

### Netherlands

| Institution | Type | Status | Gap/Notes | Open data? |
|---|---|---|---|---|
| Invest-NL | Co-invest | ✅ partial | 13 events (very thin); ~65 portfolio companies | Website only |
| RVO (SDE++, MIT, etc.) | Innovation grants | 🟡 SATR | 2,325 SATR events; SDE++/WBSO no public company register | — |
| 5 regional dev agencies (NOM, Oost NL, InnovationQuarter, BOM, LIOF) | Regional VC/grants | ❌ | Combined several hundred portfolio companies; website portfolios only | — |

### Poland

| Institution | Type | Status | Gap/Notes | Open data? |
|---|---|---|---|---|
| SUDOP | State aid register | ✅ partial | 22 events; 9 measures + extension remaining | sudop.uokik.gov.pl |
| **PFR Ventures** | VC FoF | ❌ | **950 company investments 2008-H1 2024. Downloadable from pfrventures.pl** | **Open download** |
| **NCBR** | R&D grants | ❌ | 13,000+ projects; 6,700 enterprises funded. osf.opi.org.pl project database | **Partial open** |
| **mapadotacji.gov.pl** | EU cohesion portal | ❌ | Covers PARP, BGK, NCBR, all regional EU structural fund grants to Polish companies. Hundreds of thousands of beneficiaries | **EU transparency requirement** |
| PFR (parent) | Dev bank | ❌ | No company-level open register for direct activities | — |
| BGK | State bank | 🟡 SATR | No loan portfolio open register | — |
| PARP | SME agency | ❌ | EU structural fund grants; mapadotacji.gov.pl | Via mapadotacji |
| ARP (industrial dev) | Strategic invest | ❌ | Strategic; no open register | — |

### Sweden

| Institution | Type | Status | Gap/Notes | Open data? |
|---|---|---|---|---|
| Vinnova | Innovation grants | 🟡 SATR (514 events) | **Full open API portal.api.vinnova.se (CC0), 2010-present, API key free. ~1,000+ company grants/yr. This is the biggest single Swedish gap** | **Open API — top priority** |
| Almi Invest | VC | ✅ direct | 323 events | Website |
| Almi (loans) | SME loans | 🟡 SATR | Loan portfolio not public | — |
| Industrifonden | VC | ❌ | ~10-15 new investments/yr; website portfolio only | — |
| Saminvest | VC FoF | ❌ | FoF structure; invests in VC funds, not directly | — |

### Denmark

| Institution | Type | Status | Gap/Notes | Open data? |
|---|---|---|---|---|
| EIFO | VC co-invest | ✅ direct | 131 events | Website |
| Innovationsfonden | Grants | ✅ direct | 3,313 events €892M | Website open data |
| EKF | Export credit | — | Not relevant | — |

### Finland

| Institution | Type | Status | Gap/Notes | Open data? |
|---|---|---|---|---|
| Business Finland | Innovation grants | 🟡 SATR (1,988 events) | **Direct open funding database on avoindata.fi confirmed. ~500-1,000 company grants/yr, ~€500-600M annually. Major gap** | **Open DB on avoindata.fi** |
| Tesi / Business Finland VC (merged 2025) | VC | ✅ partial | 99 events; post-2025 merger may add BFVC portfolio | Website |
| Finnvera | Loans/guarantees | 🟡 SATR | Loan portfolio not public | — |

### Austria

| Institution | Type | Status | Gap/Notes | Open data? |
|---|---|---|---|---|
| FFG | R&D grants | 🟡 SATR (2,277 events) | Large SATR presence. No confirmed bulk API for direct extraction | Project search (no bulk) |
| aws (Austria Wirtschaftsservice) | Grants/equity | 🟡 SATR (662 events) | aws Growth Investment (direct equity) not public beyond SATR | — |
| OeKB / ERP-Fonds | Loans | 🟡 SATR | Not innovation-core | — |
| Austrian regional agencies (SFG, ecoplus, etc.) | Regional grants | 🟡 SATR | Partially in SATR | — |

### Belgium

| Institution | Type | Status | Gap/Notes | Open data? |
|---|---|---|---|---|
| SFPIM | Federal equity | ❌ | ~100+ portfolio companies; website portfolio only | — |
| PMV (Flanders) | VC/loans | ❌ | ~€1.3B AUM; website portfolio only | — |
| **VLAIO / AIO (Flanders)** | Innovation grants | ❌ | Flemish innovation grants. open.vlaanderen.be open data portal confirmed | **Open data portal** |
| SOGEPA / SRIW (Wallonia) | Equity/grants | 🟡 SATR | Partially in SATR | — |
| Wallonie Entreprendre | Loans | 🟡 SATR (4 events) | — | — |
| Finance.brussels | Equity/debt | ❌ | No open register | — |

### Czech Republic

| Institution | Type | Status | Gap/Notes | Open data? |
|---|---|---|---|---|
| NRB (Národní rozvojová banka) | Dev bank | 🟡 SATR (2 events) | Very thin; new institution | — |
| ČMZRB | Guarantee | 🟡 SATR | SME guarantees | — |
| **TAČR** | R&D grants | ❌ | ~10,000+ projects; project database on tacr.gov.cz incl. companies | **Website database** |
| **CzechInvest / dotaceEU.cz** | EU structural funds | ❌ | EU cohesion transparency data; Czech portal | **EU transparency** |

### Portugal

| Institution | Type | Status | Gap/Notes | Open data? |
|---|---|---|---|---|
| BPF (Banco Português de Fomento) | Dev bank | 🟡 SATR (5 events) | Very thin | — |
| Portugal Ventures | VC | ❌ | 130+ portfolio companies; website only | — |
| **IAPMEI / ANI / PT2030** | Innovation grants | ❌ | EU structural fund grants; portugal2030.pt. dados.gov.pt | **EU transparency** |

### Greece

| Institution | Type | Status | Gap/Notes | Open data? |
|---|---|---|---|---|
| HDB | Dev bank | 🟡 SATR (63 events) | Very thin for country of this size | — |
| HDBI (TANEO/FoF) | VC FoF | ❌ | 42 VC funds, ~3,500 company investments via funds; no open register | — |
| **Greek EU structural funds (ESPA)** | EU cohesion | ❌ | espa.gr beneficiary data | **EU transparency** |

### Hungary

| Institution | Type | Status | Gap/Notes | Open data? |
|---|---|---|---|---|
| MFB | Dev bank | 🟡 SATR (14 events) | Very thin | — |
| Garantiqa | Guarantee | 🟡 SATR (1 event) | — | — |
| NKFIH | R&D grants | ❌ | Company grants; nkfih.gov.hu | No confirmed open data |

### Ireland

| Institution | Type | Status | Gap/Notes | Open data? |
|---|---|---|---|---|
| Enterprise Ireland | VC/grants | ✅ partial | 6 events (very thin vs. actual 157 startups/yr); scraper may be incomplete | Website |
| IDA Ireland | FDI incentives | ❌ | No open company-level register (commercial sensitivity) | — |
| ISIF | Sovereign fund | ❌ | Portfolio on isif.ie; website only | — |
| SBCI | SME guarantees | ❌ | No company register | — |

### Baltic States

| Institution | Country | Status | Gap/Notes | Open data? |
|---|---|---|---|---|
| **ALTUM** | Latvia | ❌ | NDB; open data on data.gov.lv confirmed | **data.gov.lv** |
| **EIS (KredEx + EAS merged)** | Estonia | ❌ | Funded projects database on eis.ee confirmed | **eis.ee** |
| **ILTE (formerly INVEGA)** | Lithuania | ❌ | Open data on data.gov.lt confirmed | **data.gov.lt** |

### Norway (EEA, not EU)

| Institution | Type | Status | Gap/Notes | Open data? |
|---|---|---|---|---|
| **Innovasjon Norge** | Innovation grants | ❌ | **Tildelinger.csv direct download at data.innovasjonnorge.no. ~€300M+/yr to Norwegian companies. Highest single ROI of all gaps** | **Direct CSV download (CC0)** |
| **Norges Forskningsråd** | R&D grants | ❌ | Open data on data.norge.no. Company grants confirmed | **data.norge.no** |
| Siva | Industrial parks | ❌ | Grants to incubators, not directly to companies | — |
| Argentum | VC FoF | ❌ | FoF; no company-level register | — |

### Switzerland (EEA-associated)

| Institution | Type | Status | Gap/Notes | Open data? |
|---|---|---|---|---|
| **Innosuisse** | Innovation grants | ❌ | Data portal at innosuisse.admin.ch confirmed. CHF 341M/yr (€380M) | **Portal confirmed** |
| SNF | Academic grants | ❌ | Primarily academic; P-3 database open | Low relevance |

### Romania, Slovakia, Slovenia, Croatia, Bulgaria

| Country | Institution | Status | Notes | Priority |
|---|---|---|---|---|
| Romania | REGAS (national SATR) | ❌ | National portal; inconsistent data quality; Romanian-language | Medium |
| Romania | EU cohesion (mfe.gov.ro) | ❌ | fondurieuropene.ro beneficiary data | Medium |
| Slovakia | APVV | ❌ | R&D grants; apvv.sk project database | Low |
| Slovakia | EU cohesion (ITMS) | ❌ | itms2014.sk | Low |
| Slovenia | National SATR | ❌ | gov.si/teme/; static page, no bulk export | Low |
| Croatia | HAMAG-BICRO | ❌ | No confirmed open register | Low |
| Bulgaria | EU cohesion | ❌ | eufunds.bg | Low |

### Luxembourg, Iceland

| Country | Institution | Status | Notes | Priority |
|---|---|---|---|---|
| Luxembourg | SNCI, Luxinnovation | ❌ | No open registers found | Low |
| Iceland | Rannís | ❌ | Grant list on rannis.is; small scale (~€20-30M/yr) | Low |

---

## SECTION 3: STATE AID / SATR — Coverage Gaps

### 3A. Countries Not in SATR → National Registers

| Country | Status | Portal | Difficulty |
|---|---|---|---|
| Poland | ✅ SUDOP (partial, 22 events) | sudop.uokik.gov.pl | 9 measures + extension remaining |
| **Romania** | ❌ Not in DB | regas.consiliulconcurentei.ro | Medium — Romanian-language, data quality inconsistent |
| **Slovenia** | ❌ Not in DB | gov.si/teme/objava-vecjih-prejemnikov | Hard — static page, no bulk export |
| Spain | 🟡 SATR (CCAA reporting inconsistent) | BDNS (far richer) | Medium — BDNS API is the better source |

### 3B. SATR Countries with Known Data Quality Issues

| Country | Issue |
|---|---|
| Spain | CCAA (autonomous community) agencies report inconsistently; some regions years late or not at all. CDTI separately tracked as mitigation |
| Hungary, Bulgaria | Missing/NULL `StateAidObjective*` metadata fields — in-scope aid may fall through objective filter |
| Malta, Cyprus, Luxembourg | Thin data overall; LU per-capita may be inflated by holding-company registrations (Sprint 9 finding) |
| All 2020-2022 | COVID/TCTF contamination already filtered (169k rows skipped) — but combined-objective awards remain a residual risk |

### 3C. New/Upcoming SATR Developments

| Development | Timeline | Impact |
|---|---|---|
| **eAid Register** (de minimis, Reg. 2023/2831) | Live Jan 2026; meaningful data ~2027 | **CRITICAL** — first-ever central register of all de minimis aid (≤€300k/3yrs) across EU. Currently a total blind spot: NDB grants below threshold invisible. This will be the largest single new data source once populated. Monitor aid-register.ec.europa.eu |
| GBER 2027 revision | Jan 2027 | `satr_filters.py` BID list will need updating — new article codes with `2026GberArt*` vintage suffixes |
| Spain BDNS systematic extraction | Now feasible | REST API covers all Spanish public bodies; far richer than CCAA-dependent SATR |

---

## SECTION 4: HORIZON EUROPE — Detailed Completeness

| Source | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|---|
| CL1 (Health) | ✅ | ✅ | ✅ | ✅ | — | — |
| CL3 (Civil Security) | ✅ | ✅ | ✅ | ✅ | — | — |
| CL4 (Digital/Industry) | ✅ | ✅ | ✅ | ✅ | 🟡 partial | — |
| CL5 (Climate/Energy) | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| CL6 (Food/Bio) | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| **Missions (HORIZON-MISS-*)** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **EIE / Eurostars (HORIZON-EIE-*)** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| ERC-PoC | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| CL2 (Culture) | skip | skip | skip | skip | skip | skip |
| ERC main grants | skip | skip | skip | skip | skip | skip |
| MSCA | skip | skip | skip | skip | skip | skip |

**Easy fix**: Add `HORIZON-MISS-` and `HORIZON-EIE-` to the clusters dict in `extract_cordis_pillar_ii.py`. These topics are already in the CORDIS bulk CSV — zero new data source, just prefix filter.

---

## SECTION 5: PRIORITY MATRIX

### Tier 1 — High impact, open data confirmed, 1-2 week build

| Gap | Expected records | Data source | Effort |
|---|---|---|---|
| **Innovasjon Norge (Norway)** | ~5,000 company events/yr | Direct CSV `data.innovasjonnorge.no` (CC0) | **1-2 days** |
| **Vinnova (Sweden)** | ~1,000 company grants/yr, 2010+ history | `portal.api.vinnova.se` open API, free key | **2-3 days** |
| **Spain BDNS systematic** | Thousands/yr — all Spanish public bodies | REST API `pap.hacienda.gob.es` (bdns-fetch lib) | **3-5 days** |
| **EIC Fund portfolio** | ~400+ companies | `eic.ec.europa.eu/eic-fund` (public list) | **1-2 days** |
| **Horizon Missions (HORIZON-MISS-*)** | ~hundreds of additional cos | Already in CORDIS bulk CSV; add prefix filter | **< 1 day** |
| **Horizon EIE/Eurostars (HORIZON-EIE-*)** | ~hundreds of additional cos | Already in CORDIS bulk CSV; add prefix filter | **< 1 day** |
| **Business Finland direct** | ~500-1,000 grants/yr | `avoindata.fi` Business Finland dataset | **2-3 days** |
| **PFR Ventures (Poland)** | 950 investments (2008-H1 2024) | Download from `pfrventures.pl/en/our-portfolio` | **1 day** |

### Tier 2 — Medium impact, partial/imperfect data

| Gap | Expected records | Data source | Effort |
|---|---|---|---|
| ~~French regional grants (SCDL)~~ | **TESTED & REJECTED** | Occitanie test (64k rows, 749 post-filter): mostly schools/associations/public bodies not private innovative companies. Regional R&D grants ≥€100k already in SATR. France is Tier-A. | — |
| NCBR Poland | ~6,700 enterprises | `osf.opi.org.pl` | 3-5 days |
| ALTUM (Latvia) | Hundreds | `data.gov.lv` | 1-2 days |
| ILTE (Lithuania) | Hundreds | `data.gov.lt` | 1-2 days |
| EIS Estonia (KredEx+EAS) | Hundreds | `eis.ee` funded projects DB | 1-2 days |
| TAČR Czech Republic | Thousands | `tacr.gov.cz` project DB | 2-3 days |
| IAPMEI/PT2030 Portugal | Hundreds | `portugal2030.pt` | 2-3 days |
| mapadotacji.gov.pl Poland | Tens of thousands | EU cohesion transparency | 5+ days |
| Clean Aviation JU | Hundreds | CORDIS `HORIZON-JU-CLEANAV-*` | 1 day (same pattern as Chips JU) |
| CBE JU (bio-based) | Hundreds | CORDIS `HORIZON-JU-CBE-*` | 1 day |
| Romania REGAS | Thousands | `regas.consiliulconcurentei.ro` | 3-5 days (data quality issues) |
| EDIP (defence) | Dozens/yr | DG DEFIS (first results ~late 2026) | Future |
| VLAIO Flanders | Hundreds/yr | `open.vlaanderen.be` | 2-3 days |
| ERC-PoC | ~200-300/yr | CORDIS `HORIZON_ERC-*-POC` | < 1 day |
| Innosuisse (Switzerland) | ~hundreds/yr | `innosuisse.admin.ch` data portal | 2-3 days |
| ETCI portfolio companies | ~38+ (ETCI1) | Partial Crunchbase/Dealroom cross-ref | Medium |

### Tier 3 — Structural gaps (no open register; not tractable in near term)

| Gap | Why untractable |
|---|---|
| KfW domestic loan portfolio | No company-level register by design |
| BMBF project grants (via Projektträger) | Distributed via 20+ agencies; no central register |
| EIF/InvestEU VC portfolio companies | Intermediary-level only; structural transparency gap |
| RRF/NGEU company grants | Top-100 per MS required; not systematic |
| JTF company grants | National/regional managed; no EU registry |
| Finnvera loan/guarantee portfolio | No public register confirmed |
| IDA Ireland FDI incentives | Commercial sensitivity |
| ICO Spain loans | Loans not grants |

### Tier 0 — Critical future watch (not actionable yet)

| Gap | Timeline | Why important |
|---|---|---|
| **eAid Register** (de minimis) | Data meaningful ~2027 | First-ever EU-wide de minimis register; will capture NDB grants currently invisible below €100k SATR threshold |
| **IPCEI-AI** | Approval ~2027 | 17 Member States participating; industrial AI ecosystem |
| **IPCEI-CIC** (Compute Infrastructure) | Approval ~2027 | Sovereign European compute |
| **ECF** (European Competitiveness Fund) | Enters force 2028 | Replaces Horizon, InvestEU, DEP, CEF, EDF and others — will restructure all our source families |
| Kohesio ERDF PO1 private sector | ~2027 for 2021-27 data maturity | Potentially 50,000+ additional innovation company events |

---

## SECTION 6: SATR — Countries/Years Currently in DB

| Country | SATR events | Notes |
|---|---|---|
| DE | 29,948 | Comprehensive |
| IT | 28,520 | Comprehensive; RNA adds de minimis |
| FR | 17,778 | Comprehensive; BPI/ADEME separately extracted |
| NL | 6,757 | Good |
| HU | 5,885 | Quality issues (NULL objectives) |
| AT | 5,422 | Good |
| BE | 5,160 | Good |
| CZ | 4,535 | Good |
| SE | 3,585 | Partial; Vinnova direct API much richer |
| FI | 2,699 | Partial; Business Finland direct much richer |
| GR | 1,953 | Thin for country size |
| SK | 1,937 | Adequate |
| IE | 1,480 | Thin; Enterprise Ireland separately thin |
| PT | 1,325 | Thin |
| LV | 1,085 | Adequate |
| HR | 999 | Adequate |
| EE | 957 | Adequate |
| BG | 726 | Quality issues |
| LT | 552 | Thin |
| LU | 463 | Thin; per-capita inflation risk |
| GB | 396 | Post-Brexit legacy |
| CY | 355 | Small country |
| MT | 149 | Micro-state |
| IS | 148 | EEA non-EU |
| **PL** | 22 (SUDOP) | National register; 9 measures remaining |
| **RO** | ❌ 0 | REGAS national portal; not yet extracted |
| **SI** | ❌ 0 | gov.si static page; not yet extracted |
