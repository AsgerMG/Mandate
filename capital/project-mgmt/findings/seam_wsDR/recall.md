# wsDR — the seam in both positions (mode=recall)

```
corpus=postgres instruments=1088 at 2026-08-11T08:30:32.595Z
ranker: all 2 request(s) on EMBEDDING
agent-select: arm=adviser depth=40 count=6 effort=low lookups=0 (0 brief(s) retrieved) model=claude-sonnet-5 — 4/4 chose, 0 FELL BACK to the shipped order (0 empty reply, 0 unparseable), 0 short reply, 0 unusable id(s), EUR 0.1064 total, EUR 0.0266 per brief
arm=adviser · LEVER=seam position (late|early), both run per founder in ONE process off ONE pool object
default seam for the product: AGENT_SELECT_SEAM=late
levers: depth=40 count=6 effort=low lookups=5 pool=18 published_cap=7
base rate quoted to the model: curve on 846 held-out founders, P(won in first 6)=26.6% P(won in first 18)=44.2% P(won in first 40)=63.8%
total EUR 0.1064 over 2 founders x 2 seams
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
| late (after the cut) | 18.0 | 14.5 |
| early (before the cut) | 40.0 | 23.0 |

mean accessible pool: **114.0** rows

## Pool recall — does the answer survive each cut (2 founders with an answer key)

| cut | won fund in the 18-row pool |
|---|---:|
| the score's (control) | 1/2 — 50.0% |
| late seam | 1/2 — 50.0% |
| early seam | 1/2 — 50.0% |

The late seam is a pure permutation of the score's cut, so its pool recall is equal to the control BY CONSTRUCTION and any difference in that row is a bug. The early seam's is the number the membership change has to be bought with.

- **the early cut DROPPED the answer** the score's cut held: 0 (none)
- **the early cut ADMITTED an answer** the score's cut missed: 0 (none)

## EXACT — the won fund in the published projection

| arm | EXACT@5 | EXACT@6 |
|---|---:|---:|
| off (score only) | 1/2 — 50.0% | 1/2 — 50.0% |
| late seam | 1/2 — 50.0% | 1/2 — 50.0% |
| early seam | 0/2 — 0.0% | 0/2 — 0.0% |

## Movement in the published projection

- mean rows the late seam changed: **2.5** of 7
- mean rows the early seam changed: **3.5** of 7
- fell back to the shipped order: late 0, early 0, of 2

## Per founder

| founder | accessible | won @ accessible | late menu/deepest | early menu/deepest | won in pool off/late/early | won rank off/late/early | EUR |
|---|---:|---:|---|---|---|---|---:|
| KARLSRUHER INSTITUT FUER TECHNOLOGIE (DE) | 114 | — | 18/14 | 40/14 | **no**/**no**/**no** | —/—/— | 0.0550 |
| UNIVERSITY OF STUTTGART (DE) | 114 | 5 | 18/15 | 40/32 | yes/yes/yes | 5/3/— | 0.0514 |
