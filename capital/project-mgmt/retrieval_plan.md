# Retrieval: can the advisor actually reach what we built?

Written 2026-08-02, opening the retrieval work as the data work closes (see
`data_corpus_judgement.md`). Measured against the live code and the live
indexes, not estimated.

## The frame

The corpus is 86% complete on all six evidence axes across 950 instruments and
EUR 458B. The closing finding of the data work was that **the product had more
grounding underneath it than it surfaced** -- five separate defects where correct
data never reached a founder.

Retrieval is where that gap is widest, and two measurements say so plainly.

## Finding 1: the index we paid for is queried by nothing

`eligibility_embeddings` holds **4,579 embedded chunks over 634 instruments** --
the "what a fund DEMANDS" index, gates and clauses, embedded with Voyage
voyage-3.5. 305 chunks were added to it today.

**No read path queries it.** The only reference to it anywhere in `lib/`, `app/`
or `scripts/` is a comment in `semantic.ts` explaining why fund MATCHING uses
`instrument_profiles` instead.

That comment is correct and well-argued: matching a company description against
rule text compares two different semantic spaces, and it measurably failed (a
rail company retrieved IPCEI's "only depreciation costs incurred during the
construction period" above Europe's Rail). Matching is not what this index is
for.

But nothing else uses it either. The index that knows what every fund REQUIRES
is not consulted when the product decides what a fund requires. That is the same
shape as the five data defects: built, correct, unreachable.

## Finding 2: the first screen ranks lexically, not semantically

`semanticFundMatch()` is called once, at `pipeline.ts:1406`, inside
`synthesize()` -- the memo path.

`computeVerdict()` (`pipeline.ts:1295`) is the FAST path: the instant
eligibility read a founder sees after screen one, before any model call. It
calls `buildInstrumentTableHydrated()` without semantic scores, so
`shortlist.ts` falls through to `themeRelevance()` -- lexical IDF over gate
text.

So the funds a founder is first shown are ranked by keyword overlap, and the
better signal only arrives later, for the memo. The fallback is documented as
"measurably worse but never wrong-by-construction", which is the right design
for a fallback and the wrong thing to be running by default on the screen that
shapes the founder's first impression.

## What is actually available to retrieve against

| Index | Rows | Instruments | Holds | Queried by |
|---|---:|---:|---|---|
| `instrument_profiles` | 932 | 932 of 958 | what a fund FUNDS (project titles, sectors) | `semantic.ts`, memo path only |
| `eligibility_embeddings` | 4,579 | 634 | what a fund DEMANDS (gates, clauses) | nothing |
| `themeIndex.generated.ts` | 940 | 940 | lexical IDF tokens over gate text | fast path, always |

26 instruments have no profile (new since the last build); 141 attributable
gates are unembedded for the same reason. Both are one paid run.

## The questions this work has to answer

Not a plan yet -- these are the things to establish before committing to one.

1. **Does semantic ranking on the fast path change what founders see, and for
   the better?** Measurable offline against the 12 archetypes with `npm run
   shadow`, which prints a byte-comparable table. If it changes little, the
   latency and the Voyage dependency are not worth it and the finding is closed
   cheaply.

2. **What should `eligibility_embeddings` be for?** Three candidates, in
   descending confidence:
   - Answering "what does this fund require of me" as free text, which the
     adaptive round already asks in a different way.
   - Finding the rule that explains a verdict, so a blocker cites the specific
     clause rather than the requirement summary.
   - Cross-instrument rule search: "which funds require a consortium" as a
     retrieval rather than a scan.
   If none of these is worth building, the honest move is to stop maintaining
   the index rather than keep paying to embed into it.

3. **Is retrieval the constraint at all, or is it selection?** The shortlist
   already cuts to ~6 rows by score before the writer sees anything. Better
   retrieval into a pool that gets cut the same way may change nothing. This has
   to be measured before it is built, exactly as `computeVerdict`'s median-vs-mean
   was.

4. **What does the advisor do when retrieval returns nothing good?** Today a
   thin brief is published on hope. The corpus can now say "this scheme closed",
   "you are outside its regions", "it grants under Art. 25 at 25-50%" -- an
   honest empty answer is now possible and is not being given.

## Constraints this must respect

- **Never conflate the two vector indexes.** `eligibility_embeddings` is what a
  fund demands; `instrument_profiles` is what it funds. Retrieving one for the
  other's job has already failed once, measurably.
- **The memo must not fail because a vector query timed out.** The lexical index
  stays as fallback; 6s timeout, per-invocation memo.
- **Measure on the product, not the distribution.** The median-vs-mean change
  looked like a refinement until it was run: 10 of 12 archetypes ranked
  differently and 15 published rows changed.
- **Render it and look.** The memo defects were invisible to 115 tests, 12
  archetypes, contracts, payload and cross-store parity. Anything founder-facing
  gets generated and read.

## First step

Answer question 1 offline. `npm run shadow` runs the archetypes and prints a
comparable table; running it with semantic scores forced on the fast path, and
diffing, costs nothing but a Voyage call per archetype and settles whether this
work is worth doing at all.
