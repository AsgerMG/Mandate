# wsHL — the fact could not act because it never reached the model that writes the brief

**FOR THE OWNER, VERBATIM.** **The memo writer was not being told what the
company builds, what the money is for, or where the founder is.** Its founder
block is headed "Scoping profile (structured intake, AUTHORITATIVE)", it was a
hand-kept list of twenty lines, and measured field by field against the
product's own exhaustive table it was short of SEVEN intake fields — including
`sector`, `useOfFunds` and `region`, which are three of the six the code itself
declares as ranking fields and all three of which are asked on **screen one**.
`sector` and `useOfFunds` are by name the two answers `tableInputFromAnswers`
was written to stop losing; that repair fixed the RANKING call sites and left
the PROMPT one, so for as long as it has existed the brief has been written by a
model that was not told two of the six things we ask before showing anything.
Nothing threw. **That is the answer to "why can a fact the founder states not
act": on the shipped path it does not arrive.** The fix is the one this repo has
already made twice — the list is deleted and the block is rendered from
`ANSWER_LABEL`, the table the compiler keeps exhaustive, so a field added
tomorrow is carried with no edit — and a new free guard,
`check_answer_in_prompt.ts`, fails the build if any answered field ever stops
reaching a model-facing block. It is red on the old
prompt (7 fields) and green on the new one. **I also closed the other half of
wsHG's question, and it closes negatively.** The three wires this field has were
priced on wsHA's 287 pairs against wsHH's 50.9% null: the VERDICT wire is inert
*by design and correctly* (15 doors fail their own useOfFunds gate under the pin
and **0** are removed, because the field is a `choice` and a curable failure must
not delete a fund); `gateFitScorer` tops out at **52.1% with an oracle answer**;
and `objectiveScorer` has real headroom (**61.0%** oracle against **50.9%** at the
pin) but **cannot be rewired**. I built the obvious repair — take the match on the
part of the founder's answer that actually splits the candidates — got net +12
on the same pairs, ran wsHG's own volume control, and it picks the door with the
longer registered purpose list **43 of 56**, and **53 of 53** under a full answer.
**It is wsHG's retired coverage rule with a different face**, and the family is
now closed by argument as well as measurement: more-wins is the breadth prior,
less-wins is jaccard and worth nothing, flat is no signal. `shortlist.ts` is
comment-only in this branch. **The free ladder cannot move and did not need to be
run: `measure_funnel.ts` imports neither `pipeline.ts` nor `knownFacts.ts`, and
its own text says every stage below `pool_cut` is "the code's own order with no
model in it."** The change is behind `PROFILE_BLOCK`, **default `complete`**, and I
propose leaving it on: a true answer the founder gave cannot make an
AUTHORITATIVE block less correct, and the alternative is to keep asking six
questions on screen one and forward three of them.

---

```
run                 2026-08-18, isolated worktree wsHL-wiring
cost                ZERO. No paid model call, no embedding, no production write.
                    ANTHROPIC_API_KEY and VOYAGE_KEY are deleted before import in
                    the probe; Postgres is read and never written.
population          wsHA's 287 committed sibling-miss pairs, read and never
                    re-derived. Same evidence file as wsHG §4 and wsHH.
corpus              postgres instruments=1088, gates hydrated for all of them
bar                 50.9% — wsHH's null on this population (the door's NAME
                    re-embedded), NOT 44.9% and NOT 50%
reproduce           npx tsx scripts/_wshl_wiring.ts          (free, ~2 min)
                    npx tsx scripts/check_answer_in_prompt.ts             (free, offline)
                    PROFILE_BLOCK=shipped npx tsx scripts/check_answer_in_prompt.ts
```

---

## 1. The defect, and how it was found rather than guessed

wsHG's question was why a perfect `useOfFunds` answer buys nothing. It named two
paths, one inert and one nearly so. This workstream priced both, found a third,
and then found that none of them was the reason — because there is a fourth
consumer neither wsHG nor any guard in the repo can see.

`check_gate_field_reach.ts` asks whether an answer can reach the evaluator.
`check_answer_reach.ts` asks whether anything then DOES something with it, and
proves that against the ROWS. **Neither can see the model that writes the brief**,
and on this product that is the decisive one: no model ranks today, so the
writer is the de facto selector.

What the writer knows about the founder is one string, built by
`eligibilityContext` in `pipeline.ts`. Compared field by field against
`ANSWER_LABEL` — which is keyed on `keyof EligibilityAnswers`, so the compiler
demands an entry for every intake field and the comparison is exhaustive by
construction:

```
field                    ranks?  writer block   adaptive round
ticketBand               true    yes            yes
sector                   true    ██ NO          yes
useOfFunds               true    ██ NO          yes
region                   true    ██ NO          ██ NO
consortium               true    yes            yes
entityCountries          true    yes            yes
activities               false   NO             yes
exclusionFlags           false   NO             NO
institutionalOwner       false   NO             NO
balanceBand              false   NO             NO
(15 others)                      yes            yes
```

Three of the six `ranks: true` fields, all three asked on screen one, absent
from the block the prompt itself labels AUTHORITATIVE. `region` was missing from
both, and `check_answer_reach`'s own docstring calls it "the single biggest
measured lever in the product".

**This is not a new defect class. It is the same one, one layer up.**
`ANSWER_USE`'s docstring lists four answers lost in one week and the fourth
entry reads: *"sector and useOfFunds reached `computeVerdict`'s table and NOT the
memo's, because the two call sites hand-maintained the same object literal and
one had lost two keys."* `tableInputFromAnswers` was written to make that
impossible. It made it impossible **for the ranking inputs**. The prompt was a
third copy nobody counted, and it had lost the same two keys plus a third.

`knownFacts.ts` is the proof that the repair was intended and abandoned
half-done: its docstring says "This block used to be a private helper of the
memo writer", and its `heading` parameter exists so "the writer can keep its
established 'Scoping profile' wording". The writer never called it.

## 2. The fix, and why it is a property

The list is gone. `intakeFactLines(e)` renders every field the founder answered,
in the words `ANSWER_LABEL` gives, for both the writer and the adaptive round —
the same shape `intakeAnswerLines` in `agentSelect.ts` already uses for the
selector, and for the same stated reason. A field added to the intake tomorrow
reaches every model with no edit anywhere.

Two things are deliberately kept:

- **The consequence lines.** "FLAG: accumulated losses may exceed half of share
  capital (undertaking-in-difficulty risk…)" is not a restatement of the answer,
  it is what the answer MEANS for aid law, and it is the one line that changes
  what a writer may claim. Dropping it when the list became a property would
  have traded one silent loss for another.
- **`region` rendered as `DE7 (Hessen)`.** The identical rendering, for the
  identical reason, as `namedRegion` in agentSelect: the founder answered with
  the code the question offered and every candidate row names the same place in
  words, so a model handed one of the two cannot see that they match. Keyed on
  `FIELD_VALUE_DOMAIN`, not on the field name.

**And a guard, because a property nobody checks is a comment.**
`check_answer_in_prompt.ts` builds both model-facing blocks for a probe founder
answered from the product's own vocabulary and fails the build on any field
whose value never appears. It matches through `sayIntakeValue` — the product's
OWN rendering of the value — so rewording a label keeps it green and dropping a
field turns it red, which is the split that matters. `unreachable` and `staged`
fields are skipped by reading `FIELD_REACH`, never by a list here, so the day a
staged field is switched on it is graded like any other.

It reproduces the defect it was written for:

```
PROFILE_BLOCK=shipped      memo writer 16/23 fields stated, exit 1
                           MISSING sector, useOfFunds, region, balanceBand,
                                   activities, exclusionFlags, conditionality
PROFILE_BLOCK=complete     memo writer 23/23, adaptive round 23/23, exit 0
```

## 3. The three wires, priced — the other half of wsHG's question

All free, all on wsHA's own 287 pairs, all through the SHIPPED functions rather
than re-implementations of them. A pair the signal is silent on scores 0.5,
because that is what the founder gets: the sort falls through to the next key.

```
wire                                            at the PIN     with an ORACLE answer
VERDICT   assessInstrument -> accessiblePool        50.0%              50.0%
GATE FIT  gateFitScorer, within a regime            49.7%              52.1%
REGISTER  objectiveScorer, registered purpose       50.9%              61.0%

wsHH's null on this population                      50.9%
```

**The verdict wire is inert by design, and it is right.** `useOfFunds` is a
`choice` field in `FIELD_SEVERITY`, so one failing useOfFunds gate is
`one_blocker` and `accessiblePool` deletes only `blocked`. Measured: **15 doors
carry a useOfFunds gate that FAILS the pin, and 0 of the 15 are removed.** wsHG
read the 59 hard filters as firing zero times; they fire, they just cannot
delete a fund alone — and they must not, because a founder can reframe what the
money pays for and a deleted row is one the founder never learns existed. There
is nothing to fix here and making the field structural would be a defect.

**The gate wire is empty.** Scored as a source of a door's declared purpose in
place of the register, the funds' own encoded `useOfFunds` demands separate **2
of 287 pairs** (52.1% is `gateFitScorer`'s oracle, not the gates' own). Only 57
pairs carry such a gate at all, and on 17 of them both doors make the same
demand.

**The register wire has the headroom and cannot be rewired.** See §4.

## 4. The repair that is the retired repair — closed by argument this time

`objectiveScorer` matches on OVERLAP: `reg.some(u => answer.includes(u))`, a
disjunction against a disjunction. `useOfFunds` is a MULTI-SELECT — types.ts's
own words are "real projects span several" — so every option a founder
truthfully ticks makes the term less able to tell two doors apart. Over every
subset of the vocabulary of each size:

```
|answer|      1     2     3     4     5     6     7     8
pairs        31.1  31.7  26.7  20.8  15.0   9.5   4.4   0.0
separated
```

**A founder who ticks every true thing about their project is scored exactly as
one who declined to answer.** That reads like a defect with an obvious fix: take
the match on the part of their answer that actually splits the candidates, since
a purpose every candidate registers separates nobody. It invents nothing — every
purpose used is one the founder stated.

Built, priced, and **retired by wsHG's own control**:

```
                     separated   net    picked door's registered list
PIN       shipped        21      +5     LONGER 20, shorter  0, equal 1
PIN       splitting      56     +12     LONGER 43, shorter  4, equal 9
ALL EIGHT shipped         0      +0     —
ALL EIGHT splitting      53      +9     LONGER 53, shorter  0, equal 0
```

It is `|reg ∩ answer|` — wsHG's COVERAGE, priced at +14 and killed — reached by a
different route. **Do not build it a third time.** The family is now closed by
argument rather than only by measurement: within a pair the founder's answer is
fixed, so any rule over the door's registered set is monotone increasing in that
set's size (overlap, coverage: the breadth prior, forbidden as a row signal by
`proximity_wsGX`), monotone decreasing (jaccard: wsHG measured it worth exactly
nothing), or flat (a constant, which ranks nothing). There is no third
direction. That closure is recorded in `shortlist.ts` itself, above the
function, so the next workstream meets it before the idea.

Note also what the shipped rule's own +5 is: of the 21 pairs it separates under
the pin it picks the more broadly notified door on **20**. A registered purpose
list is the GBER articles a scheme was notified under, and the won door averages
3.11 against the shown door's 2.77. **A constant answer through a binary match
term can only ever express a base rate.** The harness pins this field, so
`objectiveScorer` as measured is wsGX's population prior — which is a second,
independent reason wsHG's arm moved nothing.

## 5. The funnel, before and after

**Unchanged, and provably so rather than by re-running it.** `measure_funnel.ts`
imports neither `pipeline.ts` nor `knownFacts.ts`, and its own comment at the
model row states that every stage between `pool_cut` and the end is "the code's
own order with no model in it". The change is entirely inside a model prompt, so
there is no path from it to any row below. `shortlist.ts`'s diff against `main`
contains **zero non-comment lines**, so EXACT@5, REGIME@5, CHANNEL@5 and
concentration are unchanged by construction and no arm of the deterministic
ranker moved.

The standing funnel this branch does not touch (`one_funnel/latest.md`, draw
13cb71cf3a1d1847, 897 founders, AWARD_TERM=oneside):

| stage | founders | of start |
|---|---:|---:|
| answer key | 897 | 100.0% |
| in corpus | 897 | 100.0% |
| publishable | 828 | 92.3% |
| liveness confirmed | 828 | 92.3% |
| founder screen | 806 | 89.9% |
| gates pass (accessiblePool) | 774 | 86.3% |
| pool cut (40) | 657 | 73.2% |
| writer cap (8) | 377 | 42.0% |
| published (7) | 361 | 40.2% |
| top 6 | 343 | 38.2% |
| top 5 | 322 | 35.9% |

**This is the case the brief pre-authorised: the free ladder has no model in it,
so a prompt fix cannot show there.** What it buys is that the paid run now grades
a writer that knows what the company builds and what the money is for.

## 6. The flag, and the default I propose

```
PROFILE_BLOCK=complete   DEFAULT. Every answered field, rendered from ANSWER_LABEL.
PROFILE_BLOCK=shipped    the hand-kept twenty-line list, bit for bit, so a run can
                         reproduce a prompt from before 2026-08-18.
```

**Default ON.** The evidence is not a gain measurement — there is no free one to
be had — it is that the block is labelled AUTHORITATIVE and was missing three of
the six answers the code itself declares as ranking, two of them from screen
one. A true answer the founder gave cannot make an authoritative block less
correct, and the cost is a handful of prompt lines against a forty-row menu
(`tokens_wsHI` sized that ceiling). The arm exists so the confirming paid run can
be paired against the old prompt, not because the omission is defensible.

**What would prove this wrong:** a paired paid run where `complete` publishes a
worse table than `shipped`. That is the one measurement this workstream cannot
make, and it is exactly the run the owner is about to buy.

---

## Files

- `README.md` — this finding.
- `wiring_probe.txt` — §3, §4 in full: all ten sections of the probe.
- `guard_before.txt` / `guard_after.txt` — the new guard on both arms.

## What changed in the product

- **`lib/intelligence/knownFacts.ts`** — the list is gone; `intakeFactLines` is a
  property over `ANSWER_LABEL`. `sayIntakeValue` exported so the guard matches
  the product's own rendering. Region rendered `DE7 (Hessen)`.
- **`lib/intelligence/pipeline.ts`** — `eligibilityContext` behind `PROFILE_BLOCK`,
  default `complete`; `scopingProfileBlock` exported for the guard.
- **`scripts/check_answer_in_prompt.ts`** — new, free, offline, in `npm run check`
  immediately after `check_answer_reach`.
- **`lib/intelligence/shortlist.ts`** — COMMENT ONLY. The closure above
  `objectiveScorer`, so the match rule is not rebuilt a third time.

## Reproduction

- **`website/frontend/scripts/_wshl_wiring.ts`** — the whole measurement. Postgres
  reads only; `ANTHROPIC_API_KEY` and `VOYAGE_KEY` deleted before import.
  `npx tsx scripts/_wshl_wiring.ts`
- **`website/frontend/scripts/check_answer_in_prompt.ts`** — the guard. No
  credentials at all. `npx tsx scripts/check_answer_in_prompt.ts`
