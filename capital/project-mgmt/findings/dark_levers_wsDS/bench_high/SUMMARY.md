# wsDQ — the ranker on the twelve bench companies

```
corpus=postgres instruments=1088 at 2026-08-11T08:19:44.964Z
ranker: all 12 request(s) on EMBEDDING
agent-select: arm=adviser depth=40 count=6 effort=high maxtok=12288 lookups=0 (0 brief(s) retrieved) model=claude-sonnet-5 — 12/12 chose, 0 FELL BACK to the shipped order (0 empty reply, 0 unparseable), 0 short reply, 0 unusable id(s), thought on 12/12 call(s) (79252 thinking token(s) billed, 106087 readable char(s)), 0 CUT OFF at max_tokens, EUR 0.9314 total, EUR 0.0776 per brief
levers: AGENT_SELECT=adviser depth=40 count=6 effort=high lookups=5 pool=18 published_cap=7
total EUR 0.9314 over 12 companies, EUR 0.0776 each
```

| archetype | company | pool | picks (pool ranks) | deepest | kept of shipped top 6 | rows in | rows out | unsure | EUR |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|
| Robotics | Neura Robotics | 18 | 8, 6, 1, 10, 9, 7 | 10 | 1 | 0 | 0 | — | 0.0843 |
| Hardware | SMART Photonics | 18 | 0, 1, 2, 11, 10, 7 | 11 | 3 | 2 | 2 | — | 0.0813 |
| FinTech (business lending) | Silvr | 18 | 16, 17, 1, 0, 8, 9 | 17 | 2 | 4 | 4 | — | 0.0822 |
| FinTech (consumer banking) | bunq | 18 | 2, 4, 5, 12, 13, 16 | 16 | 3 | 3 | 3 | — | 0.0961 |
| AI B2C software | Photoroom | 18 | 5, 4, 1, 16, 6, 17 | 17 | 3 | 1 | 1 | — | 0.0466 |
| AI B2B software | Aleph Alpha | 18 | 4, 10, 16, 2, 14, 8 | 16 | 2 | 4 | 4 | — | 0.0814 |
| GovTech | Nortal | 18 | 0, 3, 4, 12, 13, 5 | 13 | 4 | 2 | 2 | — | 0.0775 |
| Platform | sennder | 18 | 1, 0, 10, 17, 12, 2 | 17 | 3 | 1 | 1 | — | 0.1134 |
| Cloud / NeoCloud | Nebius | 18 | 3, 13, 9, 0, 17, 15 | 17 | 2 | 3 | 3 | — | 0.1037 |
| MedTech | Corti | 18 | 10, 6, 7, 0, 11, 13 | 13 | 1 | 3 | 3 | — | 0.0617 |
| Life sciences | BioNTech | 18 | 1, 0, 2, 15, 5, 11 | 15 | 4 | 2 | 2 | — | 0.0552 |
| AgriTech | eAgronom | 18 | 8, 2, 10, 15, 1, 6 | 15 | 2 | 3 | 3 | — | 0.0479 |

- mean deepest reach: **14.8** of 17
- mean rows changed in the published projection: **2.3** of 7
- companies where the model declared something unsure: **0/12**
- companies where retrieval changed its mind: **0** (of 0 that ran a second round)
- **fell back to the shipped order: 0/12**
