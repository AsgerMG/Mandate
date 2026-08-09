# The answer key now names 499 of the 782 funds the product offers

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
four rows:

    133,705  43.1%  the family itself, which has no children (a real door)
     99,086  32.0%  notified scheme only — several bodies, cannot say which
     37,363  12.1%  a family that HAS children — a regime, not a door
     35,224  11.4%  exact leaf (a programme or scheme child)
      4,548   1.5%  nothing: no source map at all

Only 11.4% of awards resolve to an exact child. That is the whole reason the
old key was small, and it is the same fact that produced yesterday's ten-case
ranking regression: `emit_peer_prior.py` reports it as **272,307 of 492,319
award pairs (55%) with no exact leaf**, interleaved rather than dropped.

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

## 6. Re-baseline

RESULTS_PLACEHOLDER

---

## 7. What ships

1. **`Split.door_for`** in `ETL/terms/attribution.py` — the complete test for
   "which fund would this founder have applied to", including the case where the
   answer is a family. `leaf_for` and `credit` are unchanged, so
   `emit_peer_prior.py` is untouched by the definition change.
2. **`ETL/terms/extend_recall_set.py`** reads `door_for`, and stamps `traced`
   from HOW the award was placed rather than with a constant.
3. **`__recallSetDoors.json`** — 7,095 pairs, 661 instruments nameable, 499 of
   them offerable. `__recallSetComposed.json` is retired with its reason.
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

Nothing is hardcoded. No country, fund, scheme code or instrument id appears in
any of it. "Childless family" is `parent_id IS NULL` with no row pointing at it,
which is the same test `publishableInstruments()` uses to decide what a founder
may be shown.
