# wsHQ — why a scheme that ended in 2020 was published as a live door

**One paragraph for the owner.** We published SA.40453 — a French state aid
regime whose notified duration ended 2020-12-30 — as row 5 of a real founder's
brief because our rule for "is this fund open" had no expiry date on its own
evidence. The rule said, correctly, that an award paid *after* a notification
expires is only lawful under a prolonged measure, so a later award year proves
the notification was renewed. It then treated that proof as permanent. SA.40453
paid an award in 2022, so from 2022 onwards it was open forever. `betweenCalls`,
the mechanism wsGT built for exactly a row whose window has shut, never got the
chance to fire: the row was never *closed*, so `callStatus()` returned `open`
and never reached the question "does the funder say this programme continues".
The fix is one clause: an award in year Y evidences a prolongation **through
year Y and no further**, and once Y is outside the register's own reporting lag
the declared expiry is again the last thing anybody has stated about the window
— at which point the row goes to `callStatus()` and is offered only if a funder's
page says the programme runs on, **with the caveat shown**. It costs **18 rows
of 778 publishable (2.3%)**, it moves **5 rows from silently-open to
offered-with-the-caveat**, and it is the reason the founder in the prodcheck no
longer gets a door that closed five years and eight months before she knocked.

---

## 1. Establishing WHY, rather than adding a second mechanism

The instruction was to find out why `betweenCalls` did not fire before building
anything. `scripts/_wshq_probe.ts` asks the live corpus, row by row, and the
answer is not any of the three shapes we expected. The row never reached the
recurrence axis at all.

```
satr_fr_rnd__sa_40453__ministere_de_l_economie_et_des_finances
  end=2020-12-30  basis=notified_duration  lastYear=2022  successor=null
  isClosed=false  callStatus=open  evidence=observed_renewal  rec=none
  publishabilityFailures=[]   published=true
```

`isClosed()` returned **false**. Not "closed but lifted" — *open*. The clause:

```ts
if (row.lastYear != null && row.lastYear > endYear) return false;
```

`2022 > 2020`, so the row is open, and every state below it — `callStatus`,
`isShut`, `isBetweenCalls`, `betweenCallsCaveat`, `unexaminedClosedRows` — is
correct given that input and unreachable given that input. wsGT's axis was not
softened by `accessiblePool` and was not skipped by the publishable filter. It
was answering a question the row was never routed to.

The same clause carried the whole population. On the live corpus, 2026-08-18:

| publishable rows with an end date behind us | 130 |
|---|---|
| ... `call_deadline` basis, `between_calls`, caveat shown | 11 |
| ... `notified_duration`, **offered as plainly open on an award year** | 119 |

Eleven rows were being handled honestly by the axis built for this. One hundred
and nineteen were bypassing it.

## 2. The property, and its test for a fund nobody here has read

> **A row is never offered as open on a fact that is itself in the past.** Its
> window is judged on the latest dated fact anybody has stated about it — the
> declared expiry, or a prolongation an award year evidences. When that fact has
> passed, the row's own window has closed, and it may be offered **only** where
> the funder's own source says the programme continues past the round we hold,
> and then only **with the caveat shown**. NULL is not "recurs".

The test, for a fund loaded next year from a register in a language nobody here
reads: take the fact this row's openness is resting on — production's own
`opennessEvidence()` names it — and ask whether that fact has expired. A
declared window expires on its date. A prolongation expires with the register's
reporting lag. A funder's page saying the programme runs on does not expire, and
is the one thing that may carry a row whose window has shut. No fund, feed,
country, sector or date appears in the rule, and nothing was added beside wsGT's
axis: the change routes rows *into* it that were previously bypassing it.

## 3. Why the horizon is two years, measured rather than chosen

"The latest dated fact has passed" is exact for a declared expiry and coarse for
an award year, because `last_year` is a YEAR and registers publish with a lag: a
live scheme routinely shows no award for the current year. Taken literally the
rule would close schemes that are running — the 306-leaf event of 2026-08-06.

So it is measured, on the one population whose openness is established **without
reference to any award year**: rows whose declared notified duration is still in
the future. `scripts/_wshq_lag.ts`, live Postgres, 228 such rows:

```
last award this year      43.4%   cumulative  43.4%
last award 1 year ago     40.4%   cumulative  83.8%
last award 2 years ago    12.3%   cumulative  96.1%
last award 3 years ago     3.5%   cumulative  99.6%
```

A horizon of 0 would call **56.6%** of demonstrably-open rows stale; 1 year,
**16.2%**; 2 years, **3.9%**. Two years is where the register's own lag is
spent. It is a FIXED constant and deliberately not computed from the corpus at
request time, for the reason `populationRecordsDeadlines` was deleted: a copy
stale enough to be dangerous shows a *long* apparent lag, which would widen the
horizon exactly when it should narrow. Re-take the measurement with
`scripts/_wshq_lag.ts` and move the constant deliberately.

## 4. What it costs in reach, and what it buys

`scripts/_wshq_horizon.ts` prices every horizon on the live corpus before
anything moved. At two years, of the 23 publishable rows re-judged:

| | rows | what the founder gets |
|---|---|---|
| offered **with the between-calls caveat** | 5 | the row, and the fact that the window we hold has shut |
| withheld, funder's own page says it was the whole programme | 0 | — |
| withheld, **nobody has asked the funder** | 18 | one fewer row |

**`publishableInstruments()` 778 → 760, −18, −2.3%.** Rows resting openness on a
prolongation: 119 → 96. Rows offered with the caveat: 11 → 16.

The 18 are not a permanent loss and the remedy is not a rule change: each is a
programme we are calling ended without having asked, and wsGT's precedent is
that reading the funder's page brings rows *back* — 11 of the 15 it read. The
guard prints the unexamined count on every run so the number cannot sit at zero
by nobody looking.

### The funnel: `npm run stages`, the same draw, before and after

Both runs are `split=holdout seed=20260806 n=897`, **draw fingerprint
`13cb71cf3a1d1847`**, live Postgres, and there is no model anywhere in this
ladder — so this is a paired comparison, not two runs put beside each other.

| stage | before | after | delta |
|---|---|---|---|
| answer_key | 897 (100.00%) | 897 (100.00%) | 0.00 |
| in_corpus | 897 (100.00%) | 897 (100.00%) | 0.00 |
| **publishable** | 828 (92.31%) | **819 (91.30%)** | **-1.01 pts** |
| liveness_confirmed | 828 (92.31%) | 819 (91.30%) | -1.01 pts |
| founder_screen | 806 (89.86%) | 797 (88.85%) | -1.01 pts |
| gates_pass | 795 (88.63%) | 786 (87.63%) | -1.00 pts |
| **pool_cut** | 669 (74.58%) | **668 (74.47%)** | **-0.11 pts** |
| writer_cap | 382 (42.59%) | 383 (42.70%) | +0.11 pts |
| published | 368 (41.03%) | 370 (41.25%) | +0.22 pts |
| top_6 | 345 (38.46%) | 345 (38.46%) | 0.00 |
| **top_5** | 321 (35.79%) | **323 (36.01%)** | **+0.22 pts** |

Read it in one line: **the entire cost lands on `publishable`, and it lands
there because nine founders' own won fund is a scheme that ended.** The loss is
attributed exactly — `corpusLossReasons` for "the register says the window has
shut" goes 6 → 15, +9, with nothing unattributed. Those nine could never have
been a hit in a brief that is honest about what is open; they were in the
denominator claiming they could.

Below that stage the change is **positive at every cut**. Only one founder is
lost at `pool_cut`, because 18 dead rows leaving every pool frees seats for
live ones — mean accessible rows 83.2 → 81.8 — and `top_5` **rises 35.79% →
36.01%**. The trade the owner asked to have measured rather than assumed is
therefore not a trade: withholding the dead doors did not cost reach where
reach can still convert.

Two things this does NOT say. `top_6` is flat and every figure here carries a
±3.1 pt half-width at n=897, so +0.22 is inside the noise and the claim is
"no measurable loss", never "an improvement". And `publishable` -1.01 pts is
real and reproducible: it is the honest floor moving to where it always was.

Two rows are worth naming for what they say about the corpus rather than the
rule:

- **SA.40391** — the fund the prodcheck founder actually WON — is a scheme that
  ended 2020-12-30 and is now correctly withheld. The answer key names dead
  schemes as winners, and the funnel counts them in its denominator.
- **`Fondo di garanzia per le PMI`**, the 13,892-award row whose suppression
  caused the 306-leaf incident, is one of the 5 rows that gained the caveat
  rather than being withheld — a funder page read on 2026-08-12 says the
  programme is running, so the founder now reads *"The application window we
  hold closed on 2020-12-30. When the funder's own page was read on 2026-08-12
  it was running a later round of this programme."* It kept its place in the
  table and stopped pretending its 2020 window was current. Its three sibling
  registrations, including the 2026-12-30 one, are untouched.

## 5. The guard, red then green

`scripts/check_dead_doors.ts`, in `npm run check`. It reads the **published
table** against live Postgres, not the corpus: three stages sit between the rule
and the founder, and grading the corpus would be the defect
`check_guard_subject` is named after.

It has two halves, and the second exists because of an honest limitation:

1. **The row scan** calls production's `opennessEvidence()` and
   `renewalIsCurrent()` rather than restating them — a guard that
   re-implements the predicate it protects drifts from it silently, which is
   what `check_window_evidence` did. `PROVE=1` puts 25 rows a founder *is being
   shown* into the exact state of the memo's row 5 and requires the guard to
   name every one and the filter to let none through
   (`dead_doors_wsHQ_green.txt`).

2. **A ceiling on the RULE**, stated in the guard and nowhere else. A guard that
   calls the rule cannot catch the rule being wrong: run against the code that
   shipped SA.40453 — whose renewal clause had no horizon at all — the row scan
   is green on every row. The ceiling is what goes red there
   (`dead_doors_wsHQ_red.txt`), and it is what reddens if production's horizon
   is ever widened past three years, which is past anything a live scheme's
   evidence looks like.

## 6. One thing removed on the way

`check_liveness` had been **red on main since 2026-08-17** and nobody had said
so. `emit_call_recurrence` treated any record carrying a `verdict` string as a
claim on the recurrence axis, and `verdict` is the word every evidence file
reached for: wsHA's door audit writes `held`, wsHF's title audit writes
`name_gap`, one wsHA file writes an English sentence. The emitter threw, so the
projection `check_liveness` compares against disk was **unverified for five
days** — on the axis this workstream depends on. A file now speaks on this axis
when at least one of its records carries a verdict *in this axis's vocabulary*;
inside such a file an unrecognised verdict still throws, and skipped files are
named on every run. The regenerated projection is byte-identical, so nothing the
axis decides moved.

## Reproduce

```
npx tsx scripts/_wshq_probe.ts     why any row is or is not published, from live PG
npx tsx scripts/_wshq_lag.ts       the register's reporting lag, and the horizon it sets
npx tsx scripts/_wshq_horizon.ts   what every horizon costs and buys, before anything moves
PROVE=1 npx tsx scripts/check_dead_doors.ts
```

All four are free: no model call, no write, Postgres read only.
