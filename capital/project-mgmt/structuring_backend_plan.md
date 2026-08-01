# The backend a state-backed capital structuring analyst would need

Written 2026-08-01. Numbers measured against the live corpus.

## The bar just moved, and the corpus is closer to it than the product is

"Which funds fit this company" is a matching problem, and the work of the last
three days has largely solved it: 798 publishable instruments, 583 complete on
all six coverage axes, retrieval down to the individual programme.

**Structuring is a different question.** A structuring analyst is not asked
"which fund", they are asked *how do we assemble the capital*: what fraction of
this project cost can be covered, what can be stacked on what, in what order,
against which ceiling, and what does the company have to put in itself. The
answer is a *stack*, not a shortlist.

The corpus already holds most of that material and the product throws all of it
away.

```
gate_role       count   what the product does with it
filter          3,230   evaluates it  -> verdict
programme_fact    749   DISCARDED
obligation        774   DISCARDED
vague             226   discarded, correctly
```

`isFilter()` admits only `filter`, because only a filter says who qualifies.
That is right for a verdict and wrong for everything else, because **1,523
gates of structuring material** sit in the two discarded roles:

> "Grant rate is 50% of eligible costs for SME research projects, rising to 60%
> when the project content is..."
> "An additional 15 percentage point aid-intensity bonus applies if the project
> involves effective collaboration"
> "De minimis aid must not be cumulated with other State aid for the same
> eligible costs"
> "Loan can cover up to 50% of total project costs as a rule, or up to 70% for
> a justified reason"

516 of the 1,523 explicitly mention intensity, cumulation, ceilings or
co-financing. That is the answer to "how much of this can be public money, and
can I combine these two", and today it reaches nobody.

## What a structuring answer requires that we do not yet have

1. **Aid intensity, as a number.** "50% of eligible costs, 60% with effective
   collaboration" is prose today. As a rate plus its conditions it becomes
   arithmetic: project cost x rate = the envelope.
2. **Cumulation rules, as a relation between instruments.** De minimis cannot
   cumulate with other aid *for the same eligible costs*; GBER articles have
   their own rules. This is a graph over instruments, and we hold none of it
   structured.
3. **The ceiling that binds.** De minimis is capped per single undertaking over
   three years, at group level. Whether a company has headroom depends on what
   it has already received — which the corpus knows, because it holds their
   award history.
4. **Own contribution.** Every intensity implies a co-financing requirement.
   The mirror of "50% covered" is "you fund 50%", and that is the number a
   founder actually plans around.
5. **Sequence.** "Works must not start before the grant decision" makes some
   instruments strictly first. Ordering is part of a structure.

## Phase A — Stop discarding, start showing (cheap, data in hand)

Publish `programme_fact` and `obligation` gates on a row as structuring notes,
cited, exactly as `judgementCriteria` now does for unencodable filters. No new
extraction: this is the same move that surfaced 564 assessment criteria, applied
to the 1,523 that answer a different question.

Keep them typed and separate. A founder reading "you fund 50%" must not confuse
it with "you must be an SME" — one is a constraint on the structure, the other
on eligibility.

## Phase B — Encode aid intensity as a rate

A new value_spec op, `aid_intensity`, carrying `{rate, basis, bonuses[]}`.
The encoder already turns prose into specs and refuses what it cannot settle;
this extends its vocabulary rather than adding a mechanism.

With a rate per instrument, the product can state an envelope instead of a
range: *"up to EUR 340k of your EUR 680k project, at the 50% SME rate, 60% if
you run it with a research organisation."* That sentence is the product.

Verification is unusually good here: `total_project_cost_eur` is on the events
table, so a computed intensity can be checked against what recipients were
actually paid, in the same way `audit_encoding_vs_reality.py` checks filters
against actual recipients — and that audit has already overruled me once.

## Phase C — Cumulation as a graph

Model cumulation between instruments explicitly: `may_cumulate`,
`may_not_cumulate_same_costs`, `counts_against_ceiling`. Most of it is framework
law, not per-instrument, so it lives beside FRAMEWORK_RULES: de minimis and
GBER rules apply across the whole state-aid channel and are stated once.

Only then can a brief say "these two stack, that third one does not" — the
question a structuring analyst is actually paid to answer.

## Phase D — Headroom from the company's own history

The corpus holds 162,494 companies and their awards. If a founder's company is
matched, its de minimis consumption over the last three years is computable, and
so is its remaining headroom.

Handle with care: it is the founder's own data, it is inferred from a public
register rather than their accounts, and being wrong about it in the confident
direction would be expensive. State it as what the register shows, never as
their position.

## On thin instruments

56 publishable instruments have fewer than five tracked awards; 52 are national
development banks. They are not necessarily wrong, but they are unevidenced: no
median award, thin sector history, and a precedent signal of nearly nothing.

**Demote rather than delete, and say why.** A fund we hold almost nothing about
is not the same as a fund that does not fit, and deleting it silently is how a
real route disappears without anyone noticing. `meetsDataFloor` already exists
for the case where we hold nothing at all; this is the weaker version and
belongs in the same place, with the row saying "few recorded awards" rather than
quietly vanishing.

## Sequencing, and the one thing that must come first

**Two-phase hydration blocks everything.** The per-request payload is 4.24 MB
against an 8 MB limit, and the budget check has started warning. Splitting
Vinnova and CDTI the way ADEME was split will consume most of the remaining
headroom, and Phase A adds ~1,500 gate texts to rows. Shipping either before
hydration is split means unpicking it afterwards.

Order:

1. **Two-phase hydration.** Ship the shortlist's detail on demand rather than
   the whole corpus per request.
2. **Phase A.** Cheapest real gain: the material exists and is cited.
3. **Vinnova and CDTI splits.** Same mechanism as ADEME, now affordable.
4. **Phase B.** Intensity as a rate, verified against actual awards.
5. **The refresh trigger and the coverage regression gate**
   (substreams_and_refresh_plan.md, Phase 4). The gate should land before
   Phase C, because a cumulation graph is the first thing whose breakage would
   be invisible in the coverage numbers.
6. **Phase C**, then **Phase D**.

## What this deliberately does not become

- **A tax or state-aid advice engine.** The product states what the registers
  and the funds' own documents say, cited. "You may combine these" is a claim
  about published rules; "you will receive X" is advice, and the line stays
  where it is.
- **A modelling tool.** An envelope computed from a cited rate is grounded. A
  multi-year financing plan built on assumptions is not, and it would be the
  first thing in this product that no source could be shown for.
