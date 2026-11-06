# wsGM — widen the cut

Free. No Anthropic call was made in this workstream; `measure_funnel` deletes
`ANTHROPIC_API_KEY` before importing anything that could reach one. The Voyage
embedding behind `semanticFundMatch` IS the shipped ranker and is the only paid
call in the harness.

---

## 0. THE FALSIFICATION TEST, WRITTEN BEFORE THE NUMBERS ARRIVED

This section is committed in its own commit, before the reference sweep
finished, so it cannot have been fitted to what came back. Git is the evidence.

### The decision rule, fixed in advance

Ship the widest K that:

1. is `<= AGENT_SELECT_DEPTH` — a pool row past the depth is never shown to the
   model, and the permutation `agentSelectRows` returns is `[...chosen,
   ...everything else in the shipped order]`, so it can only land behind all
   `SELECT_COUNT` picks, past `BRIEF_LIMITS.institutionsMax`. It cannot publish.
   A pool wider than the depth prints its own number and measures the depth;
2. is a **measured point on the committed recall curve** — `POOL_RECALL_KS` is
   `1, 3, 6, 10, 18, 25, 30, 40, 50, 75, 100, 150, 250`, and `poolRecallAt`
   INTERPOLATES between them. The base rate the prompt quotes to the model must
   be a figure somebody measured, not one linearly guessed between two that were;
3. **loses no founder on the deterministic path** — the sweep's `left` column at
   `writer_cap`, `published`, `top_6` and `top_5`.

On today's constants that resolves to **40** and to nothing else: 25 and 30 are
strictly worse on (2)-satisfying ground, 60 is not on the curve and exceeds the
depth, and `all` exceeds the depth.

### What result would mean this workstream was wrong

Any one of these, and the recommendation is dead. Stated as quantities, before
the run, so none of them can be renegotiated afterwards:

**F1 — the deterministic path loses founders.** If widening to 40 removes the
won fund from `published`, `top_6` or `top_5` for ANY founder — the `left`
column non-zero — then a wider pool is not free even before the model is
involved, and rule (3) fails on its own terms. This is the one the free
instrument can actually decide, and it decides it either way.

**F2 — the ceiling does not move.** If `pool_cut` at K=40 is within the binomial
half-width of `pool_cut` at K=18, there is nothing to buy and the argument is
about nothing. (The committed curve says it is +18 points, so this would also be
a contradiction between two harnesses and a defect in one of them.)

**F3 — the model's accuracy on the rows it was already shown collapses.** The
break-even is arithmetic: population EXACT@5 is `P(won inside K) x c_K`, so
break-even at K needs `c_K = c_18 x P_18 / P_K`. If the queued paid run comes
back with `c_40` below that number, widening loses and the constant must go
back. **This is the whole risk and this instrument cannot see it.** It is the
quantity `project-mgmt/AWAITING_APPROVAL.md`'s EUR 11-13 run exists to settle.

**F4 — truncation rises.** wsGA breached its own VOID condition with 4 of 148
calls cut off at `max_tokens` on an EIGHTEEN-row menu. A 40-row menu is more
than twice the prompt. If truncation rises materially, the arm publishes the
control under the treatment's name and the paid run is void before it is read —
which is a reason to raise `MAX_TOKENS_BY_EFFORT` before spending, not a reason
to widen or not to widen.

### What I expect, stated so it can be wrong

The free ladder can see only one mechanism, so I expect `pool_cut` to rise
steeply and **`writer_cap` and everything below it to be flat at every K**. The
loss moves off the cut row and onto the writer's cap. That is not a null result:
it is the exact bound on the deterministic downside — F1 answered — and it says
the entire value AND the entire risk of widening live at the model stage.

If instead the rows below move, the mechanism is `resolveNameCollisions` and the
sweep's `toWriter differs` column will be non-zero. I expect that column to be
small but I do not expect it to be zero, because the mechanism is real in the
code: `preferBetterEvidencedRow` is a total order independent of position.

---

## 1. The funnel at every depth, end to end

`POOL_SWEEP=18,25,40,60,all npm run stages`. n=**897** held-out described
founders, one per company, drawn before the offerability cut. Postgres, all 814
requests on the **embedding** ranker, draw fingerprint `13cb71cf3a1d1847` — the
same draw as the reference run already on `main`, so this is that run with four
more columns and not a second measurement of a different population.

Paired: one pool object per founder, five projections of it. Everything above the
cut — the intake, the Voyage embedding, the gate hydration, `accessiblePool` — is
independent of K, so the columns share their embeddings and their gates and a
difference between two of them is a difference on the same 897 people.

| stage | K=18 (was shipping) | K=25 | **K=40 (ships)** | K=60 | K=all |
|---|---:|---:|---:|---:|---:|
| the answer key names a fund this company won | 897 100.0% | 897 100.0% | **897 100.0%** | 897 100.0% | 897 100.0% |
| ... the corpus still holds it | 897 100.0% | 897 100.0% | **897 100.0%** | 897 100.0% | 897 100.0% |
| ... it is publishable on the corpus's own facts | 814 90.7% | 814 90.7% | **814 90.7%** | 814 90.7% | 814 90.7% |
| ... its openness could be confirmed | 814 90.7% | 814 90.7% | **814 90.7%** | 814 90.7% | 814 90.7% |
| ... this founder's screen keeps it | 792 88.3% | 792 88.3% | **792 88.3%** | 792 88.3% | 792 88.3% |
| ... the encoded gates do not conclusively fail | 713 79.5% | 713 79.5% | **713 79.5%** | 713 79.5% | 713 79.5% |
| **... it survives the cut** ← | **447 49.8%** | **500 55.7%** | **598 66.7%** | **640 71.3%** | **713 79.5%** |
| ... it survives the writer's cap of 8 | 346 38.6% | 346 38.6% | **346 38.6%** | 346 38.6% | 346 38.6% |
| ... it is one of the **7** rows published | 329 36.7% | 329 36.7% | **329 36.7%** | 329 36.7% | 329 36.7% |
| ... it is in the first **6** | 303 33.8% | 303 33.8% | **303 33.8%** | 303 33.8% | 303 33.8% |
| ... it is in the first **5** | 279 31.1% | 279 31.1% | **279 31.1%** | 279 31.1% | 279 31.1% |

One row moves. Every other row is identical **to the founder** at every depth,
including at the whole pool.

### The deterministic downside is not small. It is zero, and it is measured.

The prediction in §0 was that the rows below would be flat and that the
name-collapse channel would be small but non-zero. **Half of that is wrong.** The
channel is exactly zero:

| K | founders whose `toWriter` list differs from K=18 **at all** | writer_cap +/− | published +/− | first 6 +/− | first 5 +/− |
|---|---:|---:|---:|---:|---:|
| 25 | **0** | +0 / −0 | +0 / −0 | +0 / −0 | +0 / −0 |
| **40** | **0** | +0 / −0 | +0 / −0 | +0 / −0 | +0 / −0 |
| 60 | **0** | +0 / −0 | +0 / −0 | +0 / −0 | +0 / −0 |
| all | **0** | +0 / −0 | +0 / −0 | +0 / −0 | +0 / −0 |

That column counts the **whole eight-row id list**, on every founder, won fund or
not — not just the won fund, because "the won fund did not move" is a weaker
statement than "nothing moved". The mechanism that could have fired is real in
the code and the harness went looking for it: `resolveNameCollisions` picks a
label class's survivor by `preferBetterEvidencedRow`, **a total order independent
of position**, so a better-evidenced sibling admitted at rank 30 can demote the
row that held that label at rank 3. On this population it never happens, at any
depth up to the whole accessible pool.

**F1 does not fire.** Clause (3) of the decision rule is satisfied not by
argument but by 897 counted comparisons in both directions.

### The ceiling

| K | mean rows the ranker is shown | the answer is on the list | vs 18 |
|---|---:|---:|---:|
| 18 | 18.0 | 49.8% +/−3.3 | — |
| 25 | 24.6 | 55.7% +/−3.3 | +5.9 |
| **40** | **37.0** | **66.7% +/−3.1** | **+16.8** |
| 60 | 52.5 | 71.3% +/−3.0 | +21.5 |
| all | 74.0 | 79.5% +/−2.6 | +29.7 |

**F2 does not fire**: +16.8 points against a half-width of 3.1.

Conditioned on the answer being offerable, K=40 reads 598/814 = **73.5%**, which
is the committed curve's own 73.2% at K=40 to within a founder. Two harnesses,
two populations, one number.

---

## 2. Why 40 and not 60 or `all`, when `all` is worth another 12.8 points

Two of the three clauses bite, and both are now enforced by the build rather than
remembered here.

**`AGENT_SELECT_DEPTH` is 40.** `agentSelectRows` cuts the menu to
`min(SELECT_DEPTH, rows.length)` and returns `[...chosen, ...everything else in
the shipped order]`. A pool row past the depth is never shown to the model and
can only land behind all seven picks — past `institutionsMax`. It cannot publish.
So `BRIEF_VERDICT_POOL=60` against a depth of 40 prints 60 in its levers line and
measures 40. `caps.ts` warns at module scope. **40 needs no other change**; the
guard fires on `>`, not `>=`.

**The base rate must be a point on the curve, not a point on a chord of it.**
`poolRecallAt` interpolates LINEARLY between the depths `_wsdr_curve.ts` measured
(`POOL_RECALL_KS` = 1, 3, 6, 10, 18, 25, 30, **40**, 50, 75, 100, 150, 250), and
the prompt quotes it at the length of the menu it actually built. There is no
measured point at 60: a pool of 60 would tell the model **77.7%**, which is where
the straight line between 50 and 75 happens to pass and which nobody measured.

`check_pool_recall_curve` did not catch that. Its property 3 tested only that a
seam is not PAST the deepest measured K, while printing `covers the late seam
(60)` underneath an interpolated figure — the same defect as the corrected
constant the whole module exists to replace, one level down. **It now states the
property its own sentence always claimed**, for any depth this or any future seam
takes, with no list of depths anywhere but `POOL_RECALL_KS` itself:

```
BRIEF_VERDICT_POOL=60 → FAILED — the late seam's list is 60 rows and the curve
was never measured there — the nearest measured points are K=50 and K=75.
`poolRecallAt` interpolates LINEARLY between them, so the selector would be told
a base rate nobody has measured, about the exact list it is being shown. Add 60
to POOL_RECALL_KS and re-run scripts/_wsdr_curve.ts; do not relax this.
```

Green at 18, at 40, and at `all` — the last exempt on the recorded ground that
the curve plateaus from K=150 and the terminal point IS the whole-pool figure.

**So `all` is one clause away, not three.** It needs `AGENT_SELECT_DEPTH=all`,
and it is worth **another 12.8 points of ceiling** on this run. It is not in this
change because moving the depth changes what the model is asked to read from 40
rows to a mean of 74, and that is exactly the quantity the paid run below exists
to establish — settle it at 40 first.

---

## 3. Two measured things that push against wsDR, found on the way

Neither is an argument; both are in the code and free to check.

**The prompt now tells the model the opposite of what wsDQ diagnosed.**
`baseRateSentence(listLength)` reads the length of the menu it actually built.
wsDQ's account of the old defect was "the model was told to reach down a list
that usually does not contain the answer, and it obeyed". Printed from
production's own function:

```
menu of 18                              menu of 40
  ... somewhere in this list of 18        ... somewhere in this list of 40
  about 55% of the time.                  about 75% of the time.
  So about 20% of the time it is in       So about 40% of the time it is in
  this list but BELOW the sixth row --    this list but BELOW the sixth row --
  that is the whole of what a choice      that is the whole of what a choice
  of yours can win -- and about 45%       of yours can win -- and about 25%
  of the time it is not in this list      of the time it is not in this list
  at all.                                 at all.
```

The sentence naming what the model's judgement is worth **doubles**, 20% → 40%,
and it is measured rather than asserted. A widening is therefore not only a
longer menu; it is a longer menu the model is correctly told is worth reading.

**The model already rescues deep rows, at scale.** Re-derived free from the paid
tape's per-founder rows (`adviser_medium_n773_x2.json`), by where the won fund
sat in the eighteen-row menu it was actually shown:

| rank in the menu | founders | control EXACT@5 | ranker EXACT@5 |
|---|---:|---:|---:|
| 1-3 | 31 | 31 (100%) | 26 (84%) |
| 4-6 | 16 | 14 (88%) | 2 (13%) |
| 7-9 | 20 | **0** | 13 (65%) |
| 10-12 | 12 | **0** | 3 (25%) |
| 13-15 | 9 | **0** | 3 (33%) |
| 16-18 | 10 | **0** | 3 (30%) |

Ranks 7-18: the ranker converts **22 of 51**, the deterministic order converts
**0 of 51** — by construction, since it publishes its own top seven. There is no
row for ranks past 18 because that band has never been shown to a model at any
depth, and its conversion rate is the one quantity this whole question turns on.

---

## 4. What only a paid run can settle, as arithmetic

Population EXACT@5 = `P(won inside K) x c_K`, where `c_K` is the model's rate
among founders whose fund is on the menu. The tape measures `c_18` = **51.0%**
(50/98). So break-even at K needs `c_K = c_18 x P_18 / P_K`:

| K | `c_K` that break-even needs | relative collapse from 51.0% |
|---|---:|---:|
| 25 | 45.6% | 10.6% |
| **40** | **38.1%** | **25.3%** |
| 60 | 35.6% | 30.2% |
| all | 32.0% | 37.3% |

**Hold the head's accuracy and widening cannot lose at any conversion rate on the
newly-visible band** — it only ever adds founders who were unreachable. The
entire case against it is F3: that a longer menu makes the model worse on the
rows it was ALREADY shown, by more than a quarter, relative. No free run can see
that, at any n, because it is the model.

(wsGD's figure for the same quantity was 32.6% / a 36% collapse. Mine is the
tighter bar because it is computed on this run's own ceiling gain, 1.34x, rather
than on the head-to-head draw's 1.57x. Where the two disagree, the one measured
on the population the change ships to is the one to hold the decision to.)

**One precondition on the paid run, and it is not optional.** wsGA breached its
own VOID condition with **4 of 148 calls cut off at `max_tokens`** on an
EIGHTEEN-row menu. `MAX_TOKENS_BY_EFFORT.medium` is 6144 and covers thinking as
well as output; a 40-row menu is more than twice the prompt and thinking is
`adaptive`. A truncated call publishes the control under the treatment's name.
**Raise the ceiling with the menu and report the truncation count as a void
check, before spending** — that constant is in `agentSelect.ts` and is not
changed here, because changing a model call's token budget without measuring it
is the same class of act this workstream is arguing against.

---

## 5. What changed, and what it did not

| | |
|---|---|
| `caps.ts` | `VERDICT_POOL` 18 → **40**, with the sweep, the rule and the break-even in the docstring. `parseDepth` extracted: one definition of what a depth is, so a swept list is validated by the same rule as a single lever |
| `measure_funnel.ts` | the ladder is `ladderAt(pool)` and the report's own table is `ladderAt(VERDICT_POOL)`; `POOL_SWEEP` evaluates every stage at every depth off ONE pool object per founder. Unset ⇒ output unchanged |
| `check_pool_recall_curve.ts` | "covers the seam" now means the figure is a measured point, not a point in range |
| `ARCHITECTURE.md` | the pool cut was **not on the diagram at all** — the largest single loss in the product, absent from the architecture doc. Added, with pipeline.ts:1759. The caps line carried five constants' VALUES and now carries their order. The "a longer menu is measured dead" row is retracted, with the reason |
| `poolRecall.ts` | two present-tense "`VERDICT_POOL` = 18" in the module written because a hand-typed base rate goes stale silently when a cap moves |

**Not changed, deliberately.** `WRITER_CANDIDATE_CAP` (wsGI's). `AGENT_SELECT_DEPTH`
(wider is a different decision, and it is the next one). `MAX_TOKENS_BY_EFFORT`
(§4). Anything above the cut (wsGL's) — and `accessiblePool` still deletes the
answer for 79 of 897 founders before any K applies, which no depth recovers.

**A finding for wsGI, not a change of mine.** The sweep moves the largest loss
off the cut and onto the writer's cap: at K=40 the funnel reads 66.7% at the cut
and **38.6%** after `orderMemoCandidates` cuts to 8. That is now **28.1 points**
in one row, the largest in the product, and it is a cut of 40 down to 8 sitting
directly in front of a table that publishes 7. It was 11.3 points before this
change. It is theirs.

## 6. Build state

`npm run check` and `check_recall_floor` are reported in the commits; **no floor
was adjusted and nothing was published** — every guard run in this worktree set
`GUARD_NO_PUBLISH=1`, so the shared feed still carries what `main` last said,
which is the honest state for a branch.

`check_recall_floor` after the `lib/intelligence/` edits — **all floors met, and
not one figure moved**: pool 98% (floor 93), exact5 25% (15), regime5 68% (58),
87% (78), 33% (21), 80% (68). It is insensitive to this change by construction:
its `pool` counts the candidate table and its EXACT@5 reads the instant screen's
six rows, both of which sit outside this cut.

`npm run check`, run on this branch and on a `main` worktree with the same
`GUARD_NO_PUBLISH=1`:

```
branch   10 of 51 failed: a comparator asks the rule's question, theme index is
                          not stale, a filter can admit someone, open questions
                          still cover the corpus, a winner is never gated out of
                          the memo, asking a question never costs a fund, gate
                          pertinence, applicant identity, site serves the ETL's
                          corpus, published verdicts
main     10 of 51 failed: (byte-identical list)
```

**No new red.** The one that most looks like mine is not: `a winner is never
gated out of the memo` reads 274 against a ceiling of 207 on this branch and
**274 on `main`** — it measures `accessiblePool`, which runs before this cut, and
`check_winner_not_gated.ts` never imports `VERDICT_POOL`. That is wsGL's ground.

`published verdicts` fails on both, on `main` for the pre-existing census
DEGRADED. On this branch it additionally reports DRIFTED for six guards, which is
the correct and expected consequence of editing `lib/intelligence/` with
`GUARD_NO_PUBLISH=1`: the fingerprints moved and this worktree deliberately did
not re-stamp the shared feed under `main`'s name. It clears when the guards run
from `main` after a merge.

`npx tsc --noEmit` clean; `npx vitest run` 641 of 641.

---

## 7. What happens next, and who owns it

1. **The paid run** — item 2 of `AWAITING_APPROVAL.md`, EUR 11-13, unchanged in
   design. Raise `MAX_TOKENS_BY_EFFORT` first and report the truncation count as
   a void check (§4). Read the **population** figure, `ceiling x conditional`,
   never the in-pool one: the two arms condition on different ceilings.
2. **`all` is one clause away** and worth another 12.8 points of ceiling. It
   needs `AGENT_SELECT_DEPTH` moved with it and 60/`all` measured onto the curve.
   Settle the model's behaviour at 40 first.
3. **The writer's cap is now what binds** — 28.1 points in one row. wsGI's.
4. **`accessiblePool` still deletes the answer for 79 of 897** before any K
   applies, and no depth recovers one. wsGL's.
