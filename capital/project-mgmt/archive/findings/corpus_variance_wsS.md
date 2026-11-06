# Why the same measurement read 97% and 77% twenty minutes apart

Workstream S, 2026-08-06. Branch `workstream-s-variance`.

## The answer in one paragraph

The two runs ranked on **two different corpora**, and nothing on screen said
which. `hydrateDbInstruments()` is Postgres-first and silently falls back to the
committed `public/data/instrument_terms.json` on any failure. The two disagree
about which funds are still open for **205 of 998 instruments**, and the entire
20-point pool difference is one column: `scheme_end_date`. Retrieval itself is
deterministic — eight runs, sequential and concurrent, on one corpus state gave
byte-identical pool, ranking *and* exclusion counts. **Retrieval does not vary.
The corpus underneath it does.**

And the direction is the uncomfortable one: **95% was the wrong number.** It was
measured on a corpus in which 86 legally closed calls were still on offer.

## 1. Reproduced deliberately

`website/frontend/scripts/diagnose_corpus_variance.ts` replays exactly
`check_recall_floor.ts`'s pinned 150-pair tune sample, holding the semantic
index, the sample and the seed fixed and moving one thing at a time. Every arm
restores `DATABASE_URL` immediately after hydration, so semantic ranking is
identical across arms and cannot be confounded with the corpus.

| arm | pool | mean pool size | closed calls in pool, per founder |
|---|---|---|---|
| snapshot (`CORPUS=json`) | **95.3** | 102.0 | 20.3 |
| ” + `eventCount, companyCount, totalEur, awardP50, awardN` | 95.3 | 102.0 | — |
| ” + `lastYear` | 95.3 | 102.0 | — |
| ” + `successorScheme` | 95.3 | 102.0 | — |
| ” + `schemeEndDateBasis` | 95.3 | 109.8 | — |
| ” + all 23,333 gates replaced by Postgres's | 95.3 | 102.0 | — |
| ” + **`schemeEndDate`** | **75.3** | 82.8 | — |
| ” + `schemeEndDate, schemeEndBasis` | 75.3 | 90.7 | — |
| Postgres (`CORPUS=pg`) | **75.3** | 90.7 | 1.1 |

The last two rows agree to the decimal *and* on every exclusion-rule count
(`SEL-COUNTRY 92444, SEL-CAPITAL 3948, SEL-NATIONAL-EMPTY 94, SEL-DUPE-NAME 36`),
which is the proof that `scheme_end_date` + `scheme_end_date_basis` are the
whole difference and nothing else in the corpus is contributing.

**Gates were the obvious suspect and are ruled out.** Against Postgres,
phase-one hydration loads only `WHERE i.is_framework` — 56 gates on 8
instruments — while the snapshot ships all 6,368, resolving to 23,333 after
inheritance. Splicing the full gate layer onto the Postgres corpus moves the
headline **not at all**. Selection is genuinely gate-free, as
`selectInstrumentRows` documents.

### Is it bimodal, or continuous, or time-correlated?

Neither bimodal nor continuous — **stepwise, and the steps are writes to the
shared database**. Within one corpus state the measurement is exactly
reproducible; it moves only when someone writes.

| when | pool | `funding_instruments` |
|---|---|---|
| 21:38–21:49Z | 75.3 | 1,014 |
| 21:50Z onward (8 runs, 4 of them concurrent) | 72.0 | 998 |

Eight runs at the second state — four sequential over five minutes, four
launched simultaneously — returned identical figures to the decimal. Process
start, wall-clock and concurrency are all irrelevant. Only the write is.

## 2. The mechanism, named

Three distinct faults compose into one symptom.

**(a) The fallback is invisible.** `hydrateDbInstruments()` catches every
Postgres failure, logs one line to `console.error`, loads the JSON snapshot and
returns normally. Connect timeout is 2s and `statement_timeout` is 2s, against a
database that a dozen agents are hammering. There was no way — during a run or
after it — to ask which corpus a number came from.

**(b) The snapshot cannot evaluate the liveness rule.** It carries **no
`schemeEndBasis` key at all**, on any record. `isClosed()` treats an unlabelled
end date as a call deadline and closes it permanently, so on the fallback path
every SATR notified-duration expiry reads as a closure and **119 live regime
leaves are hidden**. `website/build/eligibility_export.py` was fixed to emit the
field at commit `c242fba0` (2026-08-06 21:12Z); the artifact was never
regenerated, so the fix has not reached the file. The exporter's own comment
states the consequence exactly: *"Without the basis the two paths disagree about
liveness."*

**(c) The snapshot is a day behind on deadlines.** It was generated
2026-08-05T23:45Z. Since then **86 application deadlines were loaded into
Postgres** — 80 Spanish BDNS convocatorias and 6 French ADEME calls, all
`basis = call_deadline`, all in the past. The snapshot has `schemeEndDate: null`
for every one of them and still offers them.

Net: 205 of 998 instruments are open in one corpus and closed in the other
(86 closed only under Postgres, 119 closed only under the snapshot).

Why this shows up as *pool recall*: **31 of the 150 pinned answers** are among
those 86 now-closed calls. 31/150 = 20.7 points, and the measured gap is 20.0.
That is the entire regression.

## 3. Is pool 78 a product regression? No.

Restricting the pinned sample to the 119 pairs whose answer is a fund the
register still calls open:

| corpus | pool (live answers only, n=119) |
|---|---|
| Postgres | **90.8 ±5.2** |
| snapshot | 95.0 ±3.9 |

**Retrieval finds 91% of the funds it could still legitimately find.** The
72–78% figures are 31 dead calls in the answer key dragging down an arithmetic
ceiling of ~79%. Workstream R reached the same conclusion from the answer-key
side and owns the repair; this is an independent confirmation from the corpus
side, and the two agree.

Consequences for the floors:
- The `pool: 90` floor is **approximately right, but only on live-answer
  pairs** — and 90.8 ±5.2 sits on its edge, so it will flap until the
  population is fixed.
- Lowering it to 72 would have enshrined the answer key's age as a product
  target. Leaving it at 90 against the current population fails every run.
- Neither is the fix. The population is: pool recall as currently measured
  **decays automatically every time a deadline passes**, whether or not anything
  about the product changes. That is not a metric, it is a clock.

## 4. THE PRODUCT BUG — retrieval does not vary, but the served corpus does

This is the part that outranks the measurement question.

When Postgres is slow or briefly unreachable — which happened to at least one
agent tonight — a **real founder's request** silently completes against the
snapshot. Measured on the pinned sample:

| | founders shown ≥1 closed call in their top 5 | closed calls in pool, per founder |
|---|---|---|
| Postgres | **0%** | 1.1 |
| snapshot fallback | **26%** | 20.3 |

On the fallback path, a quarter of founders are pointed at a fund whose
application deadline has passed, averaging 0.95 dead rows of the five they see.
`check_hydration_parity.ts` makes it concrete: the "AI B2C software" archetype
gets **78 Spanish BDNS convocatorias** on the snapshot path that Postgres
correctly withholds; the French archetype gets 6 expired ADEME calls; and in the
other direction the Dutch and German archetypes lose their live SATR schemes to
IPCEI buckets.

Both halves are harm: dead calls offered, and live funds hidden. **A 2-second
timeout on a loaded database is all it takes.**

Not fixed here, because the choice is the PM's:

- **Keep degrading** (today's behaviour) and accept that a Railway blip means a
  founder is advised off a stale corpus. Tolerable only once the snapshot
  actually agrees with Postgres — i.e. once it is regenerated on every publish
  and that is enforced, which `check_corpus_currency.ts` now does.
- **Fail the request** instead. Honest, and turns a database blip into a visible
  outage rather than quiet bad advice.
- **Degrade but say so on the page** — serve the snapshot and tell the founder
  the list may be out of date.

The guard added here does not decide this. It makes the divergence impossible to
ship unnoticed, which is the precondition for any of the three.

## 5. What was built so that this cannot be measured through

Nothing was loosened. Two checks now fail that did not before.

**`lib/intelligence/corpus.ts`** — `corpusProvenance()` reports which corpus this
process hydrated and whether it is the one it asked for. `requireLiveCorpus()`
throws when `DATABASE_URL` was set and the snapshot was used anyway. Called by
`measure_recall.ts` and `check_recall_floor.ts`; both now print `corpus=` next to
their figure, the way `loadRecallSet` made numbers carry their answer key.
`NO_PG` still passes — an honest snapshot run says so. Provenance is also
recorded on the third variant of the trap: reading `loadDbInstruments()` without
ever hydrating.

The request path is deliberately unchanged. A founder mid-brief is better served
by a slightly stale table than by an error; that trade is why the fallback
exists. What ends is producing a *number* from it silently.

**`scripts/check_corpus_currency.ts`** (new, in `npm run check`) — asserts the
property, not tonight's symptom:

> the fallback corpus must answer every liveness question exactly as Postgres
> does

tested by asking both, through the one `isClosed()` definition, over every
instrument. A dropped field, a stale value, a column the exporter does not carry
yet, a truncate-and-reload half applied — all surface as a disagreement,
including the ones nobody has thought of. Deliberately *not* "does the snapshot
have a `schemeEndBasis` key": that names today's missing field and passes
tomorrow with a different one missing. It also fails when `instrument_profiles`
lacks a row for any instrument, which covers both a stale index and a
`--rebuild` in flight — a missing profile scores 0, which the ranker cannot
distinguish from "thematically wrong".

Currently fails: 205 disagreements, 16 orphaned snapshot instruments.

**`scripts/check_hydration_parity.ts`** — existed, was exactly the right guard,
and **was in no build step**; its header says "run after `make eligibility`",
and a habit is not a guard. Now in `npm run check`. It also lacked the
`.env.local` preamble every other harness carries, so it read no `DATABASE_URL`
and printed *"skipped — nothing to compare against"* on machines that had the
credentials all along. A check that goes green having done nothing is the defect
it exists to catch, in the check itself. Fixed; it now fails on 23 archetype
differences.

Ordering in `npm run check` is deliberate: currency and parity run **before**
`check_recall_floor`, because there is no point trusting a floor before knowing
which corpus it will be measured on.

## 6. What to do next, in order

1. **Regenerate and republish the snapshot** — `make eligibility`. Not done
   here: generated artifacts belong to K2, and the check failing red is the
   correct state until they are regenerated. This alone closes the 20-point
   split and stops founders being served dead calls on a blip.
2. **Answer-key repair** — workstream R, in flight. 31/150 pinned answers point
   at permanently closed calls. Until that lands, no pool floor is meaningful.
3. **Re-derive the floors afterwards**, on live-answer pairs, against a corpus
   whose fingerprint is recorded. The honest current reading is pool
   **90.8 ±5.2** on the Postgres corpus, live answers only, n=119.
4. **Decide the degradation policy** (§4). This is a product decision, not an
   engineering one.
5. **Treat every pool figure taken on 2026-08-06 before this as unattributed.**
   Any of them could be either corpus. They are not wrong so much as unlabelled,
   and there is no way to recover which is which after the fact — which is
   precisely what `corpusProvenance()` now prevents.

## Ruled out, so nobody re-chases them

- **Non-deterministic retrieval.** 8 runs on one corpus state, sequential and
  concurrent: identical pool, ranking and exclusion counts, to the decimal.
- **A Voyage degradation to lexical.** The arms hold `VOYAGE_KEY` and
  `DATABASE_URL` identical; `semanticFundMatch` is not the variable. (It *is* a
  live silent-degradation risk — a 429 logs and returns an empty map — but it
  did not cause this.)
- **The `instrument_profiles` rebuild.** It completed at 21:04Z, before both of
  P's reads. Both were taken on a complete index.
- **Gates.** Splicing the full gate layer onto the Postgres corpus moves nothing.
- **Award volume, `lastYear`, `successorScheme`, `sectorMix`, region fields.**
  No effect, individually or together.
- **Holdout leakage into the semantic index.** Already ruled out by the leak
  audit; independently consistent here, since the index was never the variable.
