# Repairing the answer key after the corpus was corrected (workstream R)

Status: the treatment and its measurements are below. Floors re-derived; see
the last section for the state of `npm run check`.

**Read first:** the harness's silent Postgres fallback, below. It is not what
this workstream was sent to fix, and it is the reason two workstreams have been
quoting pool figures that cannot both be right.

## The defect

`__recallSetComposed.json` grades retrieval by naming, for each of 4,796
company/fund pairs, the fund that company actually won. Tonight's corpus work
correctly withdrew a number of schemes from what the product may offer a
founder: Spain's genuinely-closed convocatorias and France's dead ADEME calls
are closed to new applications, and sending a founder to them costs real time.

The key was not updated with the corpus. Measured against Postgres,
2026-08-06 21:32Z:

| | pairs | share |
|---|---|---|
| answer is publishable | 3,764 | 78.5% |
| answer is closed, **no successor** | 1,032 | 21.5% |
| **total** | 4,796 | |

So pool's ceiling was **78.5% against a floor of 90**. The floor could not be
met by any ranker, because 21.5% of the questions had an answer the product is
required to withhold. The floor was right, the corpus was right, the key was
stale — exactly as workstream P established.

Distinct instruments behind those 1,032 pairs: **86** — 80 Spanish, 6 French.

## What retrieval was actually doing

This is the number that should have been reported instead of "pool 75%":

```
pool 75%  measured   /  78.5% achievable   =  95.5% of what it CAN find
```

Retrieval had not regressed at all. The measured 75% and the historical ~95%
are the same performance against two different answer keys.

## The treatment, and the two alternatives rejected

### Rejected: re-attribute each pair to the scheme's successor

This was the most attractive option — it preserves every pair, and
`publishableInstruments()` already republishes 11 closed schemes through
`successor_scheme` / `successor_title`, so the machinery exists.

It is **impossible here, and not marginally so**. Measured:

```
unpublishable answer instruments:                86
...carrying a successor_scheme:                   0
```

Zero of 86. These are not schemes that continued under a new SA number; they
are calls that ended. There is nothing to re-attribute to. The option was
closed by the data, not by preference.

### Rejected: delete the 1,032 pairs from the file

Deletion reaches the same graded population but throws away three things:

- the pairs are **true award history** — the company really did win that fund;
- the corpus can move back, and a deleted pair cannot come back with it;
- a set that silently shrinks cannot be audited. The next reader sees 3,764
  pairs and no record that 1,032 were removed or why. That is precisely the
  failure mode this file exists to prevent.

### Chosen: exclude by a computed property, retain, report, and guard

A pair may be graded on retrieval **only if the fund it names is one the
product may currently offer**. Stated once in `scripts/recallSet.ts`; both the
gate and the harness apply it from that one place.

Four things make this the honest form rather than a convenient one:

1. **It is a property, not a register.** The test is
   `publishableInstruments()` — the same function the product ranks over —
   passed in as a predicate. No country, scheme code or instrument id appears
   in the repair. The defect being fixed was an answer key with a fact about
   the corpus *baked into it*; baking the correction in the same way would only
   reschedule the same failure for the next corpus change. If a scheme reopens,
   its pairs return to the graded population on the next run with no edit.
2. **Nothing is deleted.** The 1,032 stay in the file and are reported as their
   own population, the way `mode` and `traced` already are. The count prints on
   every run of every harness.
3. **The exclusion cannot choose its pairs.** It is a function of the *answer*
   alone — it cannot read the query, the company, the sector, or whether the
   ranker gets it right — so it cannot select for pairs that flatter the score.
   Tested in `lib/intelligence/recallPopulation.test.ts`.
4. **It is guarded two-sidedly, and fatally.** `UNGRADED_SHARE = {min:10,
   max:33}` in `recallSet.ts`. Above the ceiling, the corpus has moved out from
   under the key again and the key needs repairing — the alarm that would have
   caught tonight's drift the day it happened instead of as a red floor nobody
   could explain. Below the floor, either publishability has regressed and
   closed funds are being offered again, or someone has pruned the file to
   raise a score. Both are bugs; neither is a passing build.

The band is a staleness alarm on the answer key, **not** a quality floor, and
widening it is not a legitimate response to it firing.

## The bias this introduces, stated rather than hidden

The brief asked whether dropping closed-scheme pairs biases the set. It does,
and the effect is large and concentrated. Graded population, before -> after:

| axis | before | after | shift |
|---|---|---|---|
| ES | 1,118 (23.3%) | 158 (4.2%) | **-19.1 pts** |
| FR | 1,313 (27.4%) | 1,241 (33.0%) | +5.6 |
| DE | 795 (16.6%) | 795 (21.1%) | +4.5 |
| SE | 676 (14.1%) | 676 (18.0%) | +3.9 |
| IT | 406 (8.5%) | 406 (10.8%) | +2.3 |
| traced `exact_attribution` | 2,808 (58.5%) | 1,776 (47.2%) | **-11.4 pts** |
| mode `profile` | 3,845 (80.2%) | 2,813 (74.7%) | -5.4 |
| split `tune` | 1,979 (41.3%) | 1,573 (41.8%) | +0.5 |
| split `holdout` | 2,817 (58.7%) | 2,191 (58.2%) | -0.5 |

Two observations, and they point in different directions:

- **The split barely moves** (0.5 of a point). Removal is by answer, and the
  answers are spread across both sides, so the tune/holdout balance survives.
  No company changes side — removal cannot move a company, and that is tested.
- **Spain effectively leaves the graded set**: 1,118 pairs to 158. Retrieval is
  now measured on 158 Spanish pairs, and any Spain-specific claim drawn from
  this set is now drawn from a small sample.

The second is real and must not be papered over — but it is a **coverage**
finding, not a retrieval one, and the distinction matters. The product genuinely
cannot offer those 80 Spanish schemes today. A Spanish founder arriving now is
offered what sits behind those 158 pairs. Measuring retrieval over 1,118
including 960 unofferable funds measures a product that does not exist.

**The honest reading: Spanish coverage collapsed, and that is the finding.** It
belongs to whoever owns Spanish corpus coverage, not to the recall floor. The
floor's job is to not hide it, which is why the ungraded population is reported
on every run rather than netted away.

## The hazard: no pool number tonight was trustworthy, and here is why

Workstream P recorded that identical code at an identical seed read pool **97%
at 21:09Z and 77% at 21:16Z** with `funding_instruments` byte-identical, and
attributed the movement to the retrieval index being rebuilt.

The index was **not** the cause. Measured directly:

```
source = POSTGRES        all=1014  publishable=752
  pairs whose answer is unpublishable: 1032/4796 = 21.5%   -> pool ceiling  78.5%

source = JSON fallback   all=1014  publishable=721
  pairs whose answer is unpublishable:    0/4796 =  0.0%   -> pool ceiling 100.0%
```

`website/frontend/public/data/instrument_terms.json` carries **zero** ES scheme
end dates, where Postgres carries 80. `hydrateDbInstruments()` falls back to
that JSON, silently, whenever `DATABASE_URL` is absent or the connection drops
mid-run. So:

- a run that keeps Postgres grades against the true corpus and reads pool ~75%;
- a run that loses it grades against a corpus in which **nothing is closed**,
  where the stale answer key is perfectly valid, and reads pool ~95%.

That is P's 97/77 exactly, and it is a better explanation than the index:
`instrument_profiles` affects semantic *ranking*, whereas pool is whether the
fund is in the candidate set at all — the mechanism does not reach the symptom.

The same JSON is stale in the other direction too: it predates P's 119 reopened
leaves. `publishable` differs 752 (Postgres) vs 721 (JSON).

**Consequence for anyone reading a pool figure taken tonight: check whether the
run held Postgres.** A pool number at or above ~90% against this answer key is
arithmetically only reachable via the fallback, because the true ceiling was
78.5%.

This is recorded, not fixed — the fallback lives in `corpus.ts`, which this
workstream was not sent to change, and the gate already refuses to run without
`DATABASE_URL`. It should be closed: a harness that silently grades a different
corpus than the one that ships is the same class of defect as a harness that
silently grades a different answer key, which is what `recallSet.ts` exists for.

### Controlling for it here

`instrument_profiles`, `funding_instruments` and `eligibility_embeddings` were
fingerprinted (row count + SHA-256 over the ordered rows) three times before any
baseline was taken:

| read | funding_instruments | instrument_profiles | eligibility_embeddings |
|---|---|---|---|
| 21:31:43Z | 1014 / a9f509bc3162b848 | 1014 / 2eee57ab0c08f17b | 4720 / cc063c7ffb5df6c7 |
| 21:32:40Z | identical | identical | identical |
| 21:38:34Z | identical | identical | identical |

Stable across seven minutes, which is what licensed the baseline below.

**Then it moved again, mid-baseline.** A fourth read:

| read | funding_instruments | instrument_profiles | eligibility_embeddings |
|---|---|---|---|
| 21:46:18Z | **998 / 0906e9b5b6d9ebf7** | **998 / 9e009803aeb67898** | 4720 / cc063c7ffb5df6c7 (unchanged) |

Sixteen instruments disappeared from `funding_instruments` between 21:38:34Z and
21:46:18Z, and `instrument_profiles` followed them. Another workstream is
truncating and reloading the corpus. This is the hazard the brief warned about,
and it is worth being precise about what it does and does not invalidate:

- `eligibility_embeddings` never moved, across all four reads;
- the first baseline pass straddled the change. Seed 20260806 completed before
  it; seeds 7 and 99 ran across it, and both read pool 96 where the first read
  98. Two points is inside the interval, so the change is not visibly large —
  but "inside the interval" is not the same as "measured on one corpus", and a
  floor derived from a straddling run is not derived from anything.

So the baseline and the floors below were re-taken after the corpus was
re-confirmed stable, and the straddling numbers are reported only as the
evidence that it moved.

**The standing lesson: fingerprint before AND after, not just before.** A
stability check taken only at the start would have passed here and produced a
calibration nobody could reproduce tomorrow.

## Coordination with workstream K2 — K2's re-derived floors are not valid

`wsK-leak-rebaseline` branches from `95f5fce`, which **predates the Spain and
France corpus commits** (`3ec1d61`, `3d47378`, `b5387a9`, `f4d840f`). Those
commits are ETL *code*, and the data they wrote lives in shared Postgres, so
branch position does not by itself decide what a run sees.

K2 re-derived the floors and recorded pool **96 / 94 / 95** on three seeds at
n=600. Against the true corpus the ceiling is 78.5%, so those figures are not
reachable with Postgres held; they were taken through the JSON fallback. K2's
own commit `58c7a6a` — *"A harness that loses Postgres mid-run still prints a
headline"* — describes the mechanism, and its findings file quotes
`publishable = 721`, which is the JSON number rather than Postgres's 752.

**K2's two documents disagree with each other, and the split tells you which is
which.** Its `CONTINUE_HERE.md` headline reports holdout n=600 at pool **75 / 76
/ 75** on the three seeds. Its `check_recall_floor.ts` header reports tune n=600
at pool **96 / 94 / 95**. Those cannot both be true of one corpus: the ungraded
share is 22.2% of holdout and 20.5% of tune, so the two splits have almost the
same ceiling and cannot sit twenty points apart. The 75s are the Postgres
figures; the 96/94/95 are the fallback's.

### This closes K2's largest open item

K2 records pool as **UNRESOLVED** and warns: *"Settle that before planning
against 75% — it may be a live regression rather than a level."*

It is neither. It is the stale answer key, and K2's own control experiment says
so without having been read that way: *"an index rebuilt with and without the
holdout at the same moment reads pool 78% both ways."* **78% is the ceiling.**
K2 rebuilt the index twice and measured the answer key both times, which is
exactly why the two arms agreed and why no index change could move the number.

Pool was never a regression. Against the funds the product may actually offer it
measures 96-98% (below), which is where it has always been.

Consequences:

- **K2's `FLOOR = { pool: 90, exact5: 12, regime5: 74 }` must be re-derived**,
  and its `POPULATION_FLOOR` with it. They cannot simply be carried over.
- K2's *sampler* change is correct and independent of this: stride aliases
  against the file's ordering. This workstream reached the same conclusion and
  adopted the same fix, placing the shared draw in `recallSet.ts` rather than a
  new `recallSample.ts`. **Whoever merges second will find two implementations
  of one sampler — keep either, delete the other, and keep the seed pinned.**
- After that merge, the floors below are the ones to keep, because they are the
  only ones derived with Postgres held against the repaired population.

Nothing in the above is a criticism of K2's audit, whose leak findings are
independent of this and stand.

## Re-derived floors

See `scripts/check_recall_floor.ts` for the derivation kept beside the numbers.
