# wsGD — the first factor: is the answer on the list

Everything here is computed from artefacts already paid for. **Nothing in this
workstream spent a cent on Anthropic.** The recall figures are recomputed from
`findings/headtohead_wsGA/adviser_medium_n773_x2.json` (the 773-founder draw,
fingerprint `37e0879c895d4d6a`); the prompt sizes are measured through
production's own exported `buildPrompt` by `scripts/_wsgd_stages.ts`, which
deletes `ANTHROPIC_API_KEY` before importing anything that could use it.

---

## 1. The table

`K` is the number of rows the ranker is handed. On the shipped seam it is
exactly `BRIEF_VERDICT_POOL`, because `agentSelectRows` cuts the menu to
`min(SELECT_DEPTH, rows.length)` and `SELECT_DEPTH` is 40.

| K | mean rows shown | **the answer is on the list** | founders reached (of 773) | ranker call | vs today | full brief |
|---:|---:|---:|---:|---:|---:|---:|
| 6 | 6.0 | 20.2% | 156 | — | — | — |
| **18 (ships)** | 17.9 | **36.7%** | 284 | EUR 0.0626 | — | ~EUR 0.29 |
| 25 | 24.5 | 45.9% | 355 (+71) | EUR 0.0673 | +0.0047 | ~EUR 0.295 |
| 30 | 28.8 | 50.5% | 390 (+106) | EUR 0.0703 | +0.0077 | ~EUR 0.298 |
| **40** | 37.4 | **57.6%** | 445 (+161) | EUR 0.0764 | **+0.0138** | ~EUR 0.304 |
| 50 | 45.8 | 60.0% | 464 (+180) | EUR 0.0824 | +0.0198 | ~EUR 0.310 |
| 60 | 54.0 | 62.6% | 484 (+200) | EUR 0.0882 | +0.0256 | ~EUR 0.316 |
| whole pool (81.5) | 81.5 | **78.3%** | 605 (+321) | EUR 0.1076 | +0.0450 | ~EUR 0.335 |

**Twenty-one points of ceiling cost one and a third euro-cents.** Cost is not
the constraint on this decision and it is not close.

How the euros are derived, so the arithmetic can be checked rather than
believed:

- A menu row is **271 input tokens**, measured across K = 6 → the whole pool on
  production's own prompt builder: 974 chars per row at the 3.6 chars/token
  ratio `_wsei_depth.ts` already uses. (It was ~170 when wsEI measured it; the
  rows got longer because wsDW's legibility repair landed.)
- Sonnet 5 input is $2/M and `USD_TO_EUR` is 0.92 (`cost.ts`), so a row is
  EUR 0.0005.
- 62 of wsGA's 148 calls fired the retrieval round, which re-sends the whole
  prompt, so the menu is billed **1.42x** on average.
- The writer is unaffected. `WRITER_CANDIDATE_CAP` is 8 whatever the pool is, so
  widening buys nothing on the writer's bill either way.

**Two things this price does not include, and both push the same way.** Thinking
is `adaptive` and bills at the OUTPUT rate — 488,444 thinking tokens over 148
calls is EUR 0.030 of the EUR 0.0626, half the call — and nobody has measured
whether a model thinks longer about 40 rows than about 18. And wsGA's own run
declared the VOID condition `no call cut off at max_tokens` **breached, 4 of
148, at a menu of eighteen**. A wider menu makes truncation more likely, and a
truncated call publishes the control under the treatment's name. Any depth arm
must raise `MAX_TOKENS_BY_EFFORT` with the menu and report the truncation count.

---

## 2. Every stage that removes the answer

`scripts/_wsgd_stages.ts`, **n=820 held-out described founders**, one funnel,
one pool object, rank measured at every seam. Free.

| stage | what it is | list length | answer survives | lost here |
|---|---|---:|---:|---:|
| the corpus | 1,088 instruments | 1,088 | — | — |
| `publishableInstruments()` | closure, capital-type policy, unconfirmed-open | 771 | **not measurable** | 1,763 pairs |
| gate 1 `buildInstrumentTableHydrated` | channels, leaf cap, materialisation | 86.4 | 97.2% | 23 |
| `accessiblePool` | the encoded verdict — `status === "blocked"` | 71.6 | **74.8%** | **184** |
| `orderMemoCandidates` | display-name collapse — DEMOTES, never deletes | 71.6 | 74.8% | **0** |
| `.slice(0, VERDICT_POOL)` | **the cut this workstream is about** | 17.9 | **43.3%** | 258 |
| the model's seven | `agentSelectRows` names `SELECT_COUNT` | 7 | 70.4% of those | |
| the published five | EXACT@5 reads the top five of seven | 5 | 51.0% of those | |

(43.3% on the holdout split matches the committed curve's 44.2%. The
head-to-head's 36.7% is lower because its draw is `split=all` with a 15% country
cap; the shapes agree, and every comparison below is made within one population.)

Three of these deserve to be read carefully.

**`publishableInstruments()` cannot appear in any recall figure this repo
publishes.** The recall set is CONDITIONED on the won fund being publishable —
`partitionByOfferable` drops the pair otherwise — so the closure filter, the
capital-type withholding and the unconfirmed-open policy are invisible by
construction. **1,763 pairs (24.8%)** sit outside the graded population for that
reason. That is the right design (a fund we deliberately do not offer is not a
ranking miss) but it means 74.8% is a ceiling on top of an exclusion, not the
product's true ceiling.

**The name collapse costs nothing.** 0 of 820. It is a demotion, and
`resolveNameCollisions` returns `visible + demoted === input`. The rule that
`caps.ts` cited as one of three reasons to widen the pool to 18 does not remove
a single answer.

**`accessiblePool` is the second-largest cut in the funnel and it is not a depth
problem** — 184 of 820 answers, deleted before any K applies. But it is also
mostly not a corpus problem. See §5, which is the finding that most changes what
the headline number means.

---

## 3. Why the pool is 18, answered from git rather than from taste

The honest answer is better than "a cost bound nobody re-measured". **It was
never a cost bound and never a recall number.** `89ece816` (2026-07-26, "Brief
shape: up to 5 institutions, never fewer than 2") widened it 14 → 18 and gave
the entire reason in its own message:

> Three successive filters thin the pool before the writer sees it — off-theme
> large-scale channels, duplicate institution names, conclusively blocked funds
> — so the candidate pool now runs wider (14 → 18) and the writer is shown 9.

18 is a **backfill buffer**: the writer's cap plus headroom so three named
filters could not shrink the table below it. All three have since left the
stretch it was buffering:

| the filter it buffered | where it is now |
|---|---|
| off-theme large-scale channels | `SEL-LARGE-SCALE` fires in `selectInstrumentRows`, upstream of the table |
| duplicate institution names | DEMOTES since wsGB (`nameCollision.ts`); measured at **4 rows across 22 markets** |
| conclusively blocked funds | `accessiblePool` runs BEFORE the cut (pipeline.ts, "The cut comes AFTER the drop") |

So the buffer today needs about two rows and reserves ten. And since wsGB
removed the deterministic band sort, the constant quietly acquired a **second
job it has never been sized for**: on the late seam it is the menu the ranker
reads. `caps.ts`'s own header predicted exactly this — "after the merge,
VERDICT_POOL stops being a second cut and becomes how deep the selector is
allowed to read" — and the number did not move when the meaning did.

**A silent end of the same lever, now guarded.** `BRIEF_VERDICT_POOL` above
`AGENT_SELECT_DEPTH` buys nothing a founder can read: the menu is cut to the
depth, and `agentSelectRows` returns `[...chosen, ...everything else in the
shipped order]`, so an unshown row can only rank behind all seven picks — past
`institutionsMax`. A sweep of `BRIEF_VERDICT_POOL=60` against the default depth
of 40 prints 60 in its levers line and measures 40. That is `depthLever`'s own
failure arriving through a PAIR of levers, where neither validator can see it.
`caps.ts` now warns at module scope. **Any depth arm above 40 must move
`AGENT_SELECT_DEPTH` with it.**

---

## 4. The trap: what wsDR really measured, and what has changed since

wsDR's early seam showed a 37-row menu instead of 18 and EXACT@5 fell 22.2% →
17.8%; on nine founders whose won fund sat at rank 19-40 the model picked it 0
of 9. That must be engaged with, not waved past. Four things about it are now
established:

1. **It is one discordant pair.** wsEI already said so: late 10/45 and early
   9/45 on EXACT@6 differ on ONE founder, zero the other way. That is not a
   negative result, it is no result. wsGA's null makes the point sharper — the
   ranker disagrees with ITSELF on 18% of founders, so a two-founder difference
   on n=45 is inside the coin.
2. **The rows were unreadable.** 51 of 133 audited menu rows carried no sentence
   saying what the fund pays for, and 0 of the 9 newly-visible won rows did
   (wsDV). wsDW repaired the splitter. On the current corpus the same
   measurement reads **85-93% of rows carrying a `funds:` line** (§6).
3. **The early seam does not widen the pool, and that is the trap inside the
   trap.** `SELECT_COUNT` was 6, so at most six rows could be promoted from
   below the score's cut; wsDR promoted 64 rows across 30 of 45 founders and
   none was an answer. Depth moved and the seat budget did not. `caps.ts` says
   this in full at `SELECT_COUNT`.
4. **The thing that would have to be true is now measurable, and it is not
   true.** See below.

### The model already rescues deep rows, at scale, today

Free, from wsGA's own recorded run. The 98 graded founders, split by where the
won fund sat in the eighteen-row menu:

| the won fund's rank in the menu | founders | control EXACT@5 | ranker EXACT@5 | ranker: anywhere in the published seven |
|---|---:|---:|---:|---:|
| 1-3 | 31 | 31 | 26 | 30 |
| 4-6 | 16 | 14 | 2 | 11 |
| 7-9 | 20 | **0** | 13 | 14 |
| 10-12 | 12 | **0** | 3 | 4 |
| 13-15 | 9 | **0** | 3 | 5 |
| 16-18 | 10 | **0** | 3 | 5 |
| | **98** | **45** | **50** | **69** |

Read the two halves separately, because the aggregate 45.9% → 51.0% hides both:

- **Rows 7-18: the ranker converts 22 of 51, the score converts 0 of 51.** The
  score's order publishes its own top seven, so a won fund below rank seven is
  unreachable to it by construction. The model reaches down and pulls 43% of
  them into the top five. wsDR's "0 of 9" is not what this arm does now.
- **Rows 4-6: the ranker converts 2 of 16, the score converts 14.** The model
  keeps the fund in the published seven on 11 of those 16 — it does not throw it
  away, it ranks it sixth or seventh. This is the arm's real live cost and it is
  a POSITION defect inside the seven, not a selection one.

The net of those two is +5 founders, which is the whole of the 45.9% → 51.0%.

### One number the head-to-head does not print

The memo publishes **seven** rows. The won fund is somewhere in the ranker's
published seven on **69 of 98 (70.4%)** in-pool founders, against roughly 52%
for the score. The gap between 70.4% and EXACT@5's 51.0% is entirely ordering
WITHIN the seven rows the founder is already handed. So the two-factor product
is 36.7% x 70.4% = **25.8%** on the metric "did we show it to them", and 36.7% x
51.0% = 18.7% on "was it in the top five". Both are worth improving; only the
first is what the founder receives.

---

## 5. A fifth of the ceiling is the replay's own invention

`accessiblePool` deletes the won fund on **184 of 820** held-out founders
(22.4%). These are not funds we ranked badly. They are funds the company
**received money from**, which our encoded eligibility calls a conclusive fail,
and no value of K recovers one.

Grouped by the intake field whose filter fired. `sole` counts founders for whom
removing THAT ONE ANSWER un-blocks the fund:

| intake field | answers deleted | sole | a requirement it fired on |
|---|---:|---:|---|
| `ticketBand` | 120 | **104** | "Projects of 6 to 18 months must have total eligible project costs between £100,000 and £500,000." |
| `organisationType` | 33 | 20 | "The coordinator must be a municipality, a municipal association, or a civil society organisation" |
| `region` | 16 | 16 | "The applicant enterprise must be located in the target territories of the Programme" |
| `sector` | 15 | 15 | "Projects must fall within at least one of three defined themes" |
| `useOfFunds` | 11 | 11 | "Funds must be used to clarify uncertainty related to the commercial application of the research" |
| `consortium` | 6 | 6 | "Only individual projects carried by a single company are eligible (no consortia)." |
| `borrowerModel` | 6 | 6 | "Sole proprietorships (enkeltpersonforetak) are not eligible to apply." |

**Do not read this as 184 encoding defects.** `check_winner_not_gated.ts` states
this exact property over this exact seam, pins its debt at 207, and
**deliberately leaves `ticketBand`, `consortium`, `useOfFunds` and `activities`
unanswered**, in its own words:

> a replay that hands every founder a made-up ticket band or consortium stance
> manufactures failures the founder would never have produced, and a guard built
> on those would ratchet on fiction.

That is correct, and it is already decided. What has not been noticed is that
**the same reasoning applies to the ceiling, and nobody applied it there.**
Every recall figure this repo quotes — 36.7% in the pool, 63.3% unreachable,
44.2% on the committed curve — is produced by a replay that answers those fields
with exactly that fiction. The head-to-head's own disclosure says so plainly:
`ticketBand` is *set* on 773/773 founders and *own* on 231, so seven founders in
ten are carrying `CONSTANT_ANSWERS.ticketBand`, a stand-in, into a hard filter
that can delete their answer. `useOfFunds` and `consortium` are PINNED uniform
and own on **zero**.

So `_wsgd_stages.ts` runs the identical funnel twice, **gate 1 held fixed**, with
those four fields withdrawn on the second pass. The difference is not a proposal
and not a fix; it is how much of the published ceiling is measurement error.

> **`findings/stages_wsGD/stages.md`, "How much of the ceiling is the replay's
> own invention", holds the n=820 result.**

Two consequences, whichever way the number falls:

1. **A depth arm should be run against the corrected ceiling.** If the answer is
   in the pool far more often than 36.7% once the fiction is withdrawn, then the
   marginal founders a wider K reaches are different founders, and the value of
   widening is different too.
2. **`ticketBand` is a statement of intent and it is deleting funds.** A founder
   says what they hope to raise; `accessiblePool` treats that as a conclusive
   disqualification, and it alone accounts for 104 of the 184. This repo already
   has the doctrine for it — inform-never-remove, in `answerProvenance.ts` —
   and applies it only to fields answered LATE. Whether an intent field should
   ever hold conclusive disqualifying force is a product decision, not a bug,
   and it belongs to the owner.

This route costs **zero tokens** and raises the ceiling at **every** K at once.

---

## 6. Legibility, the thing that invalidated wsDR

Measured on the current corpus through production's own prompt builder:

| K | rows carrying a `funds:` line |
|---:|---:|
| 6 | 87.5% |
| 18 | 87.4% |
| 40 | 86.5% |
| the whole pool | 86.3% |

wsEI measured 55.4% at rows 1-6 and **47.9% at rows 19-40** one day ago. The
band a wider menu would add is no longer the least readable band; it is
indistinguishable from the band already shown. The single strongest reason to
disbelieve wsDR's early arm is now measured and gone.

---

## 7. What to do, what would prove it wrong, and what it costs

### The recommendation

**Raise `BRIEF_VERDICT_POOL` from 18 to 40, and nothing else.** Not the seam
(the seam is a seat-swap, not a widening — that is what wsDR proved). Not beyond
40 without moving `AGENT_SELECT_DEPTH` (that is the silent lever §3 guards).

The arithmetic it rests on, entirely from paid runs already made:

- Population EXACT@5 today = 284/773 in pool x 51.0% = **18.7%**.
- At K=40 the pool holds the answer for 445 of 773. Break-even therefore needs
  the model's conditional accuracy to hold at **32.6%** — a **36% relative
  collapse** from 51.0%.
- The central estimate, holding today's per-band conversions and assuming the
  new 19-40 band converts at 30% (below the 50-56% actually measured at menu
  ranks 13-18): population EXACT@5 **~25%**, i.e. **+6 points**, for
  EUR 0.014 a brief.

### What would prove it wrong

Any one of these, and the proposal is dead:

1. **The model's accuracy on the first eighteen rows falls by more than a
   third** when the menu is 40 rather than 18. This is wsDR's claim stated as a
   falsifiable quantity. It is the whole risk.
2. **The 19-40 band converts below ~15%** — the model sees the answer and does
   not choose it, as wsDR's 0-of-9 suggested.
3. **Truncation rises.** wsGA already breached its own VOID condition with 4 of
   148 calls cut off at max_tokens on an 18-row menu. If a 40-row menu pushes
   that materially higher, the arm publishes the control under its own name and
   the run is void before it is read.

### The test, and it needs no new code

```
BRIEF_VERDICT_POOL=40 ONLY_IN_POOL=1 REPEAT=2 REPEAT_FIRST=50 \
  AGENT_SELECT=adviser AGENT_SELECT_EFFORT=medium \
  npx tsx scripts/_wsga_headtohead.ts
```

`_wsga_headtohead.ts` reads `VERDICT_POOL` from `caps.ts`, which reads the
environment, so the pool width is already an arm. Three properties make the
comparison sound and none of them needed building:

- The **control is very nearly invariant, and the exception is measured rather
  than assumed**. `project(poolControl)` publishes the score's own order cut to
  the writer's eight, and the score's order is a prefix of itself, so a later
  cut cannot reorder its head. That argument has one hole and it is worth
  naming: `resolveNameCollisions` picks a label class's survivor by
  `preferBetterEvidencedRow`, **a total order independent of position**, so a
  wider pool can admit a better-evidenced sibling at rank 30, make it the
  survivor, and demote the row that held that label in the top seven. The
  control is therefore invariant except through the name collapse.
  `_wsgd_stages.ts` builds the control's projection at every K and counts the
  difference; see `findings/stages_wsGD/stages.md`. If the divergence is
  material the comparison must be run against the control measured **in the same
  process at the same pool width**, not against wsGA's printed control.
- The **conditioning is already correct**. `shownDepth` is `VERDICT_POOL` on the
  late seam, so `ONLY_IN_POOL=1` conditions on "the answer is in the first
  forty" — which is the population the arm exists to reach, and exactly the
  mistake wsDR would have made by conditioning on the control's cut.
- The **null comes free**. `REPEAT=2` samples the same arm twice off one pool
  object; if the ranker disagrees with itself about as often as the arms
  disagree, the run says so and is discarded.

Read the **population** figure, not the in-pool one: the two runs condition on
different ceilings, so `ceiling x conditional` is the only comparable quantity.

**Price: EUR 11-13.** 148 calls (98 founders + 50 nulls, matching wsGA's power)
at EUR 0.076-0.085 each. n=98 is sufficient here despite being small, because
break-even requires a 36% relative collapse and a 98-founder estimate has a
+/-10 point interval — the two hypotheses are more than two intervals apart.

Raise `AGENT_SELECT_EFFORT`'s ceiling, or report the truncation count as a void
check, before spending it.

### The alternatives, priced against it

**A cheap first pass, or two-stage selection.** Haiku 4.5 over the whole
accessible pool is 19,821 input tokens (71.6 rows, measured) at $1/M, so
**EUR 0.020** a brief, plus Sonnet's EUR 0.0626 on the eighteen it returns:
**EUR 0.083**.

Compare that with simply setting `BRIEF_VERDICT_POOL=all AGENT_SELECT_DEPTH=all`
and letting Sonnet read the whole pool once: **EUR 0.108**, ceiling 74.8%, and
it REMOVES a stage rather than adding one. The two-stage design saves
EUR 0.025, cannot exceed the same 74.8% ceiling, and buys that saving by
inserting a second model that can throw the answer away — a new instance of the
exact failure this whole workstream is about. Its own precision over 72 rows is
completely unmeasured.

So two-stage is not the cheaper route to the same place; it is a slightly
cheaper route to a strictly worse structure. **If the depth arm says the model
holds up at 40, the next question is `all` at EUR 0.108, not a second model at
EUR 0.083.** And if the depth arm says the model degrades with length, that is
the same finding that would sink the Haiku pass, so the depth arm is the
cheaper experiment either way — and it should be run first.

**Rules that cut rows for reasons no longer true.** Checked, and two are closed:
the **display-name collapse removes 0 answers of 820** (it demotes), and the
**leaf cap** is inert — `shortlist.ts` records caps of 90, 103 and 250 producing
byte-identical output on every metric and every stratum. The liveness and
capital-type rules live inside `publishableInstruments()`, upstream of a
population the recall set is conditioned on, so they cannot be measured this
way at all (§2). The rule that IS still cutting is `accessiblePool`, and §5 is
what it is really doing.

### If the answer comes back negative

Then the first factor cannot be bought with depth, the model's 51% is the only
lever, and the honest next targets are the two this run already localises: the
**4-6 band**, where the arm converts 2 of 16 against the score's 14 and the fund
is in the published seven anyway; and `accessiblePool`, which deletes a fifth of
all answers for zero tokens' worth of reason.

---

## 8. Build state

`npm run check` on this branch: the same three failures as `main`, none of them
touched by this work.

| check | state | why |
|---|---|---|
| `check_asking_cannot_shrink` | FAIL, 1 of 672 | Aleph Alpha, `institutionalOwner="unsure"` deletes one `satr_de_rnd` row. A corpus/gate defect, pre-existing. |
| `check_applicant_identity` | FAIL, 2 | two instruments whose "who may apply" text describes a population that cannot in fact apply. Corpus text, pre-existing. |
| `check_corpus_census` | FAIL | census #10 DEGRADED (sector coverage 8, down from 11) and DRIFTED (the scheduled ETL is not running this checkout). ETL, pre-existing. |

`check_recall_floor` after the `lib/intelligence/` edits — **all floors met, no
drift**:

```
__recallSetDescribed.json  300 tune pairs
  ok   pool     98% (floor 93%)
  ok   exact5   25% (floor 15%)
  ok   regime5  68% (floor 58%)
       exact6   27%
       DESCRIBED n=104  pool 98%  exact5 35%  exact6 38%  regime5 77%
       BLANK     n=196  pool 97%  exact5 20%  exact6 21%  regime5 63%
  ok   regime5  87% (floor 78%)  original join, n=100
  ok   regime5  33% (floor 21%)  traced:childless_family, n=94
  ok   regime5  80% (floor 68%)  traced:exact_attribution, n=106
  [verdict] recall_floor = ok published as #751, code df182582798c68b0
```

`check_pool_recall_curve` and `check_contracts` pass at the default and at
`BRIEF_VERDICT_POOL=all AGENT_SELECT_DEPTH=all`; `memoCandidates.test.ts` 10/10.

## 9. What is in this branch

| | |
|---|---|
| `scripts/_wsgd_stages.ts` | the free stage harness: rank at every seam, the blocking gate verbatim, the invented-answers arm, control invariance, prompt size at each K |
| `lib/intelligence/caps.ts` | `VERDICT_POOL` accepts `all`; the git-sourced account of where 18 came from; the guard on `VERDICT_POOL > SELECT_DEPTH` |
| `lib/intelligence/poolRecall.ts` | `poolRecallAtDepth`, `depthLabel`, `depthPhrase` — three harnesses would have printed 0.0% for the deepest arm there is |
| `findings/stages_wsGD/` | the n=820 measurements |

**Nothing here changes a shipped default.** `BRIEF_VERDICT_POOL` is still 18.
