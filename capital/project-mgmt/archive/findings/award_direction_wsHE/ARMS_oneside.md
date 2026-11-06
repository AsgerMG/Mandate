# wsHE — the award term, two arms, paired

```
draw fingerprint    13cb71cf3a1d1847   (identical in both dumps)
A = AWARD_TERM=shipped    n=897   ranker: all 828 request(s) on EMBEDDING
B = AWARD_TERM=oneside    n=897   ranker: all 828 request(s) on EMBEDDING
paired founders     897
```

| depth | measure | A `shipped` | B `oneside` | delta | B-only | A-only | McNemar z | p |
|---|---|--:|--:|--:|--:|--:|--:|--:|
| @5 | EXACT | 33.1% | 35.8% | +2.7 | 37 | 13 | 3.4 | <0.001 |
| @5 | REGIME | 66.8% | 67.2% | +0.4 | 6 | 2 | 1.4 | 0.157 |
| @5 | CHANNEL | 80.5% | 80.7% | +0.2 | 2 | 0 | 1.4 | 0.157 |
| @6 | EXACT | 35.8% | 38.2% | +2.5 | 32 | 10 | 3.4 | <0.001 |
| @6 | REGIME | 69.1% | 69.6% | +0.4 | 6 | 2 | 1.4 | 0.157 |
| @6 | CHANNEL | 82.1% | 82.3% | +0.2 | 2 | 0 | 1.4 | 0.157 |

## Concentration of what B gained

| measure | founders gained | regimes | largest regime | its share |
|---|--:|--:|---|--:|
| exact@5 | 37 | 7 | `vinnova_grant` | 81.1% |
| regime@5 | 6 | 6 | `nfr_pes` | 16.7% |
| channel@5 | 2 | 2 | `innovation_fund` | 50.0% |
| exact@6 | 32 | 7 | `vinnova_grant` | 78.1% |
| regime@6 | 6 | 6 | `nfr_pes` | 16.7% |
| channel@6 | 2 | 2 | `satr_fr_rnd` | 50.0% |

## The sibling cell, the population the defect was diagnosed in

```
under A: missed the fund but saw a SIBLING of it (@6)   299
  ...B turns into an EXACT hit                         28  9.4%
B pushes OUT of an exact hit into a sibling miss        8
net doors won inside the cell                          +20
```
