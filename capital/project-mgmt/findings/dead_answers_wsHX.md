# wsHX — what the record was missing, and how much of our own target is unreachable by construction

**FOR THE OWNER, VERBATIM.** _(job 1 paragraph lands here)_

**And the second half, which is the one that changes what we plan.** Of the 897
founders we grade every measurement against, **78 name a fund the product may
not offer** — and they are not one kind of thing. **Thirteen cannot be got right
by anyone**: six won a call whose deadline has passed for good, and seven won a
row we have decided not to offer. **Forty-five name an object that is not a
door at all** — nineteen won an IPCEI approval wave, which has no application
route because nobody applies to one, and twenty-six won a loader-constructed
bucket label (`sudop_bgk_kit_v3`, `chips_ju_kdt_unknown`), twenty-two of them
Polish founders whose entire national offer in this corpus is five such labels.
**Only twenty are our own corpus defect** and belong in the denominator: eleven
below the data floor, and nine schemes whose notified duration expired and whose
funder nobody has asked. So the honest sentence is **"we grade against 897, of
which 13 cannot be got right by anyone and a further 45 name something no
founder could have applied to"** — and both numbers are published here because
choosing between them is choosing how the score reads. On the strict
denominator `publishable` goes 91.30% → 92.65% and `top_5` 36.01% → 36.54%; on
the wider one, 97.62% and 38.50%. **Nothing about the product improved.** The
top_5 move is inside the half-width the funnel already carries and must never be
quoted as a gain. The `publishable` move is the finding: **almost the entire
loss at that stage is the answer key naming objects that are not funds, not the
corpus failing to hold funds it should.** The key is unchanged — removing a
founder from a recall set is a decision about what we are trying to do, and it
is yours.

---

```
run             2026-08-19, isolated worktree wsHX-gates off main at a94d267c
cost            job 2: zero. No paid model call, no write, Postgres read only.
population      __recallSetDescribed.json  split=holdout  N=897
                draw fingerprint 13cb71cf3a1d1847 — ASSERTED, not printed:
                the committed funnel run's own draw, so every figure here and
                every figure in one_funnel/latest.json is about the same
                founders.
corpus          POSTGRES, 1,088 instruments, 760 publishable, asOf 2026-08-18
reproduce       cd website/frontend
                npx tsx scripts/_wshx_dead_answers.ts          # free
                ROWS=1 npx tsx scripts/_wshx_dead_answers.ts   # + every row named
full output     project-mgmt/findings/dead_answers_wsHX_census.txt
```

---

## 1. Nine was what one workstream met. Thirty-seven is the census.

wsHQ found nine founders whose won fund is a scheme that has ended — nine is the
number its change *moved*, not the number that exist. Asked of the whole
population, with production's own predicates imported rather than restated:

**37 of 897 founders (4.12%) won a fund whose `scheme_end_date` is already
past**, on 25 distinct funds. And the basis is the whole story, exactly as
`lib/intelligence/liveness.ts` says it is:

| basis | founders | funds | still publishable | open | between_calls | shut |
|---|---:|---:|---:|---:|---:|---:|
| `call_deadline` | 20 | 15 | 14 | 0 | 14 | 6 |
| `notified_duration` | 17 | 10 | 8 | 8 | 0 | 9 |
| **total** | **37** | **25** | **22** | 8 | 14 | 15 |

**Twenty-two of the thirty-seven are still offered, and correctly.** Fourteen
because a funder's own page says the programme recurs — they reach the founder
with the between-calls caveat. Eight because a current award year evidences that
the notification was prolonged: the date is a stale notification, not a shut
door.

The fifteen that are withheld split on the axis the basis column exists for:

- **6, `call_deadline`.** A passed application deadline is closure, permanently.
  Nothing anybody does brings these back.
- **9, `notified_duration`.** These are wsHQ's nine. The notification expired,
  no award year is current enough to evidence a prolongation, and **nobody has
  read the funder's page**. wsGL's precedent on exactly this question is that
  reading the page brought 11 of 15 rows back. These are a question we have not
  asked, not a door that has shut.

## 2. The 78, and the three people who can fix them

`publishable` loses 78 founders. The clause each fails is not the useful cut —
the useful cut is **who can do anything about it**.

| tier | founders | % of key | what it is |
|---|---:|---:|---|
| **A — gone or withheld** | 13 | 1.45% | 6 dead call deadlines · 7 withheld by editorial policy |
| **B — not a door** | 45 | 5.02% | 19 no application route on the object named · 26 nothing outside its own id names it |
| **C — our own corpus defect** | 20 | 2.23% | 11 below the data floor · 9 an unexamined notified duration |

**Tier B is the finding.** It is larger than A and C together, and it is not a
corpus gap:

- **19 IPCEI approval waves** — `ipcei_hy2tech`, `ipcei_micro`, `ipcei_eubatin`,
  `ipcei_mect`, `ipcei_hy2move`. The money is real and the founder really got
  it; they got it through a *national* call, and the object the key names is the
  Commission's approval of the wave. There is no application route because there
  is nothing to apply to. No ranker can propose it, and none should.
- **26 loader-constructed bucket labels** — `sudop_bgk_kit_v3` (6),
  `sudop_ncbr_aid` (6), `sudop_regional_inv` (6), `sudop_rd_centers` (3),
  `sudop_parp_rd` (1), `satr_lt_equity` (2), `chips_ju_kdt_unknown` (2).
  Twenty-two of the twenty-six are Polish, which is the same fact
  `project_offerability_residual` records from the other side: Poland's entire
  offerable pool is eight `Sudop *` rows with no real Polish fund among them.

Both are answer-key defects rather than corpus defects, and the repair is the
same in both cases: **re-attribute the answer to the scheme that actually paid.**
That is a change to the recall set, which is yours to make and is why nothing
here touches it.

## 3. The honest population — both numbers, and the flattering one named as such

There are two defensible values of M and the census prints both, side by side,
because picking one is picking how the number reads. The numerator is reduced
with the denominator: every founder in A and B fails publishability, so all of
them are lost at `publishable` exactly and survive only `answer_key` and
`in_corpus`. (Applying the smaller denominator to an unchanged 897 reads
101.47% at the top of the ladder, which is the arithmetic telling you somebody
swapped a denominator and forgot the numerator.)

| stage | N=897 | M=A → 884 | M=A+B → 839 |
|---|---:|---:|---:|
| answer_key | 100.00% | 100.00% | 100.00% |
| in_corpus | 100.00% | 100.00% | 100.00% |
| **publishable** | **91.30%** | **92.65%** | **97.62%** |
| liveness_confirmed | 91.30% | 92.65% | 97.62% |
| founder_screen | 88.85% | 90.16% | 94.99% |
| gates_pass | 87.63% | 88.91% | 93.68% |
| pool_cut | 74.47% | 75.57% | 79.62% |
| writer_cap | 42.70% | 43.33% | 45.65% |
| published | 41.25% | 41.86% | 44.10% |
| top_6 | 38.46% | 39.03% | 41.12% |
| **top_5** | **36.01%** | **36.54%** | **38.50%** |

**It rises, on both readings, and the rise is not a result.** `top_5` moves
+0.53 / +2.49 pts, inside the ±3.1 pt half-width the funnel already carries at
n=897 — quoting it as an improvement would be quoting a denominator change as a
product change. The `publishable` move (+1.34 / **+6.32** pts) is the one that
means something, and what it means is uncomfortable rather than flattering:
**on the wider reading, 45 of the 78 founders we lose at that stage are lost
because the thing we told ourselves they won is not a fund.**

## 4. What this does NOT say

- **The key is unchanged.** No founder was removed and no answer re-attributed.
  The count and the argument are here; the decision is the owner's.
- **`exact scheme in top 5, 95%` is not moved by this.** The target is stated on
  full founder information, and this is a measurement of the denominator, not of
  reach. Nothing here is evidence for or against the ceiling.
- **Tier C is not a excuse.** Twenty founders are lost to defects we can close,
  and they stay in the denominator for exactly that reason. Nine of them need a
  funder's page read; eleven need amounts and dates loaded.
- **The tiers are asked of the failing clause, never of a source.** A fund
  loaded next year from a register nobody here reads lands in a tier with no
  edit to the census. No fund, feed, country or source name appears in the test.

## Reproduce

```
cd website/frontend
npx tsx scripts/_wshx_dead_answers.ts          # the census, free
ROWS=1 npx tsx scripts/_wshx_dead_answers.ts   # + every one of the 78 named
```
