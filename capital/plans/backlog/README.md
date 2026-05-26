# Backlog plans

Plans that are scoped and ready to execute but **not currently scheduled**. Each file documents *why* it's deferred and *when* to revive it.

| File | Topic | Why deferred | Revival trigger |
|---|---|---|---|
| [`private_side_enrichment.md`](private_side_enrichment.md) | Free-source private-event enrichment (GLEIF + OpenAlex + Wikidata + EU-Startups scrape + HTTP probes) | Free-source coverage (~10–25%, biased toward EIC-funded startups) would risk publishing biased "EU funding → private follow-on" claims against a self-selected sample. User opted to first do supply-side exploration. | (a) sharp research question emerges from the Sprint 9 EDA that justifies thin coverage, (b) user accepts coverage bias for a specific narrow analysis, or (c) Crunchbase / Dealroom budget never appears and this becomes the only path. |
| [`private_side_paid_api_reference.md`](private_side_paid_api_reference.md) | Paid-API private follow-on enrichment (Dealroom / Crunchbase / equivalent) | No paid-API budget; Crunchbase free tier discontinued 2021; academic access requires institutional affiliation + multi-week sales approval. | Institutional Crunchbase / Dealroom access materialises (university research credentials, partnership, paid subscription). |

## Conventions

- Each backlog file opens with a `> **Status: BACKLOG**` banner explaining the deferral.
- Plans should remain execution-ready as written — when revived, only the banner needs editing and the sprint number updated.
- If a backlog plan grows stale (counts drift, schema changes), add a "STALE — refresh before execution" line to the banner.

## Currently active sprint chain

Three sequential plans drafted 2026-05-25, executing the **"European strategic-resilience access map"** narrative:

1. [`../sprint_12_cordis_pillar_ii_plan.md`](../sprint_12_cordis_pillar_ii_plan.md) — Horizon Europe Pillar II clusters (CL1/CL3/CL4/CL5, optional CL6) via CORDIS bulk export. Closes the single largest coverage gap (~€40-45B). Brings coverage to ~60%.
2. [`../sprint_13_tier1_ndb_plan.md`](../sprint_13_tier1_ndb_plan.md) — Tier 1 National Development Banks + strategic R&D agencies (Bpifrance, KfW Capital + SPRIND, CDP VC, Invest-NL, CDTI, Enterprise Ireland, Business Finland + Tesi, Vinnova + Saminvest + Almi Invest). Adds the national strategic deployment layer. First non-NULL `equity_amount_eur`. Brings coverage to ~75-80%.
3. [`../sprint_14_tier2_ndb_digital_europe_plan.md`](../sprint_14_tier2_ndb_digital_europe_plan.md) — Tier 2 regional/smaller-economy NDBs (PMV, AWS + FFG, PFR + NCBR, EIFO + Innovationsfonden, Wallonia NDBs) + Digital Europe Programme + EIC Fund equity backfill. Brings coverage to ~85-90% and finalises the 3-layer access map.

After Sprint 14, [`private_side_paid_api_reference.md`](private_side_paid_api_reference.md) becomes the next-highest-value augmentation (private follow-on capital via Dealroom / Crunchbase).

Earlier active sprint: [`../sprint_9_exploratory_study_plan.md`](../sprint_9_exploratory_study_plan.md) — EDA + findings website (completed; revisit when refreshing the site post-Sprint 12+).
