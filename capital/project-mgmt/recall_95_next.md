# The route to 95%: allocate slots by where funding actually comes from

Written 2026-08-03, after Phases 0–2a. Every number measured; re-measure with
`SPLIT=holdout npx tsx scripts/measure_recall.ts`.

## Where we are

```
                    session start   now (holdout)
in pool                     78%          86%
EXACT scheme in top 5       47%          49%
same REGIME in top 5        59%          72%   <- operational
  mode=project                           76%
  mode=profile              17%          60%
```

## The finding this plan rests on

Two measurements, taken together, say the remaining gap is not ranking quality.

**Only 6–8 distinct regimes could be right, per country.** FR 8, DE 8, IT 7,
ES 6, NL 7, SE 6. Choosing 5 of 8 should be near-certain; we are at 72%.

**77.8% of funded companies in the six markets won national state aid.**
Uncapped, distinct companies:

```
state_aid_satr         48,344   77.8%
horizon_eu_pillar_ii    8,974   14.5%
horizon_eu_partnership  1,912    3.1%
eic                     1,369    2.2%
chips_ju / eit / ipcei / innovation_fund   remainder
```

Our top five is close to the inverse of that. The reason is mechanical, not
deliberate: EU programmes carry 534 project titles per leaf and national schemes
carry zero, so every text signal favours the EU side, and the slot allocation
does nothing to correct it.

**So the product systematically shows the 22% and under-shows the 78%.**

## The change

Allocate the five slots using a prior over channels estimated from the corpus —
P(channel | country, sector) — instead of letting text richness decide.

This is a learned prior, not a rule: it names no fund, no channel and no
country, it is re-estimated whenever the corpus changes, and a country whose
funding genuinely comes from EU programmes will get EU rows because that is what
its data says.

Concretely:
- Estimate the distribution from distinct funded companies per channel, keyed on
  (country, sector), backing off to (country) then to global when a cell is thin.
  The corpus has 62k company–channel observations in the six markets.
- Turn it into a target composition for the table: expected slots per channel,
  floored so no channel with real share gets zero and capped so none takes more
  than about half the table.
- Fill each channel's slots with the existing leaf ranking, which already works
  (median rank 1–3 when the fund reaches the pool).

Fallback: where the prior is thin, the current ordering stands.

## Why this should reach the target and the others did not

The three fixes so far each removed an obstacle: two hardcoded priority lists, a
dedupe that discarded the right scheme, a row sort blind without text. Each
helped, and none addressed composition — the table's *shape* was still wrong.

If a founder's right answer is a national regime 78% of the time, and national
gets one slot of five, the ceiling is low no matter how good the ranking inside
that slot is. Regime-level is the metric that should move most, because the
target set is 6–8 and the prior points at the right one.

## Risks, and how each is checked

- **Over-correcting toward state aid.** The EU side is currently at 76% regime
  recall and must not fall. `mode=project` is reported separately for exactly
  this; treat a drop there as a failure even if the headline rises.
- **Fitting the prior to the ground truth.** The prior is estimated from the
  corpus, the ground truth is drawn from the corpus, so a cell with few
  observations can be memorised. Back off aggressively on thin cells, and read
  holdout only after the change is finished.
- **Archetypes are not the check here.** They assert the machinery behaves; they
  cannot see composition. `measure_recall` is the check.

## Steps

1. Build the prior as an ETL artifact (committed JSON, like the region and theme
   indexes), so the serverless path reads it and no query runs per request.
2. Apply it to channel ordering and slot counts in `selectInstrumentRows`.
3. Measure on tune, both modes separately. Iterate only against tune.
4. Confirm on holdout once. Then `npm run check`, red team, parity, build, and
   one real brief read end to end.
5. Add the floor from Phase 4 so this cannot silently regress: regime recall
   ≥90% on tune, pool ≥85%.

## Open after this

Per-scheme rules (453 children inheriting one document's rules) remain the only
route from regime-level to scheme-level accuracy. Nothing in this plan
substitutes for it; it raises the ceiling on getting the right *regime* in front
of the founder, which is the unit our data can currently support.
