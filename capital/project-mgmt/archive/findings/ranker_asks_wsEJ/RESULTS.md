# wsEJ — the ranker's question turn: built, rendered, unrun

The owner's architecture has four steps and the third did not exist: a fixed
first screen, a subset the ranker is handed, **questions the ranker writes after
looking at that subset**, then the ranking over both rounds. Screen two's
questions are written today by a separate planner, before anything has looked at
the candidates. This is the other arrangement.

Off by default (`RANKER_ASKS=off`). No model call has been made.

## What the stage is

Two halves, and the split is the design.

**Code decides the subject.** `separatingDemands()` in `lib/intelligence/rankerAsks.ts`
runs the owner's three legs over the candidates actually in front of the founder:

- **imposed** — a `filter` gate on a real candidate, with that fund's own
  verbatim requirement and a locator. No gate, no question.
- **unknown** — the intake field the gate's own `valueSpec` is keyed on holds no
  answer today. Same predicate the verdict engine uses to decide it cannot judge,
  so "we hold this" and "the answer would be read" cannot drift apart.
- **decisive** — every admissible answer is simulated through `assessAll` over
  the whole window. The demand survives only if two answers leave the candidate
  list in different qualification states. This is the leg that cuts.

Nothing here enumerates fields or question shapes; it is a counterfactual over
this founder's own answers, so it holds for a fund, a field and a comparator
nobody has looked at.

**The model decides only what a founder can answer**, from that computed list,
in the founder's words, up to a ceiling of four, and returning **none** is a
valid reply. Every question carries its demand reference and the candidates it
claims to move; `rankerAskChecks.ts` drops any that does not.

Contract `contracts/ranker/asks.md` (id `RA`, stage `ranker.asks`), routed
through a new `asker` prompt in `PROMPTS`. `RA-1`, `RA-2`, `RA-3` and `RA-B1`
are enforced; `RA-4` to `RA-8` are declared in `unenforcedRules.ts`.
`check_contracts` is green at 10 contracts, 101 rules, 31 enforced.

## What it would ask, for the twelve archetypes

`QUESTIONS_screen1.md` — the top four demands per archetype, each beside the
verbatim requirement that motivated it and the candidates it moves.
`DEMANDS_screen1.md` — every surviving demand. `<company>/prompt.txt` — the
exact bytes the model would receive. Produced by `scripts/_wsej_asks.ts`, which
makes no Anthropic call.

Twelve of twelve founders have at least one demand that changes the outcome, and
twelve of twelve have at least one that **separates** rather than merely
narrows.

## The three findings

**1. Every question is answerable — and none of them is about what the company
does.** The whole surface across twelve archetypes is seven fields: consortium,
exclusion flags, regulated activities, region, co-financing, ownership/control,
turnover. A founder can answer all of these from memory. That is the good news
and it is also the ceiling: the encoded corpus can say who is *excluded*, and it
holds almost nothing that says which of two open funds is *for* this company.
The failure the brief warned about does not appear as an unanswerable question;
it appears as a question surface that never reaches the topic axis at all.

**2. Narrowing is not separating, and the distinction had to be built.** Under
the naive reading of leg 3, a question that removes twelve candidates and
promotes none passes. It changes the set, and it can never tell a founder which
open fund is theirs. The module now classifies each demand by whether two
answers *invert* the order of two candidates, and the score doubles for those.
Of the leading demands, the financial-distress question is narrowing-only on
five of twelve archetypes.

**3. Putting the question next to the requirement makes gate mis-encoding
visible, and three archetypes would be asked a question that does not answer its
own rule.** Neura Robotics and BioNTech would be asked *"Does any single
shareholder own more than 25% of your company?"* against a requirement about
entities more than 50% owned from one specific state. Corti would be asked the
same question against a rule about majority public-sector ownership. The
`nonEuControl` question is broader than the rule it is applied to, so a
truthfully answered "yes" from a US-owned company drops four candidates it should
not. None of this is visible under the current planner, because the question
never sits beside the sentence. **This is a gate-encoding defect, not a defect in
this stage, and it is the first thing this stage found.**

## Cost

Measured off the twelve rendered prompts: system 10,973 chars, user prompt
median 16,727 and worst 22,016. At Sonnet 5 with thinking disabled and a ~700
token reply:

- median **EUR 0.021** per brief, worst case EUR 0.023.

Against the ~EUR 0.04 target and the EUR 0.50 ceiling. Added to the adviser
ranker this is a two-call brief at roughly EUR 0.034 (ranker at effort `low`) or
EUR 0.105 (effort `high`).

## The paid comparison, designed and NOT run

Population: the 45 tune founders wsDR and wsDQ used (`cross_regime_summary`
descriptions of 320+ chars, one per country|sector), so the number sits beside
the existing ones rather than near them. Both arms off one pool object per
founder, as `_wsdr_seam.ts` does, because a sequential before/after on the
shared database is not a control.

- **A (control)** `AGENT_SELECT=adviser`, first-screen answers only.
- **B (treatment)** `RANKER_ASKS=on`, the ask turn, the answers supplied by
  `scripts/founderIntake.ts` from the founder's own record, then the same ranker
  over the same pool builder with those answers merged in.

Two numbers, and the second is a veto:

- **EXACT@6** — the fund the company actually won, in the published six.
- **POOL RECALL, both arms.** The ask turn changes `EligibilityAnswers`, which
  feeds `accessiblePool`, so unlike the ranking seam it *can* remove the won
  fund. The exclusion-flags question closes up to 17 of 18 candidates on one
  answer. If the won fund survives less often under B, no ranking gain redeems
  it.

Pre-registered decision rule: ship only if EXACT@6 rises **and** pool recall does
not fall.

Cost, at ranker effort `low` (the level to run first — wsDS measured that the
thinking lever moves spend and not the metric):

- B: 45 x (0.021 ask + ~0.010 founder answer + 0.013 rank) = **EUR 1.98**
- A: 45 x 0.013 = **EUR 0.59**
- total **~EUR 2.6**. At effort `high` the same design costs ~EUR 9.0.

## Guards

`npx tsc --noEmit` clean · `npx vitest run` 516/516 (one pinned Banned-rule count
moved 15 -> 16 for `RA-B1`) · `check_contracts` ok · `check_client_boundary` ok ·
`check_recall_leaks` ok, 0 leaks · `check_answer_not_reachable` ok, 50 modules.
`check_recall_floor` not run.
