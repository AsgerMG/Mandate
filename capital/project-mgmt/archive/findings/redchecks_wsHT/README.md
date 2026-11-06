# Thirteen red checks, seven days, 139 commits — and a suite that had outgrown attention

**wsHT, 2026-08-18.** Evidence in this directory:
`BASELINE_main_2026-08-18.txt` (the full run on main),
`RED_SINCE_replay.txt` (each red replayed at twelve daily commits),
`SUITE_MEASURED.md` (one row per check: size, birth, churn, citations).

---

## For the owner, in one paragraph

**Roughly two thirds of this suite is protecting you and one third is protecting
itself.** Of 59 checks, 45 guard something a person actually experiences — a row
that should not be there, a row that should be and is not, a dead link, a name
that is a database key, a number on the page the corpus does not hold. Eleven
grade an internal artefact: a markdown file's provenance tags, a harness's
credential declaration, a scratch-script naming convention, a ratchet on debt
nobody is harmed by today. Four were graded and retired outright. The problem was
never that the eleven were wrong; it is that **they failed the build in exactly
the same colour as the founder-facing forty-five**, so a founder being sent to a
scheme that closed in 2020 and a markdown file missing a tag were the same shade
of red, and three separate agents read past all thirteen in a single day.
Thirteen of the 59 were red on main — fifteen counting the two in the CI python
job that `npm run check` could not see; **seven of them had been red since
2026-08-12, across 139 consecutive commits**, and six of the seven run in CI on
every push — so CI had been red 139 times and told nobody, because this
repository is private, no checkout here carries a GitHub token, and the only
channel was an email to you. Four of the thirteen are fixed and green in this
branch. Two are demoted to reports. Seven remain, every one owned, dated, and
listed below with its cost. **The change that matters is not any of the fixes: it
is that a new check must now name the person who is hurt when it fails, before it
is allowed to fail anything.**

---

## 1. Were they telling the truth? All thirteen, and what each was hiding

Baseline on main at `b2e1001d`: **13 of 59 red**, suite wall-clock **690s**.

| # | check | class | truth | what it was hiding |
|---|---|---|---|---|
| 1 | theme index is not stale | **defect** | true | The index was cut 2026-08-09 and the corpus republished twice since. **180 of 1,088 instruments — 16.6% — were indexed on tokens that no longer describe them.** `relevance.ts` indexes on this artifact and nothing else, so an instrument that falls under `RELEVANCE_FLOOR` simply stops being offered. FIXED. |
| 2 | rendered numbers | **defect** | true | `ANSWER_USE.borrowerModel.reason` stated corpus counts (101 comparators, 89/3/9) with no source. FIXED by attribution, which is the fix the guard prescribes. |
| 3 | one env loader | **defect ×10 + guard ×1** | mostly | Ten harnesses read `DATABASE_URL`/`VOYAGE_KEY` and declared neither, so each measured the offline fallback and printed a number indistinguishable from a real one. One of the ten, `check_answer_in_prompt.ts`, **is a check in this suite** and advertises "FREE, OFFLINE. No credentials". The eleventh was the guard: `ENV_FILE` matched any quoted run containing `.env`, so a printed sentence saying "…never from \`process.env\`" was reported as the defect it denies. ALL FIXED. |
| 4 | published figures | **defect + guard** | true | RESUME_HERE.md was rewritten on 2026-08-17 and all 31 of its `[ok …]` tags went with it; the owner's planning document carried 17 percentages and none said where it came from. The guard's own half: `loadArtifacts` did not walk `findings/`, so **315 of 534 artifacts — 59% — were unnameable**, and a figure whose evidence exists could not be cited. FIXED both ways; five figures verified, four marked `[target]`, **four marked unverifiable because no artifact holds them** (86%, 44.6%, and the 74/22/52 loss split, all quoted into briefs as measurements). |
| 5 | a comparator asks the rule's question | **defect** | true | Ten comparators decide a founder against a rule their answer cannot determine — eight jurisdiction rules turning on China, Norway, Denmark, Spain, Peru against questions that name no country, and two ownership rules asked at 25% while the rule turns on 40% and 12.5%. **A founder answers truthfully and loses a fund that admits them.** OPEN — the fix is a Postgres write; queued. |
| 6 | a filter can admit someone | encoder ratchet | true | 64 inert comparators against a ceiling of 45. By construction an inert comparator blocks nobody, so no founder experiences one. DEMOTED to report. |
| 7 | open questions still cover the corpus | coverage ratchet | true | 1,130 requirement texts with no judgement, ceiling 400. Real and diffuse; the only fix is a paid classification pass. DEMOTED to report, and queued. |
| 8 | country gates | **defect** | true | One positive rule demanding establishment in Turkey that no founder answer can satisfy, hiding `eit_digital_vap`. `check_winner_not_gated` independently lists two real winners (FutureOn, ScanTrust) deleted by that same instrument. OPEN — Postgres write; queued. |
| 9 | gate pertinence | corpus-state | true | 1,345 distinct requirement texts on gates that can decide a verdict have no pertinence verdict. Already in the registry's `manual` block; a paid classification pass. OPEN, owned. |
| 10 | applicant identity | corpus-state | true | Two published "who may apply" texts describe a population that cannot apply — an Italian guarantee only a bank may submit, a Dutch subsidy granted via a foundation. OPEN; a text fix in Postgres. |
| 11 | corpus currency | corpus-state | true | The snapshot and Postgres disagree on 3 fields over 1,088 instruments (22 names, 22 name sources, 15 countries) **and on 51 eligibility rules, 36 of them on offerable funds**. `accessiblePool` is built from these, so a degraded request admits and refuses different funds. OPEN; needs `make eligibility` + a profile rebuild. |
| 12 | site serves the ETL's corpus | corpus-state + **a broken ETL** | true | Five distinct failures, and one is not about publishing: census #11 records **"failed at classify_taxonomy.py (rc=1)"** and the coverage gate refused it — eligibility 898 down from 913, **sectors 8 down from 11, which is a figure on the home page**. The gate is working; the pipeline is not. OPEN. |
| 13 | published verdicts | corpus-state | true | The readout of the eleven credentialled guards. Census DEGRADED and DRIFTED; the container runs code fingerprinted differently from this checkout. Every verdict in the feed says `produced_by: local` — **the container has never once published one**, confirming wsHC. OPEN. |

**Score: thirteen for thirteen. Not one was a false alarm.** Two were guards
grading the wrong subject *in addition to* a real defect underneath, and both
guard bugs are fixed with the property stated more precisely, never more loosely.

### And a fourteenth and fifteenth nobody counted

`ETL/schema/check_guard_reachability.py` is red on main too — it is in the CI
python job, not in `npm run check`, so it was outside the thirteen. It named
**seventeen check modules in NO automatic path at all**. Among them:
`check_dead_doors`, built the same week to stop the product publishing a scheme
that ended in 2020; `check_winner_not_gated`; `check_memo_table`;
`check_harness_intake`. The check says in its own words that `npm run check` does
not count, "it is a command a human types". Thirteen of the seventeen are
hermetic and are now in CI; four need a live corpus and are declared with reasons
and review dates.

Beside it, `ETL/schema/check_artifact_reachability.py` is red on main too and is
unchanged by this workstream: five committed artifacts, `__recallSetDescribed.json`
among them, bind no path that any script then writes, so nothing in the tree
proves how they were made. Report-tier and owned.

Both are now IN the suite. That is not two more guards — it is the same two,
moved to where their result lands in the tree rather than in a CI log nobody in
this repo can open. The suite is 58 rows: 46 founder, 12 report.

---

## 2. Why none of them reached a person

Three mechanisms, all measured, none of them the one that was assumed.

**CI is unobservable here, and it ran the whole time.** Six of the seven week-old
reds run in CI on every push to main. CI was therefore red on 139 consecutive
commits. The repository is private; no checkout in this project carries a GitHub
token; `gh run list` prints an auth prompt and `api.github.com/repos/AsgerMG/Wincent/actions/runs`
returns 404. **Not one agent that works in this repo can see CI at all.** The only
channel is an email to the owner, and an email that arrives 139 times is not a
channel.

**The suite costs twelve minutes and needs credentials.** 690 seconds, of which
`asking a question never costs a fund` is 310s and `recall floor` is 196s — **two
checks are 73% of the wall clock**. A twelve-minute credentialled command is run
at the end of a workstream, if at all.

**A red a week old is the background colour.** This is not a metaphor: it is what
`data/guard_registry.json`'s own `accepted` block says in its `$why`, written on
2026-08-12 — "a signal no branch can turn green is a signal people learn to step
over" — six days before this. The block was built and then correctly not used.
Nothing carried its lesson to the sixty checks one layer out.

**The verdict channel is half-dead.** `guard_verdicts` holds 783 rows and every
one says `produced_by: local`. The container that runs the weekly ETL has never
published a verdict, so the credential-free door CI reads is dark by design and
dark in fact.

### The measurement behind "seven days"

Each red replayed at the last commit of each of twelve days (`RED_SINCE_replay.txt`):

| check | last green | first red | days red | commits on main since |
|---|---|---|---:|---:|
| theme index is not stale | 2026-08-11 | 2026-08-12 | 7 | 139 |
| a filter can admit someone | 2026-08-11 | 2026-08-12 | 7 | 139 |
| open questions still cover the corpus | 2026-08-11 | 2026-08-12 | 7 | 139 |
| a comparator asks the rule's question | 2026-08-11 | 2026-08-12 | 7 | 139 |
| rendered numbers | 2026-08-12 | 2026-08-13 | 6 | ~120 |
| one env loader | 2026-08-12 | 2026-08-13 | 6 | ~120 |
| published figures | 2026-08-13 | 2026-08-17 | 1 | ~25 |

`git log` puts 611 commits on main in the 30 days to 2026-08-18, across 26 active
days — 20.4 a day. Seven days is not an abstraction here; it is 139 chances.

---

## 3. "Are we building fucked up complexity?" — the honest answer

Partly yes, and the shape of the yes is specific.

```
checks on 14 July                     0
checks on 11 August                  49
checks on 18 August                  59
guard code in the suite          16,323 lines
product code (lib/intelligence)  39,989 lines      guards = 41% of it
red on main                       13 of 59
```

Every one of the 59 was individually justified when it was written, and most of
those justifications are good. The defect is not in any single check. **It is
that nothing ever asked what a failure would COST**, so every check arrived at
the same severity, and severity is the only thing that makes a red mean anything.

### The test, applied

`suite_tiers` in `data/guard_registry.json` now holds the answer for every check,
in prose, and the build refuses a check that has not answered.

- **46 founder-tier.** A person is handed something wrong if it fails. These fail
  the build.
- **12 report-tier.** True, and nobody is harmed today. Run, recorded, printed in
  full, and they fail nothing: `a red check is owned`, `a rule's check can
  actually run`, `published figures`, `one env loader`, `both stores select the
  same columns`, `a filter can admit someone`, `open questions still cover the
  corpus`, `a winner is never screened out`, `harness answers as the founder`,
  `peer prior canary`, `quotations match documents`, `every committed artifact
  can be rebuilt`.
- **4 retired**, moved to `scripts/archive/retired_*`:
  - `check_doc_identifiers` — asserted that ALL-CAPS names in `lib/intelligence/*.md`
    resolve to real symbols. It grades markdown. No founder reads it.
  - `check_ws_scripts` — the scratch-script convention, below.
  - `check_archetypes` — superseded by `check_memo_table`, which says so in its
    own header: an archetype was receiving ZERO ROWS while `check_archetypes`
    reported it passing. A guard whose stronger twin exists is a second opinion
    that can only ever be wrong.
  - `check_guard_subject` — a guard about guards. In a suite being cut for
    inattention, a check whose subject is the checks is the definition of the
    thing protecting itself.

Three of the eleven demotions deserve naming, because they are the ones that cost
real attention: **`published figures`** grades the owner's own markdown and was
red for it; **`one env loader`** grades harnesses; **`a filter can admit
someone`** counts comparators that by construction block nobody. All three are
true and all three are worth keeping. None of them should ever have been able to
stop a branch.

### On the 136 scratch scripts, and whether `check_ws_scripts`'s rule is right

**The rule is backwards.** It keeps a scratch script alive if anything names it —
a finding, a comment, another script. Naming is what happens to a file
automatically as it is written about, so the rule's steady state is that nothing
is ever retired: it reached 104 files, then 134, then 136. A retirement rule that
retires nothing is not a retirement rule, and it was failing builds over the
question.

The property it should have asserted is the one already written in the files'
own headers and never enforced: **a scratch script declares a date, and it is
archived when the date passes.** `@ws-active until 2026-09-30` is in dozens of
them. That is a genuine retirement rule and it is roughly fifteen lines.

I have not built it, deliberately. 136 files is a sweep, not a check, and the
memory rule is explicit that a paid measurement's only record is archived and
never deleted. It is queued below with the number.

---

## 4. What now makes a silent red impossible

A property, in the place where somebody is standing.

**`project-mgmt/check_status.json`** — what the suite last found, ONE ROW PER CHECK, each
with its own timestamp, its exit code, and the check's own last line. Written by
`run_checks.mjs`. Merged, never replaced, so `npm run check --only="<label>"`
refreshes exactly one row.

**`scripts/check_red_debt.ts`** — the judgement, and it runs inside
**`npx vitest run`**. That is the whole point: four seconds, no credentials, in
the verification block of every agent brief this repo writes, and the one command
that is genuinely always run. CI cannot reach anybody here, so the tree has to.

It fails on:

| | property | why it is not a mute button |
|---|---|---|
| COMPLETE | every check the runner declares has a row | a check nobody has ever run is not a passing check |
| TIERED | every check declares `founder`/`report` and a `protects` SENTENCE | this is the question that was never asked while the suite went 0 → 59 |
| FRESH | no row older than **7 days** | **this is the "a red older than N days is a build failure" property.** 7 is measured, not chosen: it is the demonstrated length of the silence. Clearing one stale row costs one check |
| OWNED | a founder-tier red needs an entry in `suite_accepted` — class, owner, the day it went red, the failure it is bound to, a review date | a red with no entry is "nobody has looked", which is the state being removed |
| BOUND | the entry's `failure` regex must still match the check's own summary | a check failing a DIFFERENT way is a new fact nobody has decided about |
| CAPPED | `review` at most **14 days** after `since` | a hold that outlives the silence it holds is the silence with a date on it |
| NOT OBSOLETE | an acceptance over a check that has gone GREEN fails | an acceptance that outlives what it accepted pre-authorises the next regression |
| REACHABLE | an acceptance naming a check the suite does not run fails | it would never be read |

**Known-and-owned versus nobody-has-looked** is the distinction the whole thing
turns on, and it is carried by the entry, not by a flag: an entry names a person,
a date it went red, and the exact failure. Held failures are **printed in full on
every run** — an acceptance nobody sees is indistinguishable from a check that
never looked.

None of this is new machinery. It is the `accepted` block that already existed
for the eleven credentialled guards, generalised to the sixty, with the four
bindings it already enforced plus the two it lacked — a tier and a clock.
`judgeAcceptance` now lives in `scripts/lib/acceptance.ts` and both readers
import it, because an acceptance interpreted in two places is an acceptance that
means two things.

**Proven red before green.** Sixteen self-test cases, one per clause, run before
the guard is trusted to judge anything and asserted by the vitest file; and the
real thing was observed failing on an empty record, on an untiered check, on an
expired hold, on a hold bound to the wrong failure, on a hold longer than the
cap, and on an acceptance over a green check, before any of them passed.

**And the suite got faster, which is the other half.** `asking a question never
costs a fund` and `recall floor` are `cadence: weekly` and leave the default
path. **690 seconds became 145** — measured, not projected. That is only safe
because their rows still age: at 7 days `npx vitest run` goes red for everybody
with `npm run check --deep` printed beside the name. Taking a slow measurement
off the fast path no longer takes it out of sight.

## 5. Where the tree stands

`npm run check` on `wsHT-redchecks`, 2:25, 58 rows:

```
  48 green
   7 red and HELD      every one dated, owned, and queued in AWAITING_APPROVAL.md
   3 red and REPORTED  recorded and printed; they fail nothing
   0 "nobody has looked"
```

Against main's `13 of 59 failed` with nothing distinguishing any of them.

Four are genuinely fixed — theme index, rendered numbers, one env loader,
published figures — and the guard bugs found underneath two of them are fixed
with the property stated more precisely, never more loosely. **No floor, ceiling
or tolerance was moved anywhere in this workstream.** The inert-comparator
ceiling is still 45 against 64, the open-question ceiling still 400 against
1,130, and `check_published_figures` still demands three verified figures. What
changed is who those two reds are allowed to stop, and whether anybody is told.
