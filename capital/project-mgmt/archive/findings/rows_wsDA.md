# wsDA — the per-row router. It does not exist either, and the union is unreachable.

**The answer: DO NOT SHIP. Nothing is shipped, nothing is flagged, nothing is
left dangling.** The ~11 points of union headroom are real, they are not
reachable from the founder (wsCW), and they are not reachable from the candidate
row either. The remaining loss needs new information, not better use of what we
already have.

Raw dumps beside this file in `rows_wsDA/`. The one new file is
`scripts/_wsda_rows.ts`, kept because it is the bound, and the bound is the
result.

---

## The hypothesis, and why it was the right one to test

wsCW closed the founder-side router and, in closing it, wrote the sentence this
workstream was set on: *the discriminator is a property of the **answer**, not of
the founder.* All fourteen of its features were computed from the request. But
"is this fund one the founder's peers keep winning, or one with no history in
the cell at all" is not only a property of the answer — it is a property of
**every candidate row**, it is readable at request time for each of them, and it
had never been measured.

So the question is not whether that property matters. It plainly does: it is the
exact axis on which the two signals divide. The question is whether it is
**separating** — whether the rows a rule would have to promote look different
from the rows it would have to demote.

They do not.

## The bound, taken before anything was built

`scripts/_wsda_rows.ts` is **free**: it reads the wsCW tape and
`peerPrior.generated.json` — no model calls, no database, no embeddings. It
reproduces the published five **600/600** on both splits before it reports
anything, and the shipped 154/600 tune and 139/600 holdout are the same numbers
`measure_recall.ts` prints.

The family is a strict generalisation of the shipped rule. The score keeps its
head seat; every remaining row is assigned to one of two tiers by a function `o`
of its **discretised row-feature vector** — tier 1 sorts by cell rank then
back-off, tier 0 sorts by score rank, tier 1 first. Shipped is the member with
`o(v) = 1 iff the row is in the cell`. Because the vector contains the row's
score rank, **the family also contains every seat count on wsCW's closed axis**,
so this is a superset of that sweep with the new row features added.

`o` is then fitted on the tape **by coordinate ascent with every answer
visible**. That is deliberate overfitting: the result is an upper bound on what
any per-row rule over these features can score, learned or hand-written.

### Granularity swept, so "it overfits" and "no rule exists" stay separate

EXACT@5, tune, n=600. Shipped is 154.

| partition | vectors | fitted with every answer visible | two-fold, honest |
|---|---|---|---|
| **coarse** — in the cell, and how deep | **6** | **155** | 153 |
| mid — + score rank, + breadth of history | 148 | 173 | 141 |
| fine — + country-marginal rank | 437 | 178 | **149** |

**Read the first row.** At the granularity of the hypothesis itself — is this
fund in the founder's cell, and how deep — an oracle that has already seen every
answer scores **155 against the shipped 154**. There is no rule to overfit,
because there is no rule. The +19 and +24 the finer partitions buy are
memorisation, and the two-fold gives all of it back and then some: every honest
estimate is **at or below shipped**.

Holdout, reported once and after the tune conclusion was fixed. Shipped is 139.

| partition | vectors | fitted with every answer visible | two-fold, honest |
|---|---|---|---|
| coarse | 6 | **142** | 111 |
| mid | 148 | 159 | 137 |
| fine | 439 | 170 | 134 |

Same shape, same verdict: the coarse oracle gains three cases in six hundred
with the answer key in front of it, and **every honest estimate on both splits
is at or below shipped**.

**The oracle bound on per-row routing is therefore +4 points fitted and
NEGATIVE cross-validated, against a union headroom of +11.** The narrower
back-off family (184 members, best member chosen per founder) bounds at
174/600 = 29.0%. Neither reaches the union, and the honest estimate of both is
a loss.

## Which row features carry signal, and the leak argument for each

The decisive measurement is not an AUC on the tape. It is the AUC between the
**two row populations a per-row rule must separate**: the 96 rows carrying the
prior's exclusive wins, which it must keep up, against the 314 rows occupying
the visible five in the score's exclusive wins, which it must push down.

| row feature | AUC tune | AUC holdout | carries signal? |
|---|---|---|---|
| cell depth | **0.506** | **0.500** | **no — exactly nothing** |
| best rank anywhere | 0.476 | 0.473 | no |
| country-marginal rank | 0.410 | 0.491 | no, and does not replicate |
| score/prior disagreement | 0.407 | 0.470 | no, and does not replicate |
| breadth of history (cells it appears in) | 0.378 | 0.432 | inverted, does not replicate |
| score rank | 0.348 | 0.423 | inverted, does not replicate |
| raw relevance | 0.321 | 0.372 | inverted, does not replicate |

**Cell depth — the feature the whole idea rests on — is 0.506 and 0.500.** The
blockers sit at median depth 2 with median breadth 6; the prior's exclusive
winners sit at median depth 2 with median breadth 4. They are the same rows.
Every other feature reads *below* 0.5, meaning the rows to keep are the ones
that look worse, and none of the below-0.5 readings replicates across splits —
0.41 becomes 0.49, 0.35 becomes 0.42.

**The leak argument, and it is one argument because every feature has the same
provenance.** Each of the seven is a function of `(fund id, founder country,
founder sector)` through **`peerPrior.generated.json` alone** — cell rank, the
country and sector Borda marginals over that same file, the count of cells
holding the fund, its best rank anywhere — plus the row's own score, which is
already shipped. `ETL/terms/emit_peer_prior.py` drops **every company in every
graded recall set**, discovered by glob over `__recallSet*.json`, **by default
and not behind a flag**, before it counts a single award pair. So the artifact
has never seen the founder being graded, and no aggregate over it — marginal,
count or rank — can reintroduce what the artifact does not contain. The
founder's own withheld award history is a different object and is read nowhere
here. `check_recall_leaks` is green: 1,366 described rows, 0 leaks at exact /
8-gram / sibling, 222 squash probes agree.

## End to end

There is no arm, so there is no arm-on/arm-off table and **no regime
concentration to report beside a gain, because there is no gain**. The
concentration that does matter is the one that says the closure is not a
one-programme artefact: the prior's 96 exclusive wins span 37 regimes and 14
countries (largest 18% / 21%), the score's 74 span 27 and 11 (19% / 20%). The
failure to separate them is spread across the corpus, not concentrated anywhere
a rule could be pointed at.

The shipped path is unchanged and re-measured at this HEAD, with the ranker
attestation, in `rows_wsDA/TAPE_tune_at_head.txt`:

    corpus=postgres instruments=1088 at 2026-08-10T19:12:40.120Z
    ranker: all 594 request(s) on EMBEDDING
    EXACT@5 (as published, from the tape) 154/600 (25.7%)

That is the wsCW tune tape's number and its attestation, re-cut after wsCY
merged: 154/600 and all 594 on EMBEDDING, identically. The tape is stable
across that merge, so every counterfactual above is about today's code.

`npx tsc --noEmit` clean. `check_recall_leaks` **ok — 1,366 described rows, 0
leaks at exact / 8-gram / sibling, 222 squash probes agree.** `check_recall_floor`
**ok — all floors met**, `traced:exact_attribution` 89% against its floor of 88%,
its one point of margin untouched because no ranking code was changed.
`npm run check` fails 3 of 40 — `rendered numbers`, `site serves the ETL's
corpus`, `published verdicts` — all three the pre-existing `make republish`
state of the shared corpus artifacts. This branch adds **one file**,
`scripts/_wsda_rows.ts`, and nothing under `app/` or `components/`; it cannot
reach any of the three.

### One caveat, stated rather than buried

The script also prints a COLLISION count: how often the ordered pair of feature
vectors one founder demands is demanded in reverse by another. On tune it is
18/339 pairs and 12/74 founders. That is a **lower bound on unwinnability, not
the finding** — at 437 vectors most pairs are too sparse to collide exactly, and
the sparsity is precisely what the fit exploits. The finding is the two-fold,
and the reason the finding is not merely "we overfitted" is the coarse row of
the table, where six vectors leave nothing to overfit and the oracle still gains
one case.

## What this closes, and what it leaves

**Ordering is done.** The seat axis is optimal (wsCW). Rank fusion is below it
(wsCW). Depth capping is a no-op (wsCW). The founder-side router does not exist
(wsCW). The **row-side router does not exist either**, and it fails for a reason
that is not a shortage of family shapes: at the coarsest useful partition an
oracle with every answer in front of it gains one case in six hundred.

The union is **unreachable by re-ordering the rows we already have**. Both
signals rank what they know; the loss is that neither knows the other's funds,
and nothing observable about a row says which kind of fund it is. Anything that
moves EXACT@5 from 26/22 has to **add information** — the intake questions that
would tell us whether this founder's answer lives inside their peer cell, or a
prior that covers the funds the current one has never seen. Not another
ordering.
