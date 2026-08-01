# Substreams, and keeping them fresh without being asked

Written 2026-08-01. Every number measured against the live corpus or the raw
source files, not estimated.

## The finding

A founder does not apply to "ADEME". They apply to **Tremplin pour la
transition écologique des PME**, or the **Fonds Tourisme Durable**. We hold
that distinction in the raw data and throw it away at ingestion.

```
data/raw/ademe/ademe_aides.csv     38,916 rows   dispositifAide: 473 distinct programmes
  2,746  Fonds Tourisme Durable - Restaurateurs & hebergeurs
  2,051  Tremplin pour la transition ecologique des PME
  1,975  Renouvellement Forestier
    656  Aides aux actions ponctuelles
```

All 473 collapse into one row, "ADEME (France)", carrying a single median award
of EUR 20,000 and one set of inherited eligibility rules. The same is true
elsewhere:

| Source | Substream field(s) in the raw data | Currently |
|---|---|---|
| ADEME | `dispositifAide` — 473 named programmes | 1 row |
| Vinnova | `DiarienummerProgram`, `DiarienummerUtlysning`, `DiarienummerAnsokningsomgang` | 1 row |
| CDTI | `instrumento`, `convocatoria`, `idConvocatoria` | 2 rows |
| Innovate UK | none in the paged JSON — needs checking against the source API | 1 row |

This is the same class of defect as two already fixed this week: the evidence
existed, the loader did not carry it. It is also the largest one, because it
does not degrade a signal — it removes an entire level of the hierarchy.

## Why it matters more than the coverage numbers suggest

The coverage table says 509 of 724 instruments are complete on all six axes.
That is true and it is measuring the wrong unit. Depth, now on the dashboard:

```
sub-instruments                    510 of 724
hold no rule of their own          594
distinct regimes behind them        47
cannot disqualify anyone           149
```

Every state-aid child got its own award history, sector mix and project titles
in the last two days, so children are differentiated on BEHAVIOUR. They are not
differentiated on RULES, and for national development banks there are no
children at all. A Swedish founder sees "Vinnova", one row, one median, when
Vinnova runs dozens of programmes with different sizes, deadlines and criteria.

## Phase 1 — Carry the identifiers (no interpretation yet)

Add `programme_ref`, `call_ref` and `programme_name` to
`public_funding_events`, populated by each loader from the fields above. Purely
mechanical: no classification, no LLM, no judgement. Doing this alone makes the
question answerable, and it is reversible.

Verification: for each source, the count of distinct `programme_ref` values
must match the count in the raw file. A loader that silently drops the column
fails that check, which is exactly how the current gap survived.

## Phase 2 — Split on the identifier, generalising what state aid already does

`populate_funding_instruments.py` already splits a rollup into children keyed
on (granting authority, notified scheme), with `MIN_CHILD_EVENTS = 40` and each
child computing its own award percentiles, sector mix, titles and operators.
Nothing in that machinery is specific to state aid except the `split_targets`
set that decides who is eligible to split.

So: generalise `split_targets` to any instrument with enough events per
`programme_ref`, and let the existing child-building code do the rest. The
threshold matters — 473 ADEME programmes at 40 events each would publish maybe
15 to 20, which is the right order. Programmes below it stay aggregated under
the parent rather than becoming rows nobody can assess.

**The naming trap.** Vinnova's identifiers are opaque (`2009-02199`) while
ADEME's are already names. A child called "2009-02199" is worse than no child.
Where no name comes with the identifier, either resolve it from the source's
own programme registry or leave that source unsplit. Never synthesise a name
from the project titles underneath it — that invents a programme.

## Phase 3 — Eligibility per substream

Splitting multiplies rows without adding rules: every new child inherits its
parent's gates, exactly as state-aid children do. That is honest but thin.

Programme pages are where per-programme criteria live, and they are the same
shape of document `extract_terms.py` already reads. Take them in order of
awards, not alphabetically: the top 20 ADEME programmes cover most of its
volume, and the long tail is not worth a call each.

Do not start this before Phase 2 is stable. Rules attached to instruments whose
ids are still moving would be orphaned by the next run.

## Phase 4 — Refresh on a trigger, not on memory

Everything above decays. ADEME publishes new awards continuously, programmes
open and close, and a corpus refreshed by remembering to refresh it is a corpus
that goes stale silently.

The pipeline is already idempotent and incremental, which is the hard part:
`make sources` fetches, `make renew` reloads, the encoders skip what they have
seen, both vector indexes reconcile on every run, and `check_regions` /
`check_vocabularies` / `check_contracts` fail the build on drift. What is
missing is something to pull the lever.

**The trigger should be the data changing, not the clock.** A nightly job that
re-embeds an unchanged corpus burns credits to produce the same numbers. Each
source already has a fetch step; record a content hash per source, and run the
downstream chain only for sources whose hash moved:

```
fetch  →  hash changed?  →  no  →  stop
                          →  yes →  load → populate → encode (incremental)
                                  → export → publish → embed (incremental)
                                  → coverage_report + dashboard
```

Two guards, both learned the hard way this week:

- **Never let a refresh publish a corpus that got worse.** `coverage_report.py`
  emits the six axes as numbers; store the previous run and refuse to publish
  when an axis drops by more than a small margin without someone looking. The
  gate-inheritance bug would have been caught by this: it took 453 children
  from a full regime rulebook to one rule each, and nothing complained.
- **A reconcile step invoked by hand stops being invoked.** Pruning and
  regeneration already run inside the normal path; keep it that way, and let
  the trigger call one entry point rather than a remembered sequence.

Implementation is a `make refresh` target plus a scheduled runner. The schedule
is deliberately not the interesting part — the hash check and the coverage
regression gate are.

## Order, and what to do first

1. **Phase 1** — carry the identifiers. Cheap, mechanical, reversible, and it
   turns an argument into a measurement.
2. **Phase 4's regression gate** — before any large reshaping of the corpus,
   not after. It is the thing that catches the next inheritance bug.
3. **Phase 2** — split, starting with ADEME, which is the clearest case and has
   real names already.
4. **Phase 3** — per-programme eligibility, top programmes by volume.

## What this plan deliberately does not do

- **Split every source.** Innovate UK shows no substream field in the paged
  JSON we hold; that needs checking at the source rather than inferring a
  hierarchy that may not exist.
- **Synthesise programme names.** See the naming trap above.
- **Chase the remaining coverage residue first.** ~150 missing routes and 82
  instruments with too few priced awards are real, but they are gaps in rows
  that may not survive Phase 2 in their current form. Reshaping the hierarchy
  before polishing it avoids doing the work twice.
