# wsEI — the depth question, measured for nothing

```
corpus=postgres instruments=1088 at 2026-08-11T11:44:05.706Z
ranker: all 150 request(s) on EMBEDDING
n=150 held-out described founders, ANTHROPIC_API_KEY deleted before import
```

> **LIMIT=150, so this is the alphabetical HEAD of the holdout split and its pool-recall levels are a sample's, not the population's.** The population figure is the committed `poolRecallCurve.generated.json`, measured on all 846: 44.2% at 18 rows, 63.8% at 40, 77.5% at any depth, mean pool 77.1. The columns this run exists for — LEGIBILITY and PROMPT SIZE — are per-row over thousands of rows and are not sensitive to which founders were drawn. Run with LIMIT=0 for the whole split.

## The pool the seam cuts out of

mean **60.5** rows · median **37** · min 16 · max 166

the won fund is in that pool at all on 86/150 (57.3%)

## Recall, legibility and prompt size at each depth

| menu | mean rows shown | won fund inside | rows with a `funds:` line | prompt chars | ~tokens |
|---|---:|---:|---:|---:|---:|
| 6 | 6.0 | 37/150 — 24.7% | 55.4% | 7983 | 2217 |
| 18 | 18.0 | 61/150 — 40.7% | 57.6% | 15426 | 4285 |
| 40 | 32.7 | 77/150 — 51.3% | 53.2% | 23628 | 6563 |
| the whole pool | 60.5 | 86/150 — 57.3% | 56.0% | 40515 | 11254 |

## Legibility BY BAND — the wsDR-invalidating question

wsDR's early arm was measured while 51 of 133 rows on the audited menus said nothing about what the fund pays for. If the rows a deeper menu ADDS are still less readable than the rows already shown, a depth arm buys unreadable rows and fails for wsDW's reason rather than for depth's.

| band | rows | with a `funds:` line |
|---|---:|---:|
| 1-6 | 900 | 55.4% |
| 7-18 | 1798 | 58.6% |
| 19-40 | 2207 | 47.9% |
| 41+ | 4171 | 59.3% |

## The won fund's own row

35/86 won rows now carry a `funds:` line. wsDV measured 0 of 9 on the nine founders whose answer the early seam was handed; wsDW repaired the splitter. This is that number on the whole population.

