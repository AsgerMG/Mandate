# Workstream L-NO-EU — eligibility coverage for Norway and the EU-level instruments

Branch `workstream-l-no-eu`. Scope: `funding_instruments` rows with `country IN ('NO','EU')`
only. 141 instruments, both populations at 0% `eligibility_text` coverage at start.

Scoreboard: `npx tsx website/frontend/scripts/measure_sibling_coverage.ts`.
Baseline (2026-08-06, commit d9fed89):

```
multi-leaf regimes 53, holding 797 leaves
ALL THREE J OMITTED   mean class 18.0   uniquely identified 36%
eligibility_text over 40 chars: 240 of 1014      NO 0/74 0%    EU 0/67 0%
```

---

## FINDING 1 (before spending a single fetch) — Norway cannot pay on this scoreboard

**73 of Norway's 74 instruments are singleton regimes.** They have no siblings, so there is
nothing for eligibility text to distinguish them *from*. Exactly one NO row sits in a
multi-leaf regime (`innovation_fund`).

Oracle simulation — give every NO leaf a perfectly distinct eligibility text, for free:

```
ALL THREE (today)                          mean class 18.0   unique 35.6%
+ perfect distinct text for EVERY NO leaf  mean class 18.0   unique 35.8%
```

Mean sibling class does not move. Not "moves a little" — the leaf-weighted mean is
unchanged to one decimal, and unique-ID gains 0.2pp, which is the single `innovation_fund`
row. **No amount of Norwegian fetching can move the sibling metric.** Norwegian coverage
is worth something for the memo (citable text, application URLs for a founder who lands on
a Norwegian instrument) but it must not be sold as sibling separation, and it must not be
prioritised over EU on this scoreboard.

The brief anticipated this risk for EU and asked us to say it plainly and early if it
landed. It landed — on Norway, not EU.

## FINDING 2 — EU pays, but only inside its own regimes

52 of 67 EU instruments *are* in multi-leaf regimes, across 11 regimes:

```
 12  IPCEI (all waves)                          11 EU leaves
 10  Horizon Europe partnerships & JUs           9
 10  Horizon Europe Pillar II (all clusters)     9
  9  EU Innovation Fund (all lots)               7 EU + 1 NO
  9  EIT (all KICs)                              1
  5  EIC (all tracks)                            4
  3  Chips Joint Undertaking                     2
  3  European Defence Fund                       2
  3 / 2 / 2  (three parentless clusters)         7
```

Oracle simulation, restricted to the 11 EU-containing regimes (68 leaves) — the honest
local scoreboard for this workstream:

```
mean class TODAY          8.32
with perfect EU text      1.85     <- the payable target
```

But on the **global** 797-leaf metric the same perfect coverage buys:

```
ALL THREE (today)                          mean class 18.0   unique 35.6%
+ perfect distinct text for EVERY EU leaf  mean class 17.5   unique 42.9%
```

**Say this plainly: 18.0 -> 17.5 is the whole global prize.** The global mean is
leaf-weighted and EU is 6.5% of leaves; it is dominated by the large FR/ES/DE/IT regimes
other agents own. The metric that actually moves is unique identification, +7.3pp from
6.5% of the corpus — because EU regimes are small enough to be *fully* resolved, unlike
the 48-sibling French ones. Per leaf touched, this is the best ratio available; in absolute
global mean-class terms it is half a sibling.

Implication for the manager: the 95% exact-scheme target is not reachable by finishing
this workstream, and nobody should read a 0.5 move as failure here. The ceiling
(every leaf everywhere perfectly distinct) is mean class 1.0 / unique 100%.

---

## Batch 1-2 — EIC (4 leaves) and Innovation Fund (8 leaves)

Both regimes went to **mean class 1.00 — fully resolved, every leaf uniquely identified.**

```
EU-containing regimes, 11 regimes / 68 leaves
  local mean class   8.32  ->  6.97
  global mean class  18.0  ->  17.9      unique 35.6% -> 38%
  EU coverage        0/67  ->  11/67     NO 0/74 -> 1/74
```

Per regime after this batch:

```
  12 leaves  cov  0  mean class 12.00  ipcei
  10 leaves  cov  0  mean class 10.00  horizon_eu_partnership
  10 leaves  cov  0  mean class 10.00  horizon_eu_pillar_ii
   9 leaves  cov  0  mean class  9.00  eit
   9 leaves  cov  8  mean class  1.00  innovation_fund      <- resolved
   5 leaves  cov  4  mean class  1.00  eic                  <- resolved
   3 leaves  cov  0  mean class  3.00  chips_ju
   3 leaves  cov  0  mean class  3.00  edf
   3 / 2 / 2 leaves  the three EIT KIC clusters
```

### What made them resolve, and the trap next to it

Writing down each leaf's *legal* eligibility would have resolved nothing. All four EIC
tracks and all seven Innovation Fund lots share the same Horizon/ETS boilerplate — legal
entity, established in an eligible country, 60% aid ceiling. Copy that onto every sibling
and coverage goes to 100% while mean class stays at 9.

What separates them is the **one condition each lot does not share**:

| lot | the discriminating condition |
|---|---|
| IF LSP / MSP / SSP | CAPEX `>100m` / `20-100m` / `2.5-20m` — pure size bands |
| IF clean-tech mfg | funds *building the factory*; explicitly excludes *using* the equipment |
| IF pilots | must **not** yet reach commercial scale — the only lot with a ceiling on maturity |
| IF battery | planned annual capacity `>= 10 GWh`, and applicant's first commercial EV-cell project **globally** |
| IF hydrogen bank | not a grant call — an auction paying a fixed premium per verified kg over 10 years |
| EIC Accelerator | single applicant, TRL 6-8, only track open to mid-caps to 499 staff |
| EIC Pathfinder | 3-party cross-border consortium, TRL 1-4 |
| EIC Transition | gated on a **prior EU-funded project** as the source of results |
| EIC Fund | the only equity track; carries a foreign-control exclusion the grants do not |

The rule this workstream is following: **record the condition a sibling would fail, not the
condition they all pass.** Coverage percentage is not the deliverable.

### Surprises worth recording

1. **The Innovation Fund's leaf structure is a historical award taxonomy, not a current
   application menu.** The corpus lots (LSP/MSP/SSP/PLT/MFG/battery/hbank) are the IF23-IF24
   shape. IF25 restructured to NZT + Heat Auction + Hydrogen Auction. The CAPEX bands
   survived the restructure, so the texts are still true and still discriminating, but nobody
   should read these leaves as "calls you can open today". Recorded as `status: recurring`
   with the round dates in `deadline`, not as open and not as closed.
2. **The shared loader reads `administering_body`, not `body`.** `found_AT.json` and the
   other agents' files use `body`; the key the loader consumes is `administering_body`. Twelve
   EU rows initially loaded prose with a NULL body for that reason. Worth checking whether
   other countries' files have the same silent miss.
3. `load_scheme_text.py` gained `--country` (mine) at the same time its owner was rewriting
   it for corpus-driven liveness. Both changes are in the working tree together. Publishing is
   done through `ETL/terms/publish_scheme_text_scoped.py`, which is country-scoped so it
   cannot carry a neighbour's uncommitted SQLite row into the live read path.
