# wsGD — where the answer is cut away

```
corpus=postgres instruments=1088 at 2026-08-12T20:32:29.378Z
ranker: all 8 request(s) on EMBEDDING
n=8 holdout described founders, ANTHROPIC_API_KEY deleted before import
1763 pair(s) excluded before this run: the won fund is not publishable
```

> The recall set is CONDITIONED on the won fund being publishable, so the `publishableInstruments()` filters — closure, the capital-type editorial policy, the unconfirmed-open withholding — cannot appear as a miss below. 1763 pair(s) were removed by them before this measurement began.

## Every stage that removes the answer

| stage | list length (mean/median) | won fund still present | lost here |
|---|---:|---:|---:|
| in the corpus | 1088 | 8/8 — 100.0% | — |
| publishable | 771 | 8/8 — 100.0% | 0 |
| gate 1 `buildInstrumentTableHydrated` | 49.1 / 40 | 8/8 — 100.0% | 0 |
| `accessiblePool` (encoded verdict) | 42.0 / 30 | 5/8 — 62.5% | **3** |
| `orderMemoCandidates` (name collapse) | 42.0 / 30 | 5/8 — 62.5% | 0 |
| `.slice(0, 6)` | 6.0 | 3/8 — 37.5% | 2 (cumulative) |
| `.slice(0, 12)` | 12.0 | 4/8 — 50.0% | 1 (cumulative) |
| `.slice(0, 18)` | 17.8 | 4/8 — 50.0% | 1 (cumulative) |
| `.slice(0, 25)` | 23.3 | 5/8 — 62.5% | 0 (cumulative) |
| `.slice(0, 30)` | 26.4 | 5/8 — 62.5% | 0 (cumulative) |
| `.slice(0, 40)` | 30.1 | 5/8 — 62.5% | 0 (cumulative) |
| `.slice(0, 50)` | 33.9 | 5/8 — 62.5% | 0 (cumulative) |
| `.slice(0, 60)` | 37.6 | 5/8 — 62.5% | 0 (cumulative) |
| `.slice(0, 80)` | 42.0 | 5/8 — 62.5% | 0 (cumulative) |

## Recall, legibility and prompt size at each K

| K | mean rows shown | won fund inside | rows with a `funds:` line | prompt chars | ~tokens |
|---|---:|---:|---:|---:|---:|
| 6 | 6.0 | 3/8 — 37.5% | 85.4% | 10768 | 2991 |
| 12 | 12.0 | 4/8 — 50.0% | 90.6% | 16894 | 4693 |
| 18 | 17.8 | 4/8 — 50.0% | 93.0% | 22906 | 6363 |
| 25 | 23.3 | 5/8 — 62.5% | 91.4% | 27708 | 7697 |
| 30 | 26.4 | 5/8 — 62.5% | 91.9% | 30666 | 8518 |
| 40 | 30.1 | 5/8 — 62.5% | 91.3% | 33901 | 9417 |
| 50 | 33.9 | 5/8 — 62.5% | 91.5% | 37613 | 10448 |
| 60 | 37.6 | 5/8 — 62.5% | 91.4% | 41231 | 11453 |
| 80 | 42.0 | 5/8 — 62.5% | 92.0% | 45833 | 12731 |
| the whole pool | 42.0 | 5/8 — 62.5% | 92.0% | 45833 | 12731 |

## The encoded verdict deleted the answer — 3/8 founders (37.5%)

These are funds the company DEMONSTRABLY WON, on a row gate 1 had already selected, which `accessiblePool` then removed because our own encoded filters say the founder conclusively fails them. No depth reaches these: the row is gone before any K is applied. Grouped by the field whose filter fired.

| intake field | founders whose answer it deleted | cited | verified | a requirement it fired on |
|---|---:|---:|---:|---|
| `ticketBand` | 3 | 3 | 3 | Projects of 6 to 18 months must have total eligible project costs between £100,000 and £500,000. |

## Per founder

| founder | country | hydrated | accessible | ordered | rank hyd/acc/ord |
|---|---|---:|---:|---:|---|
| +ATLANTIC ASSOCIACAO PARA UM LABORATORIO COLABORATIVO DO ATLANTICO | DK | 38 | 30 | 30 | 2/2/2 |
| 120FT FACTORY AB | SE | 88 | 75 | 75 | 7/7/7 |
| 1749 LTD | GB | 19 | 16 | 16 | 1/—/— |
| 17CICADA | GB | 28 | 23 | 23 | 4/—/— |
| 1A KONSULT AB | SE | 81 | 72 | 72 | 24/23/23 |
| 1Health Gut Inn Balance APS | DK | 40 | 30 | 30 | 7/6/6 |
| 1SPATIAL GROUP | GB | 27 | 22 | 22 | 1/—/— |
| 1TO1DESIGN S.R.O. | CZ | 72 | 68 | 68 | 2/2/2 |
