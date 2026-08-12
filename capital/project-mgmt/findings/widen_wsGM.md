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
