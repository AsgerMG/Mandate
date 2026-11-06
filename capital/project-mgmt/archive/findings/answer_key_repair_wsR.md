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
4. **It is guarded, and fatally** — but by two instruments, not one, and getting
   that split right took a correction mid-session:
   - `UNGRADED_SHARE.max = 33` is a **staleness ceiling**. Above it, the corpus
     has moved out from under the key again and the key needs repairing. This is
     the alarm that would have caught tonight's drift the day it happened,
     instead of as a red floor nobody could explain.
   - `MIN_PAIRS = 4700` is the **anti-pruning guard**, and it sits on the file.
     The first draft put a FLOOR on the ungraded share instead, reasoning that a
     suspiciously small exclusion meant someone had pruned the set. That was the
     wrong instrument for the right worry: the exclusion is a pure function of
     publishability, so it cannot be used to drop inconvenient pairs, and the
     only way to make this measurement easier is to delete rows — which no share
     can see. Worse, the floor would have fired on a genuine *improvement*:
     register successors for those 86 schemes and the exclusion collapses toward
     zero, failing CI on a corpus that got better.

The ceiling is a staleness alarm on the answer key, **not** a quality floor, and
widening it is not a legitimate response to it firing.

A third guard was drafted and then **deleted as wrong**: a 2% fatal cap on the
ABSENT share, meant to stop anyone measuring across a corpus reload. Measurement
killed it within the hour — the corpus settled with 16 instruments genuinely
gone, so 4.0% ABSENT was the state of a *correct* corpus and the cap would have
failed the build on it. A guard that fails on a correct corpus gets suppressed,
and then it guards nothing. ABSENT is now reported, and the reload hazard is
handled by the fingerprint-before-and-after practice at the end of this file,
because a single read cannot tell a reload in flight from one that finished.

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

## The SECOND kind of stale answer: 192 pairs that were never funds

Folded in after workstream T landed at `73d52a4`, and it wants a different
repair from the first.

T established that all 16 of GB's leaves were values of GtR's `grantCategory` —
competition FORMATS (Collaborative R&D, Feasibility Studies, Vouchers), PHASES
of a retired programme, government DEPARTMENTS, an organisation, a funding
origin, and one literally called `Unknown` — mapped into `programme_name`, the
column the instrument split runs on. The corpus manufactured 16 non-funds, and
the answer key recorded companies as having "won Collaborative R&D".

**These are not stale. They are wrong**, and the distinction decides the repair:

| | closed schemes | never funds |
|---|---|---|
| pairs | 1,008-1,032 | 192 |
| instruments | 86 (80 ES, 6 FR) | 16 (all GB) |
| was it ever offerable? | yes | **no** |
| did the award happen? | yes | **yes** |
| successor available? | no, 0 of 86 | n/a |
| repair | **exclude** | **re-attribute** |

For the closed schemes the award is sound and the fund is simply past;
retrieval is right to withhold it and grading that as a miss grades the key.

For the 16, the award is equally real — the money came from Innovate UK — but
our object model invented the thing it was attributed to. Excluding them would
throw away 192 real pairs and quietly cost GB coverage. The rollup they were
split out of is a real fund with a real quoted application route, and it is
exactly what a founder should be shown, so **retrieval returning the rollup is a
genuine hit** and re-attribution is the honest repair.

### Derived from the id, not from a list

The programme split names a child `<parent>__<slug>_<hash>`, so the parent is a
property of the id itself. Verified against the live corpus rather than assumed:

```
ids containing "__"           671
  prefix === parentId         671
  prefix names an existing row 671
```

`assertAncestorConvention()` re-checks that on every run and fails the build if
the naming ever changes, because a derivation this repair depends on must not
degrade silently. **No country, scheme code or parent id appears anywhere in the
rule.** A different programme split that loses its children tomorrow is repaired
by the same line of code.

Re-attribution is refused when the ancestor is missing or is itself unofferable
— re-pointing an answer at something the founder still cannot be shown repairs
nothing, so the row falls through to the exclusion instead.

### Reported separately, never netted

Every run of the gate and the harness prints all four populations:

```
answer key, 4,796 pairs:
  GRADED          3788 (79.0%)  answer is a fund the product may offer
    of which RE-ATTRIBUTED  192 (4.0%)  named an instrument that was never a fund;
      scored against the rollup the award actually belongs to
  WITHHELD        1008 (21.0%)  closed with no successor — correctly unofferable
  ABSENT             0 (0.0%)   names an instrument the corpus no longer holds
                                and whose ancestor is not offerable either
```

**The re-attributed 192 are almost certainly the easiest pairs in the set** — a
single large national rollup is far easier to retrieve than one convocatoria out
of eighty siblings. That is why they are broken out on their own line rather
than folded into GRADED. Anyone comparing a figure across this change must know
that 4.0% of the graded population is now scored against a rollup.

## Re-derived floors

| | before | after | pinned measurement | direction |
|---|--:|--:|--:|---|
| pool | 90 | **93** | 98 | RAISED |
| EXACT@5 | 15 | **22** | 32 | RAISED |
| REGIME@5 | 80 | **80** | 87 | unchanged |
| REGIME@5 original join | 68 | **70** | 85 (n=151) | RAISED |
| REGIME@5 traced | 82 | **84** | 90 (n=149) | RAISED |

**Nothing was lowered.** The build is green because the question the set asks
became answerable again, not because the bar moved.

Margins are deliberately not uniform. SEED and N are pinned, so sampling noise
inside the margin is zero — the same 300 pairs every run — and the margin buys
exactly one thing: room for the corpus and the index to move. That is measured,
not assumed. On the SAME pinned sample across tonight's corpus states, the
traced population moved 98 -> 90 and REGIME@5 moved 90 -> 87, while pool did not
move at all. So the width goes where the movement is: 10 points under EXACT@5,
5 under pool.

REGIME@5 could have risen to 82 and was left at 80: 83 is the lowest a seed
produced, and two points is not a margin.

## The corrected baseline, three seeds

Tune split, n=300, repaired key, Postgres held, corpus fingerprinted before and
after each individual run:

| seed | corpus clean? | pool | EXACT@5 | REGIME@5 | original join | traced |
|---|---|--:|--:|--:|--:|--:|
| 20260806 (pinned) | CLEAN | 98 | 32 | 87 | 85 (n=151) | 90 (n=149) |
| 7 | CLEAN | 97 | 29 | 83 | 79 (n=164) | 89 (n=136) |
| 99 | **DIRTY** | 96 | 28 | 83 | 76 (n=157) | 91 (n=143) |

Seed 99 straddled a corpus change and is reported rather than calibrated on.

An earlier three-seed pass at n=600 gave pool 96-98, EXACT@5 28-29, REGIME@5
86-88 on the previous corpus state; it is consistent, and it straddled the
1,014 -> 998 reload, so it is not used for calibration either.

**`npm run check` exits 0**, with the corpus verified identical before and after
the whole run:

```
ok   pool     98% (floor 93%)
ok   exact5   29% (floor 22%)
ok   regime5  87% (floor 80%)
ok   regime5  83% (floor 70%)  original join, n=151
ok   regime5  91% (floor 84%)  traced:exact_attribution, n=149
```

Note EXACT@5 read 29 here against 32 on the pinned calibration run, because the
corpus moved between them. The margin absorbed it, which is what the margin is
for.

**Re-verified on a third, materially different corpus state** — 1,076 rows with
`instrument_profiles` back in sync and `eligibility_embeddings` at 5,694, stable
across reads at 22:22Z and 22:23Z, fingerprinted identical either side of the
run:

```
ok   pool     98% (floor 93%)
ok   exact5   30% (floor 22%)
ok   regime5  87% (floor 80%)
ok   regime5  82% (floor 70%)  original join, n=151
ok   regime5  91% (floor 84%)  traced:exact_attribution, n=149
```

The floors therefore hold across THREE distinct corpus states measured tonight
(1,014 / 998 / 1,076 rows), which is the evidence that the margins are sized for
the movement this corpus actually exhibits rather than for a single lucky read.

## Did this fix the ~17-point pool fall workstream S is chasing?

**Yes, and it should be said plainly rather than left to be inferred: it was
never a fall.**

`check_recall_floor.ts` recorded pool at 94-96 before and 78 on the identical
pinned sample after, and held the floor at 90 with the build deliberately red.
Holding it was the right call. But pool did not fall TO 78 — it was CLAMPED at
78, because 78.5% was the arithmetic ceiling the stale key imposed. Retrieval
was finding 95.5% of everything it was permitted to find.

Two independent observations that only this explanation accounts for:

1. An index built `--include-recall-set` and one built holdout-clean, at the
   same moment on the same corpus, **both read pool 78**. Two different indexes
   cannot agree to three significant figures by chance; they agreed because
   neither was the binding constraint.
2. The swing between 97% and 77% on an identical tree with `funding_instruments`
   byte-identical is reproduced exactly by whether the run held Postgres — the
   fallback JSON carries zero ES scheme end dates, so through it nothing is
   closed and the stale key is perfectly valid.

So S's remaining question is not "what took a fifth of the pool away" — nothing
did. If a residual gap survives against the repaired key, it is a different and
much smaller question, and it should be re-measured from this baseline rather
than from 78.

## The corpus would not hold still, and that is now the standing practice

Four distinct movements were observed while this work was done:

| time (UTC) | funding_instruments | note |
|---|---|---|
| 21:31 - 21:38 | 1,014 | stable across three reads; first baseline taken here |
| 21:46 | 998 | 16 rows gone mid-baseline; seeds 7 and 99 straddled it |
| 21:50 | 998, new hash | contents changed, count did not |
| 22:20 | **1,076**, profiles still 998 | the two tables out of sync, mid-load |

**A stability check taken only at the START of a run passes and still yields a
number nobody can reproduce.** Every figure quoted in this file was taken with
the corpus fingerprinted (row count + SHA-256 over ordered rows) immediately
before and immediately after the run, and any run whose two prints disagreed is
labelled DIRTY above rather than quietly averaged in.

That last row is worth its own note: `funding_instruments` at 1,076 while
`instrument_profiles` still holds 998 means the ranking index describes a corpus
that no longer exists. A harness run in that window grades a chimera.
