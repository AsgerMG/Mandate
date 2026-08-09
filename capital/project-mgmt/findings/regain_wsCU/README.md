# wsCU — the two gains, re-measured against a founder who exists

> ## ⚠ SUPERSEDED IN PART BY wsCT, AND RE-RUN
>
> wsCT merged onto `main` while this workstream was measuring, and it repaired
> the `entityCountries` comparator: the corpus states "must be established in
> X" with the country's **English name**, `matchesAny` compared strings, and
> `["Denmark"]` was therefore false for `["DK"]`. 51 of the 58 `VER-BLOCKED`
> deletions were that artefact.
>
> Sections 1, 2/3 below were measured on `d7c36ba7`, before that fix. **They
> have been re-run on the merged tree and section 6 carries the numbers that
> stand.** The pre-merge figures are kept because they are the controls: they
> reproduce wsCR and wsCS to the decimal, which is what licenses reading any
> difference as the founder rather than the harness.

Every figure below was produced after `d7c36ba7`, on `founderIntake(row, policy)`.
Every run printed `ranker: all N request(s) on EMBEDDING`; none was discarded.
Nothing here was tuned on holdout: the blend is fitted on `tune` and read on
`holdout` once, and the harness refuses a pair of dumps naming one split.

Each result carries an **OLD arm** — `IDENTITY=anonymous OWN_HISTORY=withheld
CAPITAL=pinned ANSWERS=off`, exactly the founder wsCR and wsCS measured — run
on the SAME converted code. Where the OLD arm reproduces the published number,
any difference in the NEW arm is the founder and not the harness. Both did.

## 1. The blend (wsCS) — SURVIVES, and is slightly larger

`measure_signal_power.ts` N=600 per split → `fit_signal_blend.ts`.

|                        | blend | shipped | PAIRED delta | discordant | z   |
|------------------------|-------|---------|--------------|------------|-----|
| OLD (wsCS's founder)   | 27.8  | 23.0    | **+4.8 ±3.3**| 67 / 38    | 2.8 |
| NEW (real founder)     | 27.8  | 22.2    | **+5.7 ±3.5**| 74 / 40    | 3.2 |
| STRICT (+ticket/region)| 27.7  | 22.3    | **+5.3 ±3.5**| 74 / 42    | 3.0 |

Control: the OLD arm's single-signal table reproduces wsCS's four published
holdout figures to the decimal — SHIPPED 23.0 ±3.4, peer prior 22.6, semantic
20.7, unclipped sector 19.3.

Concentration, beside the number: gains over **20 regimes, largest 20%**;
losses over 19, largest 18%. Not one market, unlike wsCQ's pool gain.

**The honest reading.** The blend did not improve (27.8 → 27.8). The SHIPPED
arm FELL (23.0 → 22.2). `usedInField` went live on 45% of rows and bought the
product's own ranker nothing measurable, while pool reach rose 92% → 98%. The
lever survives because what it beats did not improve.

Upper bound, unchanged: a pure pool re-ordering, no channel cap, no dedupe, and
its largest weight is still PROXIMITY (3.60) — a term `rowRelevance` lacks.

## 2/3. The sixth row (wsCR) and MEMO@6 vs SCREEN@6 — both hold

`_wscu_memo.ts` N=250 per split.

| split   | arm | SCREEN@5→@6 | MEMO@5→@6   | sixth row | memo/screen |
|---------|-----|-------------|-------------|-----------|-------------|
| tune    | OLD | 26.4 → 30.0 | 12.8 → 15.6 | **+2.8**  | 52%         |
| tune    | NEW | 26.0 → 29.2 | 12.8 → 15.2 | **+2.4**  | 52%         |
| holdout | OLD | 22.4 → 25.6 | 12.8 → 14.0 | **+1.2**  | 55%         |
| holdout | NEW | 21.2 → 24.4 | 13.2 → 14.4 | **+1.2**  | 59%         |

No concentration: 6 pairs across 6 regimes and 6 countries on tune, 3/3/3 on
holdout. Inert for the ~32% of founders whose memo order has no sixth row.

**wsCR's real finding survives intact and stays the biggest thing on the board.**
`VER-BLOCKED` still deletes the won leaf **57/250 tune, 71/250 holdout**, and
the `scoreFit` re-sort still moves it out of the top six **47 times for 12 in**
on tune, 38 for 13 on holdout. Measured only — wsCT owns that stage.

Tier 1 was live: `usedInField` true for the won leaf's own channel on 18.8% of
tune pairs, 0.0% under the OLD arm. The null is not a dark signal.

## 4. The four autopsy buckets — reproduce wsCQ exactly

`_wsci_autopsy.ts` N=250.

| bucket                  | tune  | holdout |
|-------------------------|-------|---------|
| 1 never in the pool     | 3.2%  | 1.0%    |
| 2 cut before the table  | 1.6%  | 1.0%    |
| 3 ranked below five     | 48.6% | 44.7%   |
| 4 unwinnable            | 46.5% | 53.3%   |

ORACLE CAP 96.4% tune / 98.4% holdout. Bucket 4 is 7-8 regimes and bucket 3 is
44-52, which is the same shape wsCQ reported: the reachable headroom is in
bucket 3 and it is spread.

## 5. Single signals — the null is unchanged

Every one of the eighteen arms moved by less than one point between OLD and NEW
on holdout, and every one stayed inside its own half-width. Ranking remains
closed for single signals; the blend remains the only live lever.

## Leak status

Leak-free by construction on every figure above: `identity=real` with the
founder's OWN award history **withheld**, `capitalSought` neutral rather than
pinned, and in the STRICT arm ticket and region derived only under the
`other_scheme` guard. `usedInField` is set from peers' awards, never this
founder's. `check_recall_leaks` green (1,366 described rows, 0 leaks).
`OWN_HISTORY=corpus` was not run here; wsCQ priced it at EXACT@5 26→29.

## Floors

`check_recall_floor` green on every floor, `ranker: all 294 request(s) on
EMBEDDING`. `traced:exact_attribution` reads **89% against its floor of 88%** —
one point of margin where wsCQ recorded zero. Nothing was lowered and nothing
was moved.

## 6. THE NUMBERS THAT STAND — real founder, post-wsCT comparator

Merged tree, `identity=real own-history=withheld capital=withheld answers=off`.
Every run attested: memo 490/500 requests, blend cuts 1175/1182, all on
EMBEDDING.

### The blend — SURVIVES, larger still

|                          | blend | shipped | PAIRED       | discordant | z   |
|--------------------------|-------|---------|--------------|------------|-----|
| wsCS, fictional founder  | 27.8  | 23.0    | +5.0 ±3.4    | 69 / 39    | 2.9 |
| wsCU, real founder       | 27.8  | 22.2    | +5.7 ±3.5    | 74 / 40    | 3.2 |
| **wsCU, real + wsCT**    |**29.2**|**23.2**|**+6.0 ±3.3**| **71 / 35**|**3.5**|

Gains over **20 regimes, largest 17%**; losses over 18, largest 20%. Spread,
not one market. **Verdict: the +5.0 does not close. It grows.**

### The sixth row — worth MORE than wsCR measured, off a base twice as high

| split   | SCREEN@5→@6 | MEMO@5→@6   | sixth row | memo keeps |
|---------|-------------|-------------|-----------|------------|
| tune    | 26.8 → 30.0 | 24.4 → 27.2 | **+2.8**  | 91%        |
| holdout | 22.0 → 25.2 | 18.0 → 21.2 | **+3.2**  | 84%        |

Concentration: 7 pairs / 5 regimes / 4 countries on tune, 8 / 6 / 5 on holdout.
And it is no longer inert for anyone — **100% of founders now have a sixth row**
in the memo order, against 68-72% before the comparator fix.

### MEMO@6 vs SCREEN@6 — the alarm is retracted, independently

wsCR's "the memo is half the screen" (15.6 vs 30.0) reproduced exactly on the
old code and **is gone on the new**: 27.2 vs 30.0 tune, 21.2 vs 25.2 holdout.
`VER-BLOCKED` falls 57 → **7** on tune and 71 → **17** on holdout; the `scoreFit`
re-sort falls from 47-out/12-in to **8-out/1-in**. This is an independent
confirmation of wsCT's retraction, measured by a different probe on a different
draw. The biggest lever on the board is no longer the memo stage.

### Floors, on the merged tree

All green, `ranker: all 294 request(s) on EMBEDDING`. `exact5` reads 27 (floor
15). **`traced:exact_attribution` reads 89 against its floor of 88** — one point
of margin, where wsCQ recorded zero. Nothing lowered, nothing moved down.
