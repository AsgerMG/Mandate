# wsIN — the catch-all is two populations, and no fallback beats a constant

**Free. EUR 0.00, zero model calls, zero production writes, no Railway, no
`data/db.sqlite`.** Everything below is read out of source or computed offline
from three committed files. The harness destroys `DATABASE_URL` and
`VOYAGE_KEY` rather than trusting their absence, and is **not** `NO_PG=1`.

```
npx tsx scripts/_wsin_catchall.ts        # full output in catchall.txt
```

---

## 0. THREE CORRECTIONS TO THE BRIEF, ALL OF WHICH SHARPEN IT

**1. "Taxonomy defect or data-sparsity fact" is a false choice, and neither is
the answer.** Sparsity is measurably not the cause *anywhere*: wsIM's own
`...because the sub-sector yielded no peers` is **0**, and this run says why —
`other/other` holds **30,725 corpus rows, 28,956 of them eligible peers**;
`industrial_general` 10,173; `software_general` 6,727. Every shut door is shut
by a **rule** looking at a bucket that is full. The real answer is a third
thing, in §1.

**2. `fieldChannels` does *not* decide "which channels enter the pool at all"
any more.** `CHANNEL_BACKFILL` defaults to `on` (shortlist.ts:2094) and the
backfill fills every free slot up to `MIN_CHANNELS_CONSIDERED = 7` from
`blendedFit`, so an empty `fieldChannels` yields a pool of **exactly the same
size**, differently composed. A `fieldChannels` of size *s* leaves `7 - s` slots
to the backfill, so it displaces rather than adds; it crowds the backfill out
**entirely** only at `s >= 7`, which is **22 of 897 founders (2.5%)**. The live
lever is `usedInField`, tier 1 of the row sort — and that half of the brief is
right.

**3. The tier this is all about is already measured to COST accuracy.**
`shortlist.ts:3305-3311`, in the sort's own comment: the `usedInField` and fit
tiers were measured at **EXACT@5 51% → 49%, REGIME@5 76% → 73%** and kept as a
product judgement. Any fallback here *switches that tier on for 284 more
founders*. It is not a free slot waiting to be filled; it is a tier with a
recorded price.

---

## 1. WHAT THE CATCH-ALL ACTUALLY IS

284 is **not one population**, and the code cannot tell the two apart because
`isGenericSubsector`'s first clause is `s === ""` (corpus.ts:1906).

| | founders | |
|---|---|---|
| door shut, `fieldChannels` empty | **308 / 897 (34.3%)** | wsIM's figure, reproduced |
| founder not in the corpus | 24 | out of reach of any deterministic door |
| **a REAL catch-all label** | **171** | the classifier looked and said "too thin" |
| **NO LABEL AT ALL** | **113** | the classifier **has not reached them** |

```
label                                    founders   corpus rows   eligible peers
other / other                                  86         30725            28956
semiconductors_electronics / (empty)           42             0                0
software_data_ai / (empty)                     25             0                0
(none) / (empty)                               22             0                0
software_data_ai / software_general            18          6727             6380
health_life_sciences / health_general          17          2833             1955
energy_cleantech / energy_general              13          3207             2935
energy_cleantech / (empty)                     13             0                0
semiconductors_electronics / electronics_general 11        1728             1626
industrial_manufacturing / industrial_general  11         10173             9676
defense_security / (empty)                     11             0                0
agrifood / agrifood_general                    10          4086             3823
... four more, 5 founders
```

**An absent label and a label that says "unknown" are different facts.** One is
a statement about the company. The other is a statement about *our own
pipeline*. `isGenericSubsector` reads them as the same word, and 40% of the
founders it suppresses are not the population its docstring was written for
(*"catch-all buckets hold tens of thousands of unrelated companies"* — true of
`other/other`, meaningless for a row that is in no bucket).

### The 113 are an unfinished queue, and the ETL names it

Not inference. `classify_taxonomy.py:902`, in `_load_work`:

```python
sub = [pack(r) for r in rows(
    "c.sector_taxonomy_method IN ('nace_top','programme') AND c.subsector IS NULL")]
```

and `cmd_apply_nace` (:814) writing the state it queries for:

```python
elif top:
    method = "nace_top"           # Tier-1 fixed; Tier-2 pending LLM
...
    top, sub, method = ov, None, "programme"
```

**"Tier-2 pending LLM."** Corpus-wide the queue is **14,604 rows, 10.0% of the
shipped index** — 11,744 with a sector but no sub-sector, plus 2,860 with
neither (the `sector_taxonomy_method IS NULL` arm, never classified at all).
Their sector_tops are exactly what the two deterministic writers can emit:
`software_data_ai` 7,040, `energy_cleantech` 2,339, `agrifood` 1,388 — the three
NACE patterns that fix a sector without a sub-sector — and
`semiconductors_electronics` 821 + `defense_security` 156, which are
`SOURCE_OVERRIDE`'s `chips_ju` and `edf`. The channel mix confirms it from the
other end: **930 of the corpus's 1,096 `chips_ju` companies and 166 of its 175
`edf` companies have no sub-sector.**

**So: 113 of 284 is an ENCODING DEFECT, proven, with a named and priced fix.**

### The other 171 are a real label and I cannot show it is wrong for free

The classifier's own instruction makes both labels deliberate: *"Use the
sector's '*_general' sub-sector only when the evidence is too thin"* and *"Use
top sector 'other' ONLY for businesses with no technology, science or
engineering dimension at all"*. Deciding whether it was wrong on a given
company means re-running a classifier, which costs money this workstream does
not have.

I looked for a free second opinion and **there is none**: the intake sector and
the corpus `sector_top` agree on **823 of 851** matched founders, the 28
disagreements all run *corpus-specific → intake-`other`*, and of the 86
founders labelled `other/other`, **the intake sector is a specific sector for
exactly 0 of them.** The honest statement is that for these 171 the
deterministic path cannot serve them under the current classifier, and no
evidence in this repo says the label is wrong.

---

## 2. WHAT A FREE FALLBACK WOULD BUY — AND THE ANSWER IS NOTHING

### The target, and why it is the right one

With `fieldChannels` **empty**, `usedInField` is false on every row, so **tier 1
is inert** and the sort falls through to the score. Filling the slot is
therefore not neutral in one direction: it promotes every row whose channel is
in the set *above every row whose channel is not*. Every founder in this
population won a fund, so the won fund's channel is ground truth:

* **PROMOTES** — won channel is in the set; the founder's own fund rises to tier 1.
* **DEMOTES** — set is non-empty and the won channel is **not** in it; the
  founder's own fund falls **below** every row the fallback just promoted.

A fallback that fills the slot with noise is strictly worse than an empty slot,
and this is the measurement of exactly that. Won channel resolvable for
**897/897**.

### Four candidates, and two comparators that read nothing about the founder

```
-- ALL 284 SHUT-BY-RULE
   SECTOR_TOP           fills 262/284   promotes 76.1%   demotes 16.2%
   SECTOR_TOP_SPECIFIC  fills 176/284   promotes 40.5%   demotes 21.5%
   INTAKE_SECTOR        fills 284/284   promotes 84.5%   demotes 15.5%
   LIFT_THE_RULE        fills 171/284   promotes 55.3%   demotes  4.9%
   PRIOR top-3          fills 284/284   promotes 35.2%   demotes 64.8%
   CONSTANT top-3       fills 284/284   promotes 84.5%   demotes 15.5%
   CONSTANT top-4       fills 284/284   promotes 88.7%   demotes 11.3%
```

**`CONSTANT top-k` is "always name the k commonest won channels". It reads
nothing whatsoever about the founder, and nothing beats it.** `INTAKE_SECTOR`
ties it to the decimal (84.5 / 15.5); `SECTOR_TOP` loses to it by eight points.

The two populations separately, because a single average hides both:

```
-- REAL CATCH-ALL (n=171)          -- NO LABEL YET (n=113)        -- UNMATCHED (n=24)
   LIFT_THE_RULE   91.8% / 8.2%       INTAKE_SECTOR  75.2%/24.8%     INTAKE_SECTOR 87.5%/12.5%
   INTAKE_SECTOR   90.6% / 9.4%       SECTOR_TOP     55.8%/24.8%     everything else fills 0
   SECTOR_TOP      89.5% /10.5%       LIFT_THE_RULE   0.0%/ 0.0%     CONSTANT top-3 50.0%/50.0%
   CONSTANT top-3  93.6% / 6.4%       CONSTANT top-3 70.8%/29.2%
   CONSTANT top-4  96.5% / 3.5%       CONSTANT top-4 77.0%/23.0%
```

**On every population, the constant wins or ties.** Paired rather than
averaged, on the 171 where lifting the rule is even possible: `LIFT_THE_RULE`
alone 5, `CONSTANT top-3` alone 8, both 152, neither 6. They agree on 89% of
founders and the constant is ahead on the rest.

### The held-out result that settles it

Run the same arms on the **589 founders whose door is OPEN**, where the real
sub-sector peer draw is doing its job and the answer is known:

```
   SPECIFIC_SUBSECTOR (the shipped door)  promotes 89.5%   demotes 10.5%
   CONSTANT top-4                         promotes 90.7%   demotes  9.3%
```

**The shipped deterministic door does not beat a constant either.** As a
predictor of which *channel* a founder's fund comes from, `fieldChannels`
carries no information over "name the four commonest channels" — on the
population where it works. That is the finding that decides the recommendation,
and it was free.

### What it would do to the founders it does not help

`POOL_BLEND` and `ROW_PROXIMITY` both bought a point somewhere and paid two
elsewhere, so: the fallback fills a **mean 4.1–4.6 channels of 11**, which
consumes 4–5 of the 7 `MIN_CHANNELS_CONSIDERED` slots that today go to the
backfill's `blendedFit` ordering. On the 15.5% it demotes, the founder's own
fund drops below every row in those 4–5 channels — on a table published at six
rows, that is the difference between appearing and not. **240 promoted / 44
demoted is the right shape only if the promotion is worth something, and §2
says it is worth what a constant is worth.**

### Does the published six change? NOT MEASURABLE AT THIS BUDGET — AND SAY SO

`codes`, `selectInstrumentRows` and the six need live Postgres and the Voyage
ranker. This workstream may touch neither, and `NO_PG=1` is forbidden precisely
because it would answer with a different corpus and a lexical ranker while
looking like a real number. **Nobody has measured the six-row effect of any of
this, and this report does not estimate one.** What is available is the
mediator bound above, and it is enough to decide: an arm that does not beat a
constant does not need a six-row measurement to be declined.

---

## 3. THE RECOMMENDATION

**Do not add a peer fallback.** Not at `sector_top`, not at the intake sector,
not by lifting the rule. Three reasons in order of weight:

1. **No candidate beats a constant** — including, on the held-out 589, the
   shipped door itself.
2. **The tier it would switch on is already measured to cost 2 points of
   EXACT@5 and 3 of REGIME@5** where it fires (shortlist.ts:3305). Firing it on
   34% more of the population is a known-negative bet justified only by a
   product judgement — *"a fund proven in the founder's field"* — that a
   sector-wide or catch-all draw cannot honestly claim.
3. **It would paper over the encoding defect at exactly the place it is
   visible.** 113 of these founders are shut out because we have not finished
   classifying them. A fallback makes that permanently invisible.

**Do fix the label.** §5, prepared and unapplied.

---

## 4. THE PROPERTY, AND ITS TEST FOR UNSEEN CASES

> **An absent label and a label that asserts "unknown" are different facts, and
> no consumer may treat them as the same one.**

Not a list of bucket names — `check_contracts` fails the build on that shape,
and a rule naming `other` or `_general` is correct today and wrong the day a
twelfth sector lands with its own escape hatch.

**The test is the compiler.** Today `subsector` is a `string` and every consumer
that branches on it does so through one boolean, `isGenericSubsector`, which
answers `true` for both facts. Make the label a discriminated union at the
corpus boundary:

```ts
type SubsectorLabel =
  | { kind: "specific"; value: string }     // peers are meaningful
  | { kind: "generic";  value: string }     // classified; evidence was too thin
  | { kind: "unclassified" };               // WE have not looked yet
```

`CompetitorRecord.subsector` carries that instead of a string. Every call site
must answer the third case, because a two-branch `switch` does not compile.
There are **four** in `lib/` (corpus.ts 1921; pipeline.ts 1705, 1813, 1816) and
roughly thirty harnesses reaching them through the same `door()` shape. Add a
sector tomorrow and nothing
changes; drain the backlog and a company migrates from `unclassified` to
`specific` with no code edit; introduce a fourth label state and every consumer
is asked about it on the next build. No sub-sector name appears anywhere.

**And it makes the reporting honest for free.** `measure_funnel`'s
`querying_db` declaration currently reports 34.3% as one number. Under this
type it cannot: the harness has to say *171 refused, 113 not yet classified,
24 not in the corpus*, which is three different pieces of news for three
different owners.

### The second property, stated and NOT recommended

`findPeersBySubsector` feeds two outputs with different evidential standards:
`fieldChannels` (a **statistic** over channels) and `comparableFirms`
(pipeline.ts:529 — **named companies shown to the founder**). The docstring's
refusal is entirely about the second — *"a €370M chip fab as a space-startup
peer destroys the memo's credibility"* — and applies to both only because one
function returns both. The clean property is *a refusal justified by the naming
standard must not silently bind the statistic*, enforced by giving them
different types. **I measured it and it is not worth taking**: lifting the rule
for channels only buys 91.8% against a constant's 93.6%. Recorded so the next
workstream does not re-derive it.

---

## 5. THE CORPUS CORRECTION — PREPARED, UNAPPLIED

**What.** Drain the pending Tier-2 classification queue. This is an *encoding*
fix, not a ranking change: it fills labels that were never written, using the
classifier and prompt already in the repo.

**Exact commands** (owner's terminal; both write `data/db.sqlite`, which this
workstream may not touch):

```bash
python3 ETL/events/transform/classify_taxonomy.py run --dry-run    # prints the work + cost
python3 ETL/events/transform/classify_taxonomy.py run --max-cost 15
python3 ETL/events/transform/classify_taxonomy.py persist          # MANDATORY, see below
python3 website/build/companies_index.py                           # rebuild the shipped index
python3 ETL/terms/emit_channel_prior.py                            # cells shift as labels land
```

**`persist` is not optional.** `cmd_persist`'s own docstring records what
skipping it cost: *"An entire paid LLM pass was lost that way: 8 batches
submitted, 8 recorded collected, and no row carries
`sector_taxonomy_method='llm'` today."* `companies` is destructively reloaded
and its surrogate id re-issued, so a label written only there is temporary.
**That sentence is also a lead worth one read-only query before spending
anything** — `SELECT sector_taxonomy_method, COUNT(*) FROM companies GROUP BY
1` — because if it is still true, this backlog is not "never reached" but
"reached, paid for, and destroyed", and the fix is the persist step rather than
the classification.

**Blast radius.** 14,604 companies, 10.0% of the shipped index: 11,744 gain a
sub-sector only (`sector_top` unchanged, so `sectorFit`, `poolBlend` and
`peerPrior` are untouched); 2,860 gain both tiers, which does move those. It
changes which companies are eligible as peers for *everyone*, not only for the
14,604 — a newly-specific company becomes drawable as a peer for others in its
bucket.

**Founders reached.** 113 of the 897 (12.6%). Expected doors opened, estimated
from the classifier's own specific-label rate on the companies it has already
reached in the same `sector_top`: **≈59 of 113**, taking the shut share from
**34.3% → ≈27.8%**. An estimate, not a measurement; the true number is known
only after the run.

**Cost.** By the script's own estimator, `full × 0.0021 + sub × 0.0004`, batch
halved: **≈ USD 5.40**. Trivial, and out of this workstream's zero budget.

**Reversal.** The write is `UPDATE companies SET subsector = COALESCE(?,
subsector), ... sector_taxonomy_updated_at = COALESCE(?, ...)` — every touched
row is stamped with the run's timestamp, so the reverse is
`UPDATE companies SET subsector = NULL WHERE sector_taxonomy_updated_at = '<ts>'
AND sector_taxonomy_method IN ('nace_top','programme')`, plus the same
predicate against `company_sector_labels`, plus re-running the two builders
above. Nothing is deleted and no paid measurement's only record is touched.

**`reachCeiling` will move, and that is the point.** It is derived
(`refresh.py:565`) precisely so it rises when encodings improve. Nothing here
types it.

---

## 6. A SEPARATE FINDING, FOUND BY THE COMPARATOR ARM

`PRIOR top-3` scores **26.9%** where a constant scores 93.6%, which was strange
enough to check. **`channelPrior.generated.json` contains only 9 of the corpus's
11 channels. `national_dev_banks` and `eib` appear in no cell — not global, not
one of 23 countries, not one of 177 country|sector cells.**

`national_dev_banks` is **59.1% of the won channels in this holdout population**
and 51,756 of the index's 145,878 companies. It is read at `PRIOR_WEIGHT = 0.5`
inside `blendedFit`, which both **orders** the channels on every founder's table
and **selects** which channels the backfill admits. The most-won channel in the
corpus is being ordered with a prior of zero.

The emitter's own header says this is the exact blind spot it exists to close:
*"without the scheme_code arm national schemes vanish entirely — which is
exactly the blind spot this artifact exists to correct."* Both UNION arms carry
`WHERE ... i.parent_id IS NOT NULL`, and arm 1 additionally requires
`e.source LIKE 'satr%'`, so a national channel reachable only through a
family-root instrument cannot enter either arm. `national_dev_banks` has 203
root-only instruments carrying 88,400 events against 131 children carrying
22,539.

**I did not verify the cause against the database** — that needs one read-only
query I may not run. The *fact* is verified against the committed artifact and
is not in doubt. This is a workstream, not a patch, and it is plausibly worth
more than everything above.

---

## 7. WHAT WAS NOT DONE, DELIBERATELY

- **No number was changed.** No floor, no tolerance, no ceiling, not
  `reachCeiling`, no threshold, no default. §0.3 and §2 report measurements the
  repo already owns; neither was edited.
- **No corpus write, no Railway, no `data/db.sqlite`, no paid call.** The one
  correction warranted is in §5, unapplied.
- **No fallback was implemented**, because the measurement says not to. The
  alternative — shipping it and measuring later — is how `POOL_BLEND` happened.
- **`isGenericSubsector` was left alone.** The property in §4 is a type change
  across five call sites and a corpus-boundary refactor; it belongs in a branch
  that can run `npm run stages` before and after, which this one cannot.
