# wsIV — step 3 asks for the project, and the answer reaches the ranking

**The load-bearing question was: can a round-2 answer reach the theme embedding
at all?** Today, no. It can be made to, and the change is small, because the
only string the cosine is taken against is `description` — which is already a
field a founder's own request carries.

---

## 1. Where a round-2 answer goes today, read off the code

`planAdaptiveScreen` returns `questions` (fixed answer space) and
`projectQuestions` (written options). The panel merges the first half into
`EligibilityAnswers` and files the second half as `ProjectAnswer[]`. A
`ProjectAnswer` is read in exactly these places:

| site | what it feeds |
|---|---|
| `pipeline.ts:979` | the memo writer's `projectAnswers` block |
| `pipeline.ts:1024` | the memo writer's `commercialAnswers` block |
| `pipeline.ts:1848` | `judgeOpenAnswers` — open answers only, and only to reorder siblings |
| `agentSelect.ts:2051` | the selector's `round-two answers` context block |
| `ease.ts:103` | the ease score |
| `memoCandidates.ts:560` | candidate assembly |

**`semanticFundMatch` and `themeRelevance` are not on that list, and cannot be
reached from it.** Both take one argument, `req.description`
(`pipeline.ts:1728`, `1832`; `shortlist.ts` then calls `themeRelevance(
description, …)` as the offline fallback). The type says so itself: a
`ProjectAnswer` is "writer context and ease-scoring input only — deliberately
NOT part of EligibilityAnswers".

So a Pool P question whose answer landed in `projectAnswers` would look
identical on screen, pass every existing test, and buy **nothing** in the
ranking. That is the shape of all four defects `check_answer_reach.ts` exists
for.

### What that costs the founder Pool P is for

`selectLeafInstruments` scores a candidate as

```
(THEME_WEIGHT * rel(i) + (1 - THEME_WEIGHT) * sectorFor(i)) * objectiveFor(i)
```

`rel(i)` reads a map that **both** matchers return EMPTY for a description
under `MIN_MATCHABLE_DESCRIPTION_CHARS`. For a founder who skipped the box,
`rel(i)` is 0 for every candidate, so 0.6 of the score is a constant zero and
the leaf ordering is sector share times the objective scorer, alone. Every
other question on screen two is being answered into the remaining 0.4.

## 2. What was built

`PROJECT_QUESTION_ARM`, **default off**. When it is on AND the description is
under `USEFUL_DESCRIPTION_CHARS`, `planAdaptiveScreen` gains Pool P: one
prose question, seat-reserved the same way Pool D's is, asking the founder to
describe their own project — grounded in the ~40 candidates the planner has
just been shown, which is the thing a static form cannot do.

The panel routes its answer into `description`, appended to whatever the
founder typed and capped by `MAX_DESCRIPTION_CHARS`, and threads it to the
memo call as `descriptionOverride` — the same hazard `eligOverride` and
`projectOverride` were threaded for, since `advanceRound` extends the
description and calls `runMemo` in the same tick.

**No new request surface.** `description` is already sendable, so
`check_request_surface` is satisfied without an edit.

### What it displaces

One of six seats, and only on founders under the floor. `contracts/round2`
already says "four questions is the target, six is the ceiling, not the
budget", so what Pool P takes is the sixth — the seat the contract says should
only be spent when it changes which funds come out on top. Pool P changes all
of them rather than resolving one, and it is the only question on the screen
that does. Pool C's floor is also lifted for these founders, in the prompt and
in Q-5's own condition, because on a founder with no description Pool P **is**
the positioning source.

## 3. The free ceiling measurement

`scripts/_wsiv_answer_lift.ts` — four arms, same company, same won fund, on the
ACTIVE recall set (`__recallSetDescribed.json`), holdout, n=300, all 900
requests on EMBEDDING. Full dump: `ceiling_holdout_n300.txt`.

| arm | mean chars | in pool | EXACT@1 | EXACT@5 | REGIME@5 |
|---|---:|---:|---:|---:|---:|
| blank (skipped the box entirely) | 0 | 77.3% | 4.7% | **19.7%** | 56.7% |
| template (canned sector sentence) | 123 | 74.7% | 7.3% | **21.3%** | 62.0% |
| answer (first 90 chars of their own words) | 76 | 76.7% | 9.0% | **23.0%** | 61.0% |
| real (the whole description) | 522 | 77.3% | 8.7% | **23.7%** | 62.7% |

Paired against the founder who wrote nothing:

| arm | lift | discordant | McNemar |
|---|---:|---|---|
| template | +1.7pp | 33 (19 for, 14 against) | z=0.87, p≈0.38 |
| answer | +3.3pp | 42 (26 for, 16 against) | z=1.54, p≈0.12 |
| real | +4.0pp | 44 (28 for, 16 against) | z=1.81, p≈0.07 |

**NOT ONE OF THESE SEPARATES FROM THE BLANK ARM AT n=300, and the headline is
that sentence rather than any of the three numbers.** What the run does
establish is a shape, and the shape is consistent across four arms and three
metrics: the lift is monotone in how much text the founder gives, and the
90-character answer sits at 83% of what the whole 522-character description is
worth. If the effect is real, one short answer captures most of it and the
question does not need a paragraph. That ratio is a ratio of two small
differences and carries all their noise; it is a design input, not a figure to
quote.

**And the gap itself is +4.0pp, not the ~20 points this workstream was briefed
with.** That is the more consequential reading. §5 shows the briefed number
does not reproduce on the recall set that ships, by re-running the script it
came from — so the ceiling on this feature is genuinely small, and the brief's
premise was resting on a retired measurement rather than on this arm being
weak.

### What this CANNOT measure, stated plainly

The `answer` arm is the founder's real words, truncated. It measures **how much
text is needed** and it does not measure **whether a founder would type it**.
Nothing in this product records what a founder does with a question, and the
owner has decided not to start recording it, so the answer rate is unmeasured.
No number above is one, and none should be quoted as one.

## 4. What was seen in a browser

`scripts/_wsiv_look.mjs` renders the real `panel.tsx` with the two intake calls
fulfilled from a canned body over CDP — the real component, zero model calls.
`round_1440.png` and `round_390.png`.

- The Pool P question renders as a prose box with its stake ("Re-ranks every
  fund on this list, not just one") and, correctly, **no citation line**: it is
  grounded in no fund and must not look as if it were.
- It leads the "About your project" block, above the gate and commercial
  questions.
- At 390 the screen has no horizontal overflow and the box is legible.
- **The intake nudge is intact and was watched working**: press one on a thin
  box is "Continue", press two is "Continue anyway", and it genuinely submits.
  That founder is exactly who Pool P is the second chance for.
- **Seen and NOT changed:** the panel renders the generic half above "About
  your project", so on a phone the founder scrolls past three eligibility
  questions before meeting the one that re-ranks everything. Pool P leads its
  own half; moving the whole section changes the screen for every founder,
  which is a measured surface and the owner's call.

## 5. Two things in the brief that turned out to be wrong

**`SCREEN_FOR_RANKER` does not default off. It does not exist.** Not as a
constant, not as an env key, nowhere in the tree — `scripts/archive/
retired_check_doc_identifiers.ts` was written about exactly this, after
`ARCHITECTURE.md` named the lever and attached a measurement to it. wsDT's
measurement is real (EUR 0.7325, tag `archive/wsDT-questions-for-ranker`); the
lever never shipped.

**wsDT does not close this route, and the reason is structural rather than
arguable.** Its harness, `_wsdt_screen.ts`, computed
`semanticFundMatch(c.description)` ONCE per company, before either arm ran, and
shared it between them — its own header lists "the semantic match on the
description" among the things held fixed. The answers went to
`intoSelectorPrompt`. So the theme cosine could not move in that experiment by
construction, and its finding is the one its commit message states: *a finding
about the selector*, not about what screen two asks. All twelve of its bench
companies also carried a full description, so the population Pool P exists for
was not in it.

**And the number the product SHOWS A FOUNDER does not reproduce on the recall
set that ships.** This is the most consequential thing this workstream found
and it was not what it was looking for.

The intake tells a founder, in the box, that a description finds the right fund
"about half as often" without one. The contract comment above that copy names
its source exactly: `scripts/measure_description_lift.ts`, EXACT@5 **48.9%**
real vs **21.3%** template, "on the enriched holdout". `__recallSetEnriched.json`
is listed in `RETIRED_RECALL_SETS`.

Re-run **unmodified**, on the ACTIVE set (`__recallSetDescribed.json`), holdout,
n=300 — dump in `description_lift_active_set_n300.txt`:

```
  arm        in pool            EXACT@1            EXACT@5            REGIME@5
  real        232/300 (77.3%)     26/300 (8.7%)     71/300 (23.7%)    188/300 (62.7%)
  template    224/300 (74.7%)     22/300 (7.3%)     64/300 (21.3%)    186/300 (62.0%)

  EXACT@5 lift from the founder's own words: +2.3pp
  discordant 39 (23 for the description, 16 against)
```

**The template arm reproduces to the decimal (21.3%). The real arm is 23.7%,
not 48.9%.** A lift of +2.3pp, not +27.6pp. Independently reproduced by
`_wsiv_answer_lift.ts`, which shares no code path with it beyond
`computeVerdict`.

It is a population change, not a ranker regression, and the script's own
by-source table says which population:

| where the description came from | n | EXACT@5 real vs template |
|---|---:|---|
| `own_award_text` | 147 | 29.3% vs 25.9% = **+3.4pp** |
| `cross_regime_summary` | 113 | 15.0% vs 17.7% = **−2.7pp** |
| `own_project_title` | 31 | 32.3% vs 16.1% = **+16.1pp** |
| `cross_regime_title` | 9 | 11.1% vs 11.1% = +0.0pp |

`__recallSetDescribed.json` built 887 of its 1,898 descriptions by recovering
text from **another regime's** award of the same company, and those rows are
NEGATIVE: a description of a different project is worse than the canned sector
sentence. The retired sets were made almost entirely of the `own_project_title`
rows, which still carry +16.1pp — and which are also the most leak-adjacent
cell in the table, being the title of the very project the fund funded, on
n=31.

**What this does and does not say.** It does NOT say a founder's own words are
worthless: the two own-text cells are both positive and the largest sub-
population is +3.4pp. It says the headline pair on the intake screen is
measured on a set that has been retired, and that the blended figure on the set
that ships is small. **Not changed here** — it is founder-facing copy, the
constant it derives from is a floor this workstream may not move, and `wsIT` is
on the funnel this week.

## 6. What is still unknown

- Whether a real founder answers the question. Unmeasurable today, by decision.
- What the planner actually writes for Pool P. Every question in this
  workstream came from the offline stand-in or the canned body in
  `_wsiv_look.mjs`; the arm has never been run against Haiku, because the
  budget was zero. **One paid intake call on a handful of thin-description
  founders is what turns this from a wired feature into a judged one.**
