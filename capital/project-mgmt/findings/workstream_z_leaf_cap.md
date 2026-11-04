# Workstream Z — the leaf cap raised, priced, and bounded on both sides

Branch `workstream-z-leaf-cap`, off `main` at `a4472a91`. Every number below came
out of Postgres with `requireLiveCorpus` asserting it, and every run prints its own
corpus and timestamp — the corpus moved twice while this ran and that turned out to
be the most informative thing that happened.

**`POOL_LEAVES_PER_CHANNEL`: 90 → 250.** `check_leaf_cap` green, headroom 147.

---

## 1. The measurement, and why it had to be taken twice

### Run 1, 16:02–16:27, corpus 1,076 instruments — a null result

Holdout, three seeds, 250 pairs each, same sample, one constant moved. Caps 90 / 103
/ 250 produced **byte-identical output on every metric and every stratum** —
aggregate, mode, population, regime size, founder country. Not "within noise":
identical, 750 replays per arm.

| seed | in pool | EXACT@5 | REGIME@5 | CHANNEL@5 |
|---|---|---|---|---|
| 20260806 | 239/250 | 71/250 | 208/250 | 217/250 |
| 7 | 241/250 | 83/250 | 212/250 | 219/250 |
| 99 | 242/250 | 75/250 | 212/250 | 218/250 |

Raw: `workstream_z_leaf_cap_recall_run1.txt`. These reproduce workstream W's binding
baseline (239/241/242 pool, 73/84/75 exact) to within the IPCEI reopening described
in §5, so the two runs are comparable and the baseline held.

### Why it was null, which is a finding in its own right

`check_leaf_cap` counts **publishable leaves** per (channel, country). At request
time the **capital filters run first** — `passesCapitalPreference` and
`instrumentServesCapital`, `selectLeafInstruments` lines 943-966 — and only then is
the cap applied. Measured with `scripts/probe_leafcap_effect.ts`, one German founder
seeking grants and loans:

```
DE: pool=114   state_aid_satr publishable=103 -> in pool=81
    SEL-COUNTRY 652   SEL-CAPITAL 45   SEL-NATIONAL-EMPTY 2   SEL-DUPE-NAME 1
```

**`SEL-LEAF-CAP` fires zero times for Germany at cap 90.** 103 is what *some*
founder can reach; this founder's SATR set is already below 90 by the time the cap
sees it. The guard is right to be conservative — it must be, or it stops being a
guard — but its number is an upper bound on the runtime bite and the two had never
been told apart. The recall harness passes `capitalSought: ["grant","loan"]` for
every pair, so the measured population never exercised the German cut at all.

That is the correct reading of run 1: **not "the cap is harmless", but "the German
cut is invisible to this harness".**

### Run 2, 16:32–16:57, corpus 1,084 instruments — the cap moved to Spain

Forty minutes into the session `state_aid_satr / ES` went **87 → 95 publishable**
(workstream V is loading Spanish open calls), crossed 90, and `SEL-LEAF-CAP` began
firing for real:

```
cap  90   ES: pool=129   SEL-LEAF-CAP 3
cap 250   ES: pool=132   SEL-LEAF-CAP 0
```

Re-measured, arms **interleaved per cell** so the two readings of a pair are ~3
minutes apart rather than ~15, with the corpus being written to underneath. Raw:
`workstream_z_leaf_cap_recall_run2.txt`.

**Spain only, n=115 holdout, N=250, seed 20260806:**

| | cap 90 | cap 250 | delta |
|---|---|---|---|
| in pool | 96/115 = **83%** | 102/115 = **89%** | **+6.1 pts** |
| EXACT@5 | 39/115 = 34% | 42/115 = **37%** | **+2.6 pts** |
| REGIME@5 | 86/115 = 75% | 86/115 = 75% | 0 |
| CHANNEL@5 | 86/115 = 75% | 86/115 = 75% | 0 |

**Germany only, n=250:** identical on every metric, for the reason above.

**Headline, three seeds:**

| seed | in pool 90 → 250 | EXACT@5 | REGIME@5 |
|---|---|---|---|
| 20260806 | 238 → **239** | 71 → 71 | 208 → 208 |
| 7 | 240 → **241** | 82 → **83** | 212 → 212 |
| 99 | 242 → 242 | 75 → 75 | 212 → 212 |

---

## 2. Per stratum — this is a gain in one market and a cost in none

Every country and every regime-size bucket, both arms, all three headline seeds.
**Exactly one country changes, and only upward:**

| seed | stratum | cap 90 | cap 250 |
|---|---|---|---|
| 20260806 | ES, n=12 | pool 92% | pool **100%** |
| 20260806 | regime 51+, n=134 | pool 94% | pool **95%** |
| 7 | ES, n=11 | pool 82% exact5 55% | pool **91%** exact5 **64%** |
| 7 | regime 51+, n=125 | pool 96% exact5 28% | pool **97%** exact5 **29%** |
| 99 | — | — | no stratum changed |

No country, no regime bucket, no mode, no population, on any seed, moved down. The
regime 51+ bucket is where the SATR siblings live, which is the bucket that should
move if the cap is the thing that moved — it is, and it did.

The tune split agrees, same corpus, minutes apart: `check_recall_floor` reads
exact5 29% → 30%, regime5 86% → 87%, original-join regime5 81% → 82%.

**This is not a trade.** It is a gain concentrated in one market with no measurable
cost anywhere. The aggregate hides it because Spain is 12 of 250 sampled rows —
which is exactly why `measure_recall.ts` now reports by founder country and accepts
`COUNTRY=` to restrict the population.

---

## 3. Payload — measured, and now guarded, because it was not

`check_leaf_cap.ts` told everyone who came to change this constant:

> A wider pool costs payload and nothing else, and payload has its own guard in
> `check_payload_budget.ts`. The two checks bound the constant from both sides.

**That was false.** `check_payload_budget` measured the snapshot minus every
non-framework gate — phase one — which does not depend on the cap by a single byte.
The constant with the worst defect history in this product was bounded on one side
only, and the file asserting otherwise was the file people read before changing it.

Rather than delete the sentence, it has been made true. `check_payload_budget.ts`
now also measures **phase two**, which is the cap-sensitive half:

```
worst case = max over founder countries C of
  sum over channels of the OWN gates of min(cap, leaves serving C)
  plus the own gates of every distinct regime those leaves inherit from
```

Own gates, not merged: `corpus.ts` merges a regime's gates into each child at load,
so counting the merged copy bills one regime once per sibling where the query
returns each row once. An upper bound on purpose — it ignores the capital filter,
the ticket filter and the name dedupe, all of which only remove rows.

Measured, snapshot of 1,076:

| | cap 90 | cap 250 |
|---|---|---|
| phase one | 2.91 MB | 2.91 MB |
| phase two, worst founder (DE) | 1.01 MB | 1.06 MB |
| **total per request** | **3.92 MB** | **3.97 MB** |
| budget | 8 MB | 8 MB |

**Removing the cap entirely costs 45 KB.** The check prints that figure on every
run, so the price of this constant is now on the screen rather than a thing someone
has to go and measure. Headroom to budget: 4.0 MB, ~1,490 more instruments.

One number worth carrying: the *in-memory* cost is larger than the wire cost,
because every child holds a merged copy of its regime's gates. `probe_pool_cost.ts`
reads 2.58 MB for DE and 3.02 MB for FR after phase two. That is not what a wire
budget should bound, but it is the number to look at if hydration latency ever
becomes the complaint.

---

## 4. Why 250

All three previous values — 14, 40, 90 — were chosen to clear the widest
**publishable** group at the moment of choosing. All three were consumed. 90 was
consumed in a day. Choosing 104 would be the same decision a fourth time.

The quantity to clear is not the publishable count, because **publishability moves
with no data load at all**: every leaf already in the database is one liveness
repair or one data-floor fix away from being proposable, and those repairs are
ordinary weekly work. From Postgres, `scripts/probe_leafcap_ceiling.ts`:

| channel / country | publishable | leaves already in corpus |
|---|---|---|
| state_aid_satr ES | 87 (now 95) | **165** |
| state_aid_satr DE | 103 | 116 |
| state_aid_satr IT | 67 | 85 |
| national_dev_banks FR | 73 | 81 |

Spain was 87 and is 165 without one new row being loaded — and it moved 8 of those
78 during this session. So the ceiling to clear is **165**, and **250 is that with
half again on top**: headroom stated as a multiple, so the next person can see what
it was meant to absorb.

**It is still a ceiling, not a surrender.** 250 is reachable — Spain's BDNS register
holds 647,047 convocatorias and is being loaded from, so a group crossing 250 is a
real event and `check_leaf_cap` will fire on it. What it will not do is fire on a
Tuesday because eight Spanish deadlines were corrected. A guard that cries wolf on
routine maintenance gets bumped by one and forgotten, which is the failure mode that
produced 90.

### The previous agent's argument against deriving the cap, read and upheld

> Deriving it — cap = the widest group, i.e. no cap — silently re-links pool size to
> corpus growth, so the payload budget becomes the only thing between a corpus load
> and a request nobody can ship.

That premise is now measurably weak: payload is 45 KB, not a wall. **The conclusion
still stands, for the reason that survives the measurement** — a derived cap cannot
be too small, so it can never fail `check_leaf_cap`, so nobody ever reads the
reasoning again. The constant stays a choice with a guard. What the measurement
changes is *how the number is chosen*, not whether it is a constant.

---

## 5. The guard's stale-snapshot blindness — dependency stated, not duplicated

`check_leaf_cap` deletes `DATABASE_URL` and measures the committed snapshot for
determinism. That determinism is a property of the snapshot **agreeing with
Postgres**, not of reading a file: on 2026-08-06 the snapshot was 62 rows behind and
this guard read GREEN at 87 (ES) while the third occurrence, 103 (DE), was live.

Fixed by ordering, not by code. `check_corpus_currency` already asserts the
membership gap that hid this, so it now runs **before** `check_leaf_cap` in
`npm run check`, and the header states the dependency. No second copy of the
currency logic was added — two checks asserting one property in two ways is the
duplication class this repo keeps finding as a defect.

Re-verified against Postgres with `scripts/probe_leafcap.ts`: 1,076 instruments, 817
publishable, widest group `state_aid_satr / DE` at 103 — identical to the snapshot
reading, so the guard was measuring the right thing today.

---

## 6. Two things that are RED and are not mine

Both were red on `main` before this branch and are recorded here because they gate
the numbers above, not because this workstream caused them.

1. **`check_corpus_currency` FAILS.** The eleven `ipcei_*` rows are CLOSED in the
   snapshot (`basis=closed_beneficiary_list`, workstream W's retraction) and **OPEN
   in Postgres** — the retraction is present in one store and absent from the other,
   in the direction opposite to the 2026-08-06 incident. Postgres publishable is
   therefore 817/825, not 806. Plus 8 live instruments absent from the snapshot and
   8 with no `instrument_profiles` row, which is workstream V's Spanish load in
   flight. **Fix: `make eligibility` and rebuild the profile index once the ES load
   settles, and re-apply `close_fixed_beneficiary_lists.py --parent ipcei --write`
   to Postgres.**
2. Because `check_leaf_cap` now runs after it, that failure gates the tail of
   `npm run check`. Run individually, all four are green at cap 250:
   `check_leaf_cap` (ok, headroom 147), `check_payload_budget` (3.97 MB, within
   budget), `check_hydration_parity` (exit 0), `check_recall_floor` (all floors
   met). `npx tsc --noEmit` and `npx vitest run` clean.

Note that `NO_PG=1` does not reach `check_corpus_currency`: it loads `.env.local`
itself, by design, so it never passes quietly on a comparison it could have made.

---

## 7. Floors: NOT raised, deliberately

`check_recall_floor` on the tune split reads pool 98% (floor 93), exact5 30% (floor
22), regime5 87% (floor 80) — and the cap raise moved exact5 and regime5 up by a
point each. The margin would license a raise.

**It should not be taken on this corpus.** The corpus grew 1,076 → 1,084 during this
session with a Spanish load still in flight and `check_corpus_currency` red. A floor
is a promise; pinning one to a reading taken mid-load is how a floor becomes a flake
and then gets lowered, which is worse than never having raised it. **Raise the
floors in the session after the snapshot is republished and currency is green** —
pool 95 / exact5 25 / regime5 83 look supportable on today's readings.

---

## What this means

The cap is off the critical path for the next several corpus loads rather than for
the next one, and for the first time the cost of that decision is a number the build
prints rather than a thing each agent re-derives. The measured gain is real but
narrow — six points of pool recall for Spanish founders, nothing anywhere else —
because a second collapse, the one-row-per-institution-name dedupe, and the capital
filters both sit between this constant and the pool. **The next place to look for
pool recall is those two, not here.** For a German founder, 81 of 103 publishable
SATR leaves reach the pool at every cap from 90 upward; the cap is not what removes
the other 22.
