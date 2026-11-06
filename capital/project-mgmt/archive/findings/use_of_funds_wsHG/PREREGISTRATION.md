# wsHG — pre-registration, written and committed BEFORE the paid call

**This file is the contract.** It is committed before `_wshg_classify.ts` is run
against a paid endpoint, and it is not edited afterwards except to record which
of its own branches fired. A prior workstream here breached its declared void
condition and had to withdraw a headline; the point of this file is that the
branch is chosen before the number is known.

---

## The question

`door_separation_wsHA/README.md` §6. The corpus declares a different purpose for
the two doors on **86 of 287 (30.0%)** sibling-miss pairs, and `useOfFunds` — the
field that purpose maps onto — is asked on the first page of the intake and is
already wired into the ranking (`objectiveScorer`, `OBJECTIVE_MATCH = 1.35`).
`founderIntake` pins it to `["industrial_research", "experimental_development"]`
for all 897 founders because the only derivation available reads the register's
`objectives_text`, which is a statement about the scheme being predicted.

**This workstream derives it from the founder's OWN DESCRIPTION PROSE instead,
and prices what the signal is worth.**

## What is derived, and from what

One classification call per founder, `claude-haiku-4-5`, structured output.

**The model sees the founder's description string and nothing else.** Not the won
fund, not its id, not its name, not its scheme, not `r.sector`, not
`r.instrumentName`, not `r.descriptionFrom`, not the answer key. The request is
built from a single-key object and the assembled prompt is asserted, in code, to
contain none of those strings before it is sent.

**Why this cannot leak, stated so it can be checked rather than believed.** The
derived field is a pure function of `r.description`, and `r.description` is
already handed to the ranker on every arm of this harness (`semanticFundMatch`,
`buildInstrumentTableHydrated`, `orderMemoCandidates`). A post-processing of an
input the ranker already receives cannot carry more information about the answer
than that input already carries. The description itself clears
`isDescribed()` — `own_project_title_leaks` excluded — and the exact / 8-gram /
sibling bars of `check_recall_leaks`.

## The population this bounds

The 897 held-out, **described**, one-per-company founders the funnel draws, at
fingerprint `13cb71cf3a1d1847`. Their descriptions are recovered from each
company's own award prose under a **different regime** than the fund being
predicted. That prose is a project description; it is not an answer to "what
would this money pay for". **A real founder is asked the question directly and
states it.** Any coverage figure below is therefore a floor on what a real
founder can supply, and any lift measured on it is a lift measured on *derived*
answers.

---

## PRE-REGISTERED OUTCOMES

### 1. Coverage — can the prose yield the field at all

The classifier returns, per founder, a subset of `USE_OF_FUNDS_OPTIONS` plus a
`basis` of `stated` (the text says what the money/work is for), `inferred` (the
text describes the project closely enough that the purpose follows), or
`cannot_tell` (the text says nothing about it). An empty subset is only valid
with `cannot_tell`.

- **PAYS** — a non-empty subset on **≥ 50%** of the 897.
- **DOES NOT PAY** — non-empty on **< 30%**. At that level the derivation cannot
  price the signal on this population, and *that is the finding*: the largest
  identified separator cannot be reached without asking real founders.
- **Between 30% and 50%** — reported as a partial reach; the funnel arm still
  runs, and every figure is quoted over the changed sub-population as well as
  over all 897.

### 2. Door separation — the 86 pairs whose declared purposes differ

Offline, free, on `wsha_door_pairs_2026-08-17.jsonl` joined to
`__objectives.json`. For each pair the derived answer either favours the WON
door (overlaps its registered purpose and not the shown door's), favours the
SHOWN door, or is neutral (both or neither).

The baseline is the **pinned** answer, computed offline and already known:
**won 13, shown 8, both 65, neither 0** — net **+5**.

- **PAYS** — the derived answer favours the won door strictly more often than the
  shown door, **and** its net (won − shown) exceeds the pin's **+5**.
- **DOES NOT PAY** — net ≤ 0, i.e. the derived answer points at the wrong door at
  least as often as the right one.
- **Between 0 and +5** — the signal separates but no better than the constant
  already does; reported as such and not as a win.

Also reported unconditionally, because it bounds the whole route: an oracle
answer could favour the won door on **64 of 86** and the shown door on **55 of
86** (an answer exists for both directions on most pairs). The derived arm is
scored against that ceiling, not against 86.

### 3. The funnel — paired, within-run, on all 897

`USE_OF_FUNDS=<path> npm run stages`. Arm A is the shipped pin; arm B replaces
`useOfFunds` with the derived answer for every founder the classifier gave one,
and keeps the pin for the rest (the same rule `answersFor` uses for `ticketBand`,
so the denominator does not move with the derivation). Both arms run in one
process, on the same draw, the same corpus read and the same embedding.

**The whole ladder is reported for both arms.** No single number is quoted.

- **PAYS** — the six-row channel (`won fund in the rows the brief publishes`)
  rises by **≥ 1.0 point** and **no stage above it falls**.
- **DOES NOT PAY** — |Δ| at six rows **< 1.0 point**.
- **HURTS** — Δ at six rows **≤ −1.0 point**, or any stage above six rows falls.
  A negative result is published with the same prominence as a positive one.

### 4. VOID — the run is discarded and nothing from it is quoted

Any one of these, checked in code and not by eye:

1. The draw fingerprint is not `13cb71cf3a1d1847`. Different founders are not
   comparable with `one_funnel/latest.md` or with wsHA.
2. The ranker attestation reports **any** request not on `EMBEDDING`
   (`requireCleanRanker`), or the store is not Postgres, or `NO_PG` is set.
3. Fewer than 897 founders in the run.
4. **Drift**: any founder whose derived answer set-equals the pin has a
   *different* trace in arm B than in arm A. Those founders are the control —
   the two arms must be byte-identical for them — and a difference means the
   corpus moved between the arms and the delta is a mixture.
5. Not one founder's answer actually changed between the arms. Two identical
   arms reported as "the signal changes nothing" is the worst output available
   here and it is made unreachable rather than caught by reading.
6. Any classifier input is found to contain the won instrument id, the won
   instrument name, or the recall row's `descriptionFrom` / `reattributedFrom`.

## Spend

Authorised: roughly $2–5, one cheap classification call per founder, nothing
else. Estimated at ~897 × (≈850 in + ≈45 out) tokens on `claude-haiku-4-5`
($1.00 / $5.00 per MTok, 2026-08) ≈ **$0.95**. No ranker run, no memo run, no
re-buy. The classifier caches by description hash, so a re-run is free. The
actual figure is printed by the run and reported in the finding.

If the design drifts above ~$8 the run stops and asks.

---

*Committed before the first paid token. Branch taken: recorded in `README.md`.*
