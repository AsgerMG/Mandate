# Bucket 3 is not bucket 4. It is also not a near miss, and the score is not what decides the page.

**Workstream CM · 2026-08-09 · isolated worktree off `main` at `7190de32`.**

Reproduce (FREE — one Voyage embed and one Postgres read per pair, no model
calls). Run them ONE AT A TIME and check the tally line: a loaded machine
averages the embedding and lexical rankers and prints one number.

```
cd website/frontend
SPLIT=tune N=250 OUT=/tmp/a.json npx tsx scripts/_wscm_stages.ts   # the stack, per pair
SPLIT=tune N=40                  npx tsx scripts/_wscm_tiers.ts    # what resolves each pair of rows

PEER_FILL=alternate SPLIT=tune N=250 npx tsx scripts/_wscm_stages.ts
PEER_FILL=all       SPLIT=tune N=250 npx tsx scripts/_wscm_stages.ts
```

Every figure below is tune, N=250, seed 20260806, `ranker: all 247 request(s)
on EMBEDDING`, EXACT@5 **26.8%** — wsCI's draw reproduced pair for pair.

---

## 1. Where it actually sits: scattered, not just off the page

The 73 winnable in-pool misses, by the won leaf's rank in the candidate order:

```
min 6    p25 12    MEDIAN 22    p75 32    p90 76    max 135
rank <= 6:  3 (4%)      <= 10: 14 (19%)      <= 20: 33 (45%)
```

**Three of seventy-three sit at rank six.** The near-miss population that would
justify a nudge does not exist; the median miss is sixteen rows below the page.
The one worked example in the wsCI autopsy (rank 15 of 29) is, at p50 of 22,
slightly better than typical.

Headroom of ANY rule that only permutes or truncates the current order:

| top K | EXACT@K |
|--:|--:|
| 5 (published) | 26.8% |
| 6 | 29.6% |
| 8 | 34.0% |
| 10 | 36.4% |
| 20 | 54.4% |
| 50 | 78.4% |
| in the pool at all | 96.4% |

**Worth stating on its own: `DISPLAY_CAP` is 6 and `BRIEF_INSTITUTION_CAP` is
5.** The instant verdict already carries a sixth row, and the won leaf is in it
2.8 points more often than the memo names it. That is a product decision about
what a page promises, not a ranking change, and it is the cheapest 2.8 points
on this list — but it buys them by publishing six funds, not by choosing five
better ones.

## 2. What is above it: other programmes, not siblings

Across the same 73 misses, the five published rows hold

```
a SIBLING of the won leaf among the five      22/73   30%
mean siblings among the five                  0.75 of 5
mean DISTINCT regimes among the five          3.42 of 5
all five from one regime                      6/73
```

**So bucket 3 is not bucket 4 wearing a disguise.** The page is not filled with
the winner's own siblings; it is filled with three or four unrelated
programmes, drawn from 66 distinct regimes over the 73 misses. Splitting the
bucket the way it matters:

| | n | median rank | |
|---|--:|--:|---|
| lost to its OWN siblings (regime rank > 1) | 32 | 31 | a within-regime rule could reach these |
| lost to OTHER programmes (regime rank 1) | 41 | 14 | only a better cross-regime score reaches these |

and **40 of those 41 have a residual class of 1** — the six intake fields
separate them outright. They are not ceiling cases in any sense. They are the
top-ranked door of their own scheme, and the scheme is at rank 14.

## 3. What actually decides the final five, read off the code

wsBP's "the SCORE ranks, code cuts, the writer writes" is half right, and the
half that is wrong is the half this bucket lives in. `materialiseInstrumentTable`
orders rows in five steps and only the third is the score:

```
1  usedInField        BOOLEAN, channel-level.  above the score
2  fitDemoted         BOOLEAN, channel-level.  above the score
3  rowRelevance       the score
4  INSTRUMENT_PRIORITY, then instrument id     tie-breaks
5  the name collapse, then applyPeerPrecedence
```

Measured, over 40 tables and 3,770 adjacent row pairs, by what resolved each:

| step | pairs resolved | share |
|---|--:|--:|
| tier 1 `usedInField` | 0 | **0.00%** |
| tier 2 `fitDemoted` | 38 | 1.01% |
| tier 3 the SCORE | 3,732 | 98.99% |
| a tie, fell to channel/id | 0 | 0.00% |

### 3a. The first tier is off, and cannot be switched on without leaking

`usedInField` is true on **0 of 3,810 rows**. It reads `fieldChannels`, which
`computeVerdict` builds from the founder's own record and their DB-native
peers — and every harness in this repo replays the company as `"TestCo"`, so
`matchCompany` never matches, `targetSub` is empty, `dbPeers` is empty and
`fieldChannels` is the empty set.

That is CORRECT and must stay: the founder's own record carries the channel
they actually won from, so passing the real name would hand the answer to the
ranker. But the consequence has never been written down:

> **The top tier of the row comparator has never been exercised by any recall
> number this project has published, including the 25% north star, and cannot
> be without leaking.** The comment at the sort attributes `EXACT@5 51% -> 49%`
> to "these two tiers"; only the second was ever measurable, and it resolves
> 1.01% of pairs.

For a founder in the record, or with peers in it, a channel-level boolean sits
above the entire score. Nothing here says whether that is good. It says the
harness and production are ranking on different systems in a way no figure
discloses, which is the same class of defect as wsCI §6.

### 3b. For 81% of founders, the score chooses ONE of the five rows

`applyPeerPrecedence` runs last. Its flat branch keeps the score's single top
row and fills every seat behind it in PEER PRIOR order, peer-known rows ahead
of peer-unknown ones regardless of score.

```
flat      203/250 replays (81%)   EXACT@5 28.1%   score keeps 1 seat of 5
specific   47/250 replays (19%)   EXACT@5 21.3%   score keeps 3 seats of 5
```

and its footprint on the page:

```
the won leaf sits below >=1 row it OUTSCORED           190/250 orders, median 7 such rows
the won leaf crossed the five-row line at this step     59/250   (43 in, 16 out; net +27)
```

**Peer precedence, not the score, is what puts four of the five rows on the
page** — and it is strongly positive, earning 43 hits for 16 losses. The name
collapse, by contrast, moves nothing at all: 16 winners in the top five before
it and 16 after.

Every miss, attributed to the step that cost it its seat:

| cause | misses | share |
|---|--:|--:|
| outscored, genuinely | 158 | 86.3% |
| moved out by peer precedence | 16 | 8.7% |
| never on the table (SEL-CAPITAL, channel absent) | 9 | 4.9% |
| the name collapse | 0 | 0.0% |

## 4. Bucket 3 is NOT bucket 4 — and the distinction buys less than it sounds

The tie test, at the precision the comparator actually compares at:

```
won leaves the ranker gives a score it SHARES with other rows   0 of 73   (0%)
won leaves the ranker gives a score of their OWN               73 of 73
```

**Zero ties.** There is no hidden ceiling inside bucket 3; a reordering can
reach every one of these 73 cases in principle. The 15-point gap is not
smaller than believed on this axis.

What it costs to reach them is the sting:

```
how far below the fifth row's score the won leaf sits, as a fraction of it
   p25 1.4%      MEDIAN 24.4%
   within 5% of the fifth row:   22 of 73
   within 20%:                   34 of 73
```

So roughly a third of bucket 3 is a genuine near miss on score, and the rest
needs a quarter-better score than the row holding the last seat. wsBU measured
every available signal alone against exactly this and found nothing outside its
half-width. The honest summary is not "bucket 3 is really bucket 4"; it is
**bucket 3 is real, reachable and unclaimed, because the size of the score
improvement it needs is larger than any signal we have.**

## 5. The seat split, measured three ways, and closed

Shipped gives the score 1 seat of 5 and the peer prior 4, for two signals the
peer-precedence block itself measures as equal alone (24 / 27, union 45) and
wsBU re-measured as equal on the Doors key (21.2 ±3.3 each). That looked like
the one unexamined constant in the stack. It is not a lever.

Behind `PEER_FILL`, **default `head`, which is today's behaviour bit for bit**:

| arm | score seats | EXACT@5 | delta | paired flips | discordant |
|---|--:|--:|--:|---|--:|
| `head` (shipped) | 1 of 5 | **26.8%** | — | — | — |
| `alternate` | 3 of 5 | 24.8% | **−2.0** | +11 / −16 | 27 |
| `all` | 0 of 5 | 27.6% | +0.8 | +3 / −1 | 4 |

Concentration, beside every figure as the standing rule requires: `alternate`'s
gains spread over 9 regimes and its losses over 11, so the negative is a real
population effect and not one programme. `all`'s entire effect is 4 discordant
pairs — gains in 3 regimes, the loss in 1 — which is two net cases and no
result whatever.

**The gradient is monotone in the peer prior's favour and flat at the top.**
Taking seats FROM the peer prior costs two points; giving it the last one buys
nothing measurable. The shipped split is right, and this axis is now closed with
a number rather than by assumption.

**Nothing is shipped.** `PEER_FILL` stays `head`. There is no change here worth
a founder seeing.

## 6. What this means

- **Do not re-propose**, now measured rather than argued: rebalancing the seat
  split between the ranker and the peer prior (§5), and any treatment of bucket
  3 as a near-miss population that a nudge or a cap could collect (§1).
- **The one honest ranking finding is that the ranking is barely the deciding
  step.** For four founders in five the score chooses one row and the peer
  prior chooses four, and it should: that arrangement earns 43 hits for 16
  losses. Further work on "the ranker" is work on one seat of five.
- **The measurement gap in §3a is the thing to record and not to fix.** A
  channel-level boolean above the whole score is live for founders in the
  record and dark for every number we quote. It cannot be measured without
  leaking, so the correct response is that every EXACT@5 in this repo carries
  an unstated "with the proven-in-field tier off".
- **§1's sixth row is the only unclaimed 2.8 points on this axis**, and it is a
  promise change: the screen already shows six and the memo names five.

---

## What was changed

- `website/frontend/lib/intelligence/tableTrace.ts` — new. Records the
  candidate order at each stage of the row stack plus the three quantities the
  comparator consults. Off unless a diagnostic calls `traceOn()`: no env var
  and no request field, so no deploy or founder can enable it, and every writer
  is a no-op while off.
- `website/frontend/lib/intelligence/shortlist.ts` — `PEER_FILL`, default
  `head`, so nothing a founder sees changes; `fitDemoted` hoisted out of the
  sort comparator so the recorder reads THE sort key rather than a copy of it;
  `applyPeerPrecedence` exported for the test below.
- `website/frontend/lib/intelligence/peerFill.test.ts` — the winner-not-blocked
  check, arm-agnostic so a fourth arm still has to pass it.
- `website/frontend/scripts/_wscm_stages.ts` — the stage attribution behind §3
  and §4.
- `website/frontend/scripts/_wscm_tiers.ts` — the adjacent-pair read behind §3a.

`npx tsc --noEmit` clean. `check_comparator_admits.ts` PASS.
`check_recall_floor.ts` **ok**, all floors met, `ranker: all 297 request(s) on
EMBEDDING`, recorded beside this file as `rank_below_five_wsCM_floor.txt`. No
floor added, removed, raised or lowered. 315 unit tests pass.

**Guards proved to fail rather than assumed green**, each by running it:

- `PEER_FILL=nonsense` THROWS rather than falling back to `head`. An arm that
  silently reverts is indistinguishable from a flag that never arrived, which
  is the shape of every false null in this project's history.
- All three arms verified to REACH the module
  (`PEER_FILL=all npx tsx -e 'import {PEER_FILL} ...'` → `all`) before any arm
  was believed.
- `peerFill.test.ts` constructs the `.filter()` the demotion fix replaced and
  asserts that BOTH the permutation invariant and the winner-not-blocked check
  fail against it — the guard is shown able to fire, not left green. It is run
  under all three arms.
- `_wscm_stages.ts` throws if a verdict produced anything other than exactly
  one table, since the stage ranks would otherwise describe a different
  founder's page.
- The 0.00% in §3a was not accepted from `_wscm_stages.ts`, which reported it
  as `0/250` around the won leaf only. `_wscm_tiers.ts` re-derives it over
  every adjacent pair in the whole table and prints the booleans' distribution,
  because zero across 250 tables is the shape of a diagnostic that is not
  looking.
