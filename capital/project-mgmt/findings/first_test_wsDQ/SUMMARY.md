# wsDQ — the ranker on the twelve bench companies

```
corpus=postgres instruments=1088 at 2026-08-11T07:04:33.485Z
ranker: all 12 request(s) on EMBEDDING
agent-select: arm=adviser depth=40 count=6 effort=low lookups=0 (0 brief(s) retrieved) model=claude-sonnet-5 — 12/12 chose, 0 FELL BACK to the shipped order (0 empty reply, 0 unparseable), 0 short reply, 0 unusable id(s), EUR 0.2058 total, EUR 0.0171 per brief
levers: AGENT_SELECT=adviser depth=40 count=6 effort=low lookups=5 pool=18 published_cap=7
total EUR 0.2058 over 12 companies, EUR 0.0171 each
```

| archetype | company | pool | picks (pool ranks) | deepest | kept of shipped top 6 | rows in | rows out | unsure | EUR |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|
| Robotics | Neura Robotics | 18 | 1, 7, 4, 3, 2, 11 | 11 | 4 | 1 | 1 | — | 0.0170 |
| Hardware | SMART Photonics | 18 | 0, 11, 1, 7, 10, 9 | 11 | 2 | 3 | 3 | — | 0.0174 |
| FinTech (business lending) | Silvr | 18 | 1, 5, 0, 2, 8, 16 | 16 | 4 | 2 | 2 | — | 0.0190 |
| FinTech (consumer banking) | bunq | 18 | 2, 4, 13, 12, 3, 10 | 13 | 3 | 3 | 3 | — | 0.0177 |
| AI B2C software | Photoroom | 18 | 1, 0, 4, 5, 6, 15 | 15 | 4 | 1 | 1 | — | 0.0157 |
| AI B2B software | Aleph Alpha | 18 | 4, 14, 0, 12, 16, 8 | 16 | 2 | 4 | 4 | — | 0.0197 |
| GovTech | Nortal | 18 | 0, 3, 9, 4, 12, 13 | 13 | 3 | 3 | 3 | — | 0.0176 |
| Platform | sennder | 18 | 0, 1, 2, 6, 7, 9 | 9 | 3 | 0 | 0 | — | 0.0162 |
| Cloud / NeoCloud | Nebius | 18 | 9, 0, 17, 7, 5, 12 | 17 | 2 | 3 | 3 | — | 0.0175 |
| MedTech | Corti | 18 | 0, 7, 10, 11, 6, 4 | 11 | 2 | 2 | 2 | — | 0.0167 |
| Life sciences | BioNTech | 18 | 1, 0, 2, 15, 11, 16 | 16 | 3 | 2 | 2 | — | 0.0167 |
| AgriTech | eAgronom | 18 | 6, 8, 2, 10, 1, 15 | 15 | 2 | 3 | 3 | — | 0.0147 |

- mean deepest reach: **13.6** of 17
- mean rows changed in the published projection: **2.3** of 7
- companies where the model declared something unsure: **0/12**
- companies where retrieval changed its mind: **0** (of 0 that ran a second round)
- **fell back to the shipped order: 0/12**
