# Sprint 17 — Coverage Recovery Plan (7-day)

*Companion to [docs/gap_analysis_2026.md](../docs/gap_analysis_2026.md). Goal: close the evident coverage gaps without breaking dataset coherence.*

---

## Decision Gate 0 — Scope (must resolve before Day 4 work)

The current methodology ([methodology.md "Scope principle: direct investments only"](../docs/methodology.md)) **excludes by design**:
- Member-state-administered **structural funds** (ERDF/ESF/Cohesion → Kohesio, mapadotacji.gov.pl, dotaceEU, ESPA, PT2030, ITMS)
- **Fund-of-funds** (PFR Ventures, ETCI, EIF portfolio, Argentum, HDBI, Saminvest, KfW Capital LP)
- Intermediated bank lending, RRF/NGEU national disbursement

But Sprints 15–16 already loaded national **state aid (SATR)** and national **NDB direct registers** (ADEME, Innovationsfonden, Bpifrance, CDTI). The project's effective identity has shifted from "EU-level direct tracker" to "European public capital to companies." The site title — *"Where Europe's public capital actually goes"* — supports the broader reading.

**Two coherent options:**

- **Option A — Disciplined (recommended).** Keep "direct grant/equity/debt to a named company" as the unit. National **NDB direct registers** and **state aid** are in (they already are). **Structural-fund cohesion portals and fund-of-funds stay out** — they are intermediated and would double-count against SATR and against each other, and they have no clean company-as-direct-counterparty. This keeps every existing analysis valid and needs no methodology rewrite.
- **Option B — Broad.** Consciously widen to include structural-fund company beneficiaries (Kohesio PO1/TO1 etc.). High value but: (i) requires methodology rewrite, (ii) requires a structural-fund ↔ SATR ↔ NDB triple dedup, (iii) introduces 27 national-portal schemas. Not a 7-day job; would be its own multi-sprint programme.

**DECIDED (2026-06-01): Option A — Disciplined.** Structural-fund portals and fund-of-funds stay out. National NDB registers + state aid only.

**Sequencing (DECIDED):** thin-country level-up first → volume maximisation second → quick EU wins third → hardening last. Rationale: front-load the work that improves journalistic defensibility (reducing coverage-artifact inequality) before the headline-volume work; bank the certain CORDIS wins late since they carry no dedup risk and can't be derailed.

---

## Hard rule (applies to every national source in this plan)

> **No national register is loaded until it has passed the SATR-overlap gate.**
> Run `satr_overlap_audit.py` (extended to the new prefix) → apply the RETIRE/MERGE/KEEP decision → dedup MERGE candidates at load using, in order: `satr_tm_id` / national-ID / `normalise_name + country + year±1`.

The colliding rows are already discoverable: SATR rows carry `ndb_distributor`, so e.g. the 514 `ndb_distributor='vinnova'` SATR rows are the exact dedup target for a Vinnova direct load. Empirically measured collisions to expect:

| New source | Rows already in SATR (pre-tagged) | Also collides with |
|---|---:|---|
| Vinnova direct | 514 (`ndb_distributor='vinnova'`) | — |
| Business Finland direct | 1,988 (`ndb_distributor='business_finland'`) | — |
| Spain BDNS systematic | (ES SATR rows) | existing `cdti_` (1,880 rows) |
| Innosuisse | 0 (CH not in SATR) | — clean |
| Innovasjon Norge | 0 (NO thin in SATR) | — clean |

---

## Phase 1 — Days 1–3: Thin-country level-up (FIRST — defensibility)

Front-loaded by decision. These fill **weakly-covered geographies** and are the direct countermeasure to coverage-artifact inequality in per-capita maps. Most are also clean (no/low SATR collision), so they de-risk the sprint early.

### Days 1–2 — Clean thin-country additions (no SATR collision)
| Source | Country | Data | Dedup target | Expected |
|---|---|---|---|---|
| **Innovasjon Norge** | NO | `Tildelinger.csv` direct download (CC0) | none (NO thin in SATR) | ~5,000/yr |
| **Norges Forskningsråd** | NO | data.norge.no | pairs with Innovasjon Norge | ~hundreds/yr |
| **Innosuisse** | CH | innosuisse.admin.ch data portal | none (CH not in SATR) | ~hundreds/yr |
| **ALTUM** | LV | data.gov.lv | LV thin (1,085 SATR) | ~hundreds |
| **ILTE** | LT | data.gov.lt | LT thin (552 SATR) | ~hundreds |
| **EIS (KredEx+EAS)** | EE | eis.ee funded-projects DB | EE thin (957 SATR) | ~hundreds |

### Day 3 — Thin-country R&D register
| Source | Country | Data | Dedup target | Expected |
|---|---|---|---|---|
| **TAČR** | CZ | tacr.gov.cz project DB | CZ SATR (4,535) — overlap-audit first | thousands, R&D-specific |

Each follows the 4-step loop: **extract → overlap-audit → merge-dedup → load + classify**. Most will be **KEEP — low overlap** (like ADEME/Innovationsfonden empirically were).

---

## Phase 2 — Days 4–5: Volume maximisation (with dedup gate)

The highest-record-count sources. These are dedup-heavy (they collide with SATR), so they come after the clean thin-country wins are banked.

### Day 4 — Spain BDNS systematic (largest single unlock)
| Source | Country | Data | Dedup target | Expected |
|---|---|---|---|---|
| **Spain BDNS** | ES | REST API `pap.hacienda.gob.es` (`bdns-fetch`) | existing `cdti_` (1,880) + ES SATR | ENISA, AEI, 17 regional agencies (SPRI, AGAUR, GAIN, IVACE, ACCIÓ) |

**Critical dedup:** BDNS *contains* CDTI — exclude CDTI granting-authority codes already loaded, or dedup by BDNS award id against `cdti_` rows. Filter to innovation-relevant grant lines (R&D, startup, digital) — do not load all Spanish public subsidies.

### Day 5 — High-collision Nordic registers
| Source | Country | Data | Dedup target | Expected net-new |
|---|---|---|---|---|
| **Vinnova** | SE | `portal.api.vinnova.se` (free key, 2010+) | 514 SATR `vinnova` rows | ~1,000/yr minus overlap |
| **Business Finland** | FI | `avoindata.fi` BF funding dataset | 1,988 SATR `business_finland` rows | ~500–1,000/yr minus overlap |
| **French regions** (top 4–5: Occitanie, AURA, PACA, Grand Est, Bretagne) | FR | data.gouv.fr SCDL (≥€23k) | dedup vs `ademe_` + `bpifrance_` | thousands |

Run overlap audit FIRST. Expected decision: **MERGE** (high overlap, but direct register adds sub-threshold + recent rows SATR misses). Dedup by national-ID/name+year.

**Deprioritised to backlog:** Romania REGAS, Slovenia gov.si, IAPMEI/PT2030 (structural-fund-flavoured — borderline Option-A scope), NCBR, VLAIO.

---

## Phase 3 — Day 6: Quick EU wins (zero dedup risk, banked last)

All in-scope, all from the CORDIS bulk CSV already on disk, reusing `extract_cordis_pillar_ii.py` / `extract_chips_ju.py` patterns. No SATR overlap (different programmes). Done late because they're certain — they can't be derailed and need no dedup.

| Task | Source | Mechanism | Expected | Effort |
|---|---|---|---|---|
| Horizon **Missions** | `HORIZON-MISS-*` topic prefix | add to clusters dict | ~hundreds of cos | 1–2h |
| Horizon **EIE / Eurostars** | `HORIZON-EIE-*`, `HORIZON-INNOVSMES-*` | add prefix; `sector` from topic | company-led SME R&D — high signal | 1–2h |
| **ERC Proof of Concept** | `HORIZON_ERC-*-POC` programme id | new lightweight source, filter PoC only | ~200–300/yr | 2h |
| **Clean Aviation JU** | `HORIZON-JU-CLEANAV-*` | clone Chips JU pattern | ~hundreds | 2h |
| **CBE JU** (bio-based) | `HORIZON-JU-CBE-*` | clone Chips JU pattern | ~hundreds | 2h |
| **EIC Fund equity** | eic.ec.europa.eu/eic-fund portfolio | populate `equity_amount_eur` on existing/new EIC cos | ~400 cos | 3h |

**Coherence note:** EIC Fund fills the long-documented `equity_amount_eur=NULL` gap on EIC ([methodology.md:53](../docs/methodology.md)). It is *enrichment of existing companies*, not new rows where the grant already exists — match on PIC/name first, only insert new where the company is equity-only.

---

## Phase 4 — Day 7: Coherence hardening + coverage layer

Non-negotiable closing work so the expanded corpus is *defensible*, not just bigger.

1. **Coverage-completeness indicator.** Add a per-(country, year) coverage descriptor: which source families are present, and the lowest amount threshold observed. Lets any per-capita / per-country analysis flag "coverage-limited" countries and avoid reading coverage as spending. **Directly fixes the IS/EE/LU per-capita-artifact risk.**
2. **Full re-run of `satr_overlap_audit.py`** across all new prefixes; commit the refreshed `analysis/findings/satr_overlap_*.md`.
3. **Dedup validation.** `audit_dedup.py` + a new check: zero rows where the same (national-id OR name+country+year) appears in both a national-register source and its SATR `ndb_distributor` twin.
4. **`sanity_check.py`** green on all blocks (Europe-scope triggers, NULL amounts, instrument-type separation).
5. **Methodology update.** Extend the source-coverage table in [methodology.md](../docs/methodology.md); record the Day-1 scope decision and the dedup rule in the decision log.
6. **Instrument-type integrity.** Confirm every new loan/guarantee row writes `debt_amount_eur` (not `grant_amount_eur`) so grant sums stay clean.

---

## Explicitly OUT of scope this sprint (with rationale)

| Excluded | Why | Revisit |
|---|---|---|
| Structural-fund portals (Kohesio, mapadotacji, dotaceEU, ESPA, ITMS) | Intermediated; methodology "direct only"; triple-dedup burden | Only under Decision Gate 0 → Option B |
| Fund-of-funds (PFR Ventures, ETCI, EIF, Argentum, HDBI, Saminvest) | EU/state counterparty is the fund, not the company | Dealroom enrichment (RHS) instead |
| Italian RNA full load | Overlaps 28,520 SATR-IT rows; de minimis only adds value | De-minimis-only filter, future sprint |
| RRF/NGEU, JTF company grants | Top-100-per-MS only; structural transparency gap | Not tractable |
| KfW domestic / BMBF Projektträger / Finnvera | No company-level register exists | — |

---

## Watch list (not actionable now — calendar reminders)

| Item | Trigger date | Action |
|---|---|---|
| **eAid Register** (de minimis, EU-wide) | Data meaningful ~mid-2027 | First-ever central de-minimis register; biggest future unlock. Re-evaluate Q3 2027. |
| **EDIP** (EU defence industrial grants) | First results ~late 2026 | Monitor DG DEFIS; clone EDF extractor |
| **GBER 2027 revision** | Jan 2027 | Update `satr_filters.py` BID list for new `2026GberArt*` vintage codes |
| **IPCEI-AI / IPCEI-CIC** | Approval ~2027 | New IPCEI sources |
| **European Competitiveness Fund** | In force 2028 | Will restructure every EU source family — major re-architecture |

---

## Net expected outcome (Option A, 7 days)

- **Phase 1:** ~1,000–2,000 EU-instrument companies (Missions, EIE/Eurostars, ERC-PoC, Clean Aviation, CBE, EIC Fund equity)
- **Phase 2–3:** ~10,000–15,000 net-new national-register company events after dedup (NO, CH, SE, FI, ES, LV, LT, EE, CZ, FR regions)
- **Coherence preserved:** every addition deduped against SATR; coverage-completeness layer added; thin countries levelled up rather than dense countries over-counted; methodology and sanity checks updated.
