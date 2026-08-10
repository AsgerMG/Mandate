# Implementation plan: ground the memo's back half in our own corpus

Written 2026-08-02. This is the build plan for Phase 2b of
`advisor_retrieval_plan.md`, which established WHY. Everything below is measured
against `data/signals.sqlite` as it stands, not estimated.

## What we are fixing

Memo sections 3 (Positioning) and 4 (State of play) are written from four web
searches. They are the sections that turn a list of funds into an argument a
founder can make, and nothing in them comes from a corpus we own.

## What is actually in the signals DB

Measured, and it corrects two claims in the earlier plan.

```
articles                19,281      but is_relevant = 1 on only  3,752
article_chunks          11,184
article_entities         6,755      of which entity_type='program'  3,547
article_signals          4,366
sources                     64
```

**The usable corpus is 3,752 articles, not 19,281.** The rest were fetched and
judged irrelevant. Any headline number in a later document should use 3,752.

Recency is the corpus's strength, which is exactly what sections 3 and 4 need:

```
2026   6,498        2025   8,858        2024   2,838        <=2023   272
```

Signals are typed, with a confidence and an anticipated impact already
extracted:

```
programme_policy_change   1,653   conf 0.57      <- the positioning material
funding_pipeline_signal   1,115   conf 0.61      <- what is coming
funding_award               667   conf 0.75
regulatory_development      407   conf 0.59
partnership_collaboration   320   conf 0.71
stakeholder_appointment     204   conf 0.55
```

## The one thing that blocks everything else

`article_entities` links a mention to a **company** (`company_id`). There is no
link to an **instrument**. 3,547 programme mentions exist and **zero** are
connected to a fund in our corpus.

Without that join, a policy signal cannot be made relevant to THIS founder: we
would be pasting general EU news into a personalised memo, which is what web
search already does.

The mentions are highly matchable. 1,775 distinct, and the head is our own
channel vocabulary:

```
220  Horizon Europe      71  EIC Accelerator     24  EIC Pathfinder
172  BMFTR               58  EIC                 21  EIC Transition
 91  European Innovation Council                 22  ERC
```

---

## Step 1 -- Link programme mentions to instruments  (DONE, gate passed)

**Build:** `ETL/intelligence/transform/link_programme_mentions.py`
**Writes:** a new table `article_instrument_links` in `signals.sqlite`
(`article_id`, `instrument_id`, `mention_text`, `match_method`,
`match_confidence`).

Matching, in descending authority, and each recorded as its own `match_method`
so a later reader can tell them apart:

1. **Exact channel match.** "Horizon Europe", "EIC Accelerator", "EIC
   Pathfinder" resolve to a `source_family_bucket` or an instrument name we
   already hold. Deterministic.
2. **Instrument name match**, normalised the way `nuts_names` matching was:
   fold case, strip accents and punctuation, compare on substance. We now have
   480 register-grade fund names to match against, which did not exist a week
   ago.
3. **Abbreviation match** against `administering_body` and `scheme_operators`
   ("BMFTR", "ADEME", "CDTI").

**Abstain, do not guess.** A mention that resolves to more than one instrument
records nothing. The precedent is the naming work: a wrong fund name is worse
than no name, and a policy signal attached to the wrong fund is worse still,
because it will be quoted as a reason to act.

**Done when:** the script reports coverage per match method, and a hand-read
sample of 20 links is right. Target is not 100%; the head of the distribution
carries most of the value.

### Result

`ETL/intelligence/transform/link_programme_mentions.py`, writing
`article_instrument_links` in signals.sqlite. **8,690 links across 656
articles.**

    mentions resolved   851 of 3,547  (24%)
      channel           657    "Horizon Europe", "EIC Accelerator"
      body_abbrev       174    BMFTR/BMBF/BMWK -> Bundesministerium instruments
      name               20    exact instrument name

**24% is the right number, not a shortfall.** The unresolved head is programmes
we do not hold and should not pretend to: Scaleup Europe Fund (28), Single
Market Programme (28), Women TechEU (23), Hightech Agenda Deutschland (23),
France 2030 (18), COSME (17). ERC (22) is deliberately unresolved -- it is
Horizon Pillar I and this corpus holds Pillar II, so mapping it would attach
basic-research policy to applied-research funds.

### What it actually reaches

**1,134 of 4,366 signals are now addressable to a founder's shortlist**, and the
useful types dominate:

    programme_policy_change   443 signals across 82 instruments
    funding_pipeline_signal   334               83
    funding_award             184               67
    regulatory_development     48               37

83 of 958 instruments carry a signal -- but those 83 hold **EUR 173B of EUR
458B, 38% of corpus euros**, concentrated in IPCEI (EUR 112B), Horizon
(EUR 22B) and the Innovation Fund (EUR 13B). Policy news covers EU-level
programmes, which is where the large money is.

### Does it reach a real founder? Yes -- 12 of 12

The concern above was that 83 of 958 instruments sounds thin. Measured against
what founders are actually shown, it is not:

- **69 of 626 publishable instruments carry a signal -- but 72% of publishable
  euros.**
- Run across the 12 archetypes, **every one has signal-carrying funds in its
  pool**, typically 5 to 8 of 7 to 12:

```
Robotics      7/7     GovTech        8/12    Life sciences  8/11
Hardware      7/9     Platform       7/9     MedTech        6/9
FinTech (b)   5/9     Cloud          7/10    AgriTech       5/7
FinTech (c)   5/5     AI B2C         5/8     AI B2B         5/9
```

The reason is structural rather than lucky: policy news covers the large EU
programmes, and those are what rank into a shortlist. The long tail of small
national schemes carries no signals and also rarely reaches a founder.

**The residual limit still holds and the contract must state it:** a founder
whose shortlist happens to be entirely national state aid will have no signals,
and section 3 must fall back to web search rather than invent relevance.

## The other half of retrieval: what we ask

Tracked here because it is the same question, not a separate project.

**The intake IS the query.** The founder's free-text description is what gets
embedded against `instrument_profiles`; the six screen-one answers are what cut
the pool before any ranking runs. A better index cannot compensate for a query
that never asked the discriminating thing.

Two distinct asks, and they fail differently:

- **Screen one** decides which funds are even considered. Its questions are
  fixed, and a missing one silently removes funds from the pool -- invisible,
  because nobody sees what was never a candidate.
- **The adaptive round** already generates questions from the verbatim gate text
  of shortlisted funds (`gateReach.ts`), so it self-corrects as the corpus
  improves. That half is in good shape and got better with every rule added this
  session.

**What is worth measuring, cheaply, and is NOT worth redesigning blind:** which
screen-one fields actually change the shortlist. Run the 12 archetypes, vary one
intake field at a time, and count how many published rows move. A question that
moves nothing is costing a founder attention for no retrieval gain; a question
that moves everything deserves to be asked better.

Precedent for doing this as a measurement rather than a redesign: the award
median looked like a refinement until it was run and changed 10 of 12
archetypes. Intake changes are more expensive to get wrong -- they are the one
part of this product a founder actually experiences as work.

Not sequenced into the steps below. It runs in parallel and gates nothing,
because policy signals are scoped by the shortlist the current intake already
produces.

## Step 2 -- Make a signal relevant to a founder, in code

**Build:** `signalsFor(instrumentIds, sectorTop, country)` in
`website/frontend/lib/intelligence/signals.ts`.

Returns the typed signals attached to the funds on THIS founder's shortlist,
newest first, each with: `signal_type`, `summary`, `anticipated_impact`,
`published_at`, source URL, and the instrument it bears on.

Rules, and they are the point:

- **Scoped to the shortlist.** A signal about a fund the founder cannot get is
  noise.
- **Dated, always.** A policy claim without a date is unusable; the corpus runs
  to 2026-07-24 and freshness is its whole value.
- **Never moves a verdict.** Press reports what funders SAY. It is evidence
  about direction, not eligibility. `gate_role` has no equivalent here, so the
  boundary is structural: signals reach the writer's context and never reach
  `assessInstrument`.
- **Confidence floor.** `stakeholder_appointment` averages 0.55 and is mostly
  not decision-relevant; start with `programme_policy_change`,
  `funding_pipeline_signal` and `regulatory_development` above a measured floor.

## Step 3 -- Give sections 3 and 4 the evidence

**Change:** `pipeline.ts` `synthesize()` assembles a `policyBlock` beside the
existing `softSignalBlock`, and `contracts/brief/03-positioning.md` and
`04-state-of-play.md` are updated to require citing it.

The contract change is what makes this stick: the writer must attribute a claim
about the political moment to a dated signal on a named fund, or not make it.
Web search stays as the fallback for genuine gaps, but it stops being the
source.

## Step 4 -- Retrieval over chunks, ONLY if steps 1-3 leave a gap

11,184 chunks are already there. Do not embed them yet.

Steps 1-3 use the typed signals, which are already extracted, summarised and
scored. If those turn out to be too coarse -- if the writer needs the passage
rather than the summary -- then embed `article_chunks` into a **third** index,
kept strictly separate:

```
instrument_profiles      what a fund FUNDS
eligibility_embeddings   what a fund DEMANDS
article_chunks           what the POLICY around it is doing
```

Conflating the first two already failed measurably (a rail company retrieved
IPCEI's depreciation clause above Europe's Rail). A third index inherits that
lesson, and `check_index_freshness.py` extends to cover it.

## Verification

Per step, and none of it is "the tests pass":

| Step | How we know it worked |
|---|---|
| 1 | coverage by match method; 20 links hand-read; zero multi-match guesses |
| 2 | for each of the 12 archetypes, how many signals attach and to which funds |
| 3 | generate a real brief and READ sections 3 and 4 -- do they cite a dated signal on a named fund, or still read like a web search |
| 4 | only if reached |

Plus the standing suite: `NO_PG=1 npm run check`, red team,
`check_hydration_parity.ts`, `npm run build`, `check_index_freshness.py`.
(`npm run shadow` was here and is deleted — wsDO. It shadowed the fit score,
whose question is closed against it; `npm run trace` is the surviving free
pool diagnostic.)

## Order, and what to do first

Step 1 is the gate. It is a day of work, it needs no model calls, and if
programme mentions cannot be linked to instruments at reasonable coverage then
steps 2-4 do not have a foundation and the honest answer is that our policy
corpus grounds the memo's back half only in general terms.

Everything after step 1 is cheap by comparison, because the extraction work --
relevance filtering, entity extraction, signal typing with confidence and
anticipated impact -- was already done and paid for.
