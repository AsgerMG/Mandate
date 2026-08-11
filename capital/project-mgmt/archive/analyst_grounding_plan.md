# What a senior analyst needs, and what the corpus still cannot tell them

Written 2026-07-31, after the grounding work of the previous two days.
Every number below is measured against the live corpus (780 instruments), not
estimated. Re-measure with `python3 ETL/terms/audit_grounding.py`.

## The frame

A brief is only as good as the grounding under it, and "grounding" is not one
thing. An analyst reading a fund answers seven questions, each needing its own
evidence, each failing differently when the evidence is missing:

| # | The question | Failure when absent |
|---|---|---|
| 1 | Am I eligible? | The fund can never be ruled out, so it publishes on hope |
| 2 | Does it fund things like mine? | It cannot be ranked; every scheme in a country looks alike |
| 3 | Where must I be? | A Paris company is offered a Normandy scheme |
| 4 | **How much would I get?** | The founder cannot tell a €40k voucher from a €5M grant |
| 5 | **Is it open, and by when?** | Advice arrives after the window shut |
| 6 | How do I actually apply? | A row nobody can act on |
| 7 | **Who like me has won it?** | No way to judge whether this is realistic |

Questions 1–3 were the subject of the last two days and are largely closed.
**Questions 4, 5 and 7 have never been built at all**, and 4 and 7 are almost
entirely derivable from data already in the corpus at zero API cost. That is
the headline of this plan: the most valuable remaining work is the cheapest.

## Measured state

```
1. WHO IT IS FOR        no gate at all                      1  (0.1%)
                        gates but none evaluable            6  (0.8%)     was 173
                        fewer than 3 intake fields        127  (16.3%)
2. WHAT IT FUNDS        no funded-project text            161  (20.6%)    was 611
                        no sector mix                     196  (25.1%)
3. WHERE                region evaluable                   10  instruments
                        outside NUTS entirely              GB  (Brexit)
4. HOW MUCH             typical award recorded              0  (0%)       never built
5. WHEN                 call deadline on events            12% of events, 0% of Horizon
6. HOW TO APPLY         no application route              281  (36.0%)
                        route present but no URL          136 of 153
7. PRECEDENT            named peer recipients recorded      0  (0%)       never built
```

Complete on the original four axes: **281 / 780 (36.0%)**.

## Phase 1 — Award size. Free, derivable, largest single gap (question 4)

**282,837 of 308,469 events (92%) carry `grant_amount_eur`, and not one
instrument records what it typically awards.** The distribution across the
corpus is p10 €16k, p50 €217k, p90 €1.1M — a range wide enough that "you may
be eligible" without a number is close to useless advice.

The machinery already exists and is proven: `populate_funding_instruments.py`
computes `sector_mix` per child, and **507 of 518 split children carry their
own**. Award percentiles are the same shape of computation on the same join.

Do NOT derive it through `funding_instrument_sources` alone. That join keys on
`source`, which cannot express a per-authority child — the same defect that
gave 453 children their parent's boilerplate profile and mis-ranked the Paris
EdTech. Compute per child, from that child's own events.

- Add `award_p25 / award_p50 / award_p75` and `award_n` to
  `funding_instruments`, computed per instrument including children.
- Publish only where `award_n >= 5`. Below that a "typical" award is one or two
  events wearing a statistic's clothing.
- Feed p50 into the `scale` component of `fit.ts`, which currently reasons
  about size from `totalEur` — a number that says how big the *scheme* is, not
  what a company like this one would receive.
- Surface as a real column in the instrument table.

**Verification**: a €40k innovation voucher and a €5M IPCEI tranche must stop
reading as equivalent rows. Spot-check ten instruments against their own award
history by hand.

## Phase 2 — Precedent (question 7)

247 instruments already have five or more distinct named recipient companies
reachable through the source join, and the child-aware path will raise that
substantially. The corpus holds 162,494 companies with sector and country.

The analyst's move here is the one thing a founder cannot do alone: *"three
companies in your sector, your size, your country have taken this route."*

- Per instrument, record the recipients most similar to the founder along the
  axes already held (sector_top, country, size where known).
- Resolve at request time against the founder's own profile rather than baking
  a fixed list, so the peers shown are peers *of this founder*.
- Feed into the `precedent` component of `fit.ts`, currently weighted 0.04 on
  the thinnest evidence of the nine.

**Guard**: recipients are real named companies. Publish only what the public
registers already publish, and never imply a relationship between the founder
and a named recipient.

## Phase 3 — Timing (question 5)

`call_deadline` is present on 12% of events and the coverage is wildly uneven:
30,288 of 88,448 development-bank events carry one, EIC 3,732 of 3,965, and
**Horizon Pillar II exactly zero of 58,977**. Meanwhile `call_id` is present on
100% of events, so the identity of a call is always known and its window
usually is not.

- Derive a per-instrument award *rhythm* from the dates we do hold: annual
  call, rolling, one-off. Rhythm is honest where a deadline is unknown, and it
  is what a founder actually needs to plan around.
- Fix the staleness metric first. It currently compares against
  `MAX(last_year)` across the corpus, which is **2027 on a single instrument**,
  so everything from 2024 back reads as stale: 297 instruments (38%). Against
  2026 the real figure is roughly 189. The metric is exaggerating by ~100
  instruments and no decision should rest on it until fixed.
- Only then consider scraping deadlines for the channels that publish them.

## Phase 4 — Application routes (question 6)

281 instruments (36%) have no route, and of the 153 that do, **only 17 carry a
URL** — the rest are prose describing a process with nowhere to go.

Coverage is not uniform and the shape of the fix differs by channel:

```
eit, ipcei, horizon, eic, edf, chips, eib, innovation_fund   100% covered
national_dev_banks     61 of 201 direct
state_aid_satr         31 of 497 direct (most inherit a parent regime route)
```

- Development banks first: 140 missing, they are the instruments founders
  recognise, and each has a real public application page.
- For state aid, the honest unit is the **scheme**, not the authority. A
  notified scheme has one procedure; harvest at scheme level and let children
  inherit, which is already how the read path resolves routes.
- Where no route exists, say so plainly rather than repeating the parent
  regime's "no centralized portal is specified".

## Phase 5 — Close the residue on questions 1 and 2

- 161 instruments still have no funded-project text and 196 no sector mix;
  189 have neither, and those cannot be ranked against a company at all.
  Most are low-event instruments where the honest answer may be exclusion by
  the data floor rather than enrichment.
- 127 instruments cover fewer than three distinct intake fields. Thin, but
  every one is now evaluable, so this is a precision problem rather than a
  correctness one.
- The United Kingdom sits outside NUTS 2024 entirely. If UK regional schemes
  matter, the ONS International Territorial Levels (ITL) are the post-Brexit
  successor and mirror the NUTS structure.

## Explicitly not in this plan

- **Re-extracting the classified tier with citations.** 1,551 gates are
  `llm_classified`, and they now narrow without disqualifying, which is the
  honest treatment. Upgrading them to cited would let them disqualify, but it
  means going back to source documents for ~130 instruments. Real, expensive,
  and worth doing only once the questions above are answered.
- **Anything that widens the corpus.** Every gap above is depth on instruments
  we already hold. Adding countries or channels before this is finished makes
  the same thin brief in more languages.

## Principles this plan is written against

1. **Measure before building.** Three claims in the previous plan were wrong
   when checked: "77 lossy region gates" (really 10), "0 of 780 complete"
   (a broken join, really 263), "state aid is the weak channel" (it is the
   strongest; development banks are the hole).
2. **Never derive an instrument's evidence through the `source` join alone.**
   It cannot express a per-authority child, and has now caused three separate
   defects.
3. **A rule must be a test, not a list**, and a generalisation must survive the
   recipients audit. It overruled the tobacco exclusion on 7 instruments after
   finding 516 tobacco-sector awards; that mechanism is load-bearing.
4. **Uncited evidence narrows, it never condemns.**
5. **A reconcile step invoked by hand stops being invoked.** Pruning and
   regeneration belong in the normal run, with a build check behind them.


---

## Addendum, 2026-08-01: what the award median actually changed

Phase 1 replaced `typicalAward()`'s mean with a measured median, on the grounds
that the mean overstated by 3x or more on 11% of instruments and by up to 450x.
That was argued from the distribution, not from the product's behaviour.

It has now been measured on the product. Running the 12 archetypes twice — once
with the medians present, once with `awardP50` nulled so `typicalAward()` falls
back to the mean, which is exactly what production was doing until the Postgres
column gap was fixed:

**10 of 12 archetypes rank differently. 15 published rows change.**

    MedTech          median -> clean_aviation      mean showed eurohpc
    Life sciences    median -> clean_aviation      mean showed eurohpc
    Cloud/NeoCloud   median -> Business Finland SA.61856   mean showed SA.112229
    AgriTech         two of six Italian rows swap

So the statistic is not a refinement at the margin: it decides which funds a
founder is shown in most cases. Two consequences worth holding on to.

**Every ranking result reported before 2026-08-01 was measured on the offline
JSON path**, which always had the medians. The production path did not, so the
two had been diverging silently since the medians were introduced. The parity
check is what surfaced it, and it is the only test that can.

**A derived column is not shipped until it is in both stores.** The gap was not
a missing computation but a hand-written INSERT column list in
migrate_to_postgres.py that stopped at `scheme_operators`. That list is now read
from the SQLite table.
