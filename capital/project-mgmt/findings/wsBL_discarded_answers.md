# Workstream BL — the answers we collect and do not read

2026-08-08/09. Branch `wsBL-discarded-answers`.

Assigned two findings. Found five, of which the two largest were not on the
list, and the reason they were not is the finding under the findings.

---

## The class

Four times this month an answer a founder gave was collected, threaded through
the code, and read by nothing on the path that decides what they are shown.

| | what was lost | how it looked |
|---|---|---|
| `region` | 193 rules on 163 funds never fired; the adaptive round then asked for it again | asked, answered, merged, dropped one line before the sanitiser |
| `ticketFit` | founders asking for >EUR 50M and <EUR 500k were shown the identical five rows | computed, named, and left out of the returned expression |
| `consortiumOk` | nothing | destructured in `selectInstrumentRows` and read by nothing there |
| `prior` | nothing | computed every request under a comment saying it was applied |

Every one was invisible *because the value was present*. None is detectable by
reading a signature, an import or a destructure. `ticketFit` was one token from
being used.

---

## What this workstream found

### 1. `prior` — computed, discarded, and its comment lied (as reported)

`materialiseInstrumentTable` computed `channelPrior(...)` on every request and
read it nowhere, under a comment opening *"The prior belongs HERE"*. Forty
lines later, inside `rowRelevance`, a second comment recorded the three
measurements that say it must **not** be applied (flat 0.5: national regime
64→100%, EU 77→15%; 0.15 with text: net 73→72%).

Two comments in one function, contradicting each other, one of them the first
thing a reader meets. Deleted the computation; the surviving comment now says
what is true and points at the measurements.

**No behaviour change.**

### 2. `consortiumOk` — half a finding, and the other half was worse

*The reported half.* `selectInstrumentRows` destructured `consortiumOk` and
never read it. Removed, with the reason it is absent written in its place
(selection deliberately admits consortium-heavy channels for everyone; the row
sort demotes them).

*Should it rank?* **Yes, and it already does.** The corpus holds **83 encoded
comparators on 54 instruments** keyed to `consortium` — Horizon Pillar II, the
Joint Undertakings, EDF, IPCEI, EIT KICs, Eurostars — all of the form *"must
apply as part of a 3+ partner consortium"*. The field is reachable
(`check_gate_field_reach` passes it), it reaches `gateFitScorer`, and it reaches
the `demote` predicate in the row sort. So the honest fix was **not** to stop
asking.

*The half that was not reported.* The mapping was
`consortiumOk: eligibility?.consortium !== "no"`. `consortium` is asked in the
**adaptive** round, so on a first pass it is `undefined` — and
`undefined !== "no"` is `true`. Every founder who had not yet been asked was
recorded as **confidently consortium-ready**, and the one predicate that reads
the field then exempted Horizon/JU/EDF/IPCEI rows from demotion for all of
them. This is worse than discarding an answer: it is *forging* one. Now a real
tri-state.

`fit.ts` had it right all along (`yes → true`, `no → false`, else `undefined`,
with `structureFit` treating undefined as 0.6). Two mappings of one answer, and
the one on the row path was the wrong one.

### 3. The memo ranked without the founder's sector or what the money was for

Not reported, and the largest of the five.

`InstrumentTableInput` was built by hand at two call sites in `pipeline.ts` —
one in `computeVerdict` (the instant path), one in the memo. The literals had
drifted. The **memo** passed neither `founderSector` nor `useOfFunds`.

Both are asked on **screen one**, among only six questions a founder answers
before seeing anything. Both rank: `sector` is `(1 - wTheme)` of every row's
base score through `sectorFit`, and `useOfFunds` is the entirety of
`objectiveScorer` in the sibling reassignment. So the founder's instant verdict
was ranked on what they build and what the money is for, and **the memo — the
thing that actually ships to them — was ranked on neither**. It used the
neutral value, which is indistinguishable from a founder who declined to answer.

Nothing failed. There is no test that would have caught it, because both fields
are optional by design and the recall harness grades `computeVerdict`, which is
the path that *had* them.

One `tableInputFromAnswers` now serves both call sites.

### 4. `capitalMismatch` — computed, discarded, superseded

`pipeline.ts` computed a `capitalMismatch` predicate for every row, read by
nothing since *"Phase 4: the score selects, the writer writes"*. Confirmed
genuinely superseded — the judgement is `scoreFit`'s `capital` component
(fit.ts, weight 0.08) — and deleted.

### 5. `topicSignature` — a documented defence that is not running

`adaptiveRound.ts` defines a complete, documented function that dedupes two
phrasings of the same question, whose own docstring says *"a live round shipped
both"*. **Nothing calls it.** The defect it prevents is real, the prevention is
present, and it has never executed.

Left in place and suppressed **with the finding written beside it**, because
restoring it changes which questions a founder is asked — the adaptive round's
own measured surface, owned by AY/BH, and it needs a live round to verify. Same
for `gateKeys`, built for the round-2 schema and never placed in it (likely a
half-finished workaround for the recorded gotcha that array
`minItems`/`maxItems` 400s an Anthropic structured-output schema).

---

## The deliverable: two guards, because the class has two shapes

`check_gate_field_reach.ts` (workstream AX) already answers *can an answer
reach the evaluator*. It cannot answer the next question down, and that gap is
where all five of these lived.

### `ANSWER_USE` + `scripts/check_answer_reach.ts` — collected and discarded

> An answer the intake collects must be read by the code that RANKS, or be
> declared collected-for-the-memo-only with a reason.

`ANSWER_USE` is keyed on `keyof EligibilityAnswers`, so the compiler refuses a
new intake field until someone classifies it. The check then **proves** the
claim rather than trusting it: for three probe founders it builds the published
table under every legal answer to each field, through the production mapping
and the production entry point, and a `ranks: true` that moves no row for any
founder **fails the build**.

`ranks: false` is not the free direction. The field must still be read by
something the founder sees — it must move `evaluateEligibility`, or carry an
encoded comparator in the corpus (which means the screen reads it whenever such
an instrument is on the table, and `check_gate_field_reach` has already proved
the answer survives the sanitiser to get there). A field that moves nothing at
all fails.

No field name is enumerated in the check. Answers come from the product's own
vocabulary, and — for the two fields with no fixed option list, which is
*exactly* where `region` hid, since `check_vocabularies` skips them — from what
the funds themselves demand in their encoded comparators.

**Measured result, 23 collected fields (2 more are declared unreachable and
belong to the reach check):**

- **11 move the published rows**: `ticketBand`, `sector`, `useOfFunds`,
  `region`, `entityCountries`, `consortium`, `activities`, `exclusionFlags`,
  `fteBand`, `lossesOverHalfCapital`, `borrowerModel`.
- **12 do not**, and each now carries a written reason. The pattern is
  structural, not a wiring bug: `gateFitScorer` re-ranks only *within* a group
  of same-regime siblings and only when two of them disagree, so a field with
  single-digit comparators spread across regimes with no siblings has nothing
  to separate. These are the SME-status, ownership and commitment questions,
  and what they produce is a blocker with a cure — the part of the brief a
  founder can act on.

The honest limit: the existential is over three probe founders. A field that
ranks only for founders unlike them will read as memo-only. The guard catches
total discard, which is what all five defects were.

### `no-unused-vars` is an error in `lib/` — computed and discarded

The five unused values were already listed in `eslint.config.mjs`, as warnings,
with a one-line note each explaining that each was "a finding rather than a
tidy-up". Three of them turned out to be founder-facing defects. The note was
correct and it changed nothing, because a warning in a list of warnings is not
a guard.

It is an error under `lib/` now. Suppression stays possible and costs an inline
disable **with the reason at the site**, which is strictly better than a
warning: the reason ends up where the next reader is standing.

This catches the `prior` / `consortiumOk` / `ticketFit` shape. It cannot catch
the `region` / memo-drift shape. The two guards together cover the class.

---

## Measurement

`measure_recall.ts`, holdout, N=300, three seeds. Floors 93 / 22 / 80.

| seed | pool | EXACT@5 | REGIME@5 |
|---|---|---|---|
| 20260806 | 95% | 26% | 82% |
| 7 | 95% | 29% | 85% |
| 99 | 95% | 31% | 86% |

Within the documented baseline (94-97 / 26-31 / 82-86) and clear of every
floor. Per-country and per-regime-size strata unchanged.

### The consortium change had to be measured separately, and here is why

`measure_recall` has pinned `consortium: "yes"` for every replayed founder
since it was written. A field held constant across a population **cannot move a
number measured over that population** — the same trap that hid `ticketFit`,
whose own commit reported "the number stayed flat" and was right for the wrong
reason.

So `measure_recall` gains `CONSORTIUM=yes|no|unsure|none` (default unchanged,
so every previously published number stays reproducible). `none` replays the
founder this product actually meets on a first pass: `consortium` is adaptive,
so on the instant path **nobody has answered it**.

Seed 20260806, N=300, holdout:

| | pool | EXACT@5 | REGIME@5 |
|---|---|---|---|
| `consortium=yes` (= the old mapping's behaviour for an unanswered founder) | 95% | 26% | 82% |
| `consortium=none` (the new tri-state: unanswered demotes consortium rows) | 95% | **28%** | 82% |

Net: EXACT@5 +2, REGIME@5 flat, pool flat. Per regime-size stratum the trade is
much larger than the net: standalone regimes 28→67% EXACT (n=18), regimes 6-20
23→13% EXACT and 48→28% REGIME (n=40). That is the population-trade shape this
repo has rejected before — except here it is the *correct semantics* being
restored rather than a signal being added, and the net is positive on EXACT and
neutral on REGIME.

**If the remaining seeds do not hold, the tri-state stays anyway and the demote
is what should be revisited**: `undefined !== "no"` was never a decision. It
was JavaScript truthiness standing in for one.

---

## What I did not do, and why

- **Did not stop asking about consortium.** The brief said that would be the
  honest fix if nothing encoded consortium requirements. 83 comparators on 54
  instruments encode them.
- **Did not restore `topicSignature`'s dedupe.** Real defect, wrong workstream,
  needs a live adaptive round to verify.
- **Did not re-apply the channel prior.** Three measurements say not to. The
  note now sits where the temptation is.
