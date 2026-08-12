# wsGD — where the answer is cut away

```
corpus=postgres instruments=1088 at 2026-08-12T20:51:04.795Z
ranker: all 6 request(s) on EMBEDDING
n=6 holdout described founders, ANTHROPIC_API_KEY deleted before import
1763 pair(s) excluded before this run: the won fund is not publishable
```

> The recall set is CONDITIONED on the won fund being publishable, so the `publishableInstruments()` filters — closure, the capital-type editorial policy, the unconfirmed-open withholding — cannot appear as a miss below. 1763 pair(s) were removed by them before this measurement began.

## Every stage that removes the answer

| stage | list length (mean/median) | won fund still present | lost here |
|---|---:|---:|---:|
| in the corpus | 1088 | 6/6 — 100.0% | — |
| publishable | 771 | 6/6 — 100.0% | 0 |
| gate 1 `buildInstrumentTableHydrated` | 49.0 / 40 | 6/6 — 100.0% | 0 |
| `accessiblePool` (encoded verdict) | 41.0 / 30 | 4/6 — 66.7% | **2** |
| `orderMemoCandidates` (name collapse) | 41.0 / 30 | 4/6 — 66.7% | 0 |
| `.slice(0, 6)` | 6.0 | 2/6 — 33.3% | 2 (cumulative) |
| `.slice(0, 12)` | 12.0 | 3/6 — 50.0% | 1 (cumulative) |
| `.slice(0, 18)` | 17.7 | 3/6 — 50.0% | 1 (cumulative) |
| `.slice(0, 25)` | 23.2 | 4/6 — 66.7% | 0 (cumulative) |
| `.slice(0, 30)` | 26.5 | 4/6 — 66.7% | 0 (cumulative) |
| `.slice(0, 40)` | 29.8 | 4/6 — 66.7% | 0 (cumulative) |
| `.slice(0, 50)` | 33.2 | 4/6 — 66.7% | 0 (cumulative) |
| `.slice(0, 60)` | 36.5 | 4/6 — 66.7% | 0 (cumulative) |
| `.slice(0, 80)` | 41.0 | 4/6 — 66.7% | 0 (cumulative) |

## How much of the ceiling is the replay's own invention

`check_winner_not_gated.ts` refuses to answer `ticketBand`, `consortium`, `useOfFunds`, `activities` because "a replay that hands every founder a made-up ticket band or consortium stance manufactures failures the founder would never have produced, and a guard built on those would ratchet on fiction." Every ceiling this repo quotes is computed by a replay that answers them anyway. Gate 1 is held FIXED in both columns, so the only thing that moves is the encoded-verdict drop.

| | pool length | won fund present | at K=18 | at K=40 |
|---|---:|---:|---:|---:|
| as replayed (the published figures) | 41.0 | 4/6 — 66.7% | 50.0% | 66.7% |
| with the invented answers withdrawn | 43.8 | 6/6 — 100.0% | 83.3% | 100.0% |

## Recall, legibility and prompt size at each K

| K | mean rows shown | won fund inside | rows with a `funds:` line | prompt chars | ~tokens |
|---|---:|---:|---:|---:|---:|
| 6 | 6.0 | 2/6 — 33.3% | 83.3% | 10788 | 2997 |
| 12 | 12.0 | 3/6 — 50.0% | 91.7% | 16988 | 4719 |
| 18 | 17.7 | 3/6 — 50.0% | 93.4% | 22781 | 6328 |
| 25 | 23.2 | 4/6 — 66.7% | 94.2% | 27835 | 7732 |
| 30 | 26.5 | 4/6 — 66.7% | 94.3% | 30860 | 8572 |
| 40 | 29.8 | 4/6 — 66.7% | 94.4% | 33646 | 9346 |
| 50 | 33.2 | 4/6 — 66.7% | 94.5% | 36645 | 10179 |
| 60 | 36.5 | 4/6 — 66.7% | 94.1% | 39548 | 10986 |
| 80 | 41.0 | 4/6 — 66.7% | 94.3% | 44290 | 12303 |
| the whole pool | 41.0 | 4/6 — 66.7% | 94.3% | 44290 | 12303 |

## The encoded verdict deleted the answer — 2/6 founders (33.3%)

These are funds the company DEMONSTRABLY WON, on a row gate 1 had already selected, which `accessiblePool` then removed because our own encoded filters say the founder conclusively fails them. No depth reaches these: the row is gone before any K is applied. Grouped by the field whose filter fired.

`sole` counts the founders for whom removing THAT ONE ANSWER un-blocks the fund: the field is then the whole of the reason the answer was deleted. Several of these answers are DERIVED by the replay rather than stated by a founder — `ticketBand` from the median award under a different notified scheme, `region` from a different scheme's beneficiary region — so a high `sole` count on a derived field is a claim about our guess before it is a claim about our gates.

`own` counts the subset where the answer that fired is DERIVED FROM THIS COMPANY. The rest fired on `CONSTANT_ANSWERS` — a stand-in the replay supplies so the denominator does not move with the answer mode — and a gate that deletes a won fund on a stand-in is evidence about the replay, not about the corpus.

| intake field | founders whose answer it deleted | sole | own | cited | verified | a requirement it fired on |
|---|---:|---:|---:|---:|---:|---|
| `ticketBand` | 2 | 2 | 0 | 2 | 2 | Projects of 6 to 18 months must have total eligible project costs between £100,000 and £500,000. |

## Is the CONTROL invariant to the pool width?

A pool-width arm is only readable against a fixed control. The score's order is a prefix of itself, so a later cut cannot reorder the head — but `resolveNameCollisions` picks a label class's survivor by `preferBetterEvidencedRow`, a total order INDEPENDENT of position, so a wider pool can promote a better-evidenced sibling from deep in the pool and demote the row that held the label in the top seven. Measured against K=18, on the writer's own `toWriter` projection.

| K | control projection identical to K=18 | the won fund enters | the won fund leaves |
|---|---:|---:|---:|
| 6 | 0/6 — 0.0% | 0 | 1 |
| 12 | 6/6 — 100.0% | 0 | 0 |
| 25 | 6/6 — 100.0% | 0 | 0 |
| 30 | 6/6 — 100.0% | 0 | 0 |
| 40 | 6/6 — 100.0% | 0 | 0 |
| 50 | 6/6 — 100.0% | 0 | 0 |
| 60 | 6/6 — 100.0% | 0 | 0 |
| 80 | 6/6 — 100.0% | 0 | 0 |
| the whole pool | 6/6 — 100.0% | 0 | 0 |

## Per founder

| founder | country | hydrated | accessible | ordered | rank hyd/acc/ord |
|---|---|---:|---:|---:|---|
| +ATLANTIC ASSOCIACAO PARA UM LABORATORIO COLABORATIVO DO ATLANTICO | DK | 38 | 30 | 30 | 2/2/2 |
| 120FT FACTORY AB | SE | 88 | 75 | 75 | 7/7/7 |
| 1749 LTD | GB | 19 | 16 | 16 | 1/—/— |
| 17CICADA | GB | 28 | 23 | 23 | 4/—/— |
| 1A KONSULT AB | SE | 81 | 72 | 72 | 24/23/23 |
| 1Health Gut Inn Balance APS | DK | 40 | 30 | 30 | 7/6/6 |
