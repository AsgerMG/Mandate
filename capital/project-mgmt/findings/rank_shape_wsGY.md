# wsGY — the 46 points are all takeable by ordering in principle, and the answer is nowhere near the page in practice

**FOR THE OWNER, VERBATIM.** Put the fund a company actually won at the top of
its pool and 86.3% of founders would see it in six rows, against 35.7% today —
so nothing below the pool blocks a perfect order, and all 46 points are ours to
take in principle. In practice the answer is not near the page. Over the 454
founders who miss, its median rank is **27 of a 79-row pool** and it must climb
**21 places**; only 16.5% sit at ranks 9–15 where a small gain reaches, and
28.9% sit outside the 40-row menu entirely. On every fact we hold about a fund
— size, proximity, recency, award scale, how much text it carries — the rows we
show are within four percentile points of the fund they won. **Our score is not
biased against the answer; it is indifferent to it**, and re-weighting terms
that are already flat cannot move a median miss twenty-seven percentile points.
The one thing that does move it is the machinery a pure-reordering experiment is
scored without: our boolean tiers and peer precedence are worth **+7.2 points of
EXACT and +8.5 of REGIME on top of the score**, which is why a fitted blend
reads +5.7 alone and null end to end. The next point is more likely to come from
asking the founder something we do not currently ask than from a better use of
what we already hold.

---

```
run                 2026-08-13, isolated worktree wsGY-rankshape
population          897 founder(s) — held out, described, one per company, drawn
                    BEFORE the offerability cut
draw fingerprint    13cb71cf3a1d1847   <- IDENTICAL to `one_funnel/latest.md`
corpus              postgres  instruments=1088
ranker              all 828 request(s) on EMBEDDING
levers              pool=40 writer_cap=8 published_cap=7 shown=6
cost                one Voyage embedding and one gate hydration per founder.
                    ANTHROPIC_API_KEY deleted before import. NO paid model call.
reproduce           OUT=/tmp/wsgy.json npx tsx scripts/_wsgy_rankshape.ts   (~15 min)
                    IN=/tmp/wsgy.json  npx tsx scripts/_wsgy_report.ts      (free, offline)
```

**Read-only on the ordering code.** `rowRelevance`, `orderMemoCandidates`,
`accessiblePool` and `caps.ts` are untouched by this workstream. Nothing here is
a proposal; it is the shape of the problem wsGX and wsGV are pushing on.

**The oracle may not reach the product.** It reads the won fund off the recall
set row — a harness object — and hands production an ordering. Nothing under
`lib/` learns anything and no production path can construct it.
`check_answer_not_reachable.ts` is green.

**Where this reconciles with the instrument of record — and the drift both
instruments are sitting in.** Same draw, same store, same levers. This run's
`shipped` arm reproduces `one_funnel`'s `pool_cut` exactly (643) and lands
within ONE founder on every row below it (`writer_cap` 361 against 362,
`published` 346/347, `top_6` 320/321, `top_5` 296/297).

That one founder is not a defect in either harness, and the control run says so
precisely. `ONLY_ARM=shipped` re-runs this identical harness with nothing else
in the loop, two hours later:

```
  founders whose PRE-ARM pool is identical in both runs        894/897
  ...of which the shipped arm disagrees on ANY recorded value     0
  founders whose pre-arm pool MOVED between the two runs           3
     AQUALANDE     accessible rank 54 -> 55
     BP EUROPA SE                    9 -> 10
     LAYERONE                       19 -> 1
```

The three that moved differ in `rankAccessible`, which is computed **before any
arm runs**, so the arm loop cannot be the cause — and given an identical pool
the shipped baseline is byte-identical on all 894. The baseline every delta in
§4 is taken against is the product's, not a function of the arms beside it.

What moved is the corpus. `one_funnel` itself re-ran at 17:41 and reads
`pool_cut` **642**, not the 643 it read at 16:27. Two other workstreams were
republishing while this ran, and `semanticFundMatch` reads pgvector live. So
**the shipped ordering drifts by about three founders in two hours right now —
0.3 points, an order of magnitude inside the ±3.1 half-width.** Every arm
comparison in §4 is PAIRED WITHIN ONE RUN and is therefore untouched by it; a
figure from this file compared against a figure from a different run's table is
not.

---

## 1. The oracle ceiling — and there are TWO of them

The won fund placed FIRST in the accessible pool, then production's own cuts run
on top of it.

```
  oracle, six rows        774/897   86.3% +/-2.3
  shipped, six rows       320/897   35.7% +/-3.1
  the gap                            50.6 points
  oracle shortfall        0 founders — all 774 land at writer rank 1
```

**The shortfall is zero**, and that is the finding rather than the 86.3%. A row
placed first survives `.slice(0, 40)`, `orderMemoCandidates`, the published cap
and the six-row cut for every one of the 774 founders whose gates it passed.
Nothing between the pool and the page can demote a correctly-ranked answer, so
the ceiling on ordering work is exactly the `gates_pass` row and **86.3% is far
above the 60% below which ordering could not reach the target**.

Two different ceilings, and conflating them is the easy mistake:

| what is reordered | ceiling at six rows | who this is a ceiling for |
|---|---:|---|
| the 40-row MENU only | **71.7%** (643/897) | the model, `agentSelectMemoPool`, any re-ranking of what it is shown |
| the whole accessible POOL | **86.3%** (774/897) | a better SCORE, which runs before the cut |

A proposal has to say which one it is. wsGX's blend and proximity term are
POOL-side and answer to 86.3%; the paid ranker is MENU-side and answers to
71.7%. The 14.6 points between them are the `pool_cut` row and no model can
reach them at any price.

## 2. Where the won fund actually sits when we lose it

Rank in the accessible pool, shipped order. 454 founders pass their gates and do
not reach six rows — that is the whole of the loss below `gates_pass`, and it is
the 46 points plus the 41 founders sitting at ranks 7 and 8.

```
    p25 15    MEDIAN 27    p75 46    p90 86    max 121
    places the answer must CLIMB to reach the six:  p25 9  MEDIAN 21  p75 40

    7-8        41    9.0%  ####
    9-15       75   16.5%  #######
    16-25      92   20.3%  ########
    26-40     115   25.3%  ##########
    41-60      45    9.9%  ####
    61-100     69   15.2%  ######
    101+       17    3.7%  #
```

**It is unimodal with a long right tail. It is not bimodal**, so there is no
near population to harvest separately from a far one. Split at the two steps the
question named:

| | n | median rank | shape |
|---|--:|--:|---|
| lost at `pool_cut` | 131 | **72** | every one at 41+, by definition; p90 103, max 121 |
| lost at `writer_cap` | 282 | **21** | every one at 9–40; p25 15, p75 30 |
| at ranks 7–8 | 41 | 8 | inside the writer's candidates, below the page |

The three quantities a workstream should plan against:

```
  ranks 9-15   75/454  (16.5%)   what a SMALL ordering gain reaches
  ranks <=40  323/454  (71.1%)   what a MODEL can see and re-rank
  ranks 41+   131/454  (28.9%)   outside the menu; needs a better POOL score or
                                 a wider cut, never a re-ranking of the forty
```

**Do not read the 41+ group as unreachable.** It is unreachable by permuting the
40-row list, and fully reachable by a score that orders the pool before the cut
— the oracle proves it, and `depth_wsEI/depth.md` prices the other route
(widening the menu from 40 to the whole pool takes "the answer is on the list"
51.3% → 57.3%).

**And two thirds of a "miss" is not a wrong funder.** Of the 454, **287 (63.2%)
still see a SIBLING of the won fund** in their six and **389 (85.7%) see the
same channel**. The failure at the median is a choice of DOOR inside a regime we
already put on the page, not a founder sent to the wrong place.

*(`rank_below_five_wsCM.md`'s "median rank 22" is not quoted here. It predates
the widening to 40, `README.md` §1 lists its numbers as superseded, and this is
a re-derivation on the current population.)*

## 3. What distinguishes the rows above the answer from the answer — nothing we hold

Every number is the **percentile of a fund within that founder's own accessible
pool**, averaged over founders. That is what separates "the score prefers big
funds" from "big funds are what the pool is made of"; a raw mean cannot. `shown`
is the six rows on the page **excluding the won fund**, so hits and misses are
comparable. `relevance` is the shipped score itself and is the CONTROL.

```
  mean accessible pool                     79.3 rows
  percentile a row needs to be in the six  0.924
```

| feature | MISS shown | MISS won | gap | HIT shown | HIT won | gap |
|---|---:|---:|---:|---:|---:|---:|
| `relevance` *(the score itself)* | 0.672 | 0.653 | **+0.019** | 0.654 | 0.734 | −0.080 |
| `peerKnown` | 0.762 | 0.602 | **+0.160** | 0.749 | 0.817 | −0.068 |
| `awardP50` | 0.554 | 0.507 | +0.047 | 0.520 | 0.385 | +0.134 |
| `companyCount` | 0.547 | 0.511 | +0.035 | 0.548 | 0.674 | −0.126 |
| `totalEur` | 0.532 | 0.500 | +0.032 | 0.490 | 0.643 | −0.153 |
| `eventCount` | 0.543 | 0.516 | +0.026 | 0.542 | 0.669 | −0.128 |
| `usedInField` | 0.544 | 0.531 | +0.013 | 0.559 | 0.627 | −0.068 |
| `proximity` | 0.552 | 0.545 | +0.007 | 0.562 | 0.703 | −0.142 |
| `fitDemoted` | 0.485 | 0.494 | −0.009 | 0.463 | 0.466 | −0.003 |
| `textLen` | 0.475 | 0.490 | −0.015 | 0.502 | 0.449 | +0.053 |
| `lastYear` | 0.520 | 0.536 | −0.016 | 0.530 | 0.607 | −0.078 |

`MISS n=454   HIT n=320`

**Every "our score is biased toward X" hypothesis is dead on this table.** Size
(`totalEur` +0.032, `companyCount` +0.035, `eventCount` +0.026), nearness
(`proximity` +0.007), award scale (+0.047), recency (−0.016) and how much text a
fund carries (−0.015) are all within five percentile points of zero. The rows we
show are not bigger, nearer, more-awarded or wordier than the answer in any way
worth fitting.

Three things follow, and they are what wsGX should read first.

**a. The score is INDIFFERENT, not wrong.** On a miss the shown rows beat the
won fund by **1.9 percentile points** on our own score. The won fund is already
at the 65th percentile of its pool. It needs the **92.4th** to be on the page.
The gap is not "the score put the wrong thing first"; it is "the score has
almost no opinion, and six seats out of seventy-nine demand a very strong one".

**b. Zero ties.** 0 of 774 won funds share a rounded score with any other row in
their pool, so nothing here is unreachable *in principle* for want of
separation. Every miss is reachable by a score that can tell these funds apart.
It is the SIZE of the separation that is missing, which is the same conclusion
`rank_below_five_wsCM.md` reached by a different route and on a different
population.

**c. The only feature that separates is the one we already act on.**
`peerKnown` +0.160 is an order of magnitude above every other column — and it is
not a discovery, it is `applyPeerPrecedence` doing what it was built to do. The
shown rows are peer-known because we PUT peer-known rows there.

## 4. What the constraint stack costs at the cut — it does not cost, it PAYS

`ranking_reopen_wsCS.md` flags its +5.7 as an upper bound because a fitted blend
is scored as a pure re-ordering that pays for no channel cap, no scheme dedupe
and no peer precedence. That caveat has never been a number. Here it is, on the
SHIPPED score, free: five permutations of ONE accessible pool per founder, each
handed to the same downstream, so a delta between adjacent arms is attributable
to exactly one mechanism.

| arm | EXACT@6 | REGIME@6 | CHANNEL@6 |
|---|---:|---:|---:|
| `score_only` — the score alone, both boolean tiers stripped | 28.4% | 60.5% | 73.4% |
| `sorted` — the row comparator's own output | 32.6% | 62.7% | 75.5% |
| `collapsed` — after the display-name collision | 32.4% | 62.2% | 75.1% |
| **`shipped`** — what a founder is served today | **35.7%** | **69.0%** | **82.1%** |
| `oracle` | 86.3% | 87.6% | 89.3% |

```
  score_only -> sorted      the two boolean tiers          +4.1 pts   z=+4.39  p<0.001  (54/17)
  sorted -> collapsed       the display-name collision     -0.1 pts   9 discordant, p=1.000
  collapsed -> shipped      peer precedence + scheme dedupe +3.2 pts   z=+2.04  p=0.049  (116/87)
  score_only -> shipped     THE WHOLE STACK                +7.2 pts   z=+4.19  p<0.001  (153/88)
```

**The sign is the finding.** The stack does not discount a pure-reordering gain,
it is worth **+7.2 points of EXACT@6, +8.5 of REGIME@6 and +8.7 of CHANNEL@6**
on top of the score. So a pure-reordering arm is not scored in an
over-generous frame; it is scored in a frame **7.2 points BELOW the product's
own**, and a gain measured there has to clear that gap before it is a gain at
all.

Run the arithmetic on this population at the depth wsCS quotes: `score_only` at
five rows is **25.2%** and the product is **33.0%**. wsCS's blend is +5.7 over
its baseline as a pure re-ordering. 25.2 + 5.7 = 30.9, which is **below what
ships**. The two frames are not identical — wsCS grades top-5 of
`computeVerdict`'s table on 600 founders and this grades six rows of the memo
path on 897 — so this is the arithmetic of the gap and not a like-for-like
subtraction. It is nonetheless the whole explanation of `ship_blend_wsCV/`,
which put the blend on the publishing path and measured **off 23% / on 24% /
pure 24%** at EXACT@5, holdout n=600.

### Why the two gains are the same points found twice

The blend's largest weights are **proximity** and the **peer prior**
(`ranking_reopen_wsCS.md` §2). `applyPeerPrecedence` gives the score ONE leading
seat and fills the rest in peer-prior order, and wsCS's own §1 says the two are
"largely the same mechanism" — the peer prior alone ties SHIPPED at 22.6 against
23.0. §3 above measures the same thing from the other side: `peerKnown` is the
only feature on which the shown rows separate from the answer.

**So a fitted blend over instrument-side features re-derives, in SCORE form,
what peer precedence already delivers in ORDER form.** That is why it reads +5.7
as a pure re-ordering and null end to end: the stack's +7.2 and the blend's +5.7
are not additive, they overlap.

The one term that is genuinely absent from both is proximity as a CONTINUOUS
signal — `rowRelevance` has no home-country term in any form. §3 measures its
headroom on this population at **+0.007 percentile points** between the shown
rows and the answer, which is the smallest gap in the table but one.

### Which mechanism puts a row above the answer

```
  founders with >=1 row above them on a BOOLEAN TIER alone    40/774  ( 5.2%)     891 rows
  founders with >=1 row above them on PEER/DEDUPE alone      529/774  (68.3%)   7,799 rows
  won funds TIED on the score with another row                 0/774  ( 0.0%)

  peer branch `specific`  396 founders   six rows 38.4%
  peer branch `flat`      378 founders   six rows 44.4%
```

**68.3% of founders have at least one row above their answer that their answer
OUTSCORED**, put there by peer precedence or the scheme dedupe — 7,799 rows in
total. That looks like the defect until §4's arithmetic is read beside it: the
mechanism doing the overriding is worth +3.2 EXACT and +6.8 REGIME. **The score
being overruled is not the failure. The score is worse than the thing overruling
it.**

The display-name collapse moves nothing — 9 discordant pairs over 897 founders,
p=1.000 — reproducing `rank_below_five_wsCM.md` §3's "16 winners in the top five
before it and 16 after" on a different path and a different population.

## 5. What this means for the three workstreams

- **wsGX (fitted blend / proximity term in `rowRelevance`).** The two steps you
  are pushing on are real and their ceiling is 86.3%, so the room exists. But
  §3 says there is nothing on the instrument side left to fit: every feature
  except the peer prior is flat between the shown rows and the answer, and the
  peer prior is already applied as an order. Before spending a run, price the
  arm in the SHIPPED frame — `score_only` is 7.2 points below it, so any arm
  scored as a pure re-ordering must clear 7.2 before it is news. The proximity
  term is the one genuinely absent signal and its measured headroom on this
  population is the second-smallest gap in the table.
- **wsGV (extra facts on each row).** §3 is an argument FOR you and against
  wsGX: the loss is not a mis-weighting of facts we hold, and 63.2% of misses
  already show a sibling of the won fund. The question that remains open is
  whether a fact that separates two DOORS OF ONE REGIME exists — which is a
  content question, not a ranking one.
- **The intake.** The median miss must climb 27 percentile points on a score
  built from a founder's description and sector. If nothing we hold separates
  the shown rows from the answer, the separation has to come from something we
  do not currently ask. `ranker_asks_wsEJ/RESULTS.md` is built and unrun and it
  is now the better-motivated of the two routes.

## 6. What this cannot see

- **The model.** `agentSelectMemoPool` re-orders the 40 before the cuts. Every
  arm here is model-free, so the shipped column is the deterministic order and
  the model's own ceiling is the 71.7% row of §1, not the 86.3%.
- **`watch_only`.** `isWatchOnly` reads the writer's prose and cannot be
  evaluated without a paid memo per founder. It is a two-sided DEMOTION, so
  every row cut here is neither an upper nor a lower bound. Measured on the 35
  real briefs in `brief_records`, 6 of them (17%) demoted at least one row.
- **The intake.** A replayed founder's answers are resolved from their own
  register history. A ceiling measured on these answers bounds THIS harness, not
  the product — `one_funnel/latest.md`'s intake block says field by field which
  carried a value and which were withheld.
- **REGIME@6 is not a funnel row and must never become one.** It credits a
  SIBLING of the won fund, so a founder can be lost at one stage and credited at
  a later one, which breaks the nesting the ladder rests on. It appears here as
  a second, parallel reading of the same six rows, for the one reason it has to:
  an arm judged on the exact fund alone cannot tell a gain from a trade, and
  wsBU's unclipping arm bought +0.7 EXACT@5 for −6 REGIME@5 and −6 CHANNEL@5.

---

## Reproduction

Both scripts are the reproduction path for this finding and are cited from
nowhere else:

- **`scripts/_wsgy_rankshape.ts`** — the measurement. One accessible pool per
  founder, five permutations of it, production's own cuts on every one. Refuses
  `NO_PG`, refuses a non-Postgres store, and calls `requireCleanRanker` before
  anything is written to disk. `ONLY_ARM=shipped` runs the identical harness
  with nothing else in the loop, which is the control that the baseline every
  delta is taken against is not a function of the arms beside it.
- **`scripts/_wsgy_report.ts`** — the report. Offline, no credentials; a
  formatting change never costs the run again.
