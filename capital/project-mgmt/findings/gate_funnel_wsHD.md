# wsHD — the 63 gate corrections are right, and they do not move the funnel

**FOR THE OWNER, VERBATIM.** Applying the 63 gate corrections would take the
brief from **35.8% to 36.2% at six rows** — four founders in 897, inside this
run's own noise (exact McNemar p=0.42). What they unambiguously fix is one row
higher up: the gate screen stops deleting **21 founders' won fund** and deletes
none of anybody else's, 86.3% → 88.6%, p<0.001. Only **nine of those 21 reach
six rows**, and **five other founders are pushed out** of six rows by the same
change, because quarantining a comparator stops it deleting a row for *every*
founder — the mean pool grows from 79.5 to 83.2 rows, for all 828 of them, and
the extra rows compete for the same forty-row and eight-row cuts. The cost side
of the decision is unchanged and still holds: the guard's judgeable population
falls 6,167 → 6,052 against its floor of 6,000, so **52 pairs of headroom**.
**Apply them — the encodings are wrong and the funder's own pages say so — but
apply them as a correctness fix, not as a funnel move.** The important result is
the second one: `check_winner_not_gated`'s 251 and the founder's experience have
come apart, and the reason is structural. That guard counts 7,095 register pairs
where one ADEME forestry scheme contributes hundreds; the funnel counts 897
distinct founders, of whom only **65 (7.2%) won a fund any of these 63 rules
touches at all**. No further pass of this shape can move six rows by more than
that ceiling, whatever it fixes.

---

```
run             2026-08-17, isolated worktree wsHD-gatefix off main at e33dddc6
population      897 founders — holdout, described, one per company, drawn BEFORE
                the offerability cut. draw fingerprint 13cb71cf3a1d1847,
                IDENTICAL to one_funnel/latest.md and to rank_shape_wsGY.md
corpus          postgres instruments=1088, requireLiveCorpus asserted
ranker          all 1,656 request(s) on EMBEDDING  (2 arms x 828 founders)
cost            zero. ANTHROPIC_API_KEY deleted before import; the second arm
                buys no Voyage call (semanticFundMatch caches by description).
                NO PAID MODEL CALL. NO CORPUS WRITE. NO PUBLISH.
reproduce       cd website/frontend
                GATE_OVERLAY=../../project-mgmt/evidence/wsgu_gate_encoding_corrections_2026-08-13.jsonl \
                  npx tsx scripts/measure_funnel.ts          # ~20 min, free
                npx tsx scripts/_wshd_pg_drift.ts            # the store's own rows
                npx tsx scripts/_wshd_pg_drift.ts --winners  # who could be moved
                npx tsx scripts/_wsgu_counterfactual.ts      # the guard's 251 -> 14
report          project-mgmt/findings/one_funnel/counterfactual_latest.md
                project-mgmt/findings/gate_funnel_wsHD_run1.txt  (the first run,
                45 minutes earlier, founder for founder identical)
```

**Nothing was applied.** No `INSERT`, `UPDATE` or `DELETE` ran against any
store, `apply_gate_encoding_corrections.py` was never invoked, and nothing was
republished. The proposed comparators were served to the eligibility engine
**in one process's memory** and discarded when it exited.

`npx tsc --noEmit` clean, `npx vitest run` 764 passing, `check_contracts` and
`check_ws_scripts` green. `npm run check` is red on 14 of 55 — **every one of
them red on the base commit with this workstream's two edited files reverted**,
checked one by one rather than assumed, including `a winner is never gated out
of the memo`, which is the guard §0 exists to fix.

---

## 1. How a proposal can be measured without being written

`npm run stages` hydrates from Postgres. That is why wsGU's own before/after was
identical by construction and said so: the corrections are a proposal, and the
funnel could not see one. What it could see — `_wsgu_counterfactual.ts` — applies
them in memory to the committed snapshot and re-runs `assessInstrument` alone.
That instrument has no ranker, no pool cut and no writer cap, so it can report
what a guard's counter becomes and it cannot report what a founder sees.

So `corpus.ts` grew one seam: `setGateOverlay()`. A caller installs a map of
proposed comparators; both hydration phases serve them instead of the store's
value; nothing is written. It is **inert unless something installs one** — no
env var, no file read, no default inside `lib/` — so a server that never calls
it cannot reach the code at all. It verifies rather than trusts: a row whose
stored comparator is not the one the proposal was written against is recorded as
**drift** and keeps the store's value.

`measure_funnel.ts` then runs **the whole ladder twice per founder**, the
store's encoding and then the proposal, and the arms are paired inside one run
because cross-run comparison is not currently safe — wsGY watched the shipped
ordering drift a few founders in a couple of hours while workstreams republish
`instrument_profiles`. Both arms see the same draw, the same intake, the same
corpus read and the same embedding.

**It refuses rather than reporting a flattering zero.** An overlay that reached
no gate produces two identical arms and a report saying the proposal changes
nothing — the most consequential conclusion this instrument can reach and the
easiest to reach by accident. So drift is fatal, an overlay that never fired
throws, and the number of comparators that actually reached the engine is
printed above the table.

### The store holds what the proposal was written against

The corrections were authored against the committed snapshot, and wsHC has since
established that the snapshot and Postgres are not the same gate table. So the
store was asked directly, read-only (`_wshd_pg_drift.ts`):

```
postgres holds 9,763 gate rows
63 corrections: 62 match postgres exactly, 1 already applied, 0 drifted, 0 absent
  APPLIED  chips_ju_kdt_unknown [G1-03]
```

One row — a Chips JU per-country establishment filter — **already holds the
proposed comparator in Postgres though not in the snapshot**. It is therefore
not part of what applying the file would change, and the funnel arm below
measures 62 changes, not 63.

---

## 2. The funnel, both arms, one population

Paired at the founder, 897 founders, one run. `store` is the shipped funnel.

| stage | store | proposed | delta | entered / left | exact McNemar p |
|---|---:|---:|---:|---:|---:|
| the answer key names a fund they won | 897 100.0% | 897 100.0% | 0 | — | — |
| ... the corpus still holds it | 897 100.0% | 897 100.0% | 0 | — | — |
| ... it is publishable | 828 92.3% | 828 92.3% | 0 | — | — |
| ... its openness could be confirmed | 828 92.3% | 828 92.3% | 0 | — | — |
| ... this founder's screen keeps it | 806 89.9% | 806 89.9% | 0 | — | — |
| **... its gates do not conclusively fail** | **774 86.3%** | **795 88.6%** | **+21 (+2.3 pts)** | +21 / -0 | **<0.001** |
| ... it survives the 40-row pool cut | 643 71.7% | 654 72.9% | +11 (+1.2) | +19 / -8 | 0.052 |
| ... it survives the 8-row writer cap | 362 40.4% | 368 41.0% | +6 (+0.7) | +12 / -6 | 0.238 |
| ... it is one of the 7 published rows | 347 38.7% | 354 39.5% | +7 (+0.8) | +10 / -3 | 0.092 |
| **... it is in the first 6** | **321 35.8%** | **325 36.2%** | **+4 (+0.4 pts)** | +9 / -5 | 0.424 |
| ... it is in the first 5 | 297 33.1% | 299 33.3% | +2 (+0.2) | +7 / -5 | 0.774 |

The `+/-` on a level in this run is 3.1 points at six rows. **The gain at six
rows is a tenth of that.**

**Two runs, 45 minutes apart, agree founder for founder** — +21, +11, +6, +7,
+4, +2 — so the numbers above are not a draw of noise. The first run's report is
committed beside this finding.

---

## 3. Where the gain goes, and what eats it

Of the **21 founders the proposal un-gates**:

```
    19 of 21 still there at the 40-row pool cut
    12 of 21 still there at the writer cap
    10 of 21 still there in the 7 published rows
     9 of 21 still there in six rows
     7 of 21 still there in five
```

And **five founders LEAVE six rows** under a proposal that only ever un-blocks.
That is not a paradox and it is not noise; it is the mechanism, counted:

```
  mean accessible pool   79.5 rows  ->  83.2 rows
  founders whose pool grew    828 of 828
  founders whose pool shrank  0 of 828
```

**A quarantined comparator stops deleting the founder it wrongly deleted, and it
stops deleting that row for every other founder too.** Every one of the 828
founders whose answer reaches the founder stages gets a longer pool — about four
more rows each — and those rows compete for the same forty-row cut and the same
eight-row writer cap. So the proposal buys 21 founders at the gate screen and
sells about half the gain back at the two cuts below it.

That is a property of **quarantine as a remedy**, not of these 63 rows. It is
the same conclusion wsGU reached from the other side — *"the next pass of this
kind needs a better field to move rules to, not more quarantine"* — arriving
here as a measured cost rather than as a caution. The eight re-keyed rows and
the six moved to the offer route do not have it: they replace a comparator with
one that still discriminates, or move the fact to a layer that explains rather
than deletes.

---

## 4. Why the guard's 251 and the founder's 4 are both true

They are different populations, and the difference is not a subtlety — it is
two orders of magnitude in what one instrument counts.

| | `check_winner_not_gated` | `npm run stages` |
|---|---:|---:|
| population | 7,095 register pairs | 897 founders |
| one per company | no | yes |
| held out | no | yes |
| requires a description | no | yes |
| the answer must still be offerable | no | it is a ROW, not a filter |

`_wshd_pg_drift.ts --winners` measures the overlap directly. Of the funnel's 897
founders, **65 (7.2%) won a fund one of the 63 corrections touches**, spread over
22 instruments:

```
    10 founders   nfr_energiforskning
     8 founders   vinnova ... nationella flygtekniska forskningsprogrammet
     7 founders   vinnova ... avancerad digitalisering
     6 founders   chips_ju_kdt
     5 founders   vinnova ... 6g
     5 founders   innovation_fund_ssp
     ... 16 more instruments, 24 founders between them
```

**65 is the arithmetic ceiling on what this proposal can move at any row**,
before a single gate is evaluated. The guard's 251 is dominated by rows the
funnel's population contains at most once each: ADEME's forestry scheme alone
supplies hundreds of the guard's pairs from one French sector, and 31 of the 63
comparators never reached any founder's shortlist in this run at all.

Neither number is wrong. **`check_winner_not_gated` is a correctness guard on
the corpus and should be read as one**; it is not a proxy for the funnel, and it
was being used as one in the decision this workstream was given.

---

## 5. What it costs, verified today

wsGU's stated cost still holds, re-measured on this worktree rather than quoted:

```
  testable: at least one filter evaluated    6167 (floor 6000)      -- today
  ... with the corrections applied           6052                   -- 52 of headroom
  winners the gate screen deletes            251 -> 14 (ceiling 207, REACHED)
```

`check_winner_not_gated` is **red today at 251**, above its ceiling of 207. With
the corrections it reads 14 and the guard goes green, at the price of 115 pairs
of judgeability and 52 pairs of remaining headroom above the anti-vacuity floor.
Seven of the 45 instruments touched are left with no encoded filter of their
own; that is the honest state for a rule an eleven-value sector list cannot
express, and those funds should be ranked with their requirement shown rather
than screened out of the founders who won them.

---

## 6. What this changes about the queue

- **§0 is still worth applying, and for the reason it was written**: 63 encodings
  contradict the funder's own page, they delete founders who demonstrably won,
  and no code change reaches them. It is a correctness fix with a small,
  measured funnel gain — not the biggest single fix on the shortlist.
- **The sibling argument does not survive this measurement unchanged.** wsGY put
  63.2% of misses on a sibling of the won fund and wsAO showed gates separate
  siblings, so gate encoding looked like the lever that acts on the dominant
  failure. It is — but *these* 63 rows reach 7.2% of the population, and the
  half of them that are quarantines make every pool longer for everyone. A gate
  change that SEPARATES siblings is the lever; a gate change that REMOVES a
  comparator is the opposite of it, and this file is 48 removals.
- **The next gate pass should be measured this way before it is bought.** The
  harness now exists and costs nothing: `GATE_OVERLAY=<file> npm run stages`
  reports the whole funnel both ways in ~20 minutes without touching a store.
- **A guard's counter is not a product number.** That is the finding this
  workstream would keep if it kept only one.
