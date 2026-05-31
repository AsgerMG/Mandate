# Backlog plans

Plans that are scoped and ready to execute but **not currently scheduled**. Each file documents *why* it's deferred and *when* to revive it.

| File | Topic | Why deferred | Revival trigger |
|---|---|---|---|
| [`commercial_conform_ndb_equity.md`](commercial_conform_ndb_equity.md) | **Commercial-conform NDB equity layer** (Bpifrance equity, KfW Capital LP, CDP Equity, EIFO equity tickets, AWS Gründerfonds, Saminvest LP) via Path A (EIF Annual Transparency Report + InvestEU Operations Register), Path B (annual-report PDF parsing per NDB), Path C (Dealroom/Pitchbook commercial APIs). | **Art. 107 TFEU structural finding** (Sprint 16): commercial-conform investments are by EU competition law NOT state aid, therefore NOT published in SATR or any central register. Recovery requires PDF parsing, EIF/InvestEU reports, or commercial-data licensing — none central-source-scrapeable. | Any of: (a) LLM-PDF parsing tooling stood up (Path B), (b) EIF + InvestEU loaders implemented (Path A, weeks of work), (c) Dealroom/Pitchbook access materialises (Path C). |
| [`ndb_enrichment_via_tam.md`](ndb_enrichment_via_tam.md) | Per-company enrichment for the 3 Tier 1 NDBs loaded at placeholder level (Bpifrance, SPRIND, Enterprise Ireland) + the 3 deferred Sprint 13 sub-institutions (Business Finland, Vinnova, Saminvest) | Public portfolio pages are Cloudflare-blocked, JS-only, or list project codenames not legal entities. The EU State Aid Transparency Award Module (TAM) holds the data by law but its API requires EU Login (free signup). | Free EU Login account obtained; or annual-report PDF parsing tooling stood up; or Playwright with stealth installed for the JS-blocked sources. **Note**: Bpifrance is now extensively covered via Sprint 16 central-register extractors (ADEME, i-Nov, PM'up, Innov'up Leader, PdR-Industriel). What remains is Bpifrance's commercial-conform equity — see `commercial_conform_ndb_equity.md` (Path B). |
| [`private_side_enrichment.md`](private_side_enrichment.md) | Free-source private-event enrichment (GLEIF + OpenAlex + Wikidata + EU-Startups scrape + HTTP probes) | Free-source coverage (~10–25%, biased toward EIC-funded startups) would risk publishing biased "EU funding → private follow-on" claims against a self-selected sample. User opted to first do supply-side exploration. | (a) sharp research question emerges from the Sprint 9 EDA that justifies thin coverage, (b) user accepts coverage bias for a specific narrow analysis, or (c) Crunchbase / Dealroom budget never appears and this becomes the only path. |
| [`private_side_paid_api_reference.md`](private_side_paid_api_reference.md) | Paid-API private follow-on enrichment (Dealroom / Crunchbase / equivalent) | No paid-API budget; Crunchbase free tier discontinued 2021; academic access requires institutional affiliation + multi-week sales approval. | Institutional Crunchbase / Dealroom access materialises (university research credentials, partnership, paid subscription). **Note**: this also unlocks Path C of `commercial_conform_ndb_equity.md` — the same commercial-data licensing covers both follow-on funding and NDB-investor syndicate disclosure. |

## Conventions

- Each backlog file opens with a `> **Status: BACKLOG**` banner explaining the deferral.
- Plans should remain execution-ready as written — when revived, only the banner needs editing and the sprint number updated.
- If a backlog plan grows stale (counts drift, schema changes), add a "STALE — refresh before execution" line to the banner.

## Sprint status

| Sprint | Plan | Status | Completion docs |
|---|---|---|---|
| 12 | [`../sprint_12_cordis_pillar_ii_plan.md`](../sprint_12_cordis_pillar_ii_plan.md) — Horizon Europe Pillar II clusters via CORDIS bulk export | ✅ done | [`../../docs/notes.md`](../../docs/notes.md) Day 14 |
| 13 | [`../sprint_13_tier1_ndb_plan.md`](../sprint_13_tier1_ndb_plan.md) — Tier 1 NDBs (8 workstreams) | ✅ **8/8 loaded** | [`../../plans/sprint13_ndb_status.md`](../sprint13_ndb_status.md), Day 15 |
| 14 | [`../sprint_14_tier2_ndb_digital_europe_plan.md`](../sprint_14_tier2_ndb_digital_europe_plan.md) — Tier 2 regional/smaller-economy NDBs + Europe-scope filter | ✅ done | Day 18 |
| 15 | [`../sprint_15_satr_state_aid_plan.md`](../sprint_15_satr_state_aid_plan.md) — EU State Aid Transparency Register (SATR) integration | ✅ done | [`../../docs/notes.md`](../../docs/notes.md), corpus 20k → 95k companies |
| 16 | [`../sprint_16_ndb_direct_scrapers_plan.md`](../sprint_16_ndb_direct_scrapers_plan.md) — NDB direct scrapers (pivoted mid-sprint to central registers) | ✅ done | [`../../docs/notes.md`](../../docs/notes.md) Day 20; 7 extractors shipped (ADEME, Bpifrance×4, Innovationsfonden, EIFO, SUDOP scaffold); corpus 95k → 116,925 companies / 213,906 events. **Art. 107 TFEU finding: commercial-conform NDB equity structurally invisible — moved to [`commercial_conform_ndb_equity.md`](commercial_conform_ndb_equity.md)**. |
| 17 | [`../sprint_17_national_portals_plan.md`](../sprint_17_national_portals_plan.md) — National state-aid portals (PL/RO/SI) | 📋 next — partially started (PL SUDOP scaffold + 22 events in Sprint 16); rewritten in light of Sprint 16 outcomes |
| 18 | [`../sprint_18_regional_ndb_tier3_plan.md`](../sprint_18_regional_ndb_tier3_plan.md) — Regional NDBs (BE/DE Länder) + Tier-2 R&D agency direct portfolios | 📋 follows Sprint 17 — rewritten to remove commercial-conform equity work (moved to backlog) |
| 19 | [`../sprint_19_site_and_refactor_plan.md`](../sprint_19_site_and_refactor_plan.md) — Site visualisation + extractor refactor | 📋 follows Sprint 18 |

## Coming after Sprint 19

- **Commercial-conform NDB equity** ([`commercial_conform_ndb_equity.md`](commercial_conform_ndb_equity.md)) — closes the structural Art. 107 TFEU blind spot via EIF/InvestEU central reports (Path A), annual-report PDF parsing (Path B), or Dealroom/Pitchbook commercial APIs (Path C).
- **NDB per-company enrichment via TAM** ([`ndb_enrichment_via_tam.md`](ndb_enrichment_via_tam.md)) — Sprint 13 follow-up, now largely subsumed by Sprint 16 central-register extractors; remaining gaps are EU Login-protected.
- **Private-side enrichment** ([`private_side_paid_api_reference.md`](private_side_paid_api_reference.md)) — follow-on private capital matching, requires paid-API access.
