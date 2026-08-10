# Designing the adviser: what has to be true before we spend another euro

Written 2026-08-10, after three measured arms and with the API budget
deliberately closed. Nothing here costs anything to establish; all of it was
read out of dumps, code and the corpus. The point is that **the next test is
the first one that should cost money.**

## The three arms, and why the third one matters most

All tune, N=120, same seed so every arm saw the same 120 founders, every run
attested `ranker: all 118 request(s) on EMBEDDING`, 120/120 calls chose and
nothing fell back.

| | shipped | free re-rank | assist (keep 3) | **adviser** | thick rows |
|---|--:|--:|--:|--:|--:|
| EXACT@5 | 24% | 14% | 19% | **15%** | 17% |
| EXACT@6 | 27% | 17% | 19% | **15%** | 20% |
| REGIME@5 | 73% | 56% | 67% | **56%** | 56% |
| CHANNEL@5 | 92% | 75% | 90% | **76%** | 75% |
| in pool | 95% | 95% | 95% | 95% | 95% |
| €/brief | — | 0.0125 | 0.0136 | 0.0133 | — |

**The adviser arm — peer prior as input, thinking on, retrieval on
self-declared ambiguity — is the WORST of the model arms.** More context, more
reasoning and more tools made it worse than the plain re-rank. That is not a
result about model quality. It is the signature of a task the model cannot do
from what it is given, where extra machinery only adds ways to go wrong.

## Root cause 1: the founder side of the prompt is nearly empty

The fund side is not the problem, and this is now measured rather than assumed
(n=4,766 rendered rows):

| | |
|---|--:|
| characters per candidate row | median **530**, p75 634, max 930 |
| fields shown | median **7** of the 25 the row object holds |
| carries a descriptor line | 99.9% |
| carries a real award median | 98.4% |
| carries a last-award year | 99.5% |
| carries a stated requirement | 61.7% |
| **rows sharing their whole rendering with a sibling** | **0 of 40, on every founder checked** |

So no pair of candidates is undecidable on what the model sees. **The rows are
rich and distinct.** Thickening them further bought +3 points and still lost.

Now the other half of the same prompt, verbatim:

```
name: EXIDE TECHNOLOGIES, S.L.
country: ES
sector: energy_cleantech
how much they are looking for: b500k_2m5
what the money is for: industrial_research, experimental_development
able to run in a 3+ partner consortium: yes
regulated activities: none

We develop and commercialise energy and clean technology. We are seeking
public funding for research and development work.
```

That description is boilerplate. It names no technology, no application, no
customer, no stage, no constraint. And **40 of the 120 founders received a
byte-identical brief** — one in three founders is, to the model, the same
company.

**A model cannot pick different funds for founders it cannot tell apart.** The
shipped ranker does not have this problem because it never reads the
description: it uses the award history of the founder's peer cell, which is
distinct even when the prose is not.

**This is very likely an artifact of the harness, not of the product.** Those
descriptions were de-leaked deliberately: 87% of them originally contained the
won fund's own project titles, and 1,573 of 1,920 began with the instrument's
name. Stripping the answer out also stripped out the substance. A real founder
types their own words into a box that says *"What are you building? (a sentence
or two)"* and gives us something specific. **We have never measured the adviser
on a real description, and the number we have is a lower bound of unknown
tightness.**

## Root cause 2: the answer is sometimes not in the window

The model is shown `depth=40`. The candidate pool is min 25, **median 105**,
max 185. In the first dumped case the fund the company actually won sits at
**pool rank 49** — outside the window entirely. That founder was unwinnable
before the model read a word.

The shipped ranker orders the *whole* pool. So the comparison in the table
above is not like for like, and the model is carrying a handicap nobody
intended.

## What must be true before the next paid test

1. **A real founder description.** Either measured on descriptions that were
   never leak-stripped, or with an explicit statement of what the stripped
   prose costs. Until then every model arm is measuring a founder who does not
   exist — the same mistake that produced, and then retracted, the "95% is
   impossible" proof.
2. **The window must cover the answer**, or the ceiling must be stated beside
   the score. At depth 40 the arm's ceiling is 74%; at full pool it is 95%.
   Quote the arm against its own ceiling, never against shipped alone.
3. **The prior handed to the model is 44% inference.** A film scheme is
   credited to an AI company by 215 awards from 170 German software companies
   under *other* schemes. Feeding that in as evidence asks the model to
   adjudicate against a confident wrong signal, and the baseline it is judged
   against inherits the same defect.
4. **State what the metric rewards.** We grade on whether the founder's actual
   historical award appears. The peer prior wins partly because that metric
   rewards base rates. An adviser choosing *the best fund to apply to* may
   rightly disagree with *what this company historically won*, and we currently
   have no way to tell a good disagreement from a bad one.

## The design that follows

**Give the model what distinguishes founders, not more about funds.** Fund rows
are already rich and already distinct; the marginal character spent there is
wasted. The intake's free-text box is the only place a founder tells us
something the peer cell does not already know, and it is the one input the
current harness destroys.

**Show it the whole pool, or say what the window costs.** 105 rows at ~530
characters is ~55k characters. That is affordable at today's rates and removes
a handicap that no amount of judgement can overcome.

**Let the prior inform rather than compete.** The assist arm restored the
neighbourhood by freezing three seats, which proves the prior carries real
information. The open design is the prior as a stated *fact per row* — "N
comparable companies in this cell won this" — with its inference share visible,
so the model can discount it where it is thin.

**Tools should map to observed failures, and only two do:**
- *leaving the right neighbourhood* → the frozen seats, already measured to work
- *two candidates equally plausible* → retrieval on demand, which is built
  (`demandRetrieval.ts`, reading `eligibility_embeddings` only — the table has
  no beneficiary, award or title column, so it cannot name a winner)

Everything else proposed so far is decoration.

## The honest odds

**The architecture is not disproven.** All three arms ran against an empty
founder, a truncated window and a partly-inferred prior — and still beat chance
(15-20% against 5.7%). What has been measured is that a model given *less
information than the incumbent* loses to the incumbent, which is unsurprising.

What would have to be true for it to reach elite performance: the founder's own
words carry information the peer cell does not, and that information separates
funds that are otherwise equally plausible. **Neither has been tested.** Both
are testable, and both are cheap once the harness stops answering for the
founder.
