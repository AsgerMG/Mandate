# End-to-end plan: every answer tailored against the proprietary DB

Written 2026-08-02. Supersedes the open questions in `retrieval_plan.md`, which
established the findings this plan acts on. Numbers measured against the live
code and the live indexes.

## The goal, stated so it can be tested

**Every claim the advisor makes about a fund traces to a row in our DB, and
anything it may state it can also find.**

Two halves. The first is largely true and is what the corpus work bought. The
second is not: the advisor is a writer handed a fixed briefing pack, with no tool
use anywhere in the pipeline. It cannot look anything up.

## Reverse-engineered from the memo

The memo is the requirements spec. Each section asserts something, and each
assertion has to come from somewhere. Mapped against what the pipeline actually
assembles:

| Section | What it asserts | Grounded in | State |
|---|---|---|---|
| 1. Bottom line | where you stand, which door first, what the money is worth | our instrument DB | **good** -- and directly improved by the ceilings, closed schemes and award medians |
| 2. Funds | the five doors, the first step, and the eligibility case | our instrument DB | **good** -- this is where the whole corpus effort landed |
| 3. Positioning | how to frame the company for the political moment its funders operate in | **web search** | **not our DB** |
| 4. State of play | that the doors move with policy cycles, and tracking that is what we do | **web search** | **not our DB** |

**Half the memo is not tailored against the proprietary DB.** Sections 3 and 4
are the ones that turn a list of funds into an argument a founder can make, and
they are currently written from four web searches (`research.ts`,
`max_uses: 4`) -- the same source anyone with a browser has.

### And we already own the corpus that should ground them

`data/signals.sqlite`, built by `ETL/intelligence/extract/news_ingest.py`:

    articles            19,281  -- but is_relevant=1 on only 3,752
    article_chunks      11,184     <- chunked FOR retrieval
    article_entities     6,755     <- of which 3,547 are programme mentions
    article_signals      4,366     <- typed, with confidence and anticipated impact
    sources                 64

The usable corpus is **3,752 articles**, not 19,281; the rest were fetched and
judged irrelevant. Build plan with the full measurement:
`policy_grounding_implementation.md`.

Nothing in `website/frontend/` reads any of it. It was chunked for retrieval and
never wired to anything. That is the same "built, correct, unreachable" shape as
the five data defects, at the scale of half the memo.

This changes the priority order below: connecting the policy corpus is worth
more than tuning how the fund corpus is ranked, because one closes a gap where
we currently have nothing proprietary to say, and the other improves something
already good.

## What is NOT being built, and why

**Not chat-over-chunks.** The obvious "RAG" move -- embed the question, pull the
twenty nearest chunks, let the model reason -- would replace a deterministic
spine with a similarity search. Today the shortlist is built by code, verdicts by
a rule engine, exclusions logged, and every figure traces to a row. That spine is
why a citation can be trusted. For a product whose worst failure is sending a
founder to a fund they cannot get, trading it for recall is a bad deal.

The plan keeps the spine and gives the advisor the ability to go DEEPER within
it.

---

## Phase 0 -- Retrievable equals showable (DONE)

The invariant everything else rests on. Both vector indexes are built by paid
steps that process only what is missing, so they drift silently and the failure
is invisible: the advisor states a fact it cannot retrieve.

- 26 instrument profiles and 141 attributable gates were stale after the
  corpus work. Both re-embedded. **958/958 profiles, 0 unembedded gates.**
- `ETL/terms/check_index_freshness.py` now runs in `refresh.py` immediately after
  the embed steps and **fails the run** if anything at an attributable evidence
  tier lacks an embedding, or any instrument lacks a profile. It reads the tier
  list from `evidenceTiers.json`, the one definition both languages already use.

## Phase 1 -- Measure before building (free, do first)

Two questions decide how much of the rest is worth doing. Both are answerable
offline against the 12 archetypes.

**1a. Does semantic ranking on the first screen change what founders see?**
`semanticFundMatch()` is called only in `synthesize()`. `computeVerdict()` -- the
instant eligibility read -- falls through to lexical IDF over gate text. Force
semantic on the fast path, run `npm run shadow`, diff the archetype table.

Precedent for why this must be measured and not assumed: the award median looked
like a refinement until it was run, and changed 10 of 12 archetypes and 15
published rows.

- If rows change materially, wire it (one line) with the lexical path kept as
  fallback and the existing 6s timeout.
- If they barely change, close the finding and note it. The Voyage dependency on
  the fast path is not free.

**1b. Is retrieval the constraint, or is selection?** The shortlist cuts to ~6
rows by score before the writer sees anything. Better retrieval into a pool that
is cut the same way may change nothing. Measure by widening the pool and
observing whether published rows change at all.

## Phase 2 -- Give the advisor lookup tools (the real work)

Today `synthesize()` assembles a fixed payload and the writer takes it or leaves
it. It cannot ask a second question, so everything it might need must be
pre-decided. That is why grounding kept failing to surface: the pipeline guessed
what mattered.

Add a small, closed set of tools over what already exists. Closed on purpose --
each is a query against our DB with its own guardrails, not free SQL.

| Tool | Backed by | Guardrail |
|---|---|---|
| `fund_requirements(instrument_id)` | `eligibility_gates` + `eligibility_embeddings` | returns only gates at an attributable tier, each with its source and evidence tier |
| `explain_blocker(instrument_id, field)` | the gate that produced the verdict | returns the exact clause, never a paraphrase |
| `similar_recipients(instrument_id, profile)` | `companies` + events | only what public registers already publish |
| `funds_matching(constraint)` | `eligibility_embeddings` | scoped to the shortlist; cross-corpus search is a separate decision |

Rules that make this safe:

- **The shortlist is still built by code.** Tools let the writer explain and
  deepen; they never let it add a fund the engine excluded. The exclusion log
  stays authoritative.
- **Every tool response carries provenance** -- instrument id, evidence tier,
  source file or register. A response the writer cannot attribute is a bug.
- **Closed vocabulary.** No free-form SQL, no arbitrary corpus queries.
- **Bounded.** Tool calls are capped per brief and the writer already runs inside
  `maxDuration`; the memo must never fail because a lookup hung.

Finally, this is where `eligibility_embeddings` earns its keep. 4,720 chunks over
634 instruments are currently queried by nothing. `fund_requirements` and
`explain_blocker` are its job. **If Phase 2 does not happen, stop maintaining
that index** rather than keep paying to embed into it.

## Phase 3 -- An honest "nothing fits"

Today a thin brief publishes on hope. The corpus can now say why a fund is not
for this founder: the scheme closed on a date, they are outside its registered
regions, it grants under Art. 25 at 25-50% and their project is too small.

An empty or near-empty answer, with the reason, is a better product than five
funds a founder cannot get. This is a writer-contract change (`contracts/`) plus
surfacing the exclusion log, not new data.

## Phase 4 -- Verification

Nothing here ships on a green test suite alone. The memo defects this session
were invisible to 115 tests, 12 archetypes, contracts, payload and cross-store
parity, and were found by generating a real brief and reading it.

```
NO_PG=1 npm run check                        # 115 tests + 9 checks
npm run shadow                               # archetype table, byte-comparable
NO_PG=1 npx tsx scripts/red_team.ts          # exclusions must not weaken
npx tsx scripts/check_hydration_parity.ts    # both stores agree
npm run build                                # the only thing that bundles
python3 ETL/terms/check_index_freshness.py   # showable == retrievable
```

Plus, for every phase that changes founder-facing output: generate a real brief
on the live site and read it.

## Phase 2b -- Ground positioning and state-of-play in our own corpus

The larger half of the work, and the one the memo mapping says matters most.

19,281 articles with 4,366 typed signals, already chunked, currently unused. The
target is that sections 3 and 4 cite OUR corpus -- a named policy move, its date,
its source, and which of the founder's shortlisted funds it bears on -- instead
of a general web search.

Sequenced the same way as the fund corpus was:

1. **Measure what is actually there.** Signal types, date coverage, and how many
   signals can be tied to an instrument or a channel we hold. Do this before
   embedding anything; the fund work repeatedly found the answer already in the
   data.
2. **Connect signals to instruments.** A policy signal is only useful to this
   founder if it bears on a fund in their table. `article_entities` is the
   likely join.
3. **Then, and only then, retrieval.** Embed `article_chunks` into a THIRD index,
   kept strictly separate from the two that exist: what a fund DEMANDS, what a
   fund FUNDS, and what the POLICY around it is doing. Conflating the first two
   already failed measurably once.
4. **Web search becomes the fallback, not the source.** It stays for genuine
   gaps, but a claim about the political moment should cite something we hold.

Guardrails: a signal carries a date and a source URL or it is not usable; the
corpus is press, so it reports what funders SAY, which is evidence about
direction and not about eligibility -- it must never move a verdict.

## Order and honest cost

| Phase | Cost | Gate |
|---|---|---|
| 0. Freshness invariant | done | -- |
| 1. Measure the fund-side question | free, hours | decides Phase 2's shape |
| 2b. Policy corpus: measure and connect | days | **highest value: closes a gap where we have nothing proprietary today** |
| 2. Lookup tools | the real work, days | do only if Phase 1 shows the pool matters |
| 3. Honest empty answer | small, contract change | independent, can go anytime |

Phase 1 is the gate. If measurement shows the shortlist already surfaces what
matters, Phase 2 shrinks to `explain_blocker` alone -- and that is still worth
building, because "why not" is the question a founder asks that we currently
answer from a summary rather than the clause.
