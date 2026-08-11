# The two-gate strategy: how we find the right fund

Written 2026-08-05. This is the direction that works, with the numbers that
prove it. Supersedes the "no demonstrated route" conclusion in
`screen_one_discrimination_plan.md`, which was wrong -- it had measured four
levers that all shared one assumption, and the assumption was the problem.

## The result

```
                        before    after     target
EXACT scheme in top 5     23%      40%       95%
same REGIME in top 5      77%      92%       95%
profile mode exact        13%      37%
profile mode regime       76%      97%
```

Holdout, n=150. Regime-level is effectively at target. Exact-scheme nearly
doubled.

⚠ **Two corrections to the table above, both from 2026-08-09.**
1. **The 95% target column is not reachable.** wsCC measured the honest maximum
   at **65.9% EXACT@5** under full founder information, **58.3%** plannable
   (`findings/rich_intake_wsCC.md`). ⚠ 58.3% is CEILING@5 and 65.9% is EXACT@5 — different metrics over different populations, so do not subtract them. The like-for-like partner of 58.3 is 65.0% CEIL@5; no EXACT@5-weighted greedy run exists (wsCP, `RESUME_HERE.md`).
   The gap between 40% and 95% must not be read as headroom.
2. **The 40% is not what the product ships.** EXACT@5 on the current corpus and
   key is **25%**. Regime-level remains the OVERRULED recommendation (owner,
   2026-08-03) and is not the target regardless of how near it sits.

## What was wrong for four attempts

Corpus enrichment, the adaptive round, gate-fit ranking and region all measured
flat at ~23%. Each tried to improve **how well a founder's ATTRIBUTES match a
fund's DESCRIPTION**. Siblings under one regime share their body, country,
sector and (until this week) their rules -- so no amount of matching separates
them.

The signal that worked asks a different question entirely.

---

## GATE 1 — screen one: narrow to the right regime

**Mechanism: peer precedence.** `ETL/terms/emit_peer_prior.py` builds, from
627,957 traced (company -> instrument) award pairs across 153,636 companies, a
ranked answer to: *which funds do companies in this country and sector actually
win?* No text, no embedding, no gate.

**Why it is orthogonal to the ranker**, measured on 150 holdout companies with
every test company excluded from the prior:

```
ranker alone               24%
peer precedent alone       27%
both right on same case    10 cases only
UNION                      45%
```

Peer catches 32 cases the ranker misses; the ranker catches 26 that peer
misses. They are nearly independent, which is why combining beats tuning
either. Shipped as **1 ranker slot + peer fill = 40-43%**.

**The cap is the whole trick.** Uncapped popularity scores 16% -- it returns
the biggest funds to everyone. Capping each instrument at 40 contributing
companies turns "which funds are biggest" into "which funds recur for this kind
of company".

```
cap    4     8    12    25    40    60   uncapped
@5    19%   19%   22%   27%   27%   27%    16%
```

**Gate 1 is now effectively solved at regime level (92%).** A founder reliably
gets the right *door*.

---

## GATE 2 — the adaptive round: pick the right sibling behind that door

With gate 1 at 92% regime, gate 2's job is precise and narrow: of the siblings
shown, which is the one?

**Measured on 80 holdout companies:**

```
exact right already            36
right regime, WRONG sibling    39   <- gate 2's entire job
```

**Which fields actually differ between the won fund and the sibling shown
instead** -- i.e. the determinative follow-up questions:

| field | times it differs |
|---|---:|
| consortium | 73 |
| region | 64 (+21 where only the sibling has it) |
| activityCountries | 63 |
| fteBand | 60 |

These four are what a follow-up should ask about. Note what is NOT here:
ticket size, development stage, ownership. Those are shared by siblings.

### The eligibility engine works, and is not wired to ranking

A probe suggested it was inert (0 conclusive failures). That was wrong -- it
checked the clause-level status name. With gates hydrated and a realistic
profile (insolvency, 250+ FTE) declared:

```
blocked        744 instruments
one_blocker    171
open            19
2,611 blockers recorded
```

2,518 evaluable filter gates exist across 857 instruments. The engine
discriminates. **It simply does not reach the row ranking** -- `assessAll` is
called in `synthesize()`, after the table is built, and `shortlist.ts` never
references it.

### Question SELECTION was optimising the wrong thing (fixed)

`openFieldsForShortlist` ranked candidate questions by `reachPct` -- how much of
the shortlist is gated on a field. Reach and discrimination turn out to be
**inversely correlated**:

| field | reach % | distinct-spec ratio |
|---|---:|---:|
| exclusionFlags | 82.8 | 0.11 |
| nonEuControl | 55.1 | 0.18 |
| needBy | 12.6 | 1.00 |
| region | 2.9 | 0.57 |
| turnoverBand | 1.1 | 1.00 |

Every fund wants a founder not in crisis and not under a recovery order, so
asking eliminates nobody. Now ranked on `infoScore = reachPct x distinctness`;
`region` went from 0/25 to 14/25 slots.

---

## What to do next, in order

1. **Wire assessment into ranking.** The engine produces 744 `blocked`
   instruments under a realistic profile and none of it demotes a row. This is
   the single largest untapped lever for gate 2 and needs no new data.
   Demote on `blocked`, never eliminate -- our comparators are uneven and a
   wrong hard-exclusion silently removes a real door.
2. **Ask the four determinative fields.** `consortium`, `region`,
   `activityCountries`, `fteBand` are what separate siblings. `fteBand` is on
   screen one but changes 0/5 rows because it never reaches ranking (same root
   cause as 1).
3. **Then re-measure gate 2 in isolation** with
   `scripts/measure_funnel_recall.ts`, which already separates
   screen-one-only from after-the-round.

## Corpus work worth paying for

Now that peer precedence works, the corpus investment that pays is **more
(company -> instrument) award pairs**, not more scheme text. Every additional
traced award sharpens the prior directly. Specifically:

- countries where the prior has thin cells (the 257 cells are uneven),
- the ~40% of recall-set companies with no `subsector`,
- award records for schemes currently represented by fewer than the cap of 40.

That is a measurable, bounded ask with a known mechanism -- unlike the scheme
text fetch, which was worth doing for the memo but moved ranking by zero.
