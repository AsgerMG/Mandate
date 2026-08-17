# wsHE — the award term, two arms, paired

```
draw fingerprint    13cb71cf3a1d1847   (identical in both dumps)
A = AWARD_TERM=shipped    n=897   ranker: all 828 request(s) on EMBEDDING
B = AWARD_TERM=off    n=897   ranker: all 828 request(s) on EMBEDDING
paired founders     897
```

| depth | measure | A `shipped` | B `off` | delta | B-only | A-only | McNemar z | p |
|---|---|--:|--:|--:|--:|--:|--:|--:|
| @5 | EXACT | 33.1% | 35.2% | +2.1 | 39 | 20 | 2.5 | 0.013 |
| @5 | REGIME | 66.8% | 66.7% | -0.1 | 8 | 9 | -0.2 | 0.808 |
| @5 | CHANNEL | 80.5% | 80.7% | +0.2 | 2 | 0 | 1.4 | 0.157 |
| @6 | EXACT | 35.8% | 38.1% | +2.3 | 35 | 14 | 3.0 | 0.003 |
| @6 | REGIME | 69.1% | 69.5% | +0.3 | 9 | 6 | 0.8 | 0.439 |
| @6 | CHANNEL | 82.1% | 82.3% | +0.2 | 2 | 0 | 1.4 | 0.157 |

## Concentration of what B gained

| measure | founders gained | regimes | largest regime | its share |
|---|--:|--:|---|--:|
| exact@5 | 39 | 9 | `vinnova_grant` | 76.9% |
| regime@5 | 8 | 8 | `nfr_pes` | 12.5% |
| channel@5 | 2 | 2 | `satr_fr_rnd` | 50.0% |
| exact@6 | 35 | 10 | `vinnova_grant` | 71.4% |
| regime@6 | 9 | 9 | `nfr_pes` | 11.1% |
| channel@6 | 2 | 2 | `satr_fr_rnd` | 50.0% |

## The sibling cell, the population the defect was diagnosed in

```
under A: missed the fund but saw a SIBLING of it (@6)   299
  ...B turns into an EXACT hit                         28  9.4%
B pushes OUT of an exact hit into a sibling miss        8
net doors won inside the cell                          +20
```
