# Brief output architecture: making quality diagnosable

Written 2026-07-29, after a live Bending Words run whose brief, adaptive
questions and PDF export were all rejected by the user.

The goal is not to fix that brief. It is to build the architecture in which
"the state of play section is wrong" resolves to one file, one rule ID and one
failing check — so the next twenty defects are fixed by the PM editing a
document rather than by an engineer re-deriving the pipeline.

---

## 1. Diagnosis

### 1.1 The specific defects (from the Bending Words run)

| # | What the reader saw | Cause |
|---|---|---|
| D1 | 11 rows of GBER statute, each printing the same sentence twice, with PDF filenames and page anchors | `panelReport.tsx:173` counts `"met"` as worth showing; `eligibility.ts:286-289` sets `check = "${fund} — ${requirement}"` and `finding = requirement` |
| D2 | "Your answers speak to 8 of its 14 documented eligibility rules" | `ease.ts:166` — a ranking-confidence metric rendered as prose |
| D3 | "Open to you: nothing in its documented rules rules you out" | `panelReport.tsx:110` — legally careful, reads as a shrug |
| D4 | EIC Accelerator deleted, though its own gates evaluated as **met** on the same page | `_agent_instructions.md:103` archetype veto → writer sets `worthPursuing: false`, which deletes the row |
| D5 | 4 rows, two of them the same legal instrument (GBER Art. 25), one attributed to a ministry a founder cannot phone | no same-legal-basis dedupe in `buildInstitutions` |
| D6 | "You confirmed this financing covers SME financing-access costs" | statute vocabulary from a GBER regime text became an answer option in `generateProjectQuestions`, then propagated into `whyEligible` |
| D7 | State of play: two think-tank papers, then "neither development changes eligibility today" | `pipeline.ts:1109` asks for "developments worth watching" — a newsletter brief, not a decision input |
| D8 | Positioning clauses unparseable ("described by David Chekroun as favouring minority stakes over control") | 130-word cap at `pipeline.ts:1102` compresses attribution out |
| D9 | Wincent plug welded to the end of an analytical paragraph | `STATE_OF_PLAY_PLUG`, `pipeline.ts:398`, string-concatenated into the same field |
| D10 | PDF named "Get your state-backed capital brief \| Wincent", containing nav, hero and footer | `window.print()` uses `document.title`; `globals.css:145` hides the page with `visibility:hidden`, which does not remove layout |
| D11 | A B2C tutoring app told to position on "classroom deployment and pedagogical outcomes" — a school/teacher customer it does not have | nothing in the funnel asks the commercial model, so the writer inferred go-to-market from the sector label |

**D11 is also a grounding-rule gap, not only a missing question.** The
GROUNDING instruction (`pipeline.ts:1097`) requires that a *claim* about the
company trace to a project answer or the founder's own description. "Position
on classroom deployment" is phrased as a *recommendation*, so it slipped
through while carrying an unsourced factual premise about who the customer is.
The positioning contract must cover recommendations, not just assertions: **no
customer, channel or go-to-market may be named unless the founder said it.**

D1–D3 are one defect wearing three hats: **internal machinery rendered as
reader content.** D4 and D5 are one defect: **the writer may delete a row the
code qualified, and may publish two rows for one instrument.**

### 1.2 The structural cause

**The spec has no home.** What the brief says is currently decided in four
places at once:

1. `_agent_instructions.md` — the system prompt for all six model calls. Its
   "Field-by-field rubric" and "Output discipline" sections describe the
   **retired 9-section memo** (`overview.headline`, `stakeholderMap`, `todos`).
   Every writer call is sent a careful rubric for a document it is not writing.
2. `pipeline.ts:919-1116` — a ~200-line template literal holding the real
   per-section rules, interleaved with evidence assembly.
3. `types.ts` `REPORT_SCHEMA` — the shape, built per request.
4. Hardcoded strings in `panelReport.tsx`, `ease.ts`, `eligibility.ts`,
   `watchOnly.ts` — text the reader sees that no spec mentions.

`_agent_instructions.md` went stale for one reason: **nothing broke when it
did.** The schema and the user message silently overrode it. That is the exact
failure mode `check_vocabularies.ts` was written to stop for intake
vocabularies, and its header already states the doctrine:

> "None of this shows up as an error. It shows up as a slightly worse brief,
> which is exactly why it survived so long. A failing check is the only thing
> that keeps the two vocabularies married."

This plan generalises that doctrine from vocabularies to output.

### 1.3 The measurement cause (the important one)

Six model calls exist, across three routes:

| Stage | Where | Model calls | Test coverage today |
|---|---|---|---|
| S1 screen 1 → shortlist | `/verdict`, `shortlist.ts`, `eligibility.ts`, `gateReach.ts` | 0 (deterministic) | **Good** — `check_archetypes`, `verdict.test`, `comparator.test`, `watchOnly.test` |
| S2 round-2 gate questions | `/intake` → `generateGroundedRound` | 1 | **None** |
| S3 round-2 project questions | `/intake` → `generateProjectQuestions` | 1 | **None** |
| S4 profile signal | `/intake` → `inferProfileSignal` | 1 | **None** |
| S5 peer research | `/` → `research.ts` | 2 | Indirect only |
| S6 the writer | `/` → `pipeline.ts synthesize` | 1 | **Good** — `memo_bench` + `bench_report` |

`memo_bench.ts:162` calls `runIntelligence()` directly with screen-1 answers
and **no `projectAnswers`**. The adaptive round is only ever invoked by the
intake route. Therefore:

- No adaptive question has ever been generated in a test run.
- The path where a founder's round-2 answers reach `whyEligible` — the path
  that produced D6 — has never been exercised.
- `bench_report.ts` scores the final report JSON only. It cannot see the
  questions, the evidence blocks, or which candidate was dropped by which rule.

**Everything measured improved. Everything unmeasured decayed.** That is the
whole story, and no amount of prompt editing fixes it.

---

## 1.4 How rules are written

This governs every contract, and it is the reason the current prompt is in the
state it is in.

**A rule names a property. It never names an instance.** No company, no fund,
no sector, no country, no archetype may appear in the text of a rule. If a rule
stops working when you change the company name, it is not a rule — it is a
patch with a rule's formatting.

The repo already holds this standard for test fixtures (`__archetypes.ts`:
*"If a fix only works by naming one of these, the fix is wrong"*). It was never
applied to output rules, and the cost is visible: `pipeline.ts:1037-1084` is
forty lines of guardrail citing three companies by name, each added after one
bad run, none generalised.

**Specific cases are evidence, not specification.** A rule may carry an
`evidence:` note recording the run that revealed it — that history is valuable
and should not be lost. But the note sits beside the rule, never inside it, and
the rule must be readable and correct without it.

**Feedback is input to a rule, not the rule itself.** When a defect is reported
in concrete terms, the work is to find the general property that was violated
and write *that*. A reported case of a consumer product being advised to
position for institutional buyers is not a rule about consumer products,
education, or that company — the property is: *the brief may not assert a
customer, channel or go-to-market the founder has not stated.* That rule also
catches the enterprise company told to court retail users, which the literal
version never would.

**Corollary — recurrence means the rule was too narrow.** If a defect returns
in a different sector or company shape, the response is to widen the existing
rule, never to add a second one beside it. Two rules describing one property is
how the current prompt grew.

---

## 2. The governing principle: fit, not rules

Stated by the user 2026-07-29, and it governs everything below:

> Relevance filtering belongs in screen 1, screen 2 and the deterministic
> matching. A fund should drop out because it does not fit — never because a
> hard rule handed to the language model told it to drop out.

The mechanical distinction:

- A **filter** is binary and fires pre-writer. It removes a fund from the
  universe. Nothing downstream can recover it and no record exists that it was
  ever considered.
- A **signal** is continuous. It moves a fund down a ranking. A poor fit lands
  fourteenth, the cut takes five, and the run record shows why.

Today, exclusion happens at three stages in four mechanisms: hard pre-writer
filters (`CHANNEL_BANDS`, `Fit:`/consortium), writer-side vetoes (the archetype
prose rule, `worthPursuing`, `actionableNow`), and a post-writer regex
(`WATCH_ONLY_COPY`). **All four collapse into one ranking and one cut.**

### 2.0 What stays a hard exclusion

Two things only, because both are facts rather than judgements:

1. **A conclusive encoded gate failure** — `verdict.ts` `blocked`. Real,
   cited, traceable to primary text.
2. **A structural impossibility** — a national scheme outside the founder's
   usable countries. A fact about the instrument, not an opinion about the
   founder.

Everything else becomes a scored contribution.

### 2.0.1 The fit score

One function, one output per instrument, every component recorded:

| Component | Source | Replaces |
|---|---|---|
| `eligibility` | `verdict.ts`: open 1.0 / one_blocker 0.6 / unknown 0.4 / blocked → excluded | — |
| `theme` | semantic match, `instrument_profiles` | the archetype veto, `TOPUP_THRESHOLD` |
| `scale` | continuous distance between typical award and the ask | **`CHANNEL_BANDS`**, `LARGE_SCALE_TOPUP` |
| `structure` | consortium/solo requirement from encoded gates | **`Fit:`** per-channel declarations |
| `capital` | asked-for capital type vs instrument capital type | graded fallback in `selectLeafInstruments` |
| `geography` | in-country 1.0 / EU-wide 0.8 / foreign national → excluded | (unchanged, correctly a fact) |
| `precedent` | comparable companies that drew from it | `ease.ts` precedent |
| `liveness` | penalty scaled by years since last award | `stale` handling |

A consortium fund for a solo founder scores low on `structure`. It does not
disappear — it ranks below five better options, and if the founder has nothing
else, it publishes with its requirement stated. That is the behaviour the
per-channel `Fit:` gate was reaching for and could not express.

### 2.0.2 What screen 2 is for

Specified by the user 2026-07-29. Screen 1 stays exactly as it is — it scopes.
**Screen 2 has two jobs and may not compromise on either.**

**Job 1 — narrow the funnel to the final five.** Screen 2 is where the pool of
~18 candidates becomes the 5 that publish. Its objective is therefore not
"resolve open gates" but **"reduce uncertainty about which five are
strongest"**: ask the questions whose answers most change which funds clear the
top of the fit ranking. A gate that is open on a fund already ranked
fourteenth is not worth a question; a gate that decides between rank 4 and rank
6 is.

This is a definable objective (expected movement across the top-5 boundary),
which is what makes round 2 testable rather than a matter of prompt taste.

**Job 2 — understand the commercial model, for positioning.** Distinct from
job 1 and not subordinate to it. These answers do not need to touch
eligibility at all; they exist so the brief can position the company
correctly.

The failure that proves job 2 is not optional: **Bending Words is a B2C
tutoring app.** Its brief advised positioning on *"classroom deployment and
pedagogical outcomes"* — schools and teachers, a customer the company does not
have. Nothing in the funnel had ever asked who the customer is, so the writer
inferred a go-to-market from the sector label and got it backwards. Every
sentence of that positioning paragraph was well-sourced on the policy side and
wrong about the company.

**Question depth** — the user's note that round-2 questions should go further
in depth than they currently do is accepted and deliberately parked. Structure
first, depth in iterations.

### 2.0.3 The cut: five strongest, unordered

The brief publishes **the five strongest by fit score**. It does not assert a
priority order among them, and the writer does not rank.

This supersedes the previously documented doctrine, *writer RANKS, code CUTS*
(`project_brief_pool_sizing`). The new division is:

> **The score ranks. Code cuts. The writer writes.**

The writer losing its ordering role is the point: under the old doctrine the
writer's ordering decided publication, so a bad ordering silently deleted a
good fund. Under the new one, publication is decided by a deterministic,
recorded score, and the writer's only job is prose about the five it is given.

Not displaying a priority order is a real simplification, not a cosmetic one:
an asserted ranking is a claim the brief would have to defend, and the fit
score is not yet good enough to defend one. Five strong options presented as
five strong options is honest at the current state of the ranking. A
relevance framework that can justify an ordering is future work.

### 2.0.3 Why this is safe only in this order

The writer's vetoes are currently **compensating for a weak ranking**. Remove
them first and briefs get visibly worse, because nothing is left to catch a bad
row. So the ranking must carry the load before the vetoes come out — see the
revised sequencing in §3.

The deeper argument for doing it this way: a veto is a guardrail in a prompt,
which cannot be tested. A ranking is deterministic code, which can. This moves
the quality investment from the untestable layer to the testable one.

---

## 2.1 The architecture

Four components. Each solves one named failure above.

### 2.1 Stage contracts

Every stage that produces founder-visible output gets one markdown file that is
the **single source of truth** for what that stage may produce.

```
website/frontend/contracts/
  brief/01-bottom-line.md
  brief/02-funds.md
  brief/03-positioning.md
  brief/04-state-of-play.md
  round2/gate-questions.md
  round2/business-questions.md
  _shared/grounding.md        # the non-negotiables, lifted from _agent_instructions.md
  _shared/voice.md            # FT plain English, banned hedges, no em-dashes
```

Fixed structure per contract:

```markdown
---
id: SOP
stage: brief.state-of-play
schema_fields: [stateOfPlay]
evidence: [recentEvidence, institutions]
---

## Purpose
The one decision this section serves. A section that serves no decision does
not ship.

## Rules
- SOP-1 (hard, ≤200w) ...
- SOP-2 (soft) ...

## Banned
- SOP-B1 ...

## Worked example
### Pass
### Fail — breaks SOP-2
```

The writer prompt is **assembled from contracts at request time**.
`pipeline.ts` keeps evidence assembly and loses the prose. `_agent_instructions.md`
is split into `_shared/` and deleted.

Why markdown: the PM edits behaviour without touching TypeScript. Why
frontmatter: it is machine-checkable, which is the whole point.

### 2.2 Rule IDs

Every rule carries an ID (`SOP-3`, `FUND-7`, `Q-2`). The same ID appears in:

- the contract (where it is defined)
- the check that enforces it (`bench_report.ts`)
- the run record when it is violated
- the git log when it changes

A defect stops being "state of play felt off" and becomes **"SOP-3 failed on
4/12 archetypes, first at commit `abc123`."** That is the user's stated ask,
made concrete.

Two tiers:

- **Hard rules** — mechanically checkable (word caps, banned substrings, row
  counts, duplicate legal basis, statute vocabulary in options). Enforced in
  code. Violation is a defect, full stop.
- **Soft rules** — genuine judgement ("is this bullet actually decision-
  relevant?"). Scored by an LLM judge **against the contract text itself**, not
  a separately maintained rubric.

The second point is the load-bearing trick: **the writer and the judge read the
same document.** They cannot drift, because there is only one artifact. A
separate judge rubric would be `_agent_instructions.md` all over again.

### 2.3 Provenance

Every field of `IntelligenceReport` gains an origin tag — `code` | `model` |
`fixed` — plus the evidence block IDs it drew on, carried in a parallel
`provenance` map built where the value is built. Invisible in production,
rendered inline under `?trace=1`.

D1, D2 and D3 were all `code`-origin text nobody had specced. With provenance
they are visible on sight rather than after four file reads.

### 2.4 Full-funnel bench

`memo_bench` is extended from "call the writer" to "walk the funnel":

```
archetype fixture
  → POST /verdict          (deterministic shortlist)
  → POST /intake           (REAL adaptive questions)
  → persona auto-answer    (1 model call: "you are this founder, answer these")
  → runIntelligence with the real projectAnswers
  → score
```

The persona answer step is what makes question quality measurable: **a persona
that cannot answer a question from its own fixture is a defective question**,
and that is detectable without a human. It also, for the first time, exercises
the answers-reach-the-brief path.

New scoreboard section, question quality:

- `Q-1` no answer option contains statute vocabulary absent from the founder's
  own words and from ordinary English
- `Q-2` no two questions share a topic signature (promote the existing
  `topicSignature` dedupe from a silent filter to a scored check)
- `Q-3` persona answered without falling back to "cannot tell"
- `Q-4` every answer given is consumed somewhere in the brief; unconsumed
  answers are wasted questions
- `Q-5` the business half is present and topically distinct from the gate half

---

## 3. Phases

### Phase 0 — freeze the defects (half a day, no behaviour change)

Add Bending Words as archetype 13 in `__benchCompanies.ts` — the case that
caused this plan becomes a permanent regression fixture. Encode D1–D10 as
checks. **All red.** Nothing is fixed yet; we can now prove when it is.

Doing this first is deliberate: a fix with no failing check is a fix nobody can
defend six weeks later.

### Phase 1 — contracts (behaviour-neutral)

Create `contracts/`, move the prompt prose out of `pipeline.ts` verbatim, build
the assembler, split `_shared/`, delete `_agent_instructions.md`. Add
`scripts/check_contracts.ts` to `npm run check`:

- every `schema_fields` entry exists in `REPORT_SCHEMA`
- every `evidence` entry is actually assembled in `pipeline.ts`
- every rule ID referenced by a check exists in a contract
- every hard rule has an enforcing check — **no orphan rules**
- no contract rule is unreferenced — **no dead spec**

The last two are what stop the next `_agent_instructions.md`.

Acceptance: a bench run scores **identically** to the pre-refactor run. Same
text, new home.

### Phase 2 — the brief, as contract diffs

Every fix is now a markdown edit:

- **Four sections only.** Delete `EligibilityTable` from the report; delete
  `whyEasyLine` from the row (it survives for ranking and telemetry); delete
  the "Open to you" line. Fixes D1–D3.
- **`02-funds`**: five rows, same-legal-basis dedupe, no ministries as
  institutions, and the writer may rank low but **may not disqualify a fund
  whose gates evaluated as met**. Remove the archetype veto. Fixes D4, D5.
- **`04-state-of-play`**: the golden template. Part 1 — the funds above sit
  inside political cycles and industrial agendas; when those move, so do the
  gates and the positioning that wins, made specific to this company's actual
  funds. Part 2 — Wincent reads those signals, anticipates the changes and
  opens the right doors; partner with us and play the political momentum to
  your advantage. Part 2 renders as its own block, never concatenated into the
  analytical paragraph. Fixes D7, D9.
- **`03-positioning`**: cap 130 → ~200 words; every named person carries role
  and relevance in the same sentence. Fixes D8.

Phase 0's checks go green. That is the acceptance test.

### Phase 3 — the fit score, in shadow

Build the scored ranking of §2.0.1 and run it **alongside** the existing
filters and vetoes without changing a single published brief. Every run records
both orderings: what the current pipeline published, and what the score would
have published, with every component value per instrument.

Shadow mode is the whole safety argument. Replacing a ranking system by
switching it on and reading the output is how you discover three months later
that a fund class quietly vanished. Replacing it by measuring both against 13
archetypes until the new one demonstrably wins is how it is normally done, and
there is no reason to do it differently here.

Exit condition: on the archetype set, the scored ordering publishes at least as
many actionable, non-contradictory rows as the veto-driven one, and no
archetype loses a fund that a human agrees belonged.

**RESULT, 2026-07-29 — the score FAILS its exit condition. Phase 4 is blocked.**

`npm run shadow` runs free on all 12 archetypes. Two rounds of correction were
made during the build and both were real defects in the score itself: an
absent-theme default of 0.5 outranked weak-but-real matches (large programmes
scored identically for every archetype, a visible tell), and there was no
proximity term, so pan-European programmes were indistinguishable from a
scheme in the founder's own country. With those fixed and the semantic index
in play, national schemes correctly lead and thematically-right programmes
correctly top their archetype.

What still fails:

- **IHI (health) reaches the top five in 8 of 12 archetypes**, including
  fintech, govtech and agritech. **Clean Aviation in 7 of 12.**
- **EIC Accelerator is lost in 11 of 12** — the exact fund whose disappearance
  started this work.

The cause is not the weights. It is that `instrument_profiles` embeddings for
broad, multi-topic Joint Undertakings score high against almost any technical
description, so `theme` cannot separate them from a genuine match. That is a
data problem in the profile corpus, and it must be fixed before the score can
carry selection.

Until then the pre-writer rules stay, the writer keeps its narrow
disqualification, and `contracts/brief/02-funds.md` documents the writer's
judgement as current behaviour rather than describing an end state that does
not exist.

### Phase 4 — remove the vetoes (DONE, 2026-07-30)

Unblocked by finding that the thematic signal was being normalised away rather
than missing (see the shadow result above), plus a sector-affinity component
built from what each instrument has actually funded.

Removed: the per-channel ticket-band filter, the per-channel consortium
declaration, the writer's `worthPursuing` disqualification and its
`actionableNow` flag. Watch-only rows are demoted rather than deleted. The
writer no longer selects at all: rows arrive ranked and cut, and it writes one
note per row in the order given.

> **The last sentence was not true, and the demotion is why (wsGK,
> 2026-08-13).** A demotion is a deletion whenever the published cap sits below
> the writer's. At 8 candidates and 7 published, one match on the watch-only
> vocabulary anywhere in the table cut the fund it matched on and promoted the
> rank-8 fund into its seat, at any rank the ranker had given it. Measured on
> `brief_records` in Postgres: 8 matches in 128 candidate rows over the 19
> briefs to 2026-07-30, then **0 in 107 rows over the 14 briefs since** — the
> last one dated the day FUND-4 entered the writer's contract. The sort is
> gone; the regex reports and does not select. Phase 4's disposition for #4 is
> now carried out as written, at the moment it costs nothing.

Verified live: `candidates=7 kept=7 rejected=0 omitted=0`, and EIC Accelerator
ranks third for a French AI company on merit rather than being restored by a
cap.

### Phase 4 (original text, for the record)

Only once Phase 3 has met its exit condition, and in one change so the effect
is attributable:

- delete the EIC archetype rule (Tier 1 #2)
- delete `worthPursuing` (#3) — writer ranks, code cuts
- convert watch-only from deletion to demotion (#4)
- delete `CHANNEL_BANDS` (#1), superseded by the `scale` component
- delete per-channel `Fit:` gating (#5), superseded by `structure`

Every one of these is now removing something the score already does better,
rather than removing a guardrail and hoping.

### Phase 5 — round 2

**5a first: the funnel bench.** Rebuilding the questions before they are
measurable repeats the mistake that caused this.

**5b: question selection becomes an objective.** With the fit score in place,
"which question to ask" stops being "which gate is open" and becomes "which
answer would most change the ordering" — measurable as expected rank movement.
The business-model half falls out of this naturally, because `theme` and
`structure` are fed by it.

**5c: the rework.**
- Gate half: add a translation step — options must be written in founder
  commercial vocabulary *derived from* the requirement, never lifted from it.
  Enforced by `Q-1`.
- Business half: a new generator, deliberately **not** gate-grounded — the
  first stage in this pipeline that isn't. 3–4 model-written questions on
  commercial model (who pays, B2B/B2C/B2G, procurement exposure, what an award
  unlocks commercially). Answers feed `03-positioning` and the payoff bullet,
  and are firewalled from `computeVerdict` exactly as `ProjectAnswer` already
  is.
- Both halves render as one panel.

### Phase 6 — provenance and `?trace=1`

### Phase 7 — PDF

Set a real filename (`Wincent-brief-<company>-<date>`) around the print call;
replace the `visibility` hack with ancestor-chain `display:none`. Needs a
human click-through — there is no headless browser in this sandbox.

---

## 4. Decisions taken, and why

- **Contracts before fixes.** Every Phase 2 item is a re-spec of a section.
  Written against today's architecture they would land in the template literal
  and be moved a week later — the revamp done twice.
- **Files and git, not a prompt-management service or a contract editing UI.**
  Git is already the version store and the audit trail. A service would add an
  unversioned source of truth, which is the disease.
- **Hard rules first, LLM judge only for genuine judgement.** A check that
  cries wolf trains you to ignore the report — `bench_report.ts` already says
  this in its own comments, and it is right.
- **`caveats` stays a footer line, not a fifth section.** Four sections is the
  spec; the caveat is furniture.
- **Persona auto-answering rather than hand-written fixture answers.** Static
  answers cannot catch a bad *new* question, which is the failure we are
  trying to detect.

## 5. Cost

Phase 3a adds one persona call per archetype per run, on top of the existing
research + writer calls. `memo_bench` already defaults to a rotating 2-company
sample rather than the full 12; keeping that default holds a routine run in
single-digit dollars. A full 12-archetype full-funnel sweep is the expensive
case and should stay deliberate, not habitual.

## 6. What this does not do

- Does not touch S1. The deterministic shortlist is the best-covered part of
  the system and needs nothing.
- Does not reopen the two technical-DD items closed by decision (source
  licensing, outcome loop).
- Does not add an archetype branch anywhere in the pipeline. Per
  `__archetypes.ts`: if a fix only works by naming an archetype, the fix is
  wrong.
