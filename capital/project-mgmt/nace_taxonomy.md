# NACE-backed sector taxonomy

How EuroInvTracker assigns every company a **two-tier sector** (broad `sector_top`
+ granular `subsector`), with the official NACE activity code as the authoritative
backbone and an LLM only for what NACE cannot resolve.

Canonical code: `ETL/transform/classify_taxonomy.py` (the `NACE_TIER` table and
`resolve_nace()` are the single source of truth; this document explains them).

---

## 1. Why NACE is the backbone

NACE Rev. 2 is the EU's official statistical classification of economic activities.
State-aid records (SATR) ship each company's NACE descriptor in
`public_funding_events.sector_tags_raw` (e.g. *"Manufacture of batteries and
accumulators"*, *"Computer programming activities"*). It is an **externally
reported, authoritative** statement of what a company does — strictly better than
any model guess. Measured on a held-out set, an LLM that does *not* see the NACE
code recovers the NACE-implied Tier-1 only ~56% of the time and the specific
sub-sector only ~35% (it defaults to the `*_general` bucket). **Therefore: where
NACE resolves, we apply it deterministically and never let the model overwrite it.**

NACE is *not* sufficient on its own for two structural reasons:
1. **Coverage.** Only ~13% of companies carry a NACE descriptor that resolves to a
   single sector. ~87% (mostly CORDIS / Horizon / EIC grant-funded innovators)
   have project text but no NACE code — the LLM is their only option.
2. **Granularity.** NACE is coarser than Tier-2. *"Production of electricity"* does
   not distinguish solar / wind / hydrogen / batteries. The sub-sector axis often
   lives below NACE's resolution.

---

## 2. The two-tier taxonomy

**Tier 1 — `sector_top` (11, mandatory, 100% coverage):**
`health_life_sciences`, `energy_cleantech`, `mobility_transport`,
`industrial_manufacturing`, `semiconductors_electronics`, `software_data_ai`,
`space`, `defense_security`, `agrifood`, `materials_chemicals`, `other`.

**Tier 2 — `subsector` (94, controlled vocabulary nested under each Tier 1):**
each sector has a curated list ending in a `*_general` escape used when the
evidence is too thin to choose a specific sub. Full list: `TAXONOMY` in
`classify_taxonomy.py` / `classify_taxonomy.py vocab`.

---

## 3. The NACE → (Tier 1, Tier 2) mapping

`NACE_TIER` maps a NACE descriptor substring to a Tier-1 and, where the descriptor
is specific enough, a Tier-2. Matching is case-insensitive, **most-specific first**.
A NACE descriptor sets only the sector when its Tier-2 entry is blank.

| NACE descriptor (substring) | Tier 1 | Tier 2 |
|---|---|---|
| Manufacture of (basic) pharmaceutical | health_life_sciences | pharma_drug_discovery |
| Manufacture of medical and dental instruments; irradiation, electromedical | health_life_sciences | medical_devices |
| R&D on biotechnology | health_life_sciences | biotech_therapeutics |
| Human health / Hospital / Medical practice | health_life_sciences | health_general |
| Computer programming / consultancy / software publishing / Web portals / Information service | software_data_ai | *(LLM picks)* |
| Data processing, hosting; Computing infrastructure; Computer facilities mgmt | software_data_ai | cloud_infrastructure |
| Wired / Wireless telecommunications | software_data_ai | telecom_networking |
| Manufacture of electronic components / computers / communication / consumer electronics | semiconductors_electronics | electronics_general |
| Manufacture of loaded electronic boards | semiconductors_electronics | pcb_components |
| Manufacture of optical instruments | semiconductors_electronics | photonics_optoelectronics |
| Manufacture of (special/general-purpose) machinery; machine tools; bearings, gears | industrial_manufacturing | industrial_machinery |
| Production of electricity / Electric power generation | energy_cleantech | *(LLM picks)* |
| Transmission / Distribution of electricity | energy_cleantech | grid_smart_grid |
| Steam and air conditioning supply | energy_cleantech | heat_pumps_hvac |
| Water collection, treatment and supply; Sewerage | energy_cleantech | water_wastewater |
| Waste collection / treatment; Materials recovery; Remediation | energy_cleantech | circular_economy_recycling |
| Manufacture of batteries and accumulators | energy_cleantech | batteries_storage |
| Distribution of gaseous fuels | energy_cleantech | energy_general |
| Manufacture of food products / beverages / dairy | agrifood | food_processing |
| Growing of … | agrifood | *(LLM picks)* |
| Mixed farming | agrifood | agtech_precision_farming |
| Hotels / Restaurants / Construction / Civil engineering / Retail / Wholesale / Furniture / Real estate / Head offices | other | other |

**Deliberately omitted (fall through to the LLM, never mis-mapped):**
- *"Manufacture of air AND spacecraft"* (NACE 30.3) — conflates aviation and space,
  so it cannot cleanly confirm either `mobility_transport` or `space`.
- Generic *"Scientific research and development"* — spans every deep-tech sector.
- Electric motors / generic *"electrical equipment"* — spans electronics ↔ industrial.

---

## 4. Routing rules (per company)

`resolve_nace(tags)` aggregates every NACE descriptor a company carries:

1. **Clean specific NACE** → exactly one Tier-1 *and* a Tier-2 → write **both tiers
   deterministically**, `method = nace`. No LLM.
2. **Clean sector-only NACE** → exactly one Tier-1, Tier-2 blank → write the Tier-1,
   leave Tier-2 for the LLM (constrained to that sector), `method = nace_top`.
3. **Ambiguous NACE** (descriptors resolve to >1 Tier-1) → treat as no NACE.
4. **No NACE** → programme override if applicable (Innovation Fund→energy_cleantech,
   EDF→defense_security, chips_ju→semiconductors_electronics), `method = programme`;
   otherwise both tiers come from the LLM, `method = llm`.

The LLM, when used, is **given the NACE-confirmed Tier-1 as fixed guidance** wherever
one exists, so its only job is the (easier) in-sector sub-sector choice or the
genuinely no-signal cases.

---

## 5. Coverage (2026-06-26, 159,368 companies)

| Route | Share | Determinism |
|---|---|---|
| clean NACE (both tiers) | ~10–13% | deterministic, exact |
| sector-only NACE / programme override | small | Tier-1 deterministic, Tier-2 via LLM |
| no resolvable NACE | ~87% | LLM (Tier-1 + Tier-2) — unverifiable from data |

`unambiguous-NACE pool ≈ 30,617 companies`; the live share is lower because
multi-event companies accumulate multiple NACE tags and become ambiguous.

---

## 6. Schema

`companies` (migration 010): `sector_top`, `subsector`, `sector_taxonomy_method`
(`nace` | `nace_top` | `programme` | `llm` | NULL=pending), `sector_taxonomy_updated_at`.
Legacy `sector_inferred` is retained during transition. See [[project_memo_rework]].
