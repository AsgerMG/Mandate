# wsDR — the seam in both positions (mode=bench)

```
corpus=postgres instruments=1088 at 2026-08-11T08:31:28.396Z
ranker: all 12 request(s) on EMBEDDING
agent-select: arm=adviser depth=40 count=6 effort=low lookups=0 (0 brief(s) retrieved) model=claude-sonnet-5 — 24/24 chose, 0 FELL BACK to the shipped order (0 empty reply, 0 unparseable), 0 short reply, 0 unusable id(s), EUR 0.4903 total, EUR 0.0204 per brief
arm=adviser · LEVER=seam position (late|early), both run per founder in ONE process off ONE pool object
default seam for the product: AGENT_SELECT_SEAM=late
levers: depth=40 count=6 effort=low lookups=5 pool=18 published_cap=7
base rate quoted to the model: curve on 846 held-out founders, P(won in first 6)=26.6% P(won in first 18)=44.2% P(won in first 40)=63.8%
total EUR 0.4903 over 12 founders x 2 seams
```

## The base-rate line, as the two seams print it

```
late  (list of 18):

Measured on 846 held-out companies, the scheme that actually paid out is in
the first six rows about 25% of the time, and somewhere in this list of 18
about 45% of the time.
So about 20% of the time it is in this list but BELOW the sixth row --
that is the whole of what a choice of yours can win -- and about 55% of the
time it is not in this list at all, and nothing you pick can reach it.
```
```
early (list of 40):

Measured on 846 held-out companies, the scheme that actually paid out is in
the first six rows about 25% of the time, and somewhere in this list of 40
about 65% of the time.
So about 40% of the time it is in this list but BELOW the sixth row --
that is the whole of what a choice of yours can win -- and about 35% of the
time it is not in this list at all, and nothing you pick can reach it.
```

## Depth

| | list shown | mean deepest reach |
|---|---:|---:|
| late (after the cut) | 18.0 | 14.3 |
| early (before the cut) | 33.4 | 25.1 |

mean accessible pool: **45.8** rows

## EXACT is NOT REPORTABLE on this population

These founders are archetypes chosen to be plausible, not recall pairs with a known won fund. There is no answer key, so EXACT@5 and EXACT@6 are undefined here rather than zero, and pool recall cannot be computed. What IS measured is depth, reach and how far the published projection moves. Run `MODE=recall` for the graded numbers.

## Movement in the published projection

- mean rows the late seam changed: **2.3** of 7
- mean rows the early seam changed: **2.6** of 7
- fell back to the shipped order: late 0, early 0, of 12

## Per founder

| founder | accessible | won @ accessible | late menu/deepest | early menu/deepest | won in pool off/late/early | won rank off/late/early | EUR |
|---|---:|---:|---|---|---|---|---:|
| Neura Robotics (Germany) | 22 | — | 18/15 | 22/15 | —/—/— | —/—/— | 0.0352 |
| SMART Photonics (Netherlands) | 38 | — | 18/12 | 38/29 | —/—/— | —/—/— | 0.0437 |
| Silvr (France) | 47 | — | 18/16 | 40/16 | —/—/— | —/—/— | 0.0462 |
| bunq (Netherlands) | 34 | — | 18/13 | 34/30 | —/—/— | —/—/— | 0.0431 |
| Photoroom (France) | 48 | — | 18/16 | 40/29 | —/—/— | —/—/— | 0.0414 |
| Aleph Alpha (Germany) | 105 | — | 18/16 | 40/38 | —/—/— | —/—/— | 0.0575 |
| Nortal (Estonia) | 67 | — | 18/13 | 40/38 | —/—/— | —/—/— | 0.0401 |
| sennder (Germany) | 18 | — | 18/17 | 18/16 | —/—/— | —/—/— | 0.0326 |
| Nebius (Netherlands) | 44 | — | 18/13 | 40/32 | —/—/— | —/—/— | 0.0448 |
| Corti (Denmark) | 28 | — | 18/11 | 28/24 | —/—/— | —/—/— | 0.0370 |
| BioNTech (Germany) | 21 | — | 18/15 | 21/19 | —/—/— | —/—/— | 0.0346 |
| eAgronom (Estonia) | 77 | — | 18/15 | 40/15 | —/—/— | —/—/— | 0.0341 |
