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

## Step 1 -- Link programme mentions to instruments

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

Plus the standing suite: `NO_PG=1 npm run check`, `npm run shadow`, red team,
`check_hydration_parity.ts`, `npm run build`, `check_index_freshness.py`.

## Order, and what to do first

Step 1 is the gate. It is a day of work, it needs no model calls, and if
programme mentions cannot be linked to instruments at reasonable coverage then
steps 2-4 do not have a foundation and the honest answer is that our policy
corpus grounds the memo's back half only in general terms.

Everything after step 1 is cheap by comparison, because the extraction work --
relevance filtering, entity extraction, signal typing with confidence and
anticipated impact -- was already done and paid for.
