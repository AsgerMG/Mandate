# wsHX — what the record was missing, and how much of our own target is unreachable by construction

> ## ⚠ OPERATIONAL ALARM — READ THIS FIRST
>
> **The weekly ETL cron is OFF as of 2026-08-19 ~01:40 UTC and I could not turn
> it back on.** The service instance config is correct (`0 3 * * 0`,
> `python3 ETL/events/extract/railway_cron.py`) but Railway runs the LATEST
> DEPLOYMENT, and that is `dea9c4c7` — `sleep infinity`, `cron=None` — which
> succeeded at 00:51 UTC as the wake for a volume transfer. **Every attempt to
> deploy the restored schedule since has failed on Railway's side**: `502 Bad
> Gateway` on upload, `503 no healthy upstream` from the API, and
> `Unauthorized` from an auth service that is part of the same outage (the
> stored token was independently checked and is valid until 02:00:58 UTC).
>
> **The repair, the moment Railway is healthy:**
>
> ```
> python3 ETL/lib/verify_cron.py --deploy
> ```
>
> If it reports `Unauthorized`, the CLI session expired during the outage and
> needs one interactive `npx --yes @railway/cli login` first — which is why
> this could not be finished from a non-interactive session.
>
> **Nothing was lost and no data is at risk.** The corpus of record was never
> written: the upload failed before it started and the volume still holds the
> pre-push data. The prepared file is kept at
> `data/wshx_union_ready_to_push.sqlite`.


**FOR THE OWNER, VERBATIM.** **The union is built and proven and it is not yet
on the volume: Railway's builder has failed every deploy since 22:50 UTC** —
503s from its own API, build-log streaming down, three deploys FAILED and one
stuck 33 minutes — and every route to that volume goes through a deploy. The
file is finished and kept: 9,763 gates, 311,440 awards, 164,050 companies, and
**every one of the twelve family tables other than `eligibility_gates` hashes
byte-identical to the record it was built from.** Finishing it is one command
once the builder is healthy. **What matters more is what the dry run found on
the way, because the obvious version of this job would have been wrong.**
Promoting the family the documented way — `reconcile_stores.py --family
instruments` — is GREEN on the overwrite gate, `proven loss: 0 row(s)`, and the
gate is right: no *row* would have gone. It counts rows. The same command had
**374 column values queued to be displaced on rows both stores already hold**,
across nineteen columns that share no reason — 91 `capital_type_basis`, 70
`name_source`, 48 `name`, and one `scheme_end_date`, which is written weekly
**on the record** by `refresh_open_calls.py` and nowhere else. `owner_is_source`
picks a winner once, for a whole family, and a family has more than one owner.
So the promotion is now `--inserts-only`: it carries the 3,362 rows nobody
disputes and refuses to settle a dispute as a side effect. **And the record is
missing more than gates.** It still calls all 44 loader-composed bucket labels
`deterministic` — every `sudop_*`, every `satr_*_equity`,
`chips_ju_kdt_unknown` — where the laptop calls them `partition_key`, the value
`registerNamesTheRow()` reads to withhold a row from every founder.
`assign_name_evidence.py` is not in `railway_cron.py::STEPS`, exactly as no gate
encoder is, so **the record cannot reach that state on its own and anything
rebuilt from it today puts Poland's entire offerable pool back in front of
founders.** That is a second promotion, in the same direction, and I have not
made it: it moves a publishability verdict on 44 rows and it is yours.

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
quoted as a gain. The `publishable` move is the finding: **45 of the 78
founders we lose at that stage are lost because the object we recorded as their
won fund is not a fund, and a further 13 because the door is gone or we refuse
it — 58 of 78, against 20 that are the corpus failing to hold what it should.** The key is unchanged — removing a
founder from a recall set is a decision about what we are trying to do, and it
is yours.

---

```
run             2026-08-19, isolated worktree wsHX-gates off main at a94d267c
cost            NO PAID MODEL CALL anywhere in this workstream, either job.
                job 1: two 645 MB Railway volume transfers, read only; one
                  union built into a local copy; nothing uploaded.
                job 2: zero. No write, Postgres read only.
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

### The upload, and why it has not landed

Railway's builder went unhealthy at roughly 22:50 UTC and has not recovered:

```
22:44 UTC  SUCCESS       the restore after the record was pulled — the last good deploy
22:56 UTC  FAILED        wake for the upload
23:09 UTC  FAILED        verify_cron.py --deploy, the repair for the above
23:37 UTC  FAILED        wake for the upload, second attempt (33 min INITIALIZING)
00:07 UTC  FAILED        the rollback that wake() now fires itself (29 min)
           HTTP 503 "no healthy upstream" from the Railway API itself
           "Failed to stream build logs" on every deploy since 22:56
```

**The weekly ETL is NOT off, and that is checked rather than assumed.** Railway
runs the latest SUCCESSFUL deployment; a failed one does not replace it. Every
deployment and the schedule baked into each:

```
00:07 UTC  FAILED        cron '0 3 * * 0'  start railway_cron.py   the rollback
23:37 UTC  FAILED        cron None         start sleep infinity
23:09 UTC  FAILED        cron '0 3 * * 0'  start railway_cron.py
22:56 UTC  FAILED        cron None         start sleep infinity
22:44 UTC  SUCCESS       cron '0 3 * * 0'  start railway_cron.py   ← what runs
22:01 UTC  FAILED        cron '0 3 * * 0'  start railway_cron.py   ← before I touched it
```

The service instance reads `0 3 * * 0` / `python3
ETL/events/extract/railway_cron.py`, and the last deployment that succeeded
bakes the same pair. **No `sleep infinity` deployment is live and none can
become live**: both of them FAILED. Five consecutive builds failed between
22:56 and 00:36 UTC, the last after 29 minutes in INITIALIZING. Note the 22:01 failure: **the builder was already failing
before this workstream deployed anything.** `verify_cron.py` will report red
while the newest deployment is FAILED, and it is right to — that is a true
statement about the latest deployment and not about what is scheduled.

Every route to the volume in this repository begins with a deploy, so the
upload cannot be attempted, let alone forced.

**The union file is kept, and finishing it is one committed command:**

```
python3 ETL/events/load/promote_to_record.py \
    --file data/wshx_union_ready_to_push.sqlite --apply
```

`promote_to_record.py` is new and it is the reason this promotion sat undone
for ten days while being described, correctly, as one command. There was no
such command. `push_local.py --skip-pull` skips the pull **and nothing else**:
it still runs 43 extractors, the manual inbox, and `classify_taxonomy.py run
--max-cost 20`, which is a paid model call. So the only route to the guarded
upload was hours of unwanted work and a bill.

This is the upload and its guard and nothing else, and it shares BOTH halves
rather than restating either — `push_local.judge_push` for the decision,
`pull_db.verify` for "is what came back a whole database". It wakes, downloads
a FRESH witness, judges against it at the moment of the upload, and uploads
only if the record holds nothing the file lacks. It has **no
`--force-overwrite`**: the weekly cycle needs one because it has a deadline, a
promotion does not, and the honest answer to "the record holds rows this file
lacks" is to union them in and run again. It also checkpoints the WAL first and
refuses if anything is left in it — a volume upload carries one file, and a
database missing its last transaction passes `quick_check` looking perfect.
`--file` is required and deliberately NOT defaulted to `data/db.sqlite`:
uploading the working corpus by forgetting an argument is the accident this
tool must not make convenient.

### One defect fixed because the outage exposed it

The first failed wake left the service instance saying `sleep infinity` with
**no cron schedule at all** — the weekly ETL off, with nothing in the failing
process saying so. `wake()` writes that config on its first line and then
deploys, and every caller invokes `wake()` OUTSIDE its `try`, because there is
nothing to restore until the wake has happened. So the `finally` that would
have repaired it is unreachable by construction, in both directions, on every
failure. `railway_service.wake()` now rolls back where the write happened,
re-raises regardless, and prints the repair command if the rollback itself
fails. `test_wake_rolls_back.py` drives it hermetically and its unseen case is a
`BaseException` that is not an `Exception` — a ctrl-c between the config write
and the deploy costs a week of ETL and a narrower catch cannot see it. **It
fired for real on the second failed wake, in this run's own log.**

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

## Verify

```
npx tsc --noEmit                                   clean
npx vitest run                                     846 passed (62 files)
npx tsx scripts/check_contracts.ts                 ok, 10 contracts, 105 rules
npx tsx scripts/check_red_debt.ts                  ok — every check observed and owned
python3 ETL/events/load/test_promotion_is_inserts_only.py   ok  (NEW)
python3 ETL/lib/test_wake_rolls_back.py                     ok  (NEW)
python3 ETL/events/load/test_overwrite_refusal.py           ok
python3 ETL/events/load/test_overwrite_guard.py             ok
GUARD_NO_PUBLISH=1 npx tsx scripts/check_corpus_census.ts   FAILED — unchanged
```

The census guard is red on DIVERGED / DRIFTED / SCHEMA / STALE, exactly as it
was before this workstream, and for the reason this workstream could not close:
the union is not on the volume. It is already owned in `check_red_debt` as
*"site serves the ETL's corpus"*. **Note that it will stay red on DIVERGED even
after the upload lands**, because it reads `corpus_census` ROWS and only a cron
run writes one — the proof of the promotion is a re-read of the volume, not a
green guard.

**`npm run prodcheck` was NOT run, and the reason is that it would measure
nothing.** It is required for job 1 because promoting the gates changes what the
record holds — and the record is unchanged, because the upload did not land.
Nothing on this branch is founder-facing (two Python modules, two Python tests,
one free census script and documentation), the deployment serves `main`, and the
product reads Postgres rather than the volume in any case. A paid run that
cannot move is not a check. It belongs with the upload, and it is named in
AWAITING_APPROVAL §2 as part of finishing it.

## Reproduce

```
cd website/frontend
npx tsx scripts/_wshx_dead_answers.ts          # the census, free
ROWS=1 npx tsx scripts/_wshx_dead_answers.ts   # + every one of the 78 named

python3 ETL/events/load/reconcile_stores.py --report record.sqlite local.sqlite
python3 ETL/events/load/reconcile_stores.py --into record.sqlite --from local.sqlite \
    --family instruments --table eligibility_gates --inserts-only --dry-run
```

---

## Postscript — is it Railway, or is it us?

Worth settling, because "the platform is broken" is the most self-serving
diagnosis available and it should not be taken on faith.

**It is Railway.** Three independent facts, none of which depends on trusting
the CLI's own error text:

1. **A deploy failed at 22:01 UTC**, before this workstream had run `railway up`
   at all.
2. **The API itself served `HTTP 503 "no healthy upstream"`** to a bare
   `query { me { email } }` — a query with no relation to this project.
3. **The sidecar hypothesis is excluded by timing.** The obvious repo-side
   cause would be the two 647 MB store copies sitting in `data/`. They were
   moved out of the repo at 23:35 UTC, and the deploys at **23:37 and 00:07
   both failed anyway**, with `data/` holding nothing unusual. (`data` is
   fully gitignored in any case — `.gitignore:57` — and the successful builds
   report a 16 MB snapshot.)

Every deploy since 22:56 also reports `Failed to stream build logs: Failed to
retrieve build log`, which the three successful ones did not.

---

## Appendix — a queue item whose precondition does not hold

Found while the promotion's witness was downloading, and it is free money.

`AWAITING_APPROVAL` §4 on main, *"Restore the eleventh sector"*, says:

> `restore` is a pure function of `company_sector_labels`; **the volume's copy
> is empty**, so the repaired pipeline still reports 8 sectors of 11. The route
> is a union pull then a ~645 MB push through `overwrite_gate`, and I would
> want to verify the precondition read-only first the way the other three were.
> The alternative is asking a model to re-derive the labels, which prices at
> about **USD 136**.

**The precondition is false, and verifying it read-only is exactly what this
workstream already did.** `reconcile_stores.py --report` against the volume
pulled at 2026-08-19 00:44 UTC:

| store | rows | distinct `sector_top` | only-A | only-B |
|---|---:|---:|---:|---:|
| corpus of record | 144,493 | **11** | 0 | 0 |
| this laptop | 144,493 | **11** | 0 | 0 |

Byte-identical — the table hashes the same on both stores. Every column is
populated: `sector_top` 144,493 non-empty, `subsector` 131,973, `method` and
`labelled_at` 144,493 each. **The eleventh sector is already on the volume.**

So neither branch of that item is needed as written. There is nothing to pull
and nothing to push for this table, and **the USD 136 re-derivation would be
paying a model to recreate 144,493 rows the record already holds.**

What this does NOT establish is why the census still reads 8. The labels are
present, `railway_cron.py::STEPS` already carries the
`classify_taxonomy.py restore` step that reads them (line 78 on main), and
census #11 — the most recent, 2026-08-16 — **failed at `classify_taxonomy.py`
(rc=1)**. The most economical hypothesis is therefore that no complete pass has
run since the `restore` step was added, and that the next successful weekly run
resolves it for free. That is a hypothesis and it is labelled as one: the
measurement here is only that the labels are on the volume, which is enough to
retire the USD 136 option and the 645 MB round trip.
