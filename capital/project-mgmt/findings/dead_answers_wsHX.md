# wsHX — what the record was missing, and how much of our own target is unreachable by construction

**FOR THE OWNER, VERBATIM.** **The corpus of record now has the 3,362 gates, and
nothing on it was touched to put them there** — every other row in every other
table is byte-for-byte what it was, proven by hashing all twelve family tables
before and after. It was one command away from being much worse than that.
Promoting the family the obvious way — `reconcile_stores.py --family
instruments` — is green on the overwrite gate, correctly: *no row* would have
been lost. What that gate cannot see is COLUMNS, and the same command had **374
values queued to be displaced on rows both stores already hold**, across
nineteen columns that share no reason — 91 `capital_type_basis`, 70
`name_source`, 48 `name`, one `scheme_end_date`, which is written weekly **on
the record** and nowhere else. `owner_is_source` picks a winner once, for a
whole family, and a family has more than one owner. So the promotion is now
`--inserts-only`: it carries the rows nobody disputes and refuses to settle a
dispute as a side effect. **And the record was missing more than gates.** It
still calls all 44 loader-composed bucket labels `deterministic` — every
`sudop_*`, every `satr_*_equity`, `chips_ju_kdt_unknown` — where the laptop
calls them `partition_key`, which is the value `registerNamesTheRow()` reads to
withhold a row from every founder. `assign_name_evidence.py` is not in
`railway_cron.py::STEPS`, exactly as no gate encoder is, so **the record cannot
reach that state on its own and anything rebuilt from it today would put
Poland's entire offerable pool back in front of founders.** That is a second
promotion, in the same direction, and I have not made it: it changes a
publishability verdict on 44 rows and it is yours.

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

## 0. The promotion, and the near miss inside it

### What the two stores actually held

`reconcile_stores.py --report`, both stores read-only, 2026-08-19:

| table | corpus of record | this laptop | only on the record | only on the laptop |
|---|---:|---:|---:|---:|
| `funding_instruments` | 1,088 | 1,088 | 0 | 0 |
| `funding_instrument_sources` | 980 | 980 | 0 | 0 |
| **`eligibility_gates`** | **6,401** | **9,763** | **0** | **3,362** |
| `eligibility_clauses` | 893 | 893 | 0 | 0 |
| `instrument_application` | 285 | 285 | 0 | 0 |
| `companies` | 164,050 | 164,029 | **21** | 0 |
| `public_funding_events` | 311,440 | 311,399 | **≥41** | uncomparable |

wsHC's reading is confirmed exactly: **the record has never been given the
3,362 gates and nothing was ever lost.** It is also ahead in the other
direction — 21 companies and at least 41 awards exist only on it, which is why
a push of the laptop was never the answer.

### The near miss

The documented promotion path is `pull_db.py --carry-forward`, then a union
into the laptop, then `push_local.py --skip-pull`. Two things are wrong with it
here. `push_local.py`'s own `main()` runs 43 extractors and
`classify_taxonomy.py run --max-cost 20` — a **paid model call** — so the
guard was used and the pipeline around it was not. And the union direction was
inverted: building it **into the record** keeps every row the record holds alone
by construction rather than by a comparison, and never reads
`public_funding_events` — the one table nothing can key — from the laptop at all.

Then the dry run said this, and it is the finding:

```
funding_instruments   +0 new, 416 merged, 374 conflicts, 0 kept that the source lacks
```

`overwrite_gate` was **green** on that same operation — `proven loss: 0 row(s)`
— and it was right. It measures ROWS. Every one of those 374 values sits on a
row both stores hold, so nothing it counts would have moved. Nineteen columns
disagreed, and they do not share a reason:

| column | rows | who is right |
|---|---:|---|
| `capital_type_basis` | 91 | not established |
| `name_source` | 70 | **the laptop** — see below |
| `name` | 48 | not established |
| `eligibility_fetched_at` | 46 | the laptop, trivially |
| `capital_type` | 26 | not established |
| `sector_mix` | 19 | not established |
| `scheme_end_date` | 1 | **the record** — `refresh_open_calls.py` writes it weekly, there and nowhere else |
| 12 more | 73 | not established |

`owner_is_source` answers "who is right" **once, for a whole family**. A family
has more than one owner. So `reconcile_stores.py` gained `--inserts-only` and
`--table`, and `test_promotion_is_inserts_only.py` states the property:

> **A transfer run as a PROMOTION may add rows the target does not have and may
> change NOTHING ELSE.** Every row the target already holds must be
> byte-for-byte identical afterwards, whatever the source says about it and
> whatever column the disagreement is in.

Its test for the unseen case is a column this repository has never named, on a
table declared into the family map at runtime. Proven red against the old
`merge_table`: it names all four displaced values and the two counters.

**I got the direction wrong once and it is worth recording.** I first read the
record's Spanish titles as the cleaner ones — `bdns_conv_922188` reads *"Ayudas
para provisión conjunto de equipamiento … 5G redes muy rurales"* on the record
and *"PROYECTO DE ORDEN QUE ESTABLECEN BBRR DE LA CONCESIÓN DE …"* on the
laptop and Postgres — and wrote it into a commit message. It is backwards.
`name_source` says the record's is `deterministic` (**we** composed it from
register fields) and the laptop's is `case_register` (**the Commission's** own
title). `nameEvidence.ts` is explicit that the second is the stronger evidence.
The record's title is prettier because we wrote it. The commit is corrected in
place; the property never depended on the answer, which is why the test's
fixture no longer models one.

### What was written, and the proof

```
eligibility_gates   +3,362 new, 0 merged, 0 conflicts, 6,401 shared LEFT AS THE TARGET HAS THEM
```

Then, before the upload, every family table hashed on both sides:

| | record | union | |
|---|---:|---:|---|
| `eligibility_gates` | 6,401 | **9,763** | 0 deleted, **0 changed**, 3,362 added |
| `companies` | 164,050 | 164,050 | byte-identical |
| `public_funding_events` | 311,440 | 311,440 | byte-identical |
| `funding_instruments` | 1,088 | 1,088 | byte-identical |
| the other eight family tables | | | byte-identical |

### The second thing the record is missing, which I did not do

`assign_name_evidence.py` is not in `railway_cron.py::STEPS` — for exactly the
reason no gate encoder is. So the record still carries:

```
laptop  case_register 452  deterministic 306  programme_feed 203  curated 83  partition_key 44
record  case_register 430  deterministic 376  programme_feed 203  curated 79  partition_key  0
```

**All 44** rows the laptop withholds as `partition_key` — every `sudop_*`,
every `satr_*_equity`, `chips_ju_kdt_unknown` — the record still calls
`deterministic`, which is offerable. Migration 032 widens the CHECK constraint
and moves no data, so the weekly cron will not repair it. **Anything rebuilt
from the corpus of record today puts Poland's entire offerable pool back in
front of founders.** It is a one-command promotion in the same direction, it
changes a publishability verdict on 44 rows, and it is a decision rather than a
transfer — so it is queued, not done.

And it is the same 44 rows job 2 counts from the other end: 26 of the 78
founders we cannot serve won one of them.

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

**Tier C is eleven equity funds and one French regime.** All eleven below the
data floor are equity — `eic_fund` (3), `eifo_coinvest` (2),
`almi_invest_equity` (2), `htgf_equity`, `cdp_vc_equity`, `cdp_vc_fof`,
`invest_nl_equity` — which is `project_pipeline_channel_audit`'s finding
arriving from the other direction: the equity channel is not thin in the
brief because founders do not ask for it, it is thin because the rows carry
no amounts and no dates and cannot clear the floor. And of the nine unexamined
notified durations, **eight are one scheme**: SA.40391, across its R&D and its
equity registration. One funder page, read once, decides eight founders.

## 2b. Seventy-eight founders is thirty-one funds

The founder is the unit the funnel counts. The FUND is the unit anybody would
act on, and a repair list of thirty-one reads very differently from a loss of
seventy-eight:

| founders | fund | tier |
|---:|---|---|
| 7 + 1 | `satr_fr_rnd__sa_40391__…` and its equity twin | C — nobody has asked the funder |
| 6 | `sudop_bgk_kit_v3` | B — a label |
| 6 | `sudop_ncbr_aid` | B — a label |
| 6 | `sudop_regional_inv` | B — a label |
| 5 | `eit_food_rfs` | A — editorial policy |
| 4 | `ipcei_micro` | B — no door |
| 3 | `sudop_rd_centers` | B — a label |
| 3 | `ipcei_hy2tech` · `ipcei_tech4cure` | B — no door |
| 3 | `eic_fund` | C — below the data floor |
| 3 | `ademe_aid__innov_eau_ec2654` | A — the deadline passed |
| … | 20 more funds, 1–2 founders each | |

Five Polish bucket labels carry 22 founders. Eight IPCEI waves carry 19. One
French regime carries 8. **Three decisions and one page-read cover 49 of the
78.**

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
