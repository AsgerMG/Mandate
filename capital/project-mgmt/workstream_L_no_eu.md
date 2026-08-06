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
