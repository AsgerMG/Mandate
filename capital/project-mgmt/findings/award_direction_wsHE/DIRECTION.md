# wsHE §2 — is it backwards, or is the answer key odd?

This is the fork the brief said decides everything, and it is decided by one
quantity: the SIGN of `log10(awardP50 / bandMid)`.

Reproduce with `IN=/tmp/wsha_doors.json npx tsx scripts/_wshe_award.ts` — free,
Postgres reads only, ~20 seconds, on wsHA's own draw `13cb71cf3a1d1847`.

## The measurement

287 sibling-miss pairs; 286 carry a usable award median on both doors.

```
d = log10(awardP50 / bandMid).  Negative = the door pays LESS than the ask.

d(WON)    mean -0.78  p10 -1.39  p25 -1.13  MEDIAN -0.81  p75 -0.47  p90 0.03
d(SHOWN)  mean -0.55  p10 -0.99  p25 -0.85  MEDIAN -0.63  p75 -0.24  p90 0.05

WON door pays BELOW the ask                      255  89.2%
SHOWN door pays BELOW the ask                    245  85.7%
WON door is the SMALLER of the two               195  68.2%

|d| smaller for WON (the ask points at it)        87  30.4%
|d| smaller for SHOWN (the ask points away)      199  69.6%

on the LOWER QUARTILE instead (awardP25 vs the same ask), n=286
  closer for WON                                  99  34.6%
  closer for SHOWN                               187  65.4%
```

## The verdict: BOTH readings are true, and neither is the fix

**Reading (B) is confirmed.** The founder wins a smaller, earlier cheque than
the number they state. The won door's median sits 0.81 decades below the band
midpoint — a factor of about 6.5 — and 89.2% of won doors are below it. This is
not noise around a match; it is a one-sided offset the width of most of an order
of magnitude.

**Reading (A) is also true, and it is the same fact.** The offset is structural,
not sampling error: a founder's band is a RAISE and `awardP50` is what one
scheme pays into a project. A GBER Article 25 grant at 50% intensity on a EUR 1M
project is a EUR 500k cheque against a EUR 1M-2.5M ask. The two quantities are
not the same quantity, which is exactly the category error (A) names — and (B)
is what that error looks like when you measure it.

## What actually goes wrong, in one sentence

**A symmetric proximity rule whose target sits above almost every candidate is
not a proximity rule; it is "prefer the larger payer."**

If the target `T` is above both doors, the door nearer `T` is the LARGER one.
The won door is the smaller one 68.2% of the time. So the term picks the shown
door 69.6% of the time, and wsHA's 33.1% / 5.6% is that same fact seen through
the scorer's own dead zone (both doors within one decade of `T` tie at 1.35, so
the term only speaks on the 38.7% of pairs where at least one is further out).

## Why the lower-quartile arm is dead, and did not need a run

Reading `awardP25` off both doors instead of `awardP50` moves BOTH of them
further below a target that was already above both. It cannot change which is
nearer, and it does not: 34.6% against 65.4%, barely distinguishable from the
65.4/30.4 it replaced. **The target is wrong, not the statistic.** Answered for
free; no end-to-end run spent on it.

## Independent corroboration, on a different split by a different method

`poolBlend.ts` carries a conditional logit fitted by wsCU on the tune split and
reported on holdout. Its weight on `award median` is **−0.657** — the second
largest magnitude in the vector, and NEGATIVE. Smaller is better. That fit knew
nothing about sibling pairs and used a different estimator; it lands on the same
sign as everything above.

Note also that the same fitted vector carries `award scale fit` at **+0.403** —
proximity to the ask, positive. Two columns of one model disagreeing about the
same fund's median is exactly what you would expect when a symmetric proximity
term is standing in for a monotone one.

## The wsGX check, run rather than assumed

`A_POPULATION_PRIOR_IS_NOT_A_ROW_SIGNAL` says a term taking two values inside a
pool already screened on that bit cannot add information. `awardScorer`'s input
is continuous, but its output is `AWARD_MATCH / (1 + max(0, decades − 1))` — a
FLAT 1.35 for every fund within a decade of the ask. Measured over each
founder's country-reachable leaf population:

```
DISTINCT values per pool   min 12  p25 21  MEDIAN 37  p75 37  max 102
share at the 1.35 CEILING            MEDIAN 0.54
share at NEUTRAL 1.0                 MEDIAN 0.06
```

37 distinct values is not two, so this is not a re-run of a dead arm. But over
half the pool is tied at the ceiling, which caps how much any re-weighting of
this term can do at the pool level — and is consistent with wsGY measuring it at
+0.047 across the whole pool.

## And the distinction the brief insisted on

wsGY: the score is INDIFFERENT across the pool, `awardP50` at +0.047. This
finding is about the SIBLING CELL, where the same term runs 33.1 against 5.6.
The two are compatible, and §3 of the diagnostic shows why:

```
the won door's award-median percentile in its own reachable pool
  p10 0.10  p25 0.22  MEDIAN 0.36  p75 0.58  p90 0.74
```

At pool level the won fund is a mildly-smaller-than-median payer (0.36 against
0.50) — a weak, diffuse signal, which is what a whole-population weight sees.
Inside the sibling cell, where every other fact is held constant by
construction, the same tendency is 68.2%. **The signal is concentrated where the
pool score is blind.** That is the case for trying an arm; it is not a promise
that the arm reaches the number, because reaching it requires the sibling cell
to be reachable from the row sort at all — which is what §3 of this finding
measures end to end.
