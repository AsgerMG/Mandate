# Sprint 20 — Two-tier corpus reclassification + DB-native peer discovery

**Goal.** Replace the 8-bucket `sector_inferred` (49% in `other`/`unclassified`) with a
**two-tier taxonomy** — a broad, 100%-coverage top sector plus a granular sub-sector —
applied to all ~159k companies via an Anthropic Message Batches run, then use it to power
**database-native peer discovery** in the /for-companies memo so peers always carry a real
funding signal instead of depending on web-search → name-match.

**Why.** `companies.sector_inferred` has only 8 coarse values; `other` (40.7%) +
`unclassified` (8.0%) = ~49% of the corpus. There is no semantic axis to find peers inside
the DB, which is the root cause of weak peer signals in the competitive memo. Text coverage
is strong enough to fix this: **89%** of companies have an event title/summary and **86%**
carry `sector_tags_raw`; only ~16.6k (10%) are name+country only.

---

## 1. The taxonomy (the decision to lock first)

### Tier 1 — `sector_top` (broad, MANDATORY, 100% coverage)
Every company gets exactly one. MECE, investor-aligned, EU-strategic. Proposed 10 + forced
`other` fallback (target `other` < 5%):

1. `health_life_sciences` — biotech, pharma, medtech, diagnostics, digital health
2. `energy_cleantech` — renewables, storage, hydrogen, grid, energy efficiency, CCS
3. `mobility_transport` — EV, automotive, civil aerospace, rail, logistics
4. `industrial_manufacturing` — advanced manufacturing, robotics, automation
5. `semiconductors_electronics` — chips, photonics, sensors, electronics
6. `software_data_ai` — SaaS, AI/ML, cybersecurity, fintech, data infra
7. `space` — launch, satellites, SSA, earth observation
8. `defense_security` — defense systems, dual-use, security
9. `agrifood` — agtech, food tech, food-chain biotech
10. `materials_chemicals` — advanced materials, chemicals, nanotech
11. `other` — genuinely uncategorizable (minimise)

### Tier 2 — `subsector` (granular, controlled vocabulary nested under each Tier 1)
~8–15 curated sub-sectors per top sector (~100 total), each with an `…_general` escape for
thin-signal companies. Example under `energy_cleantech`: batteries_storage, hydrogen_fuel_cells,
solar_pv, wind, grid_smart_grid, ev_charging, e_fuels, carbon_capture, heat_pumps_hvac,
green_steel_industrial_decarb, biofuels, nuclear_fusion, energy_efficiency, water_wastewater,
circular_economy_recycling, energy_general.

A **controlled** Tier-2 vocab (not free tags) keeps the axis MECE and makes DB peer-matching a
simple equality join. Optional stretch: also emit 3–5 free-text `keywords` for fuzzy similarity.

### Determinism overrides (reuse classify.py source-family rules)
Programme-authoritative sources pin Tier 1 without an LLM call: Innovation Fund → energy_cleantech,
EDF → defense_security, chips_ju → semiconductors_electronics. Apply these first; LLM fills the rest
and always fills Tier 2.

---

## 2. Pipeline

New `ETL/transform/classify_taxonomy.py` (patterned on classify_llm.py; reuses its context
builder and bake-off harness):

- **Context per company** (from v_events, deduped): canonical_name, country, top 3–5 project
  titles, `sector_tags_raw`, source families.
- **Model:** `claude-haiku-4-5` via the **Anthropic Message Batches API**
  (`client.messages.batches.create`) — NOTE the existing `classify_batch` path is OpenAI-only;
  do not reuse it. 50% batch discount.
- **Structured output:** JSON schema `{sector_top: <enum 11>, subsector: <string>}`; validate
  `subsector ∈ vocab[sector_top]` post-hoc; invalid → 1 retry → deterministic `…_general` fallback.
- **Prompt caching:** the taxonomy system prompt (full Tier-1 + Tier-2 vocab, ~2–2.5k tokens) is
  the cached shared prefix (Haiku min cacheable prefix = 4,096 tokens, so pad/confirm it caches;
  if under, accept the uncached cost — still cheap).
- **Bake-off first:** run on ~200 NACE-grounded samples (existing harness) and confirm Tier-1
  agreement vs the NACE-derived label before the full run.

### Schema / write-back (new migration in ETL/load)
Add to `companies`: `sector_top TEXT`, `subsector TEXT`, `sector_taxonomy_method TEXT`
(rule|llm|fallback), `sector_taxonomy_updated_at TIMESTAMP`. Keep legacy `sector_inferred`
during transition; repoint consumers, then deprecate.

---

## 3. Cost & runtime (Haiku 4.5, batch, 159,368 companies)

Pricing: Haiku 4.5 $1/$5 per MTok → **batch $0.50 in / $2.50 out**. Cache reads ~0.1× input.

| Scenario | Input/item | Total input | Output | **Est. total** |
|---|---|---|---|---|
| No caching | ~2.2k tok (2k system + 0.2k ctx) | 350M → $175 | 5.6M → $14 | **~$190** |
| System cached (~0.1×) | ~0.4k tok effective | 64M → ~$25 | 5.6M → $14 | **~$40–50** |

**Bottom line: well under ~$100 with caching, ≤ ~$190 worst case.** Batches complete within
~1h typically (max 24h); 100k requests / 256MB per batch → split into **2 batches** (~80k each).

---

## 4. Product wiring (the payoff)

- Rebuild `website/build/companies_index.py` to emit `sector_top` + `subsector` per row.
- **DB-native peer discovery** in `lib/intelligence/pipeline.ts`: classify the founder (or match
  their company) to a `(sector_top, subsector)`, then pull the top-funded corpus companies in the
  same subsector (+ country / Europe) as **guaranteed-funded** peers. Blend with web-found peers so
  every memo has real funding signal even when web names don't match the corpus.

---

## 5. Phases & gates

1. **Lock taxonomy** (Tier-1 set + controlled-vs-free Tier-2) — user decision.
2. **Migration + classify_taxonomy.py + bake-off** (~200 samples; gate: Tier-1 agreement ≥ target).
3. **Full batch run** (159k, 2 batches) + write-back + QA distribution check (gate: `other` < 5%,
   no Tier-2 outside vocab). HARD RULE unchanged: SATR-overlap gates still apply to any new loads.
4. **Rebuild index + DB-native peer discovery** in the memo pipeline.

See [[project_memo_rework]] for the memo rework this builds on.
