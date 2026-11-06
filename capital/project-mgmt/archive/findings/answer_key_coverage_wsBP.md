# The answer key can name 499 of the 782 funds the product offers — and is held

> **STATUS: BUILT, MEASURED, NOT ACTIVE.** `__recallSetDoors.json` is committed
> and `ACTIVE_RECALL_SET` still points at `__recallSetComposed.json`, on a
> coordinator hold pending workstream BQ's corpus republish. Section 8 is the
> measurement that says the stated blocker binds 22 of the 255 leaves and not
> the other 233, and it is the section to read before deciding.


**Workstream BP · 2026-08-09 · isolated worktree off `main` at `3c8284f7`.**
Follows WS-BB2, which found the hole from the other end.

Every corpus figure came out of live Postgres with `corpus=postgres
instruments=1088` printed on the run that produced it. The offerable population
is not restated anywhere in this work: `scripts/dump_publishable_ids.ts` runs
the product's own `publishableInstruments()` and every census reads its output.

---

## 1. The headline

**`EXACT@5 30%` was a statement about 278 instruments. The product offers 782.**

The key now names **499 of 782 (63.8%)**, and the 283 it still cannot name are
named and explained rather than left implied.

The cause was one line of definition. `Split.leaf_for` builds its lookups from
rows that HAVE a parent, so it can only ever return a CHILD. Four successive
repairs to the answer key all widened *which child* an award could be credited
to. None of them could reach a family that was never split — and a childless
family is not a rollup above the funds, it **is** the fund: it is what
`publishableInstruments()` offers and what the founder applies to. CDTI's six
programmes, Innovate UK, Bpifrance's innovation line, Innovationsfonden's
Erhvervsforsker. 199 of the 782 offerable leaves, 17,012 awards behind
`innovate_uk` alone.

The prior never had this hole. `Split.credit()` already falls back to the
family, so the ranker has always been able to learn these funds while the key
could not grade them. **That asymmetry is what made promoting them measure as a
loss** — and it is why suppressing standalone funds looked like a free accuracy
win right up until WS-BB2 named the six leaves filling every standalone row-slot
on a Spanish founder's table.

---

## 2. Sizing it: three populations, three different answers

`ETL/terms/audit_answer_key_reach.py`, live corpus, 782 offerable leaves:

    278  35.5%  NAMED — the key already named it            (before)
    221  28.3%  RECOVERABLE — awards can be placed on it
    195  24.9%  UNMEASURABLE — has awards, none placeable on it
     88  11.3%  UNMEASURABLE — no award in the corpus names it

The award side, over 309,926 non-duplicate awards, is the fact underneath all
four rows. (This corrects a figure that was travelling between workstreams:
"272,307 of 492,319 awards, 55%" counted CREDITED PAIRS, of which one award can
produce several, not awards. Over awards the split places nothing on 88.6% —
and 43.1% of that is the childless-family case this work recovers, so the
unplaceable rate that matters is 45.5%, not 88.6%. See section 7.)

    133,705  43.1%  the family itself, which has no children (a real door)
     99,086  32.0%  notified scheme only — several bodies, cannot say which
     37,363  12.1%  a family that HAS children — a regime, not a door
     35,224  11.4%  exact leaf (a programme or scheme child)
      4,548   1.5%  nothing: no source map at all

Only 11.4% of awards resolve to an exact child. That is the whole reason the old
key was small, and it is the same fact that produced the ten-case ranking
regression on 2026-08-08: `emit_peer_prior.py` interleaves 272,307 of 492,319
credited pairs that have no exact leaf, rather than dropping them.

Two of those five rows are one fund each — the exact child and the childless
family — and together they are 54.5% of all awards. The other three cannot name
a single fund and never will. Section 7 is why that distinction is worth more
than the placement rate everyone has been quoting.

### What was recoverable, by market

    NO  74 leaves / 16,933 awards      ES   6 / 2,315      DK  4 / 1,279
    EE  47 / 2,483                     FR   6 / 1,879      FI  2 / 1,763
    LV  25 / 3,921                     GB   1 / 17,012
    DE  18 / 1,920                     PL   8 / 3,830
    CZ  15 /   547                     EU  12 / 1,531

All 221 are now nameable, at the base set's own cap of 12 pairs per instrument.
Every one of the eleven funds WS-BB2 named as "never an answer anywhere in the
active set" carries 12 pairs in the new key.

---

## 3. What remains unmeasurable, and why neither is a to-do

**88 leaves — no award in the corpus names them.** The key is built from awards
that were made. A leaf with zero awards cannot be an answer under any ranker, so
its absence carries no information about retrieval. These are the BDNS
convocatorias: open Spanish calls we hold before anyone has won one. They become
gradable when the register publishes an outcome, with no edit to any file.

**195 leaves — awards exist and none can be placed on them.** The larger and the
permanent one. `populate_funding_instruments.py` only creates a child above
`MIN_CHILD_EVENTS`, so most awards under a split regime have no child of their
own and resolve no further than the **notified scheme** — which one register
shares across as many as eighteen delivering bodies (SA.56245). A test pair
needs exactly one right answer, and "one of these eighteen" is not one.

These 195 are gradable at REGIME level and are not gradable at EXACT level.
That is a fact about what the registers publish, not a gap in our tooling, and
no amount of work on the key changes it. It is concentrated in IT (36 leaves /
20,175 awards), CZ (32), DE (21), AT (20) and BE (16).

**`door_for` refuses rather than guesses, in both directions.** An award under a
family that HAS children is not credited to the regime — that would make the
right answer a row the founder cannot apply to. And one source in the corpus
maps to 88 childless families at once; "which of these 88" has no answer, so it
is refused too.

---

## 4. Two things the extension broke on contact, both real

### The size floor had made four published baselines unreproducible

`MIN_PAIRS` is pinned to the active set's committed size and was applied to
whatever set was loaded. The moment the active set grew to 7,095, every `SET=`
replay of a retired set exited 1 — "4,796 pairs, under the 7,000 floor, the
answer key has SHRUNK" — and the retired sets exist for exactly one purpose,
which is that a published number stays reproducible.

The floor is a claim about ONE artifact: the active key must not be quietly
pruned. It is now scoped to the active set. Lowering `MIN_PAIRS` to let the
replay run would have been weakening a floor to go green.

### The new pairs arrived wearing an existing population's name

`extend_recall_set.py` stamped every added pair `traced: exact_attribution`.
`check_peer_prior_canary.ts` caught it in under a second: that population read
98.3 → **70.5 against a floor of 95**, on an artifact nobody had touched.
Nothing had regressed — a different population had inherited a floor calibrated
on another one.

The pairs now carry `traced: childless_family` and `exact_attribution` reads
98.0 again. This is the case for floors per population rather than a headline,
made by the check itself, on its first encounter with a population that did not
exist when it was written.

---

## 5. The leak, priced

The new key adds **2,018 companies no fitted artifact had ever excluded** — 31%
of its pairs. `ETL/lib/recall_holdout.py` discovers recall sets by glob, so the
new file is covered automatically *from the next rebuild onward*; the committed
artifacts predated it. Measuring the new key against them would have been the
evaluation grading itself on its own answer key.

`check_peer_prior_canary.ts`, free, tune split, before and after rebuilding:

    population            in cell          regime@5
    childless_family    88.4 -> 63.3     29.9 -> 24.7
    exact_attribution   39.8 -> 39.7     98.0 -> 99.5
    original join       66.9 -> 66.9     81.3 -> 78.9

**Twenty-five points of in-cell share on the new population was the test
companies voting for their own answers.** `peerPrior`, `regionPrior` and
`channelPrior` are rebuilt in this branch under the default exclusion. The cost
to the pre-existing populations is small and it is not zero: `original join`
falls 81.3 → 78.9 against a floor of 78, so its margin is now 0.9 points. The
floor is NOT lowered. If a legitimate refresh takes it under, the answer is to
find out why, not to widen the band.

`sector_mix` is the fourth artifact of this shape and it lives in
`funding_instruments`, so refreshing it means a corpus rebuild. **That is left
open and stated rather than done here**, because a corpus rebuild from one
workstream's branch is not a change that should ride along with an answer-key
extension. It is a real residual: those 2,018 companies still have their own
vote inside the won fund's sector mix.

---

## 6. Re-baseline — and the number that moved is not EXACT@5

`SPLIT=holdout N=300 ANSWERS=real`, three seeds, live Postgres, 1,088
instruments printed on every run.

    arm                                  seed 20260806   seed 7   seed 99
    A  Composed key, artifacts as shipped
         in pool                              96%          97%      98%
         EXACT@5                              29%          27%      31%
         REGIME@5                             92%          92%      91%

    B  Composed key, artifacts REBUILT (the control)
         in pool                                                    98%
         EXACT@5                                                    31%
         REGIME@5                                                   91%

    C  Doors key, artifacts rebuilt
         in pool                              92%          92%      94%
         EXACT@5                              25%          28%      30%
         REGIME@5                             71%          68%      73%

**Arm B is a free control and it is the one that answers the brief's question.**
It exists by accident — the active pointer was flipped while seed 99 was in
flight — and it is worth more than the accident cost: the same key, the same
seed, the only difference being the rebuilt priors, reads **98 / 31 / 91 against
arm A's 98 / 31 / 91**. Identical on every headline. So the mandatory exclusion
refresh moved nothing, and everything below is the POPULATION changing.

### EXACT@5 did not really move. REGIME@5 fell twenty-one points.

EXACT@5 goes 29/27/31 → 25/28/30. That is within the ±5 half-width on every seed
and the direction is not consistent. **Retrieval is about as good on the 221
funds the key could not see as on the 278 it could** — which is the single most
useful thing in this document, because it is the opposite of what "these funds
are never the answer" implied for two workstreams.

REGIME@5 goes 92/92/91 → 71/68/73, and that is not noise. The explanation is
arithmetic, from the same runs:

    seed 20260806, arm C          n     pool   exact5   regime5
      regime 1 (alone)           99      99%      30%       30%
      regime 2-5                 10      70%      20%       30%
      regime 6-20                29      90%      28%       69%
      regime 21-50               59     100%      15%       95%
      regime 51+                103      83%      24%      100%

A standalone fund IS its own regime, so regime credit and exact credit are the
same question and there is no sibling to be right about. In a regime of 51+,
naming any one of a hundred siblings scores 100%. **REGIME@5 92% was largely a
statement about sibling-group size**, and the old key's standalone stratum was
n=17 scoring 81-100% — a tiny, unrepresentative corner. In the new key that
stratum is n≈100 and scores 30%.

Read the EXACT column across that table: the standalone funds (30%) are second
only to `regime 6-20` (28%) and beat `regime 21-50` (15%). The funds we could
not grade are the ones retrieval does best on.

### Spain, the market the whole finding came from

    seed 20260806      n    pool   exact5   regime5
      arm A, ES       14     93%      29%      79%
      arm C, ES       17     88%      41%      76%

With CDTI's programmes in the key, Spain's measured EXACT@5 goes **up**, 29 → 41.
The funds WS-BB2 was worried we would suppress are funds retrieval already
finds; we simply had no way to be told.

### Floors

**Not re-derived, because the active set did not change.** The floors in
`check_recall_floor.ts` are calibrated on `__recallSetComposed.json` and that is
still the active key, so they stand untouched. Nothing here is lowered. The gate
on this branch, live Postgres, 1,088 instruments, pinned seed and N:

    ok   pool     98%  (floor 93)
    ok   exact5   29%  (floor 22)
    ok   regime5  91%  (floor 80)
    ok   regime5  89%  (floor 70)  original join, n=157
    ok   regime5  94%  (floor 84)  traced:exact_attribution, n=143

`traced:exact_attribution` is worth a note: it was **red on main at 82 against
its floor of 84** after the 2026-08-08 peer-prior merge, and it reads 94 here.
The mandatory holdout refresh in section 5 fixed it as a side effect — the
artifact was carrying a stale exclusion, and rebuilding it under the current
glob was the repair that ten-case regression had been waiting for.

When the hold lifts, they must be re-derived rather than carried across — a
floor calibrated on one population is not a floor on another, which is precisely
what `check_peer_prior_canary` demonstrated in section 4 by firing on a
population that had inherited a name. On today's arm C the honest starting point
would be pool ~92, EXACT@5 ~25, REGIME@5 ~68 (the lowest seed of each) with the usual margins, plus a
`traced:childless_family` floor of its own. **REGIME@5's floor of 80 cannot
survive that and must not be carried over as though it could**: 68 is not a
regression against 80, it is a different question.

The population-drift note already in that file needs one more line when this
lands. It records the graded split moving 149/151 → 143/157 on an identical seed
and N; the Doors key makes it a THREE-way split (roughly 111 original join /
95 exact_attribution / 94 childless_family at n=300, and it moves by up to six
between seeds), so the per-population percentages sit on denominators near 100
rather than near 150 and carry proportionally more noise.

---

## 7. The "unplaceable" floor is wrong, and wrong in the same way the key was

Workstream BQ puts the honest floor on what any answer key can ever cover at
**133,621 awards (43.4%) structurally unplaceable** — a call id published with
no granting authority and no programme name — and names Horizon, Innovate UK and
`fr_relance` as the sources responsible.

Those awards are placeable. Measured over exactly that population:

    awards with a call id, NO authority and NO programme name   135,659
      of which door_for places on ONE fund                      123,669  (91.2%)

      source                    awards   placed
      innovate_uk_2023           4,675    4,675
      innovate_uk_2024           4,294    4,294
      horizon_eu_cl5_2021        4,020    4,020
      horizon_eu_cl4_2021        3,932    3,932
      ademe_aid                  8,996        0

Every source BQ names except ADEME is a **childless family**, and a childless
family needs no authority and no programme name to be identified — it is already
the only fund the source maps to. "Unplaceable" was read off `leaf_for`, which
can only return a child, and it is the same error that kept 199 funds out of the
answer key: an award with nowhere to go *inside* a regime is not an award with
nowhere to go.

Corpus-wide, the two placements side by side:

    placed on an exact CHILD      35,224   11.4%   <- what "placement" has measured
    placed on a childless DOOR   133,705   43.1%   <- invisible to leaf_for
    placed on ONE fund, total    168,929   54.5%
    genuinely unplaceable        140,997   45.5%

BQ's 11.5% reproduces exactly. The number that should be carried forward is
**54.5%**, and the rebuild raises the first line, not the third.

---

## 8. Does the pending republish invalidate this? Measured: 1 leaf of 233

The hold is on the theory that a key extended onto a stale child layer measures
the rebuild as churn. That is correct for the 22 leaves Doors adds through
`leaf_for`. It is not correct for the 233 it adds through the family fallback,
and this was measured rather than argued.

Replaying the ETL's own split test (`programme_split` on >1 distinct programme
name, `split_targets` on the SATR buckets, `MIN_CHILD_EVENTS = 40`) against
today's events, for each of the 233 childless families the key now names:

    WOULD ACQUIRE CHILDREN, and stop being an offerable leaf      1
      satr_lt_equity   1 child, 48 events
    STAY CHILDLESS, answer survives the rebuild unchanged       232

That is the expected result once stated: the reason `leaf_for` cannot reach
these funds is that they have **no children for the split to key on**, which is
the one property a child rebuild cannot change. And the single exception needs
no repair — `partitionByOfferable` moves its pairs to WITHHELD on the next run,
with no edit to any file.

The 7-of-22-country ceiling is likewise a property of `leaf_for`, not of the
corpus. Doors already names childless families in NO (74), EE (47), LV (25),
DE (18), CZ (15), EU (12), PL (8), ES (6), FR (6), DK (4), FI (2), GB (1) and
four more. `door_for` removes that ceiling before the republish, not after it.

**What the republish does require**: re-running `extend_recall_set.py --base
__recallSetDoors.json --out <next>` once the child layer is fresh, to pick up
the leaves that become placeable when valid keys go 241 → 671. The extender is
additive and never alters a pair, and it re-tests every base row's description
against the label it then carries, so that run composes on top of this one
rather than re-deriving. That is the property the brief asked the extension to
have, and it is why holding it buys nothing that re-running would not.

---

## 9. What ships

1. **`Split.door_for`** in `ETL/terms/attribution.py` — the complete test for
   "which fund would this founder have applied to", including the case where the
   answer is a family. `leaf_for` and `credit` are unchanged, so
   `emit_peer_prior.py` is untouched by the definition change.
2. **`ETL/terms/extend_recall_set.py`** reads `door_for`, and stamps `traced`
   from HOW the award was placed rather than with a constant.
3. **`__recallSetDoors.json`** — 7,095 pairs, 661 instruments nameable, 499 of
   them offerable, 0 leaks at exact / 8-gram / sibling containment against
   `instrument_profiles.profile_text`, 0 companies on both sides of the split.
   Committed and named as `STAGED_RECALL_SET`; activation is one line.
4. **`ETL/terms/audit_answer_key_reach.py`** — the census above, re-runnable,
   naming no fund and restating no rule. It reads the product's own publishable
   list rather than approximating it, which is worth 23 leaves and three points
   of every share it prints.
5. **`scripts/dump_publishable_ids.ts`** asserts `requireLiveCorpus`. It printed
   its provenance and trusted the reader; a silent Postgres timeout would have
   handed every Python-side census the snapshot, in which nothing is closed.
6. **`assertGradablePopulation` takes the file it is grading**, so the
   anti-pruning floor guards the active key and lets a retired replay through.
7. **`recallLeaks.test.ts` reads `ACTIVE_RECALL_SET`** instead of naming a file.
   Its own docstring says it poisons "the REAL active recall set"; the comment
   was the specification and the literal was the bug.
8. **`check_peer_prior_canary.ts`** floors the third population.
9. **`peerPrior`, `regionPrior` and `channelPrior` rebuilt** under the default
   holdout, because `__recallSetDoors.json` is now on disk and
   `recall_holdout.py` counts retired and staged sets alike. This is required
   whether or not the key is activated, and it is what took
   `traced:exact_attribution` from red to 94.
10. **`ETL/terms/test_attribution.py`**, wired into CI — eight cases on
    `door_for`'s boundary, on an in-memory corpus, no credentials.

### Left open, deliberately

`sector_mix` is the fourth artifact fitted over award history and it lives in
`funding_instruments`, so refreshing it means a corpus rebuild. Those 2,018 new
companies still have their own vote inside the won fund's sector mix. A corpus
rebuild from an answer-key branch is the wrong shape of change, and workstream
BQ's republish is the right place for it — it should carry the holdout refresh
with it.

Nothing is hardcoded. No country, fund, scheme code or instrument id appears in
any of it. "Childless family" is `parent_id IS NULL` with no row pointing at it,
which is the same test `publishableInstruments()` uses to decide what a founder
may be shown.
