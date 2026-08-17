# wsHC — nothing lost a thousand gates; the corpus of record never received them

**FOR THE OWNER, VERBATIM.** Nothing was destroyed. The Railway volume has been
read twice, on 2026-08-09 and 2026-08-16, and both readings say 6,401 gates — it
has never been observed to hold more. The 7,471 in the alarm is a **laptop**
reading, and the laptop today holds **9,763**, as does the Postgres the product
serves from. So the direction is the reverse of the alarm: **3,362 encoded gates
exist only outside the store this repo declares of record**, and the volume
cannot regenerate them, because no gate-encoding step is in the weekly cron.
No founder is affected today; the brief reads Postgres and has every gate. What
it costs is that the record's own contents are materially thinner — **157 of
1,021 publishable funds would lose every evaluable rule, and sibling groups
separated by gates fall from 40 of 41 to 26 of 41** — which is exactly the
failure wsGY measured, where 63.2% of the founders we miss are already shown a
sibling of the fund they would have won. **What the guard should have done is
three things, and it did none of them.** It never judged `instruments.gates`
against anything, because the loss test iterates two hardcoded tuples that gate
counts are not in — now `SHRANK`, derived from what a census records rather than
from a list, so a measure added next year is judged the day it exists. It
published a verdict graded against a bar it did not fingerprint — census #11 said
"down from a high of 913" while this repo says 937, and `DRIFTED` fired only by
luck, because the Python happened to move in the same deploy. And the
credential-free door that CI reads is dark: **`guard_verdicts` holds 783 rows
from a laptop and zero, ever, from the container**, because the file that defines
what a guard is was excluded from the image. All three are fixed and proven red
before green; two of the fixes are inert until someone runs `railway up`.

---

```
run             2026-08-17, isolated worktree wsHC-gatecount off main at 7b70d748
stores read     railway-volume  via corpus_census rows (READ ONLY)
                local           data/db.sqlite, opened mode=ro
                postgres        corpus_census + live COUNT(*) (READ ONLY)
cost            zero. No paid model call, no corpus write, no publish.
reproduce       python3 ETL/terms/_wshc_gate_cohorts.py cohorts      §1 cohort table
                python3 ETL/terms/_wshc_gate_cohorts.py cost         §2 and §3(a)
                python3 ETL/terms/_wshc_gate_cohorts.py history      §1 census table
                python3 ETL/terms/_wshc_gate_cohorts.py fingerprint  §5
                GUARD_NO_PUBLISH=1 npx tsx scripts/check_corpus_census.ts
                  (from website/frontend — the guard's own output)
```

Every figure below carries its store. Two numbers from two stores read as one
number is the error that produced the alarm this workstream was given.

---

## 1. Is the divergence real, and is it definitional?

**Real, not definitional, and it is not a loss.** Three separate proofs.

### The count is one query, and it is unqualified

`publish_corpus_census.py::collect` records `instruments.gates` as

```python
gates = con.execute("SELECT COUNT(*) FROM eligibility_gates").fetchone()[0]
```

There is no predicate to differ on. No `gate_role`, no `verification_level`, no
join to `funding_instruments`. Both 6,401 and 7,471 are the whole table.

### Same code, two stores

The census carries the fingerprint of the Python that produced it. Censuses #9
and #10 carry **the same one**:

| census | taken | produced by | store | fingerprint | instruments | gates |
|---:|---|---|---|---|---:|---:|
| 9 | 2026-08-08 22:26 | local | local | `e25d3712f8cc48f2` | 1,088 | **7,471** |
| 10 | 2026-08-09 03:13 | etl-pipeline | railway-volume | `e25d3712f8cc48f2` | 1,088 | **6,401** |

Identical code, five hours apart, identical instrument count, 1,070 apart on
gates. A definitional difference is excluded by the record itself.

### The record has never been observed to fall

Every census ever taken, by store:

| # | taken | store | instruments | gates | run outcome |
|---:|---|---|---:|---:|---|
| 1–3 | 2026-08-07 | unknown (laptop) | 1,076–1,084 | 6,368 | ok |
| 4 | 2026-08-07 17:51 | unknown (container) | 322 | 4,018 | failed at `refresh_open_calls.py` — mid-rebuild, not a corpus |
| 5–6 | 2026-08-07 | unknown (laptop) | 1,086 | 6,368 | unknown |
| 7–9 | 2026-08-08 | local | 1,088 | **7,471** | partial |
| 10 | 2026-08-09 | **railway-volume** | 1,088 | **6,401** | partial |
| 11 | 2026-08-16 | **railway-volume** | 1,088 | **6,401** | failed at `classify_taxonomy.py` |

The store of record reads 6,401 on both of its readings — **flat**, not falling.
6,401 is 33 *above* the 6,368 both stores shared on 2026-08-07. Nothing on the
volume went backwards.

What happened is on the laptop. `eligibility_gates.created_at` (local, `mode=ro`)
dates every row:

| cohort | rows | instruments touched | evaluable | cited | where it exists |
|---|---:|---:|---:|---:|---|
| before 2026-08-08 | 6,227 | 866 | 2,614 | 4,371 | all three stores |
| 2026-08-08/09 UTC session | 1,244 | 354 | 392 | 1,103 | local + postgres only |
| 2026-08-12 session | 2,292 | 474 | 704 | 2,292 | local + postgres only |
| **total local today** | **9,763** | | | | |

(6,227 + the 141 rows stamped 2026-08-09 UTC that were written on the evening of
2026-08-08 CEST = 6,368, the shared state. The two sessions created 3,536 rows
and 174 were replacements, netting the +3,362 the guard reports.)

Both unpromoted cohorts are paid research, not derivation:
`encoding_method` is `scheme_text_extract` (2,467), `llm_encode` (826), `llm_orgtype` (44) and
`llm_triage` (22), plus 141 rows with no method (`registered_region`) and 36
quarantined.

### The volume cannot catch up on its own

`ETL/events/extract/railway_cron.py::STEPS` — the weekly run's only write path
into the volume — contains no gate encoder. `encode_gates.py`,
`encode_scheme_text_gates.py`, `load_scheme_text.py` and
`apply_gate_encoding_corrections.py` are not in it, and `detect_eligibility_gaps.py`
is a detector. These 3,362 rows exist where they were written and nowhere the
cron can reach.

---

## 2. What it costs

**Not today's brief.** The product reads Postgres, and Postgres has all 9,763.
`migrate_to_postgres.py` copies every column of `eligibility_gates` except
`id`, `created_at` and `updated_at`, so the content of the work is in two places,
not one.

The cost is what the record is *for*. `corpus_stores.py` makes the volume of
record on one test — *which store, if lost, could not be rebuilt?* — and it is
the only store backed by a persistent volume rather than one laptop's disk. For
a third of the gate corpus that argument does not currently hold: the two copies
are a gitignored file on a workstation and a projection that
`migrate_to_postgres.py` truncates and reloads.

**What the record's own contents would do to the product**, measured on the
local store with the two unpromoted cohorts excluded — the closest reconstruction
of the volume available without reading it, and stated as such:

| measure (local sqlite, 1,021 publishable leaves) | today (9,763 gates) | pre-08-08 cohort only |
|---|---:|---:|
| leaves with ≥1 **evaluable** gate | 957 | **800** |
| sibling groups (≥2 leaves) separated by their evaluable gate sets | **40 / 41** | **26 / 41** |
| leaves sitting in a separated group | **705 / 713** | **441 / 713** |

157 publishable funds have evaluable rules only because of the unpromoted work.
And on the record's contents, 264 of 713 sibling leaves sit in a group where
every member carries an identical evaluable gate set — nothing that could tell
them apart. That lands directly on the failure that dominates: `rank_shape_wsGY.md`
measured that **287 of the 454 founders who miss (63.2%) are already shown a
SIBLING of the fund they would have won**, and `leaf_separation_wsAO.md` measured
that gates *do* separate siblings once founders are described as different people.
Gate depth is the one lever measured to act on it, and on the corpus of record a
third of that depth is not there.

---

## 3. Why the guard is blind, and to what

It is **not** blind to the divergence. `check_corpus_census.ts`'s `DIVERGED` arm
reported it correctly and in the right direction, per family, with the number:

```
local/instruments.gates:    derived 7,471, record 6,401 (+1,070 held only by the derived store)
postgres/instruments.gates: derived 9,763, record 6,401 (+3,362 held only by the derived store)
```

Two other things are true, and they are the deliverable.

### (a) `instruments.gates` is judged by nothing over time

`coverage_gate.py`'s LOSS test iterates `AXES` (six) and `KPI_AXES` (eight), both
hardcoded tuples. `instruments.gates` is in neither, so the census records it
every week and nothing has an opinion about whether it fell. It could go 9,763 →
1,088 on a single store and every LOSS test in the repo would still pass. That is
a fact about the code, not an inference.

**The six coverage axes are not a substitute, because they saturate.**
`eligibility` is `n_eval >= 2` — a per-instrument boolean. A fund carrying forty
evaluable rules and a fund carrying two score identically, so everything above
the threshold is invisible to it. Measured on the local store, counting only
directly-attached rows and therefore a strict lower bound (parent inheritance
adds more slack):

```
evaluable gate rows, directly attached      3,710
  sitting above the axis threshold of 2     1,782   (48%)
  instruments carrying more than two          584 of 1,018
```

**1,782 evaluable rules — 48% of the depth in the corpus — can be deleted with
the `eligibility` axis unmoved.** That is the shape of the incident
`coverage_gate.py`'s own header opens with, and it is what makes a gate-count
measure a different instrument rather than a redundant one.

**Being fair to the axis on this particular loss:** it would have caught it, on
one store. Re-running `coverage_report.build`'s `eligibility` definition over the
local store with the two encoding sessions excluded gives 907 against 956 with
the 08-08/09 session present — 49 instruments, against a tolerance of 5. So the
axis is not blind here; it is *lossy*. It reports 49 for a loss of 1,070, says
nothing about which quantity moved, and would have said nothing at all had the
same 1,070 rows come off the funds that carry depth. (That reconstruction is
approximate and stated as such: a `created_at` cutoff rebuilds which rows
existed, not what they contained, and `apply_gate_encoding_corrections.py` has
since edited older rows in place. The no-cutoff control gives 956 where census #9
recorded 937, so read these as ±20.)

### (b) One high-water mark, three stores that are not supposed to be equal

`project-mgmt/coverage_baseline.json` is a single committed file, and
`coverage_gate.py` runs against whichever database it is pointed at. The mark it
holds is therefore the **maximum over every store anyone has ever run it on**,
while the verdict is about **one** store. That is why census #11 tells you

```
LOSS  eligibility: 898 instruments, down from a high of 913.
      Something the corpus knew, it no longer knows.
```

when what is true is that the volume never knew it — the laptop did. The sentence
is false as written and it is the reason two confidently wrong conclusions were
reached about this in one evening. Cross-store difference is `DIVERGED`'s
question and it has a different fix; putting it in LOSS's mouth makes the two
indistinguishable to a reader.

### The property

> **Every numeric measure a census records about a corpus is judged for LOSS
> against the highest that SAME STORE has ever recorded on a census fit to
> publish.**

Three clauses, each carrying its own weight:

- **every numeric measure** — the set is *derived from the recorded payload*, not
  listed. A measure added to the census is judged from its second census onward,
  with no edit anywhere. This is what stops `instruments.gates` from being the
  fourteenth special case and an axis added next year from being the fifteenth.
- **that same store** — "did this corpus get worse" is a question about one
  store over time. It is answerable from the census table alone, which is the
  only per-store history that exists, and needs no baseline file.
- **fit to publish** — a mark is set only by a census the existing `admissibility`
  predicate accepts. A run that died halfway reads low; letting it set a mark is
  fine (marks only rise) but letting a *failed* run's low reading stand as
  evidence of what a corpus can hold is not.

**It re-introduces neither recorded failure**, because both were percentage
tests and this is absolute:

- *FALSE ALARM (2026-08-06)* — 150 instruments join, every axis gains ~70, five of
  six shares fall. Every count **rises**, so no measure falls below its mark and
  nothing fires.
- *BLIND SPOT (never caught)* — 150 instruments deleted, 130 with a route:
  `route` 908 → 778 while the share rises 89.8% → 90.4%. The count fell 130 below
  its mark, so it fires. The denominator is not consulted at any point.

Implementation, test for an unseen measure, and the red-then-green proof: §4.

---

## 4. The check

`shrinkage()` in `website/frontend/lib/corpusCensus.ts`, beside `admissibility`
and pure like it, reported by a new `SHRANK` arm in `check_corpus_census.ts`.
No new storage: the census table already is the per-store history.

```
lib/corpusCensus.ts             censusMeasures(), lossTolerance(), shrinkage()
lib/corpusCensus.test.ts        10 assertions, committed red before the function existed
scripts/check_corpus_census.ts  the SHRANK arm
ETL/schema/check_cross_language_constants.py   the tolerance is coverage_gate's own
```

**The tolerance is not a new knob.** `LOSS_TOLERANCE_SHARE = 0.005`, proportional
only with a floor of one, is `coverage_gate.KPI_TOLERANCE_SHARE`, and
`check_cross_language_constants.py` now fails the build if the two spellings
drift. The instrument axes' floor of three is deliberately not carried over: it
exists because a parent/child re-split of one regime legitimately moves a handful
of rows, no measure judged here has that mechanism, and a floor of three on
`sectors` (11) or `countries` (23) would license losing a quarter of them.

### Proven red before green

Committed in that order, on purpose. The tests are in the tree one commit before
the function is (`project-mgmt/findings/gate_divergence_wsHC_red.txt` is the run
output), and the central one simulates the real failure rather than an imagined
one: census #9's own payload, a week later, with the 1,070 gates of the 08-08
session gone and **nothing else changed** — 1,088 instruments still there, every
KPI equal or higher.

```
RED    lib/corpusCensus.test.ts   Tests  10 failed | 11 passed (21)
       TypeError: shrinkage is not a function
GREEN  lib/corpusCensus.test.ts   Tests  21 passed (21)
```

Judged by everything that existed before, that pair is silent: `admissibility`
passes it, and no KPI moves.

### The test for a case nobody has seen

Nothing in this repo has ever recorded `instruments.doors`. The test invents it,
puts it on a census, and asserts it is judged — with no edit to any list, in this
file or in `coverage_gate.py`. That is the difference between a measure being
covered and a measure having been remembered.

### Neither recorded failure returns

| | what it does |
|---|---|
| FALSE ALARM (2026-08-06) — 150 instruments join, every count rises ~70, five of six shares fall | **silent.** Nothing here reads a share, and no count fell. |
| BLIND SPOT (never caught) — 150 instruments deleted, 130 with a route; `route` 908 → 778 while the share RISES 89.8% → 90.4% | **fires.** The count is 130 below its mark. The denominator is not consulted at any point. |
| census #4 — the mid-rebuild reading, 322 instruments, `frameworks: 10` where every sound reading of that corpus says 8 | **silent.** A reading that failed the test does not raise the mark — `coverage_gate.advance()`'s rule, which is also what stops the mark being a ratchet. |

### What it says about the corpus today

Nothing, and that is the correct answer.

```
GUARD_NO_PUBLISH=1 npx tsx scripts/check_corpus_census.ts
  → DEGRADED, DRIFTED, DIVERGED, SCHEMA, STALE.  No SHRANK.
```

No store has ever been observed to hold less than it once held. The volume reads
6,401 twice; the laptop reads 7,471 three times. The alarm this workstream was
given was a cross-store comparison, `DIVERGED` had it right, and the new arm
declines to say it a second time in the wrong words.

### What it does not cover, said out loud

`censusMeasures` walks the census's `kpis` and `instruments` blocks. Adding a
*measure* to either needs no edit; adding a new top-level *block* to the census
would. `coverage` is excluded deliberately — it is `coverage_gate.py`'s own
snapshot, judged by `coverage_gate.py`, and it carries `shares`, which is the one
quantity this test must never read. The consequence is that defect (b), the
single baseline file over three stores, is **demonstrated but not repaired**: the
eligibility and sectors lines will keep saying "the corpus knew" about a corpus
that never did until `coverage_gate.py`'s mark is keyed by store. That is one
change to `_high_water`/`advance` and `corpus_stores.store_id()`, and it lands on
the two axes wsHB is live on, which is why it is not made here.

---

## 5. The DRIFTED report

`check_corpus_census.ts` says census #11 was produced by code fingerprinted
`c99a0aeb2a070141` while this checkout is `ba21132f9cc7de04`.

Reproducing `code_fingerprint()` over git history (content hash of every `.py`
under `ETL/` and `website/build/`; the reimplementation reproduces HEAD's
`ba21132f9cc7de04` exactly), the newest commit that fingerprints to
`c99a0aeb2a070141` is **`f6ff3957b`, 2026-08-11 18:44** — "wsEN: the screen had
two authors and one of them was deleting". The Railway container is running the
image uploaded then. **316 commits behind HEAD**, six days at the time of census
#11.

**It does not explain the gate divergence.** The four modules that produce and
judge these numbers —

```
ETL/events/load/publish_corpus_census.py
ETL/terms/coverage_report.py
ETL/terms/coverage_gate.py
website/build/lib/corpus_kpis.py
```

— are **byte-identical between `f6ff3957b` and HEAD**. The container measures
what this checkout measures. The divergence is in the rows, as §1 shows by two
independent routes.

**It does explain why the volume cannot close the gap.** Of the 27 Python files
under `ETL/` and `website/build` that changed in those 316 commits, the ones
carrying gate encoding — `encode_gates.py`, `encode_scheme_text_gates.py`,
`load_scheme_text.py`, `apply_gate_encoding_corrections.py`,
`apply_gate_role_overrides.py` — are all newer than the image. The container is
running the 2026-08-11 encoders, and it does not run them at all.

It is also the honest reading of a fingerprint mismatch generally: the
fingerprint covers two whole trees, so DRIFTED tells you *the container is not
this checkout*, never *this number was measured differently*. Answering the
second question takes a diff of the measuring modules, and that diff should be
what the report offers. Recorded, not fixed, in §8.

---

## 6. The bar was not fingerprinted, and DRIFTED fired by luck

wsHB resolved the two high-water marks and reached this from the other side.
Census #11's gate says *"down from a high of 913"*; `coverage_baseline.json` in
this checkout says **937**, raised by `fe75156a` on 2026-08-12 09:45 — the
morning after the running image was built — because thirteen fields were below
the mark the corpus had actually reached. **937 is authoritative and the guard is
too lenient**: against the right bar the same census fails on four counts with a
39-row shortfall, not two counts and 15.

**The general defect underneath it.** `code_fingerprint()` hashed `ETL/**.py` and
`website/build/**.py`. `project-mgmt/coverage_baseline.json` is neither, and it
is *the input the published verdict is computed against*. DRIFTED fired here only
because the Python happened to move in the same deploy. **Redeploy with unchanged
code and a stale bar and nothing whatsoever fires** — the census publishes a
verdict graded against a bar no reader can identify.

### The property

> **A fingerprint published with a verdict covers every input that can change
> that verdict.** Code is one of those inputs. It is not the only one, and
> nothing about a file's suffix decides whether a file is one.

The test that decides an unseen case: *take any file the judging code grades
against, change one byte, and the fingerprint must move.* That is answerable
about a file nobody has thought of yet, in a format nobody has used yet — which
a register of blessed filenames can never be.

Two halves, in two places on purpose:

| | where | what it holds |
|---|---|---|
| the algorithm | `ETL/schema/test_verdict_bar_fingerprinted.py` | the hash moves for a declared non-code input, generically. It asserts this on `project-mgmt/a_bar_nobody_has_written_yet` under five suffixes **including none at all** — a rule keyed on `.json` passes every other assertion in the file and fails that one |
| the declaration is complete | `ETL/schema/check_census_imports.py::bar_is_fingerprinted` | derived from the census's own import graph, not listed. Every module-level path constant resolving to a file the image contains must be inside the fingerprint. **An input added next year fails the day its constant appears.** |

The declaration itself is `publish_corpus_census.JUDGEMENT_INPUTS`, so the hash
stays a dumb content hash that two machines cannot disagree about — the one
property a fingerprint must never lose.

### Proven red before green, on the real tree

Full output in `gate_divergence_wsHC_red.txt`. With the bar *declared* an input
and `code_fingerprint` left exactly as it stood on 2026-08-16:

```
FAIL: a verdict can be published against a bar nobody can identify
  - the bar changed 913 -> 937, the code did not, and the fingerprint did not move.
    A verdict computed against the old bar and one computed against the new are
    indistinguishable to every reader downstream. That is census #11.
```

Green after. This checkout's fingerprint moves `ba21132f9cc7de04` →
`1dd643153d801a8c` as a result, which is correct and is the point.

### The derived check found a second and a third input

`ETL/schema/guard_verdicts.sql` — the table verdicts are written into — sits
*under* `ETL/` and contributed nothing to the hash, because the walk takes only
`.py`. "Under a fingerprinted tree" is not "hashed", and reading it as such would
have put the same hole in the check that the check exists to close. And
`data/guard_registry.json` — which decides what code a verdict is bound to and
which exit codes count as a pass — led to §7.

---

## 7. No verdict has ever been published from the container

Found by the check in §6 from first principles, and confirmed independently from
the table:

```sql
SELECT produced_by, COUNT(*), MAX(taken_at) FROM guard_verdicts GROUP BY 1;
  local         783   2026-08-13 16:17
  wsAN2-merge     4   2026-08-08 09:47
  proof-local     5   2026-08-07 22:09
```

**Zero rows, ever, from `etl-pipeline`** — across every guard, not only the
census. Meanwhile `corpus_census` has rows #10 and #11 from `etl-pipeline`.

The mechanism is in the tree. `guard_verdicts.REGISTRY` is
`ROOT / "data" / "guard_registry.json"`; `.dockerignore` excludes `data/`, and
`/app/data` is the mounted volume, which holds the corpus and not the registry.
So `guard("census")` cannot resolve inside the container. In
`publish_corpus_census.main()` that call sits **after** the census INSERT and
**before** `publish(...)` — which is precisely the pattern the two tables show: a
census row written, no verdict beside it. `railway_cron.py` runs its four
corpus-side guards through the same runner, and none of them has ever recorded
either.

**What it costs.** `check_corpus_census.ts` documents the verdict feed as the
credential-free door — "which is how it came to run on every pull request without
GitHub holding a credential to the production database". On that door the newest
census is **#9, a laptop, 2026-08-08**. Every CI run without `DATABASE_URL` has
been judging an eight-day-old reading of a *derived* store and cannot see the
corpus of record at all. The channel that covers every guard was covering the
record with nothing.

**Fixed here, not deployed.** `.dockerignore` gains `!data/guard_registry.json`.
It takes effect on the next `railway up`; nothing redeploys the service on a push
(`repoTriggers: []`). Queued in `AWAITING_APPROVAL.md`.

---

## 8. What this workstream did not do

- **No corpus write.** Promoting the 3,362 gates to the volume is a write to the
  corpus of record and goes to `project-mgmt/AWAITING_APPROVAL.md`, not here.
- **No deploy.** The `.dockerignore` fix is committed and inert until somebody
  runs `railway up`. Queued with cost and risk.
- **`eligibility` (898, high 913) and `sectors` (8, high 11) are wsHB's**, and
  wsHB has settled which mark is authoritative. §3(b) explains why the *word* on
  the eligibility line is wrong; it says nothing about the axis.
- **`coverage_gate.py`'s mark is still one file over three stores.** §3(b) and
  §4 explain it and the `SHRANK` arm demonstrates the per-store shape, but
  keying `_high_water`/`advance` by `corpus_stores.store_id()` is not done —
  it lands on the two axes wsHB is live on.
- **The four cron guards were not put through §6's test.** It covers the census's
  import graph, which is the declared scope of `check_census_imports.py`.
  `check_offerable_decay.py` reads `data/reference/offerable_baseline.json` at
  module level and `data/reference/` is 892 KB of committed input excluded from
  the image by the same pattern, so the same question is very likely open there.
- **DRIFTED naming the modules that actually differ** is a real improvement and
  is not built here.
