# What 95% arithmetically requires

Written 2026-08-06 while three workstreams were running, because all three were
aimed at "improve the ranking" without anyone having checked what the target
decomposes into. It turns out to constrain the design hard enough that it
changed two of the three briefs.

Method: `funding_instruments` joined against the 2,817 holdout pairs of
`__recallSetComposed.json`. No ranker code involved, so nothing here depends on
the state of `shortlist.ts`.

## The group we have to order is large, and there is no easy tail

Regime size (`parent_id` group) of the fund each company actually won:

```
p10  12      median  76      p75  88      p90  103      max  103
regimes with ONE member (nothing to separate)      0   ( 0%)
regimes with <= 5 members                         90   ( 3%)
```

Every won fund sits inside a crowd. 97% of them sit in a crowd of more than
five. Any plan that hopes part of the corpus is easy is wrong about this corpus.

## The decomposition

```
EXACT@5  =  P(in pool)  x  P(regime reaches the five)  x  P(we pick the right leaf)
   36%   =      97%     x           89%                x          40%
```

The third factor is derived, not measured directly, and it is the whole
remaining product. Solving for what 95% needs:

| regime@5 | right leaf must be picked |
|---|--:|
| 92% | 106%  — impossible |
| 95% | 103%  — impossible |
| 97% | 101%  — impossible |
| 99% |  99% |

**There is no version of 95% exact that does not require near-perfect regime
recall AND near-perfect leaf choice inside a median-76 group.** Ranking tweaks
cannot get there; they move the third factor by single points.

## The third factor has a ceiling, and it is 39%

Added 2026-08-06 by workstream J. Two corrections to the figures above, then
the result they were needed for.

**The 36% is void.** It was the old stride sampler aliasing against the set's
ordering. On the seeded shuffle (`95f5fce`), three seeds:

```
             seed 20260806   seed 7   seed 99
pool               97%         96%      96%
EXACT@5            27%         30%      26%     (+/-5.5 at n=250)
REGIME@5           86%         91%      85%
```

So the decomposition reads `28% = 96% x 87% x 33%`, and the half-width is 6
points — a 2-3 point move is not a result.

**The third factor cannot be raised past ~39%, and that is arithmetic rather
than a prediction.** `scripts/measure_offer_separability.ts` asks what a
chooser built on the leaf's own OFFER can reach — capital type, award
magnitude at ticket-band resolution, registered GBER article, registered
purpose, own encoded gates, closing date — without building one. Two siblings
that record the same values on all six cannot be told apart by any chooser
reading them, however perfectly the founder answers, so the size of that
indistinguishable class bounds every such chooser at once. Holdout, n=2,786,
mean regime 53.3 members:

```
offer facets, all six          27.0% @1   42.1% @3    mean class 31.3
+ sector ranked inside class   38.8% @1   55.9% @3    upper bound on a hybrid
```

The second line is the highest number available: a perfect founder, perfectly
matched, with the strongest measured posterior breaking the remaining ties. It
is 39% against the 99% the table above requires. **95% EXACT@5 is not
reachable with the facts this corpus holds** — not by a better ranker, and not
by a better chooser.

The same arithmetic prices the collapse. One row per regime buys about six
points of regime@5, so collapsed EXACT@5 tops out at `0.96 x 0.93 x 0.388 =
35%` against today's 28% +/-6 — a gain that needs the oracle to be real. At
any realistic fraction of it the collapse loses, which is what workstream G
measured directly (12 exact points spent for 5 regime points) and why it
refused to ship it. That refusal stands.

## What binds is register coverage, not the mechanism

The mechanism is sound where the data exists. Of the six facets, the two
registered ones carry the signal, and they are on record for a third of
leaves. On cases whose won leaf has a registered basis the oracle is **52.8%**
against **20.6%** for the same cases with the register removed, and coverage
predicts the outcome country by country:

```
ES  0% registered -> oracle 11%   (class 44)      DE  87% -> 53%   (class 3.8)
FR 35%            -> oracle 15%   (class 48)      IT  91% -> 62%   (class 2.2)
SE 17%            -> oracle 17%   (class 40)      NL  88% -> 67%   (class 3.3)
```

Spain is 24% of the graded holdout and has no registered objective at all. So
the leverage is an ETL job — extend the objective/article extraction to the
registers that have none — and not a modelling one. It still does not reach
95%: complete coverage puts the ceiling near 53% before the hybrid, and the
target needs 99%.

Two things this chooser is NOT exposed to, recorded because both were asked:

- **A cut year cannot break it.** Five of the six facets are properties of the
  registration, true of a scheme that has never paid anyone. Only award
  magnitude is fitted to history, and it is worth 3.0 points of the 27.0%
  (registration facts alone: 24.0%). There is nothing here to collapse the way
  the sector posterior collapsed 34.5% -> 10.9%.
- **It was never gradeable end to end.** `__recallSetComposed.json` carries
  `name, country, sector, instrument, description, mode, split` and no founder
  intake — no `ticketBand`, no `capitalSought`, no `useOfFunds`. An
  offer-against-intake chooser has no answers to match against, and the only
  available source for them is the amount of the award being predicted. The
  oracle above exists because it is the one leak-free way to bound the idea.

## The structural consequence

Workstream E measured that among the 125 holdout cases where the won fund is in
the pool but below the cut, the share where *the regime holds a slot and the won
leaf is its best member* is **0%**. There is no case that was lost for lack of a
seat once the regime was ordered correctly.

Two things follow.

1. **Collapsing rows to one per regime converts regime@5 into EXACT@5 almost
   one-for-one.** The seat was never the binding constraint; the representative
   was.

2. **Collapsing frees seats.** A mean of **3.07 of the five rows are currently
   siblings of one regime** — three seats on one programme, none of them the
   right leaf. One row per regime makes the five rows five distinct programmes,
   which should lift regime@5 above 89% at no cost, because two seats stop being
   spent on a choice we are getting wrong anyway.

This is also the product's own promise. Five rows that are three flavours of one
regime are not "five specific funds to apply to", whatever the recall number
says.

## The ceiling of region, stated before we tune toward it

Region is the only measured separator (44-66% @1 within groups). Its physical
ceiling is the **94.4% NUTS-1 self-agreement** of a company's own awards — a
company's region does not identify its leaf more reliably than the company's
own award history agrees with itself.

So region alone tops out near 94% on the third factor, which with a perfect
pool and perfect regime recall lands short of 95% end to end. **A second
separator, orthogonal to geography, is required.** That is a statement about the
design, not a prediction about any one experiment, and it should be checked
against measurement rather than believed.

## What this rules out

- Tuning global sort weights. They move the third factor by points; it needs
  tens of points.
- Any plan that reaches 95% exact while regime@5 sits below ~99%.
- Treating region as "one more signal". Under the collapsed shape it is not a
  signal in a sort, it is the answer to a single question per regime.
