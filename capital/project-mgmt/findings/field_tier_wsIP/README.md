# wsIP — the tier is not the signal, and only one of them is worthless

**Free. EUR 0.00, zero model calls, zero production writes, no Railway, no
`data/db.sqlite`.** Every number is production's own `buildInstrumentTable` run
over committed files, credentials DESTROYED rather than trusted absent, and
**not** `NO_PG=1`.

```
FIELD_TIER=off npx tsx scripts/_wsip_fieldtier.ts
FIELD_TIER=on FIELD_SET=constant:3 npx tsx scripts/_wsip_fieldtier.ts
npx tsx scripts/check_field_tier_priced.ts
```

---

## 0. THE ANSWER

**Keep the tier.** It does not cost two points of EXACT@5; it is worth **+0.0246
of mean reciprocal rank, 95% CI [+0.0166, +0.0334]**, and it **doubles the
founders whose won fund is the first row they read, 28 → 54**. Every middle arm
is worse. Removing it is the single largest regression measured on this product
this week, and EXACT@6 cannot see it — which is the whole reason wsII built the
recip instrument.

**And wsIN is still right.** The *signal* feeding the tier is indistinguishable
from a founder-blind constant, at the six rows as well as at the mediator. Those
two facts are compatible because **the tier and the signal are different
objects**, and the brief — mine and wsIN's — treated them as one.

---

## 1. FIVE CORRECTIONS, AND THE FIRST TWO INVERT THE BRIEF'S PREMISE

**1. The price in the comment was never this tier's price.** The brief says
"`shortlist.ts:3305` already records the tier's price in its own comment." It
records a **joint** price for **two** tiers — `usedInField` *and* the
startup-ready demotion — and then the arithmetic that matters: the run that
produced it (`32cd36c5`) replayed every company as **`TestCo`**, and
`matchCompany("TestCo", …)` matches nothing in any country. So `fieldChannels`
was **empty** and `usedInField` was **false on every row of every replay**.

**THE KEY NEVER FIRED IN THE RUN THAT PRICED IT.** The whole three-point delta
belongs to the tier below it. This is not my inference —
`project-mgmt/research/pool_to_table.md:168` says it outright: *"The tier cannot
cost or gain anything on this harness, and re-measuring it here would be
measuring nothing. Its production cost is real and remains unmeasured."* That
same note re-measured the **other** tier alone at EXACT@5 35% → **34%** — a point
in its favour, not three against — and concluded *"the note in `shortlist.ts`
saying they cost three points is stale."* **It was stale, in the file, for
sixteen days, and two workstreams reasoned from it anyway.** This is the repo's
named dominant failure mode: a comment that is no longer true.

**2. So we were not paying. We were being paid.** Nobody had ever measured this
tier. The first measurement says it is one of the more valuable things in the
row sort.

**3. The diversity hypothesis is backwards, and the funder half of it is
structurally impossible.** The brief supposed the tier might buy channel or
regime diversity, or stop a table filling with one funder. It buys neither:

* **Distinct funders per table is 6.000 of 6 in EVERY arm, and tables dominated
  by one body is 0/897 in EVERY arm.** That is not the tier's doing and cannot
  be: the name-collapse below the sort keeps one row per institution *name*, so
  a six-row table has six funders whatever the comparator does. The concern the
  judgement was probably made on was already guaranteed elsewhere.
* Regimes and channels move the **wrong way**: turning the tier **off** takes
  distinct regimes 3.713 → **3.964** and distinct channels 2.734 → **3.135**.
  **The tier costs diversity and buys rank.** The trade is real and it is the
  opposite of the one the brief expected to find.

**4. `FIELD_SET=empty` is NOT `FIELD_TIER=off`, and I wrote a docstring saying
it must be before the run corrected me.** They differ (recip 0.127142 vs
0.126378; 863 vs 864 in-table) because `fieldChannels` reaches the founder by
**two** routes, not one: the sort tier *and* pool composition — a set of size
*s* leaves `7 − s` of `MIN_CHANNELS_CONSIDERED` to the backfill, so it displaces
what the backfill would have chosen. "Remove the tier" and "empty the signal"
are different interventions and the report keeps them apart throughout.

**5. `npm run shadow` does not exist — confirmed, and neither does `--only`.**
`trace` and `stages` are real (`trace_pool.ts`, `measure_funnel.ts`). I used
neither: both need what this budget forbids. I did not run `npm run check` at
all, for the reason wsIO paid for.

---

## 2. THE MEASUREMENT — 897 FOUNDERS, BOTH INSTRUMENTS, DIVERSITY FIRST-CLASS

Control is the shipped path and it reproduces wsIO's independent run to the
sixth decimal (`meanRecip 0.149057`). Peer-derived `fieldChannels`, own award
history withheld — the leak-free shape, and what production does for any founder
not in the corpus, which is most startups.

```
arm                      EXACT@6        REGIME@6   meanRecip      regimes  channels  funders
on  (SHIPPED)            227/897 25.3%    68.6%    0.149057        3.713    2.734     6.000
off                      223     24.9%    68.3%    0.126378        3.964    3.135     6.000
tiebreak                 223     24.9%    68.3%    0.126382        3.964    3.135     6.000
selective                222     24.7%    68.3%    0.141494        3.926    3.094     6.000
weight 0.05              224     25.0%    68.3%    0.130098        3.919    3.079     6.000
weight 0.10              224     25.0%    68.3%    0.130667        3.904    3.054     6.000
weight 0.25              223     24.9%    68.3%    0.133647        3.853    2.959     6.000
weight 0.60              225     25.1%    68.5%    0.140534        3.768    2.816     6.000
weight 1.00              228     25.4%    68.7%    0.147003        3.725    2.757     6.000
```

Paired, bootstrapped 4,000×, per founder:

```
on vs off          dRecip +0.02464  95%CI [+0.01663,+0.03337]   183 better,  16 worse
on vs tiebreak     dRecip +0.02463  95%CI [+0.01662,+0.03338]   183 better,  16 worse
on vs selective    dRecip +0.00900  95%CI [+0.00427,+0.01416]   156 better,  11 worse
on vs weight 0.25  dRecip +0.01712  95%CI [+0.01045,+0.02451]   141 better,   7 worse
```

**Where the value is, and why EXACT@6 is blind to it.** The rank histogram:

```
              rank1  rank2  rank3  rank4  rank5  rank6   absent
on  (SHIPPED)   54     17     19     67     29     33      32
off             28     17     17     84     32     36      32
```

The tier moves founders from rank 4 to rank 1. **EXACT@6 scores those two the
same** — both are "in the six" — so the business metric records +4 founders
(±2.85pts of half-width: unreadable) while the founder's actual experience
changes from *fourth thing on the page* to *first*. wsII's instrument reads it at
**fifteen times its own CI width.** A change reported only on EXACT@6 here would
have been reported as nothing.

---

## 3. THE MIDDLE ARMS, INCLUDING THE ONE THAT IS MECHANICALLY DEAD

**`tiebreak` is not a weaker tier, it is no tier.** Demoted below `rowRelevance`
it reproduces `off` to four decimals (0.126382 vs 0.126378). The reason is
mechanical and worth keeping so nobody proposes it again: `rowRelevance` is a
continuous within-pool percentile compared at 1e-6, so **it essentially never
ties**, and a key that only speaks on ties never speaks. Any "demote it to a
tie-break" proposal against a continuous score is this result.

**`weight` only works by becoming the tier.** The sweep is monotone and
asymptotic: 0.05 → 0.1301, 0.25 → 0.1336, 0.60 → 0.1405, **1.00 → 0.1470 ≈ the
hard tier's 0.1491**. Since the score it is added to lives in [0,1], a bonus of 1
*is* a lexicographic key. So the honest reading of the weight arm is not "a
softer version is available" but "the softer it is, the less of the effect
survives, and the coefficient that recovers the effect is the one that
reconstructs the hard key." It also confirms the arm is wired correctly.

**`selective` — the hard tier only where the flag is not near-constant across
the candidate rows (share in (0, 0.5]) — recovers 65% and is still a loss**
(0.1415 vs 0.1491, dRecip −0.0090, CI excluding zero). Worth reporting because
it is the arm the brief most expected to win, and because it rules out "fire it
only where the signal is non-degenerate" as a free improvement: the tier is
earning on the broad tables too.

**Skipped, with reasons.** *Removing the flag rather than the tier* — out of
scope and destructive: `usedInField` also renders `[used by peers in your field]`
to the writer (`pipeline.ts:603`) and selects the signals-digest slices
(`pipeline.ts:789`). *Per-channel weights* — that is the channel prior, which the
comment at `rowRelevance` records as already measured and rejected, and §4 shows
this tier is a cruder version of it that works.

---

## 4. THE DECISIVE ARM: THE TIER IS WORTH IT, THE SIGNAL IS NOT

wsIN's constant is the arm that matters, and the six-row outcome had never been
measured — wsIN said so and declined to estimate it. It can be measured for
free, because `fieldChannels` is an **input** to `buildInstrumentTable`: feed it
the *k* commonest won channels, identical for every founder, reading nothing
whatsoever about the company.

```
FIELD_SET (tier on)   EXACT@6      meanRecip    regimes  channels
peers  (SHIPPED)      227  25.3%    0.149057     3.713    2.734
constant:3            237  26.4%    0.146195     3.402    2.284
constant:4            219  24.4%    0.129552     3.602    2.717
constant:5            219  24.4%    0.127140     3.671    2.784
empty                 226  25.2%    0.127142     3.942    3.110

peers vs constant:3   dRecip +0.00198  95%CI [-0.00733,+0.01122]   EXACT@6 -11
```

**The confidence interval includes zero and EXACT@6 favours the constant.**
wsIN's mediator result transfers intact: as a claim about *which channel this
founder's money comes from*, the peer draw carries no information a
three-element constant does not.

And now the decomposition that separates the two objects. Hold the pool fixed
and switch the tier off under **both** inputs:

```
                        tier on    tier off    dRecip (paired, bootstrapped)
peers                   0.149057   0.126378    +0.02464  [+0.01663,+0.03337]
constant:3              0.146195   0.125423    +0.02362  [+0.01574,+0.03183]
```

**The tier is worth +0.024 no matter what feeds it. The thing feeding it is
worth zero.** That is the finding, and it dissolves the apparent contradiction
in the brief: the tier's value is not "we identified the founder's field" — a
constant proves it is not — it is **concentration**. Promoting a small block of
channels above the score puts the commonest funders first, and 52.5% of these
founders won a national-development-bank fund. The tier is a channel prior
applied at the row sort, arriving by a side door, doing the job the explicit
channel prior was measured at and rejected for (`rowRelevance`'s own comment).

**Do NOT switch the input to the constant, despite the +10 EXACT@6.** Three
reasons, in order of weight. It is **zero on recip with a CI spanning zero**, so
the +10 is one metric's noise against the other's silence. It is derived from
the same 897 it is scored on. And decisively: `usedInField` is **rendered** —
`[used by peers in your field]` reaches the writer — so a constant would make the
product assert to a founder something it had not checked and knew to be
generic. That is the `POOL_BLEND` shape and worse, because the lie is on the
page rather than in an artifact.

---

## 5. THE PROPERTY, AND ITS TEST FOR UNSEEN CASES

> **A ranking key may only be priced on a population where it FIRES, and it
> fires only where it SEPARATES — where the candidate rows do not all carry the
> same value for it. A key with one value across every row it sees is inert by
> arithmetic, and any number recorded beside it was produced by something else.**

No channel name, no company name, no fund id, no list — `check_contracts` fails
the build on that shape. It is a statement about the **distribution of a key over
the rows it sees**, so it asks the identical question of any tier anyone adds
tomorrow.

**The test is `scripts/check_field_tier_priced.ts`, wired into `ci.yml`**
(not `run_checks.mjs`: `check_guard_reachability` says in its own output that
`npm run check` does not count, and `--only` does not honour itself). It builds
tables through **the request path's own calls**, never a second copy of them —
because a guard reading a reimplementation of the thing it guards is precisely
how `TestCo` survived — and fails when the tier separates nothing for more than
the recorded share of founders, in **either** direction:

* **worse** → the tier has gone inert, so delete the number beside it or restore
  what feeds it, but do not leave a measurement standing against a dead key.
* **better** → bank it here, this commit. It did exactly that to me: measured
  47.5% against the 48.5% I first wrote and refused the build until 47.5% was
  committed.

**Had this check existed in July it would have failed on the run that wrote the
comment**, where the inert share was 100%.

---

## 6. WHAT WAS NOT DONE, DELIBERATELY

* **Nothing a founder receives changed.** `FIELD_TIER` defaults to `on`, and the
  proof is not my assertion: wsIO's `_wsio_prior.ts`, which I neither wrote nor
  touched, returns `in-table 864/897, EXACT@6 25.3%, meanRecip 0.1491` against
  this tree — identical to the same harness against HEAD.
* **No floor, tolerance or ceiling moved**, except the one this workstream
  created, which came *down* before its first green run.
* **No paid call, no production write, no Railway, no `data/db.sqlite`, no
  `NO_PG=1`.** `DATABASE_URL` and `VOYAGE_KEY` are deleted by both new scripts.
* **The stale comment was corrected in place rather than deleted**, because the
  next reader needs to know the number was wrong and why, not merely that it is
  gone.
