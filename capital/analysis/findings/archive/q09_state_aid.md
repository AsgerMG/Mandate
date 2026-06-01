# Q09 — National state aid layer (Sprint 15)

The EU State Aid Transparency Register (SATR) adds a fourth layer to the EuroInvTracker access map: the **legal-instrument view** of how Member States deploy public capital to undertakings. This sits alongside EU-direct (Pillar I/II/III, IPCEI, EIB, DEP), NDB-direct (Tier-1/Tier-2 national development banks), and private (Sprint 10, pending).

## Headline numbers

- **122,814 state-aid events** across **24 EC-portal countries** for 2021-01-01 → 2026-05-29
- **75,195 companies are SATR-only** (no EU-direct, no NDB-direct event)
- **€165B total aid value** tracked
- **64 companies are tri-channel** (EU + state aid + NDB direct) — the most-funded set in the corpus

Slovenia (gov.si), Poland (SUDOP), Romania (REGAS) and Spain (BDNS — already covered by `extract_cdti.py`) maintain national portals outside the EC SATR; the first three are deferred.

## Top countries by state aid value (€B, 2021–2026)

| Country | Events | Companies | €B |
|---|---:|---:|---:|
| DE 🇩🇪 | 29,948 | 19,858 | **72.7** |
| IT 🇮🇹 | 28,520 | 18,815 | 29.9 |
| FR 🇫🇷 | 17,778 | 9,858 | 26.8 |
| CZ 🇨🇿 | 4,535 | 2,955 | 8.5 |
| NL 🇳🇱 | 6,757 | 4,466 | 6.4 |
| BE 🇧🇪 | 5,160 | 2,872 | 3.4 |
| AT 🇦🇹 | 5,422 | 2,848 | 3.1 |
| FI 🇫🇮 | 2,699 | 1,747 | 3.0 |
| HU 🇭🇺 | 5,885 | 4,026 | 2.7 |
| SE 🇸🇪 | 3,585 | 1,828 | 2.6 |

The DE > IT > FR ordering aligns with GDP and known industrial-policy intensity. Italy's high event count vs aid value reflects the **Fondo di Garanzia per le PMI** issuing many small SME-guarantee awards.

## Filter scope

The SATR data we ingested covers **only innovation, IPCEI / strategic industrial, and net-zero / decarbonisation aid**:

- GBER R&D and innovation block (Art. 21-30 with 2022/2023 revisions and sub-bids 252a/b/c/d)
- SME investment aid (Art. 17, 23, 24) + InvestEU SME (Art. 56e10)
- Start-ups (Art. 22), Risk finance (Art. 21)
- **IPCEI** (AR79411 — Important Projects of Common European Interest)
- **Net-Zero / decarbonisation**: Art. 36 family (env protection, clean vehicles, refuelling infra), 38/40/41/46/47/48 (energy efficiency, renewables, district heating, circular economy)
- Equity-instrument safety net: risk capital, equity intervention, subordinated debt, soft loan, guarantee

**Excluded at staging load:**
- COVID-19 / Temporary Framework / TCTF / TCTF-extension emergency aid (169,243 rows excluded — multilingual title-pattern regex catches "COVID-19", "Temporary Framework", "TCF:", "Quadro Temporaneo", "Encadrement temporaire", "Befristeter Krisenrahmen", "Exceptional Liquidity Guarantee" etc.)
- Agriculture / fisheries / forestry aid
- Audio-visual (Art. 54), sport (Art. 55), culture (Art. 53)
- Natural-disaster compensation, training aid (Art. 31-33)

## 4-layer access map

| EU direct | State aid | NDB direct | Companies |
|:---:|:---:|:---:|---:|
| | ✓ | | 75,195 |
| ✓ | | | 14,702 |
| ✓ | ✓ | | 2,702 |
| | | ✓ | 2,121 |
| ✓ | | ✓ | 272 |
| | ✓ | ✓ | 189 |
| **✓** | **✓** | **✓** | **64** |

The 64 tri-channel companies are the most-funded subset — companies that drew from EU instruments, national state aid, AND NDB direct programmes. Notable names include NORDIC REN-GAS OY (FI cleantech, €87M EU + state aid), BEDIMENSIONAL SPA (IT life sciences), VARJO TECHNOLOGIES OY (FI VR/defense), ICEYE (FI space/defense), AXELERA AI BV (NL deeptech), Oura Health Oy, Wirepas Oy.

## Sector distribution of SATR companies

After NACE-aware classification:

| Sector | Companies (whole corpus) | of which SATR-only |
|---|---:|---:|
| Unclassified | 31,471 | ~31,000 |
| Other | 19,700 | ~19,000 |
| Cleantech | 14,115 | ~5,400 |
| Deeptech hardware | 12,333 | ~9,000 |
| Digital | 9,444 | ~7,500 |
| Life sciences | 6,649 | ~1,800 |
| Space | 1,026 | ~300 |
| Defence | 507 | ~0 |

**Caveat:** The 31k unclassified SATR companies have NACE descriptions that don't fall into our 7-bucket taxonomy (mid-sized manufacturing under generic codes — "Manufacture of plastic products", "Treatment and coating of metals", "Other manufacturing", "Manufacture of fabricated metal products"). They're real companies, just hard to categorise without external enrichment.

The 19.7k "other" classification is intentional and accurate — companies in hotels/construction/wholesale/agriculture/freight/etc that received aid under our innovation+net-zero scope but whose primary activity is genuinely non-tech.

## NDB scraper retirement decision: ALL KEEP

Cross-check matching between SATR and existing NDB scrapers (HTGF, Coparion, SPRIND, ALMI, CDP VC, Tesi, Invest-NL):

| NDB | Country | Match % |
|---|---|---:|
| Tesi | FI | 53.5% |
| CDP VC | IT | 29.3% |
| HTGF | DE | 27.4% |
| Coparion | DE | 26.9% |
| ALMI Invest | SE | 12.4% |
| Invest-NL | NL | 7.7% |
| SPRIND | DE | 0.0% |

Best overlap (Tesi) still leaves 46% of NDB events SATR-invisible. ALMI's near-zero overlap reflects Swedish early-stage tickets being below the SATR threshold or not state-aid-classified. All scrapers retained.

## Top aid instruments

| Instrument | Events |
|---|---:|
| Direct grant / Interest rate subsidy | ~52,000 |
| Soft loan | ~26,000 |
| Loan / Repayable advances | ~12,500 |
| Guarantee (general + Commission-decision variant) | ~22,000 |
| Tax advantage | ~6,500 |
| Direct grant | ~2,500 |
| Equity (risk capital, risk finance, OFEI, subordinated debt) | ~2,000 |

Direct grants (combined: ~54,500) are the dominant instrument once COVID emergency aid is stripped out — consistent with normal R&D and innovation policy.

## Queries

See `analysis/queries/q09_state_aid.sql` for the underlying SQL.
