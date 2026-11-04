# wsCW — the seat allocation, swept end to end. It is already optimal.

**The answer: the fixed split is the maximum of its own axis, on both splits and
under both scores. The remaining loss is not addressable by re-allocating seats
between the two signals we have.** A perfect per-founder router between them
would be worth about +11 points, that headroom is real, and nothing observable
at request time reaches any of it.

Raw dumps beside this file in `seats_wsCW/`. `PEER_FILL` is deleted; the code
with its five arms is tagged `archive/wsCW-peer-fill`.

---

## The method, and why it is not one harness run per idea

`applyPeerPrecedence` is a **pure reorder** of the array it is handed. It adds
nothing, removes nothing, and reads only (row order, row score, scheme code,
peer prior). So every seat count, every fusion of the two orderings and every
router over them is a function of ONE replay's tape.

`scripts/_wscw_dump.ts` cuts that tape — the `collapsed` order, each row's
score, scheme code, regime and channel, the prior's rank for every row, and the
founder-side features a router could legally read. It uses `founderIntake` under
`founderPolicyFromEnv` and `sampleRecall` at the shared seed, so it replays the
same founders `measure_recall.ts` does.

`scripts/_wscw_seats.ts` reads the tape and **checks itself before it reports**:
it replays the shipped seat count and compares with the `final` order the code
actually produced. **600/600 on all three tapes.** The tape's shipped EXACT@5 is
154/600 on tune and 139/600 on holdout — the same 154 and the same 139
`measure_recall.ts` printed for wsCV. The counterfactuals are about the shipped
path, not about a model of it.

Every run carries `ranker: all N request(s) on EMBEDDING` and its founder
attestation. **No model spend: one Voyage embed and one Postgres read per pair.**

## 1. The seat axis, swept

EXACT@5, n=600, the seat count the ONLY thing that differs. Shipped is 1 seat on
the flat branch and 3 on the specific one.

| seats to the score | 0 | **1 (shipped)** | 2 | 3 | 4 | 5 | score alone |
|---|---|---|---|---|---|---|---|
| tune | 23.8 | **25.7** | 24.7 | 23.8 | 22.8 | 21.2 | 20.2 |
| holdout | 23.5 | **23.2** | 22.7 | 23.2 | 21.5 | 19.2 | 19.3 |

REGIME@5 and CHANNEL@5 move the same way, so there is no trade hidden in the
aggregate. On tune the shipped point is the maximum outright; on holdout it sits
on a plateau of 0/1/3 (139–141, all inside ±3.4) with everything beyond it
falling away. `alternate` (wsCM's arm) is 23.5 tune / 22.7 holdout.

**Two other axes, both off the seat axis, both closed.** Reciprocal rank fusion —
the same two orderings with a FINITE weight instead of the shipped strict tier —
runs 19.0 to 25.0 over four dampings and three weights on tune, never above
shipped. Capping the prior's REACH so it may promote only its first N entries is
a **no-op at N=8** and a loss below it: the prior's deep entries never reach the
visible five anyway.

## 2. What each signal knows, with counts

Tune, n=600, EXACT@5, same pool and same founder:

| | count |
|---|---|
| both right | 47 |
| **only the score** | **74** |
| **only the peer prior** | **96** |
| neither | 383 |
| union (a perfect binary router) | **217 = 36.2%** vs shipped 25.7% |

Holdout: 48 / 68 / 93 / 391, union 34.8% vs shipped 23.2%. **The orthogonality
replicates and so does the ~+11-point headroom.**

And the two are not better and worse versions of one thing — they know
different facts:

| | won leaf's rank in the PRIOR | never in the cell | won leaf's rank on the SCORE |
|---|---|---|---|
| only the prior right (96) | median **2**, p90 6 | **0 / 96** | median 36 |
| only the score right (74) | median 15, p90 27 | **33 / 74 (45%)** | median **2** |
| neither (383) | median 20 | 143 / 383 | median 34 |

**The prior owns recurrence** — where it wins, it holds the exact answer at the
very front of the founder's cell, for a fund the score has buried at rank 36.
**The score owns the funds with no history in the cell** — where it wins, in
nearly half the cases the prior has never heard of the fund at all.

Neither advantage is one programme or one market. The prior's 96 exclusive wins
span 37 regimes and 14 countries (largest 18% / 21%); the score's 74 span 27 and
11 (19% / 20%).

## 3. Is there a router? No.

Fourteen candidate features, every one available at request time and none naming
a fund, country or sector. AUC for "the score is the one that is right", over the
discordant founders only, and then a **two-fold cross-validation** — threshold
and direction fitted on one half, scored on the other.

* Best AUC on tune 0.622 (`top score value`); on holdout 0.618 for the same
  feature. Everything else is inside the multiplicity-corrected null, and the
  two splits **do not agree on which features carry any signal**: description
  skewness reads 0.606 on tune and 0.498 on holdout.
* **Cross-validated, no router beats the fixed split.** Tune: best 157/600
  against shipped 154 — and that one is "route the specific branch to the score
  alone", which buys +3 EXACT while costing REGIME@5 80.5 → 70.3 and CHANNEL@5
  91.5 → 77.1 on that branch. Holdout: best 140/600 against shipped 139.

**Why nothing predicts it.** The thing that decides which signal is right is a
property of the ANSWER, not of the founder: whether the won fund is in this
founder's peer cell at all. In 45% of the score's exclusive wins it is not, and
no request-time feature reveals that. A router needs a NEW signal, not new
arithmetic over these two.

## 4. The blend, re-measured at every seat count

The brief's named follow-on: if the seat allocation opened up, re-measure wsCU's
blend. **It does not open up, and the blend does not win when it is forced open.**
`POOL_BLEND=on`, tune n=600: the whole seat axis is flat inside noise (137–147)
and every point of it is below the blend-OFF shipped 154.

The reason is the orthogonality, and the blend spends it:

| | both right | only score | only peer | union |
|---|---|---|---|---|
| blend off | 47 | 74 | 96 | 217 |
| blend on | 69 | 64 | 75 | 208 |

The blend carries the peer prior as one of its fourteen columns. It improves the
score by making it **agree** with the fill that already has that information —
so it adds nothing at the point of allocation and shrinks the union, which is
the only quantity a seat allocation can spend. wsCV's null is not a
seat-allocation artefact.

## 5. What shipped

Nothing to the ordering — no arm earned it. What changed is that the axis is now
closed in the code rather than in a findings file: `PEER_FILL` and its five arms,
`scoreSeats`, the `alternate` interleave, the `confident` guard and the `scoreOf`
parameter that existed only for the arms that read it are **deleted**, and the
two remaining constants carry the sweep that fixes them. Every invariant test
survives unchanged — the permutation check, the winner-still-reachable check, the
proved-it-can-fail filter reconstruction, and the non-vacuity block.

**Verified as a no-op, and the check is worth stating exactly** because the two
tapes are NOT byte-identical and the reason is not this change. Re-cutting the
tune tape after the deletion: **EXACT@5 154/600, the same 154**, and the
**published five is identical on 600 of 600** replays. 29 replays arrive at the
reorder with a different input order, and their `spread` differs too — that is
the live vector index returning slightly different raw similarities between
runs, upstream of everything touched here. On the 571 replays whose reorder
INPUT was identical, the reorder's output is identical **571/571**. The only
seat counts a request now produces are 1 and 3.

## 6. What this means for the next workstream

The +11 points of routing headroom are real and they are **not reachable by
ordering**. Both signals already rank the funds they know; the loss is that
neither knows about the other's. Anything that moves EXACT@5 from here has to
add information — a signal that says whether THIS founder's answer lives inside
their peer cell, or a prior that covers the funds the current one has never seen
(33 of the score's 74 exclusive wins, 45%, are funds absent from the cell
entirely). Do not re-run the seat sweep; it is done, twice, on both splits.
