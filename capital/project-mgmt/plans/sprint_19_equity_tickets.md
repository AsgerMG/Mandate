# Sprint 19 — Public Equity in Europe: Step-by-Step Programme

*Scope decided 2026-06-11: NDB venture tickets (not SOE stakes), new `public_equity_stakes` table, open data only (no Dealroom — ruled out, do not re-suggest). This is a Europe-wide programme: equity tickets enter the study only when the integration criteria in Step 0 are met per country — single-institution showcases (e.g. EIFO) are probes, not deliverables.*

**The editorial frame (equal-rank deliverable):** almost no European institution discloses public equity ticket sizes — not state-aid law (Art. 107 exempts market-conform investment), not NDB reporting, not EU instruments. The programme produces the recoverable data AND the **disclosure scorecard** that turns the gaps into the finding ("Europe's invisible public equity"). Every step feeds both.

---

## Step 0 — Integration standard (BEFORE any extraction; ~0.5 day)

Define once, so the layer is comparable and analyses can't misuse it:

1. **Unit**: a *stake* = (company, holding institution, as-of date) with optional pct range and optional € — positions, not funding events. Stakes never sum with grants/loans.
2. **Schema**: migration 008 `public_equity_stakes(company_id, holder, holder_type, stake_pct_min/max, ticket_eur, as_of, first_seen, exited, source, raw_source_url, disclosure_level)`. `disclosure_level ∈ {name_only, pct_range, pct_exact, amount}` is the scorecard's unit of analysis.
3. **Equity visibility tiers per country** (the integration criterion, mirroring the grant coverage indicator):
   - **E-A register-grade**: an ownership register or mandatory filing makes stakes near-complete independent of the institution's goodwill (DK CVR; NO aksjonærregister; UK Future Fund register).
   - **E-B institution-grade**: the institution itself publishes a complete portfolio (HTGF, Coparion, PFR, CDP VC, Portugal Ventures).
   - **E-C partial**: press releases / case pages only.
   - **E-X opaque**: nothing recoverable.
   **Rule: cross-country equity comparisons only within the same tier; presence-only claims corpus-wide with the tier caveat; ticket-size claims only where `disclosure_level='amount'`.** Tier per country lands in `coverage_indicator.json` as `equity_tier`.
4. Gate: methodology section drafted; migration applied; `equity_tier` field wired into the indicator generator.

## Step 1 — Census of public equity investors, all 40 countries (~1 day)

Output: `data/processed/public_equity_census.csv` — one row per institution/vehicle: country, institution, vehicle name, direct-vs-FoF, active?, routes available (A-D below). Seed list (from ndb_taxonomy, gap analysis §2, and tonight's probes — verify each, add the missed):

| Country | Institutions/vehicles (direct equity unless noted) |
|---|---|
| EU | EIC Fund ✅(loaded); EIF (FoF/LP); ETCI (FoF); InvestEU equity window |
| DK | EIFO (+ legacy Vækstfonden); Dansk Vækstkapital (FoF) |
| NO | Investinor; Nysnø (climate); Innovasjon Norge (minor) |
| SE | Almi Invest; Saminvest (FoF); Industrifonden |
| FI | Tesi (direct+FoF); Business Finland VC (FoF) |
| FR | Bpifrance Large Venture / French Tech Seed / regional vehicles |
| DE | HTGF; Coparion; KfW Capital (LP); Bayern Kapital; IBB Ventures; NRW.BANK Venture |
| NL | Invest-NL; regional ROMs (BOM, InnovationQuarter, …) |
| BE | PMV (VL); Wallonie Entreprendre; finance&invest.brussels |
| IT | CDP Venture Capital (multi-fund) |
| ES | CDTI Innvierte (co-invest); Axis/Fond-ICO (FoF); SETT |
| PT | Portugal Ventures; Banco de Fomento |
| IE | Enterprise Ireland (one of Europe's most active seed investors); ISIF |
| AT | aws Gründerfonds |
| PL | PFR Ventures (FoF + direct); NCBR VC |
| HU | Hiventures (very active state VC) |
| GR | HDB / Equifund (FoF) |
| EE/LV/LT | SmartCap; ALTUM co-invest; INVEGA Koinvesticinis fondas |
| GB | British Patient Capital (FoF); **Future Fund (equity conversions, register published)** |
| CZ/SK/RO/BG/HR/SI + Balkans | smaller national funds — enumerate, expect E-C/E-X |

Gate: ≥ 35 institutions enumerated with routes assessed; census reviewed by user before extraction order is locked.

## Step 2 — Route survey per institution (~1 day, desk research)

Four route classes; record availability + expected `disclosure_level` ceiling per institution:
- **Route A — accounting disclosure**: annual-report notes forced by law (associates ≥20%, fund commitments). Verified precedent: EIFO årsrapport Note 12 lists ALL fund stakes ≥20% with exact pct (`data/raw/eifo/eifo-aarsrapport-2025.pdf` p.81-82); Note 13 shows direct tickets are aggregate-only.
- **Route B — public registers**: DK CVR legal owners (pct ranges, **needs free system-til-system application — USER ACTION, gates nothing else**); NO aksjonærregister (annual dump, access mechanics to confirm); EE/LV/PL register ownership data; UK Future Fund portfolio list.
- **Route C — voluntary portfolio pages**: PFR (950-investment downloadable file), HTGF, Coparion, CDP VC, Portugal Ventures, Almi, Tesi, Investinor, Hiventures, Bpifrance LV, EIFO case pages.
- **Route D — state-aid registers (in-corpus)**: GBER Art. 21 risk finance. **Verified: 950 SATR rows / €2.1B** (`aid_instrument='StateAidInstrumentPRVRISKFIN'`: GR 328, LT 147, FI 118, SK 103, HU 77/€1.6B) + ES BDNS participative loans. Aid-channelled quasi-equity, already loaded, never labelled equity.

Gate: scorecard skeleton filled (institution × route × expected level); extraction order locked by yield/effort.

## Step 3 — In-corpus reclassification (Route D; ~0.5 day; FIRST extraction because it's Europe-wide on day one)

Label the 950 PRVRISKFIN rows + BDNS participative loans as equity-class instruments (decide on inspection whether amounts are tickets or aid elements — store accordingly, never silently as grants). Corpus equity signal goes from 25 events/€7M to ~1,000 events/~€2B+, correctly caveated, across 8+ countries at once.

## Step 4 — EU layer (~0.5 day)

Backfill the 233 EIC Fund positions into `public_equity_stakes` (name_only). Flag ETCI/EIF-backed where derivable (`eif_lp_backed` column exists). EU tier lands as E-C (names, no amounts) — itself a scorecard finding about the EU's own transparency.

## Step 5 — Register-grade countries first (Route B; the E-A tier; ~3 days total)

Order: **UK Future Fund** (published list, zero access friction) → **DK CVR** (when user's S2S access lands; query deltager ∈ {EIFO, Vækstfonden, …} → all direct stakes with ranges + dates) → **NO aksjonærregister** (confirm access route; if request-gated, document and defer) → EE/LV/PL register spot-checks. These three-to-five countries become the study's equity benchmark set — cross-country equity claims start and end here until other countries level up.

## Step 6 — Institution-grade extractions (Routes A+C; the E-B tier; ~3-4 days, strict yield order)

1. PFR Ventures file (≈950 rows, one download)
2. HTGF + Coparion (portfolios public; companies largely already in DB from Sprint 13 loads — stakes derivable with high match rates)
3. CDP Venture Capital (per-fund portfolio pages)
4. Portugal Ventures, Almi Invest, Tesi, Investinor, Hiventures (portfolio pages)
5. Annual-report Route-A pass: EIFO Note 12 (+ prior-year Vækstfonden reports for history), Bpifrance document d'enregistrement, Tesi/Almi/ISIF reports — extract whatever accounting law forces out (mostly fund-layer pct_exact)
6. Enterprise Ireland + ISIF report appendices

Each extraction: `lib/matching.py`, scope filter, `disclosure_level` honestly assigned, scorecard row updated.

## Step 7 — Tiering, gates, and integration into the study (~1 day)

- Assign `equity_tier` to all 40 countries; write into `coverage_indicator.json`; per-capita/cross-country guards same as grant tiers.
- Acceptance gates: ≥1,500 stakes rows; ≥3 E-A countries; ≥6 E-B institutions; every stake has disclosure_level; zero stakes double-counted against funding events.
- Analyses unlocked (and only these until tiers improve): (a) presence cohorts — "publicly equity-backed" vs not, corpus-wide with caveat; (b) full-stack case studies in E-A countries; (c) the scorecard itself.

## Step 8 — Scorecard + methodology + site (~1 day)

Disclosure scorecard page (institution × route × level achieved); methodology equity limitation rewritten around `disclosure_level` and `equity_tier` ("here is exactly who lets you see what" — DK ranges vs FR nothing is the headline contrast); decision log; site rebuild via `build_site_data.py`.

---

## User actions (none block Step 0-4)
1. DK CVR system-til-system application (free, virk.dk) — gates Step 5-DK only.
2. Census review after Step 1 (lock the extraction order).
3. Vinnova API key (Sprint 18 leftover, unrelated).
